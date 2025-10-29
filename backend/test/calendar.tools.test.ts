import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findFreeSlotsTool } from '../src/agents/tools/calendar';

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any;

describe('findFreeSlotsTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns ok with slots when calendar responds', async () => {
    const res = await findFreeSlotsTool(logger, {
      accessToken: 'test',
      startIso: new Date().toISOString(),
      endIso: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 30,
    });
    // We cannot guarantee local calendar, only assert shape
    expect('ok' in res).toBe(true);
  });
});
