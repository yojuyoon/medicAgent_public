import { describe, it, expect } from 'vitest';
import { GPAgent } from '../src/agents/specialized/GPAgent';

class StubLLM {
  async generate(_: string) {
    return 'Stay hydrated and get enough sleep.';
  }
}

describe('GPAgent', () => {
  it('returns a helpful reply', async () => {
    const agent = new GPAgent(new StubLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'Give me general health advice',
    } as any);
    expect(typeof res.reply).toBe('string');
    expect(res.reply.length).toBeGreaterThan(0);
  });
});
