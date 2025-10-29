import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { redis } from './redis';

export const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const pingNotificationQueue = async () => {
  try {
    const client = await notificationQueue.client;
    await client.ping();
    return { connected: true, message: 'NotificationQueue connected' };
  } catch (error) {
    return {
      connected: false,
      message: `NotificationQueue connection failed: ${error}`,
    };
  }
};

// Dead-letter queue for pre-enqueue validation failures or enqueue errors
// Note: BullMQ queue names must not include ':'
export const notificationDLQ = new Queue('notifications_dlq', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export type NotificationPlan = {
  channel: 'sms' | 'whatsapp';
  to: string[];
  body: string;
  scheduleAt?: string; // ISO 8601
  repeat?: { cron: string; tz?: string; limit?: number };
  retry: { attempts: number; backoffMs: number };
  idempotencyKey: string;
  labels?: string[];
  policyNotes?: string[];
};

export const enqueueNotification = async (plan: NotificationPlan) => {
  const now = Date.now();
  let opts: JobsOptions = {
    attempts: plan.retry?.attempts ?? 3,
    backoff: plan.retry?.backoffMs
      ? { type: 'exponential', delay: plan.retry.backoffMs }
      : { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
    jobId: plan.idempotencyKey,
  };

  if (plan.scheduleAt && !plan.repeat) {
    const ts = new Date(plan.scheduleAt).getTime();
    let delay = Math.max(0, ts - now);
    // Ensure a minimal positive delay to classify as delayed job when intended
    if (delay === 0) {
      delay = 20_000; // 20 seconds
    }
    opts = { ...opts, delay };
  }
  if (plan.repeat) {
    opts = {
      ...opts,
      repeat: {
        cron: plan.repeat.cron,
        tz: plan.repeat.tz,
        limit: plan.repeat.limit,
      },
    } as JobsOptions;
  }

  const job = await notificationQueue.add('notify', plan, opts);
  return job.id as string;
};

export const putToNotificationDLQ = async (
  reason: string,
  payload: unknown
) => {
  const job = await notificationDLQ.add('dead_letter', {
    reason,
    payload,
    timestamp: new Date().toISOString(),
  });
  return job.id as string;
};
