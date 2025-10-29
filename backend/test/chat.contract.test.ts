import { describe, it, expect } from 'vitest';
import { GPAgent } from '../src/agents/specialized/GPAgent';

class StubLLM {
  async generate(_: string) {
    return 'General advice response.';
  }
}

describe('GPAgent contract', () => {
  it('returns reply and optional followups with allowed types', async () => {
    const agent = new GPAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'hello',
    } as any);
    expect(typeof res.reply).toBe('string');
    const allowed = new Set(['question', 'confirm', 'info']);
    for (const f of res.followups || []) {
      expect(allowed.has(f.type)).toBe(true);
    }
  });
});
