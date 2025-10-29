import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { NotificationAgent } from '../src/agents/specialized/NotificationAgent';
import {
  ensureTestEnvVars,
  NotificationStubLLM,
  clearNotificationQueue,
} from './utils';

describe('NotificationAgent contract', () => {
  let agent: NotificationAgent;

  beforeAll(async () => {
    ensureTestEnvVars();
    const app = Fastify({ logger: false });
    agent = new NotificationAgent(new NotificationStubLLM(), app.log);
  });

  afterAll(async () => {
    await clearNotificationQueue();
  });

  it('returns allowed followup types', async () => {
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'Please notify +61412345678 now about checkup',
    });
    const allowed = new Set(['question', 'confirm', 'info']);
    for (const f of res.followups || []) {
      expect(allowed.has(f.type)).toBe(true);
    }
  }, 30_000);
});
