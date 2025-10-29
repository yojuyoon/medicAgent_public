import { describe, it, expect } from 'vitest';
import { AppointmentAgent } from '../src/agents/specialized/AppointmentAgent';

class ThrowLLM {
  async generate(): Promise<string> {
    throw new Error('LLM failure');
  }
}

describe('AppointmentAgent error handling', () => {
  it('returns standardized error payload on processing failure', async () => {
    const agent = new AppointmentAgent(new ThrowLLM() as any, console as any);
    const res = await agent.process({
      userId: 'u',
      sessionId: 's',
      message: 'book an appointment',
      metadata: { googleAccessToken: 'valid-token' },
    } as any);
    expect(res.actions?.[0]?.type).toBe('error');
    expect(res.actions?.[0]?.status).toBe('failed');
    expect((res.actions?.[0]?.payload as any)?.reason).toBe(
      'APPOINTMENT_PROCESSING_ERROR'
    );
    expect(typeof res.reply).toBe('string');
  });
});
