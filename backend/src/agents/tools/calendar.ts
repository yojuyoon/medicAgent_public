import type { FastifyBaseLogger } from 'fastify';
import type { CalendarEvent } from '../../services/google-calendar';
import { GoogleCalendarService } from '../../services/google-calendar';

export type TimeSlot = { start: string; end: string };

// Calendar tool node: find free slots
export async function findFreeSlotsTool(
  logger: FastifyBaseLogger,
  params: {
    accessToken: string;
    startIso: string;
    endIso: string;
    durationMinutes: number;
  }
): Promise<{ ok: true; data: TimeSlot[] } | { ok: false; error: string }> {
  try {
    const { accessToken, startIso, endIso, durationMinutes } = params;
    const calendarService = new GoogleCalendarService(logger);
    const slots = await calendarService.findFreeSlots(
      accessToken,
      startIso,
      endIso,
      durationMinutes
    );
    return { ok: true, data: slots };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error('findFreeSlotsTool error:', err as any);
    return { ok: false, error: message };
  }
}

// Calendar tool node: create event
export async function createEventTool(
  logger: FastifyBaseLogger,
  params: { accessToken: string; event: CalendarEvent }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { accessToken, event } = params;
    const calendarService = new GoogleCalendarService(logger);
    const result = await calendarService.createEvent(accessToken, event);
    return { ok: true, id: (result as any).id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error('createEventTool error:', err as any);
    return { ok: false, error: message };
  }
}
