import { describe, it, expect } from 'vitest';
import { NotificationAgent } from '../src/agents/specialized/NotificationAgent';
import { ReportAgent } from '../src/agents/specialized/ReportAgent';

class StubLLM {
  async generate(_: string) {
    return 'ok';
  }
}

const allowedFollowupTypes = new Set(['question', 'confirm', 'info']);

describe('Agent contract - followups type', () => {
  it('NotificationAgent returns allowed followup types', async () => {
    const agent = new NotificationAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'Notify me to take aspirin at 8 pm',
    } as any);
    for (const f of res.followups || []) {
      expect(allowedFollowupTypes.has(f.type)).toBe(true);
    }
  });

  it('ReportAgent returns allowed followup types', async () => {
    const agent = new ReportAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'weekly cognitive status',
    } as any);
    for (const f of res.followups || []) {
      expect(allowedFollowupTypes.has(f.type)).toBe(true);
    }
  });
});
