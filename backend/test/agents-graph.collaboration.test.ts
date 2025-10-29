import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { agentsGraphRoutes } from '../src/routes/agents-graph';

class StubLLM {
  async generate(_: string) {
    return 'notification.schedule';
  }

  async generateWithUsage(prompt: string) {
    return { text: 'notification.schedule', usage: { totalTokens: 10 } };
  }
}

describe('State-based collaboration: notification -> appointment (medication folded into notification)', () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(cors, { origin: true, credentials: true });
    await app.register(agentsGraphRoutes as any, {
      prefix: '/agents',
      llm: new StubLLM(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes to appointment after notification when notificationSchedule is present', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/chat',
      payload: {
        userId: 'u1',
        sessionId: 's1',
        message: 'please set a pill reminder at 8 pm and add to calendar',
        metadata: { googleAccessToken: 'valid-token' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Expect collaboration moved currentAgent to appointment
    expect(body.currentAgent).toBe('appointment');
    // Expect sharedData to carry notification schedule
    expect(body.context?.sharedData?.notificationSchedule).toBeDefined();
  });
});
