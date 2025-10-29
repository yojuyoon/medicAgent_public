import { describe, it, expect, vi } from 'vitest';

// Mock the redis-mcp module that listUserPlansTool uses
vi.mock('../src/mcp/redis-mcp', () => ({
  mcp: {
    listUserPlans: vi.fn().mockResolvedValue([
      { id: 'n1', plan: { when: { iso: '2025-07-03T09:00:00.000Z' } } },
      { id: 'n2', plan: { when: { iso: '2025-07-05T09:00:00.000Z' } } },
    ]),
  },
}));

import { findMatchingPlanTool } from '../src/agents/tools/notification';
const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any;

// (No-op) Ensure mock is hoisted by placing vi.mock above imports

describe('findMatchingPlanTool', () => {
  it('matches by MM/DD date mention', async () => {
    const res = await findMatchingPlanTool(logger, {
      userId: 'u1',
      utterance: 'change my last appointment to 7/5',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.match.notificationId).toBe('n2');
  });

  it('returns not_found if no date match', async () => {
    const res = await findMatchingPlanTool(logger, {
      userId: 'u1',
      utterance: 'hello world',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_found');
  });
});
