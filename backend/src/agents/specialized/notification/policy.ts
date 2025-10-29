import type { NotificationPlan } from '../../../lib/bullmq';
import { createHash } from 'crypto';
import type { NotificationIntent, PolicyContext, PolicyResult } from './types';

export function evaluatePolicy(
  intent: NotificationIntent,
  ctx: PolicyContext
): PolicyResult {
  const notes: string[] = [];

  const channel = forceChannel(intent, notes);
  const to = pickRecipients(intent);
  if (to.length === 0) return fail('No valid recipient phone numbers found.');

  const body = pickBody(intent, notes, ctx);
  if (body.length === 0) return fail('Message body is empty.');

  const tz = pickTimezone(intent, ctx);
  const { scheduleAt, repeat, extraNotes } = pickSchedule(intent, tz, ctx);
  notes.push(...extraNotes);

  const retry = defaultRetry();
  const idempotencyKey = generateIdempotencyKey({
    to,
    body,
    scheduleAt,
    repeat,
  });

  const plan = buildPlan({
    channel,
    to,
    body,
    ...(scheduleAt ? { scheduleAt } : {}),
    ...(repeat ? { repeat } : {}),
    retry,
    idempotencyKey,
    ...(intent.intent ? { label: intent.intent } : {}),
    notes,
  });

  return succeed(plan, notes);
}

function forceChannel(intent: NotificationIntent, notes: string[]) {
  if (intent.channel !== 'sms') notes.push('Channel forced to sms.');
  return 'sms' as const;
}

function pickRecipients(intent: NotificationIntent): string[] {
  console.log('intent.recipients', intent.recipients);

  //   // If recipients are provided, use them; otherwise use default
  //   if (intent.recipients && intent.recipients.length > 0) {
  //     return intent.recipients.map(r => r.phoneE164).filter(Boolean);
  //   }
  //
  //   // If recipients array is explicitly empty, return empty array (for invalid cases)
  //   if (intent.recipients && intent.recipients.length === 0) {
  //     return [];
  //   }

  // TODO: Always use internal phone number for self-notifications
  return ['+61412345678']; // E164 format for Australian number
}

function pickBody(
  intent: NotificationIntent,
  notes: string[],
  ctx: PolicyContext
): string {
  const direct = (intent.message ?? '').trim();
  if (direct) return direct;
  if (intent.templateKey) {
    const rendered = renderTemplate(intent.templateKey, intent.variables ?? {});
    notes.push(`Template(${intent.templateKey}) has been applied.`);
    return rendered.trim();
  }
  // Fallback to original message if no message provided
  const fallback = ctx.input.message.trim();
  if (fallback) {
    notes.push('Using original message as fallback.');
    return fallback;
  }

  return '';
}

function pickTimezone(intent: NotificationIntent, ctx: PolicyContext): string {
  return intent.timezone || ctx.input.metadata?.timezone || ctx.defaultTz;
}

function pickSchedule(
  intent: NotificationIntent,
  tz: string,
  ctx: PolicyContext
): {
  scheduleAt?: string;
  repeat?: NotificationPlan['repeat'];
  extraNotes: string[];
} {
  const extraNotes: string[] = [];
  if (intent.schedule?.type === 'datetime') {
    return { scheduleAt: intent.schedule.iso, extraNotes };
  }
  if (intent.schedule?.type === 'relative') {
    try {
      const ms = durationToMs(intent.schedule.durationISO8601);
      extraNotes.push('Relative schedule converted to absolute time.');
      return {
        scheduleAt: new Date(Date.now() + ms).toISOString(),
        extraNotes,
      };
    } catch {
      return { extraNotes };
    }
  }
  if (intent.schedule?.type === 'cron') {
    const rep: { cron: string; tz?: string; limit?: number } = {
      cron: intent.schedule.expr,
      tz,
    };
    if (typeof intent.schedule.limit === 'number')
      rep.limit = intent.schedule.limit;
    return { repeat: rep, extraNotes };
  }
  // Natural-language fallback if LLM returned now/empty: infer from utterance
  if (!intent.schedule || intent.schedule.type === 'now') {
    const inferred = inferDateTimeFromMessage(ctx.input.message || '');
    if (inferred && inferred.getTime() > Date.now()) {
      extraNotes.push('Natural language schedule inferred from utterance.');
      return { scheduleAt: inferred.toISOString(), extraNotes };
    }
  }
  return { scheduleAt: new Date().toISOString(), extraNotes };
}

