import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { agentsGraphRoutes } from '../src/routes/agents-graph';

class StubLLM {
  async generate(_: string) {
    return 'health.advice';
  }
}

describe('Agents Graph SSE', () => {
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

  it('emits status, result, done events in SSE mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/chat',
      payload: {
        userId: 'u1',
        sessionId: 's1',
        message: 'hello',
        stream: true,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain('"type":"status"');
    expect(body).toContain('"type":"result"');
    expect(body).toContain('"type":"done"');
  });
});
