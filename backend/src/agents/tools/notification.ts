import type { FastifyBaseLogger } from 'fastify';
import { enqueueNotification } from '../../lib/bullmq';
import { mcp } from '../../mcp/redis-mcp';

// Enqueue notification with idempotency support
export async function enqueueNotificationTool(
  logger: FastifyBaseLogger,
  params: { plan: any; idempotencyKey: string }
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    const { plan, idempotencyKey } = params;
    const jobId = await enqueueNotification({ ...plan, idempotencyKey });
    return { ok: true, jobId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'enqueueNotificationTool failed');
    return { ok: false, error: message };
  }
}

// Cancel scheduled notification by notificationId (mapped to job id via MCP)
export async function cancelNotificationByIdTool(
  notificationId: string
): Promise<{ ok: boolean }> {
  const existing = await mcp.getJobId(notificationId);
  if (!existing) return { ok: false };
  await mcp.removeJobById(existing);
  return { ok: true };
}

// List user plans from MCP
export async function listUserPlansTool(
  userId: string
): Promise<{ ok: true; plans: any[] } | { ok: false; error: string }> {
  try {
    const plans = await mcp.listUserPlans(userId);
    return { ok: true, plans };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return { ok: false, error: message };
  }
}

// Find best matching plan from user's list based on natural language hint
export async function findMatchingPlanTool(
  logger: FastifyBaseLogger,
  params: {
    userId: string;
    utterance: string; // e.g., "Change the appointment I booked on 7/3 to 7/5"
    timezone?: string;
  }
): Promise<
  | { ok: true; match: { notificationId: string; plan: any } }
  | {
      ok: false;
      reason: 'not_found' | 'ambiguous' | 'error';
      candidates?: any[];
      error?: string;
    }
> {
  try {
    const res = await listUserPlansTool(params.userId);
    if (!res.ok) return { ok: false, reason: 'error', error: res.error };
    const plans = res.plans || [];
    if (plans.length === 0) return { ok: false, reason: 'not_found' };

    // Simple temporal parsing: extract MM/DD or M/D patterns
    const dateMatches = Array.from(
      params.utterance.matchAll(/(\d{1,2})\/(\d{1,2})/g)
    );
    const mentionedDates = dateMatches.map((m) => ({
      month: parseInt(m[1]!, 10),
      day: parseInt(m[2]!, 10),
    }));
    const target = mentionedDates.length
      ? mentionedDates[mentionedDates.length - 1]
      : undefined;

    // Score candidates by date proximity and simple text hints
    const candidates = plans
      .map((p: any) => {
        const id = p?.notificationId || p?.id;
        const whenIso: string | null =
          (p?.plan?.when?.iso as string | undefined) ||
          (p?.plan?.schedule?.iso as string | undefined) ||
          null;
        const summary = p?.plan?.summary || p?.plan?.templateKey || '';
        if (!id || !whenIso) {
          return { id: undefined, plan: p?.plan || p, score: 0 };
        }
        let dateScore = 0;
        if (mentionedDates.length > 0 && whenIso) {
          const dt = new Date(whenIso);
          const month = dt.getUTCMonth() + 1;
          const day = dt.getUTCDate();
          // Check against all mentioned dates and take the highest score
          for (const d of mentionedDates) {
            if (month === d.month && day === d.day) {
              dateScore = Math.max(dateScore, 1); // exact day match
            }
          }
        }
        const textScore =
          /appointment|booking|reminder|notification|report/i.test(
            params.utterance
          )
            ? 0.1
            : 0;
        const score = dateScore + textScore;
        return { id, plan: p?.plan || p, score };
      })
      .filter((c: any) => !!c.id)
      .sort((a: any, b: any) => b.score - a.score);

    if (candidates.length === 0) {
      return { ok: false, reason: 'not_found' };
    }

    // If no date mentioned, return not_found
    if (mentionedDates.length === 0) {
      return { ok: false, reason: 'not_found' };
    }

    // If date mentioned but top candidate scored 0, lift to minimal score
    if (candidates[0]?.score === 0) {
      candidates[0].score = 0.5;
    }

    // If multiple top ties, mark as ambiguous
    const top = candidates[0]!;
    const ties = candidates.filter((c) => c.score === top.score);
    if (ties.length > 1) {
      return { ok: false, reason: 'ambiguous', candidates: ties.slice(0, 3) };
    }

    return {
      ok: true,
      match: { notificationId: String(top.id), plan: top.plan },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'findMatchingPlanTool failed');
    return { ok: false, reason: 'error', error: message };
  }
}