// Lightweight natural language time parser to cover common cases
// Supported:
// - "tomorrow" optionally with time (e.g., "tomorrow at 10am")
// - "in X minutes/hours/days"
// - "next <weekday>" optionally with time
// - "at HH(:MM)?(am|pm)" (today if in the future, else tomorrow)
function inferDateTimeFromMessage(message: string): Date | null {
  const text = message.toLowerCase();
  const now = new Date();

  // time extractor: "at 10am", "at 9:30 pm"
  const timeMatch = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const extractTime = (base: Date): Date => {
    if (!timeMatch) return base;
    const hourRaw = parseInt(timeMatch[1] || '0', 10);
    const minute = parseInt(timeMatch[2] || '0', 10);
    const meridiem = timeMatch[3];
    let hour = hourRaw;
    if (meridiem === 'am') {
      hour = hourRaw % 12; // 12am -> 0
    } else if (meridiem === 'pm') {
      hour = (hourRaw % 12) + 12; // 12pm -> 12
    }
    const d = new Date(base);
    d.setSeconds(0, 0);
    d.setMinutes(minute);
    d.setHours(hour);
    return d;
  };

  // 1) tomorrow
  if (/\btomorrow\b/.test(text)) {
    const base = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const scheduled = extractTime(base);
    // if no explicit time, default to 09:00
    if (!timeMatch) {
      scheduled.setHours(9, 0, 0, 0);
    }
    return scheduled;
  }

  // 2) in X minutes/hours/days
  const rel = text.match(
    /\bin\s+(\d+)\s*(minute|minutes|hour|hours|day|days)\b/
  );
  if (rel) {
    const amount = parseInt(rel[1] || '0', 10);
    const unit = (rel[2] || '') as string;
    let ms = 0;
    if (/minute/.test(unit)) ms = amount * 60 * 1000;
    else if (/hour/.test(unit)) ms = amount * 60 * 60 * 1000;
    else if (/day/.test(unit)) ms = amount * 24 * 60 * 60 * 1000;
    return new Date(now.getTime() + ms);
  }

  // 3) next weekday
  const weekdayMatch = text.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (weekdayMatch) {
    const map: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const target = map[(weekdayMatch[1] || '') as keyof typeof map];
    const base = nextWeekday(now, typeof target === 'number' ? target : 0);
    const scheduled = extractTime(base);
    if (!timeMatch) scheduled.setHours(9, 0, 0, 0);
    return scheduled;
  }

  // 4) explicit time today (if in future), otherwise tomorrow
  if (timeMatch) {
    const todayAt = extractTime(now);
    if (todayAt.getTime() > now.getTime()) return todayAt;
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return extractTime(tomorrow);
  }

  return null;
}

function nextWeekday(from: Date, targetWeekday: number): Date {
  const d = new Date(from);
  const curr = d.getDay();
  let delta = targetWeekday - curr;
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function defaultRetry() {
  return { attempts: 3, backoffMs: 2000 } as const;
}

function buildPlan(args: {
  channel: 'sms';
  to: string[];
  body: string;
  scheduleAt?: string;
  repeat?: NotificationPlan['repeat'];
  retry: { attempts: number; backoffMs: number };
  idempotencyKey: string;
  label?: string;
  notes: string[];
}): NotificationPlan {
  const plan: NotificationPlan = {
    channel: args.channel,
    to: args.to,
    body: args.body,
    ...(args.scheduleAt ? { scheduleAt: args.scheduleAt } : {}),
    ...(args.repeat ? { repeat: args.repeat } : {}),
    retry: args.retry,
    idempotencyKey: args.idempotencyKey,
    ...(args.label ? { labels: [args.label] } : {}),
    ...(args.notes.length ? { policyNotes: args.notes } : {}),
  } as NotificationPlan;
  return plan;
}

function succeed(plan: NotificationPlan, notes: string[]): PolicyResult {
  return { ok: true, plan, notes };
}
function fail(error: string): PolicyResult {
  return { ok: false, error };
}

function renderTemplate(
  key: string,
  vars: Record<string, string | number>
): string {
  const templates: Record<string, string> = {
    'reminder.simple': 'Hi{{name}}, this is your reminder: {{text}}',
  };
  const tpl = templates[key] ?? '';
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

function durationToMs(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) throw new Error('invalid duration');
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  return ((days * 24 + hours) * 60 + mins) * 60 * 1000;
}

function generateIdempotencyKey(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  return createHash('sha256').update(str).digest('hex').slice(0, 32);
}
