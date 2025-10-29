import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../src/agents/specialized/notification/policy';
import type {
  NotificationIntent,
  PolicyContext,
} from '../src/agents/specialized/notification/types';

function buildCtx(message: string): PolicyContext {
  return {
    defaultTz: 'Australia/Sydney',
    input: {
      userId: 'u-test',
      sessionId: 's-test',
      message,
    } as any,
  };
}

function baseIntent(
  overrides: Partial<NotificationIntent> = {}
): NotificationIntent {
  return {
    intent: 'notify',
    channel: 'sms',
    recipients: [],
    schedule: { type: 'now' },
    ...overrides,
  } as NotificationIntent;
}

function minutesBetween(a: Date, b: Date) {
  return Math.abs((a.getTime() - b.getTime()) / 60000);
}

describe('Policy natural language scheduling - inference fallback', () => {
  it('tomorrow at 10am -> schedules at next day 10:00 (local)', () => {
    const now = new Date();
    const ctx = buildCtx('Please notify me tomorrow at 10am to take my pill');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const iso = (res as any).plan.scheduleAt as string;
    expect(typeof iso).toBe('string');
    const dt = new Date(iso);
    const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    target.setHours(10, 0, 0, 0);
    expect(minutesBetween(dt, target)).toBeLessThan(6);
  });

  it('tomorrow (no time) -> defaults to 09:00', () => {
    const now = new Date();
    const ctx = buildCtx('remind me tomorrow');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    target.setHours(9, 0, 0, 0);
    expect(minutesBetween(dt, target)).toBeLessThan(6);
  });

  it('in 2 hours -> schedules about 2h from now', () => {
    const start = new Date();
    const ctx = buildCtx('send a reminder in 2 hours');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    const diffMin = (dt.getTime() - start.getTime()) / 60000;
    expect(diffMin).toBeGreaterThan(90);
    expect(diffMin).toBeLessThan(150);
  });

  it('in 15 minutes -> schedules about 15m from now', () => {
    const start = new Date();
    const ctx = buildCtx('ping me in 15 minutes');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    const diffMin = (dt.getTime() - start.getTime()) / 60000;
    expect(diffMin).toBeGreaterThan(10);
    expect(diffMin).toBeLessThan(25);
  });

  it('next Monday at 9:30 -> schedules upcoming Monday 09:30', () => {
    const ctx = buildCtx('next Monday at 9:30 remind me');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    // Check minute and hour
    expect(dt.getMinutes()).toBe(30);
    // Allow either 9 local hour mapping; timezone may shift to UTC, so check against local hour
    expect(dt.getHours()).toBe(9);
  });

  it('next Friday (no time) -> defaults to 09:00 of that day', () => {
    const ctx = buildCtx('next Friday send notification');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    expect(dt.getHours()).toBe(9);
    expect(dt.getMinutes()).toBe(0);
  });

  it('at 7pm -> if time remains today schedule today, else tomorrow 19:00', () => {
    const now = new Date();
    const ctx = buildCtx('notify me at 7pm');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    // Hour should be 19 local
    expect(dt.getHours()).toBe(19);
    const diffH = (dt.getTime() - now.getTime()) / (60 * 60 * 1000);
    expect(diffH).toBeGreaterThan(0);
    expect(diffH).toBeLessThan(36);
  });

  it('in 1 day -> about 24h later', () => {
    const start = new Date();
    const ctx = buildCtx('remind me in 1 day');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    const diffH = (dt.getTime() - start.getTime()) / (60 * 60 * 1000);
    expect(diffH).toBeGreaterThan(20);
    expect(diffH).toBeLessThan(28);
  });

  it('in 3 days -> about 72h later', () => {
    const start = new Date();
    const ctx = buildCtx('please remind me in 3 days');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    const diffH = (dt.getTime() - start.getTime()) / (60 * 60 * 1000);
    expect(diffH).toBeGreaterThan(68);
    expect(diffH).toBeLessThan(80);
  });

  it('next Sunday 8am -> schedules around next Sunday 08:00', () => {
    const now = new Date();
    // compute expected next Sunday 08:00 local
    const expected = new Date(now);
    const curr = expected.getDay();
    let delta = 0 - curr; // Sunday is 0
    if (delta <= 0) delta += 7;
    expected.setDate(expected.getDate() + delta);
    expected.setHours(8, 0, 0, 0);

    const ctx = buildCtx('set a reminder next Sunday 8am');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    // allow up to 120 minutes tolerance due to DST/timezone differences
    expect(minutesBetween(dt, expected)).toBeLessThan(120);
  });

  it('free text with explicit time only: at 6am -> today or tomorrow 06:00', () => {
    const now = new Date();
    const ctx = buildCtx('at 6am');
    const res = evaluatePolicy(baseIntent(), ctx);
    expect(res.ok).toBe(true);
    const dt = new Date((res as any).plan.scheduleAt);
    expect(dt.getHours()).toBe(6);
    // Within 36h window
    const diffH = (dt.getTime() - now.getTime()) / (60 * 60 * 1000);
    expect(diffH).toBeGreaterThan(0);
    expect(diffH).toBeLessThan(36);
  });
});
