import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { NotificationAgent } from '../src/agents/specialized/NotificationAgent';
import { OllamaService } from '../src/services/llm';
import { setupOllama } from '../src/lib/setup-ollama';
import { ensureTestEnvVars, clearNotificationQueue } from './utils';
import { pingNotificationQueue, notificationQueue } from '../src/lib/bullmq';
import { checkRedisConnection } from '../src/lib/redis';

describe('NotificationAgent + real Ollama (docker) integration', () => {
  let app: FastifyInstance;
  let agent: NotificationAgent;
  let reachable = false;

  beforeAll(async () => {
    ensureTestEnvVars();

    // infra checks
    const redisStatus = await checkRedisConnection();
    expect(redisStatus.connected).toBe(true);
    const queueStatus = await pingNotificationQueue();
    expect(queueStatus.connected).toBe(true);

    // ollama reachable?
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
    agent = new NotificationAgent(
      new OllamaService(
        app.log,
        process.env.OLLAMA_BASE,
        process.env.OLLAMA_MODEL
      ),
      app.log
    );
  }, 60_000);

  afterEach(async () => {
    await clearNotificationQueue();
  });

  afterAll(async () => {
    await app.close();
  });

  it('schedules a notification using real LLM JSON extraction', async () => {
    if (!reachable) return; // skip gracefully if ollama is not up
    const res = await agent.process({
      userId: 'ollama_u1',
      sessionId: 'ollama_s1',
      message: 'Please notify +61412345678 now about checkup using real llm',
    });
    expect(typeof res.reply).toBe('string');
    // Best-effort assertion (models vary). Ensure at least a job got queued.
    const waiting = await notificationQueue.getWaitingCount();
    const delayed = await notificationQueue.getDelayedCount();
    expect(waiting + delayed).toBeGreaterThan(0);
  }, 120_000);

  it('schedules a notification using real LLM and setup delayed notification queue', async () => {
    const res = await agent.process({
      userId: 'u1',
      sessionId: 's1',
      message: 'Please notify me tomorrow at 10am to take my pill',
    });
    expect(typeof res.reply).toBe('string');
    const m = String(res.reply).match(/jobId=([\w-]+)/);
    expect(!!m && !!m[1]).toBe(true);
    const job = await notificationQueue.getJob(m![1]!);
    expect(job).not.toBeNull();
  }, 120_000);
});
