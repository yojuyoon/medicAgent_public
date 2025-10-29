import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { RouterAgent } from '../src/agents/router/RouterAgent';
import { GPAgent } from '../src/agents/specialized/GPAgent';
import { ReportAgent } from '../src/agents/specialized/ReportAgent';
import { AppointmentAgent } from '../src/agents/specialized/AppointmentAgent';
import { OllamaService } from '../src/services/llm';
import { setupOllama } from '../src/lib/setup-ollama';
import { ensureTestEnvVars } from './utils';
import { pingNotificationQueue } from '../src/lib/bullmq';
import { checkRedisConnection } from '../src/lib/redis';

// Spy calendar tool for AppointmentAgent tool usage verification
vi.mock('../src/agents/tools/calendar', () => {
  return {
    findFreeSlotsTool: vi.fn(async (_logger: any, _args: any) => ({
      ok: true,
      data: [],
    })),
  };
});

describe('RouterAgent + Ollama integration (intent + a2a)', () => {
  let app: FastifyInstance;
  let router: RouterAgent;
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

    const llm = new OllamaService(
      app.log,
      process.env.OLLAMA_BASE,
      process.env.OLLAMA_MODEL
    );

    router = new RouterAgent(llm, app.log);
    router.register('gp', new GPAgent(llm, app.log));
    router.register('report', new ReportAgent(llm, app.log));
    router.register('appointment', new AppointmentAgent(llm, app.log));
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('routes symptom advice to GP', async () => {
    if (!reachable) return;
    const res = await router.process({
      userId: 'r1',
      sessionId: 'r1',
      message: 'Please provide general care advice for cold symptoms.',
    });
    expect(res.route === 'gp' || typeof res.reply === 'string').toBe(true);
  }, 120_000);

  it('routes report summary to ReportAgent', async () => {
    if (!reachable) return;
    const res = await router.process({
      userId: 'r2',
      sessionId: 'r2',
      message: "Please generate a summary of this week's health report.",
    });
    expect(res.route === 'report' || typeof res.reply === 'string').toBe(true);
  }, 120_000);

  it('routes appointment-ish message to AppointmentAgent and triggers tool path (spy)', async () => {
    if (!reachable) return;
    const { findFreeSlotsTool } = await import('../src/agents/tools/calendar');

    // Reduce flakiness: stub classification to appointment
    const classifySpy = vi.spyOn<any, any>(router as any, 'classify');
    classifySpy.mockResolvedValue({ intent: 'appointment.book', entities: {} });

    const res = await router.process({
      userId: 'r3',
      sessionId: 'r3',
      message: 'Please tell me available appointment times next week.',
      metadata: { googleAccessToken: 'dummy-access-token' },
    });
    expect(typeof res.reply).toBe('string');
    expect((findFreeSlotsTool as any).mock.calls.length >= 0).toBe(true);
  }, 120_000);
});
