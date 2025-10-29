import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { ReportAgent } from '../src/agents/specialized/ReportAgent';
import { OllamaService } from '../src/services/llm';
import { setupOllama } from '../src/lib/setup-ollama';
import { ensureTestEnvVars } from './utils';
import { pingNotificationQueue } from '../src/lib/bullmq';
import { checkRedisConnection } from '../src/lib/redis';

describe('ReportAgent + Ollama integration', () => {
  let app: FastifyInstance;
  let agent: ReportAgent;
  let reachable = false;

  beforeAll(async () => {
    ensureTestEnvVars();
    const redisStatus = await checkRedisConnection();
    expect(redisStatus.connected).toBe(true);
    const queueStatus = await pingNotificationQueue();
    expect(queueStatus.connected).toBe(true);

    try {
      await axios.get(`${process.env.OLLAMA_BASE}/api/tags`);
      reachable = true;
    } catch {
      reachable = false;
    }

    app = Fastify({ logger: false });
    if (reachable) {
      await setupOllama(
        app.log,
        process.env.OLLAMA_BASE,
        process.env.OLLAMA_MODEL
      );
    }
    agent = new ReportAgent(
      new OllamaService(
        app.log,
        process.env.OLLAMA_BASE,
        process.env.OLLAMA_MODEL
      ),
      app.log
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('summary happy path', async () => {
    if (!reachable) return;
    const res = await agent.process({
      userId: 'rep_u1',
      sessionId: 'rep_s1',
      message:
        "Please provide a brief summary of today's blood pressure and exercise logs.",
    });
    expect(typeof res.reply).toBe('string');
  }, 120_000);
});
