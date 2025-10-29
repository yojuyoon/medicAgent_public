import { describe, it, expect } from 'vitest';
import { AppointmentAgent } from '../src/agents/specialized/AppointmentAgent';

class StubLLM {
  async generate(prompt: string) {
    if (/Determine the intent/i.test(prompt)) return 'FIND_SLOTS';
    return 'ok';
  }
}

describe('AppointmentAgent', () => {
  it('asks to connect Google when token missing', async () => {
    const agent = new AppointmentAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'find available times',
      metadata: {},
    } as any);
    expect(res.actions?.[0]?.type).toBe('auth_required');
  });
});
