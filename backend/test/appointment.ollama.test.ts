import {
  describe,
  it,
  beforeAll,
  afterAll,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { AppointmentAgent } from '../src/agents/specialized/AppointmentAgent';
import { OllamaService } from '../src/services/llm';
import { setupOllama } from '../src/lib/setup-ollama';
import { ensureTestEnvVars } from './utils';
import { pingNotificationQueue } from '../src/lib/bullmq';
import { checkRedisConnection } from '../src/lib/redis';

// Mock calendar tool to avoid external Google Calendar API calls
vi.mock('../src/agents/tools/calendar', () => {
  return {
    findFreeSlotsTool: vi.fn(async (_logger: any, _args: any) => {
      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60000);
      return {
        ok: true,
        data: [{ start: start.toISOString(), end: end.toISOString() }],
      } as const;
    }),
  };
});

describe('AppointmentAgent + Ollama integration', () => {
  let app: FastifyInstance;
  let agent: AppointmentAgent;
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
    agent = new AppointmentAgent(
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: end-of-day guidance (real LLM)', async () => {
    if (!reachable) return;
    const res = await agent.process({
      userId: 'appt_u1',
      sessionId: 'appt_s1',
      message:
        "Is it possible to book a hospital appointment today at 17:45? If it's too late, please suggest alternatives.",
      metadata: {
        googleAccessToken: 'dummy-access-token',
        timezone: 'Australia/Sydney',
      },
    });
    expect(typeof res.reply).toBe('string');
  }, 120_000);

  it('tool usage: find free slots uses calendar tool (LLM forced)', async () => {
    // Force intent to FIND_SLOTS by stubbing LLM
    const llmSpy = vi.spyOn((agent as any).llm, 'generate');
    llmSpy.mockResolvedValueOnce('FIND_SLOTS');

    const { findFreeSlotsTool } = await import('../src/agents/tools/calendar');

    const res = await agent.process({
      userId: 'appt_u2',
      sessionId: 'appt_s2',
      message: 'check available time slots next week',
      metadata: { googleAccessToken: 'dummy-access-token' },
    });
    expect(typeof res.reply).toBe('string');
    expect((findFreeSlotsTool as any).mock.calls.length).toBeGreaterThan(0);
  });
});
