import { describe, it, expect } from 'vitest';
import type { LLMService } from '../src/services/llm';
import { RouterAgent } from '../src/agents/router/RouterAgent';
import { BaseAgent } from '../src/agents/base/BaseAgent';

class StubLLM implements LLMService {
  async generate(prompt: string): Promise<string> {
    const userMatch = prompt.match(/User:\s*([\s\S]*?)\n/i);
    const userText = (userMatch?.[1] || '').toLowerCase();
    if (/book|appointment/.test(userText)) return 'appointment.book';
    if (/pill|medication/.test(userText)) return 'notification.schedule';
    return 'health.advice';
  }
}

class DummyAgent extends BaseAgent {
  getCapabilities() {
    return ['dummy'];
  }
  async process(): Promise<any> {
    return { reply: 'ok' };
  }
}

const makeAgent = () => {
  const router = new RouterAgent(new StubLLM(), console as any);
  const gp = new DummyAgent(new StubLLM() as any, console as any, 'gp');
  const appt = new DummyAgent(
    new StubLLM() as any,
    console as any,
    'appointment'
  );
  const notification = new DummyAgent(
    new StubLLM() as any,
    console as any,
    'notification'
  );
  router.register('gp', gp);
  router.register('appointment', appt);
  router.register('notification', notification);
  return router;
};

describe('RouterAgent', () => {
  it('routes appointment requests to appointment', async () => {
    const router = makeAgent();
    // registry is empty but we only test route selection + intent
    const res = await router.process({
      userId: 'u',
      sessionId: 's',
      message: 'please book an appointment tomorrow 3pm',
      metadata: { googleAccessToken: 'valid-token' },
    } as any);
    expect(res.intent).toBe('appointment.book');
    expect(res.route).toBe('appointment');
  });

  it('routes medication reminders to notification', async () => {
    const router = makeAgent();
    const res = await router.process({
      userId: 'u',
      sessionId: 's',
      message: 'set a pill reminder for 8pm',
    } as any);
    expect(res.intent).toBe('notification.schedule');
    expect(res.route).toBe('notification');
  });

  it('falls back to gp for unknown intents', async () => {
    const router = makeAgent();
    const res = await router.process({
      userId: 'u',
      sessionId: 's',
      message: 'hello there',
      metadata: { googleAccessToken: 'valid-token' },
    } as any);
    expect(res.route).toBe('gp');
  });
});
