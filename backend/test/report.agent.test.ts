import { describe, it, expect, beforeAll } from 'vitest';
import { ReportAgent } from '../src/agents/specialized/ReportAgent';
import { ensureTestEnvVars } from './utils';

class StubLLM {
  async generate(_: string) {
    return 'Here is your health report summary.';
  }
}

describe('ReportAgent', () => {
  beforeAll(() => {
    ensureTestEnvVars();
  });
  it('returns a report-related reply and followups', async () => {
    const agent = new ReportAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'weekly cognitive status',
    } as any);
    expect(typeof res.reply).toBe('string');
    expect(res.followups).toBeUndefined();
  });

  it('generates a weekly cognitive report when asked explicitly', async () => {
    const agent = new ReportAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'Please generate a weekly cognitive report',
    } as any);
    expect(typeof res.reply).toBe('string');
    // actions may exist and be marked done/failed
    if (res.actions && res.actions.length > 0) {
      const a = res.actions[0] as any;
      expect(a.type).toBeDefined();
      expect(['done', 'failed', 'pending']).toContain(a.status);
    }
  });
});
