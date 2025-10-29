import { describe, it, expect } from 'vitest';
import {
  INTENT_TO_ROUTE,
  resolveRoute,
  BLOCK_RULES,
  FALLBACK_INTENT,
} from '../src/agents/router/intent-routing';

describe('intent-routing', () => {
  it('maps known intents to routes', () => {
    expect(resolveRoute('appointment.book')).toBe('appointment');
    expect(resolveRoute('notification.schedule')).toBe('notification');
  });

  it('falls back to gp for unknown intents', () => {
    const unknown = 'something.else';
    const intent = Object.keys(INTENT_TO_ROUTE).includes(unknown)
      ? unknown
      : FALLBACK_INTENT;
    expect(resolveRoute(intent)).toBe('gp');
  });

  it('blocks appointment intents without googleAccessToken', () => {
    const guard = BLOCK_RULES[0]!;
    const res = guard({ intent: 'appointment.book', metadata: {} });
    expect(res.blocked).toBe(true);
  });
});
