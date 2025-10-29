import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { agentsGraphRoutes } from '../src/routes/agents-graph';

class StubLLM {
  async generate(_: string) {
    return 'health.advice';
  }
}

describe('Agents Graph timeline', () => {
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

  it('includes timeline when requested', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/chat',
      payload: { userId: 'u1', sessionId: 's1', message: 'hi', timeline: true },
    });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(Array.isArray(payload.timeline)).toBe(true);
    expect(payload.timeline.length).toBeGreaterThan(0);
  });
});
