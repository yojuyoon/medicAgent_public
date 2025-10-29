import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { agentsGraphRoutes } from '../src/routes/agents-graph';
import type { LLMService, LLMUsage } from '../src/services/llm';

class UsageLLM implements LLMService {
  async generate(prompt: string): Promise<string> {
    // Fallback path should not be used in this test
    return 'health.advice';
  }
  async generateWithUsage(
    prompt: string
  ): Promise<{ text: string; usage?: LLMUsage }> {
    if (
      /Intent classifier/i.test(prompt) ||
      /Analyze this user message and determine the intent/i.test(prompt)
    ) {
      return { text: 'health.advice', usage: { totalTokens: 42 } };
    }
    return { text: 'Ok.', usage: { totalTokens: 100 } };
  }
}

describe('Agents Graph usage in timeline', () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(cors, { origin: true, credentials: true });
    await app.register(agentsGraphRoutes as any, {
      prefix: '/agents',
      llm: new UsageLLM(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('includes usage.totalTokens for router and agent steps when available', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/chat',
      payload: {
        userId: 'u1',
        sessionId: 's1',
        message: 'hello',
        timeline: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    const timeline = payload.timeline as Array<any>;
    expect(Array.isArray(timeline)).toBe(true);
    // Find router and agent entries
    const routerStep = timeline.find(t => t.step === 'router');
    const agentStep = timeline.find(t =>
      String(t.step || '').startsWith('agent:')
    );
    expect(routerStep?.usage?.totalTokens).toBeDefined();
    expect(agentStep?.usage?.totalTokens).toBeDefined();
  });
});
