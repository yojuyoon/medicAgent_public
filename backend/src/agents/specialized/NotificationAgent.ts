import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/AgentTypes';
import { putToNotificationDLQ } from '../../lib/bullmq';
import { mcp } from '../../mcp/redis-mcp';
import type { NotificationIntent } from './notification/types';
import { extractIntent } from './notification/planner';
import { evaluatePolicy } from './notification/policy';

export class NotificationAgent extends BaseAgent {
  private readonly defaultTz = 'Australia/Sydney';

  constructor(llm: LLMService, logger: FastifyBaseLogger) {
    super(llm, logger, 'notification');
  }

  getCapabilities() {
    return ['plan_notification', 'schedule_notification'];
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    const parsed = await extractIntent(this.llm, input.message);

    // CRUD-aware operations
    if (parsed.operation === 'cancel') {
      if (!parsed.notificationId) {
        const { findMatchingPlanTool } = await import('../tools/notification');
        const matchParams: {
          userId: string;
          utterance: string;
          timezone?: string;
        } = {
          userId: input.userId,
          utterance: input.message,
        };
        if (input.metadata?.timezone)
          matchParams.timezone = input.metadata.timezone;
        const match = await findMatchingPlanTool(this.logger, matchParams);
        if (match.ok) {
          parsed.notificationId = match.match.notificationId;
        } else if (match.reason === 'ambiguous') {
          return {
            reply:
              'I found multiple matching notifications. Please specify which one you want to cancel.',
            actions: [{ type: 'cancel_notification', status: 'pending' }],
          };
        } else {
          return {
            reply:
              "I couldn't find a matching notification to cancel. You can say 'list my notifications' to review them.",
            actions: [{ type: 'cancel_notification', status: 'failed' }],
          };
        }
      }
      const { cancelNotificationByIdTool } = await import(
        '../tools/notification'
      );
      const { ok } = await cancelNotificationByIdTool(parsed.notificationId);
      return {
        reply: ok
          ? 'The notification has been canceled.'
          : 'Could not find a notification to cancel.',
        actions: [
          { type: 'cancel_notification', status: ok ? 'done' : 'failed' },
        ],
      };
    }
    if (parsed.operation === 'query') {
      const { listUserPlansTool } = await import('../tools/notification');
      const res = await listUserPlansTool(input.userId);
      const plans = res.ok ? res.plans : [];
      return {
        reply: `You have ${plans.length} notifications.`,
        actions: [
          {
            type: 'query_notification',
            status: 'done',
            payload: { count: plans.length },
          },
        ],
      };
    }
    // Update: if no explicit notificationId, try to resolve by matching user's plans
    if (parsed.operation === 'update' && !parsed.notificationId) {
      const { findMatchingPlanTool } = await import('../tools/notification');
      const matchParams: {
        userId: string;
        utterance: string;
        timezone?: string;
      } = {
        userId: input.userId,
        utterance: input.message,
      };
      if (input.metadata?.timezone)
        matchParams.timezone = input.metadata.timezone;
      const match = await findMatchingPlanTool(this.logger, matchParams);
      if (match.ok) {
        parsed.notificationId = match.match.notificationId;
      } else if (match.reason === 'ambiguous') {
        return {
          reply:
            'I found multiple matching notifications. Please specify which one you want to update.',
          actions: [{ type: 'update_notification', status: 'pending' }],
          followups: [
            {
              type: 'question',
              text: 'I found several notifications around that date. Can you clarify which one?',
            },
          ],
        };
      } else {
        return {
          reply:
            "I couldn't find a matching notification to update. You can say 'list my notifications' to review them.",
          actions: [{ type: 'update_notification', status: 'failed' }],
        };
      }
    }

    // Update: remove old job (if notificationId provided) then re-schedule with same id
    if (parsed.operation === 'update' && parsed.notificationId) {
      const existing = await mcp.getJobId(parsed.notificationId);
      if (existing) {
        await mcp.removeJobById(existing);
      }
    }
    // Generate message body if not provided by LLM parsing
    if (!parsed.message || parsed.message.trim() === '') {
      parsed.message = await this.generateNotificationMessage(
        parsed,
        input.message
      );
    }

    const policy = evaluatePolicy(parsed as NotificationIntent, {
      defaultTz: this.defaultTz,
      input,
    });

    if (!policy.ok) {
      await putToNotificationDLQ(policy.error, { input, parsed });
      return {
        reply: `Unable to schedule notification: ${policy.error}`,
        actions: [
          {
            type: 'plan_notification',
            status: 'failed',
            payload: { reason: policy.error },
          },
        ],
      };
    }

    const plan = policy.plan;

    try {
      // Use provided notificationId for update to keep identity; otherwise idempotencyKey
      const notificationId = parsed.notificationId || plan.idempotencyKey;
      const { enqueueNotificationTool } = await import('../tools/notification');
      const enq = await enqueueNotificationTool(this.logger, {
        plan,
        idempotencyKey: notificationId,
      });
      if (!enq.ok) throw new Error(enq.error);
      const jobId = enq.jobId;
      await mcp.savePlanForUser(
        input.userId,
        notificationId,
        plan,
        jobId,
        'scheduled'
      );
      const result = {
        reply: `Notification scheduled. jobId=${jobId}`,
        actions: [
          {
            type: 'schedule_notification',
            status: 'done' as const,
            payload: { jobId },
          },
        ],
        followups: [
          { type: 'info' as const, text: plan.policyNotes?.join(' \n') ?? '' },
        ],
      };

      // Set sharedData for collaboration
      (result as any).sharedData = {
        notificationSchedule: {
          jobId,
          plan,
          notificationId,
          userId: input.userId,
          message: input.message,
          timestamp: new Date().toISOString(),
        },
      };

      return result;
    } catch (err: unknown) {
      const reason =
        err instanceof Error
          ? `ENQUEUE_FAILED: ${err.message}`
          : 'ENQUEUE_FAILED: unknown';

      this.logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          userId: input.userId,
          sessionId: input.sessionId,
          originalMessage: input.message,
          parsed,
          plan,
          reason,
        },
        'NotificationAgent enqueue error:'
      );

      await putToNotificationDLQ(reason, { input, plan });
      return {
        reply: 'An error occurred while enqueuing. Please try again later.',
        actions: [
          {
            type: 'schedule_notification',
            status: 'failed',
            payload: { reason },
          },
        ],
      };
    }
  }

  // helpers moved to notification/{planner,policy}

  private async generateNotificationMessage(
    intent: NotificationIntent,
    originalMessage: string
  ): Promise<string> {
    const prompt = `You are a notification message generator. 
Generate a concise, friendly notification message based on the user's intent and original message.

Rules:
- Keep it short and clear
- Be friendly but professional
- Focus on the key information (medication, time, etc.)
- Use Korean language for the output message
- No emojis in the output

Examples:
- User: "Please send me a blood pressure medication reminder tomorrow at 2pm"
- Generated: "Blood pressure medication reminder (tomorrow at 2pm)"

- User: "Vitamin reminder in the morning"
- Generated: "Vitamin reminder (morning)"

- User: "Check my hospital appointment"
- Generated: "Hospital appointment reminder"

Intent: ${intent.intent}
Original message: ${originalMessage}
Schedule: ${JSON.stringify(intent.schedule)}

Generate notification message:`;

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.3 });
      return response.trim();
    } catch (error) {
      this.logger.warn(
        { error },
        'Failed to generate notification message, using fallback'
      );
      return `Notification: ${originalMessage}`;
    }
  }
}
