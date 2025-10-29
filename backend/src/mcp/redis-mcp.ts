import { redis } from '../lib/redis';
import { notificationQueue, notificationDLQ } from '../lib/bullmq';
import type { JobsOptions } from 'bullmq';

export type PlanStatus = 'scheduled' | 'canceled' | 'completed' | 'failed';

export const mcp = {
  async enqueueNotification(
    payload: unknown,
    options?: { idempotencyKey?: string }
  ) {
    let addOpts: Partial<JobsOptions> = {};
    if (options?.idempotencyKey) addOpts.jobId = options.idempotencyKey;
    const job = await notificationQueue.add(
      'notify',
      payload as any,
      addOpts as JobsOptions
    );
    return job.id as string;
  },

  async putDLQ(reason: string, payload: unknown) {
    const job = await notificationDLQ.add('dead_letter', {
      reason,
      payload,
      timestamp: new Date().toISOString(),
    });
    return job.id as string;
  },

  async getQueueCounts() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
      notificationQueue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  },

  async kvSet(key: string, value: unknown) {
    if (!key.startsWith('app:notifications:')) throw new Error('forbidden key');
    await redis.set(key, JSON.stringify(value));
  },
  async kvGet<T = unknown>(key: string): Promise<T | null> {
    if (!key.startsWith('app:notifications:')) throw new Error('forbidden key');
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  },

  async savePlanForUser(
    userId: string,
    notificationId: string,
    plan: unknown,
    jobId: string,
    status: PlanStatus
  ) {
    const planKey = `app:notifications:plan:${notificationId}`;
    const idxKey = `app:notifications:index:${userId}`;
    const jobKey = `app:notifications:job:${notificationId}`;
    await Promise.all([
      redis.set(
        planKey,
        JSON.stringify({
          userId,
          notificationId,
          plan,
          jobId,
          status,
          updatedAt: new Date().toISOString(),
        })
      ),
      redis.sadd(idxKey, notificationId),
      redis.set(jobKey, jobId),
    ]);
  },

  async listUserPlans(userId: string) {
    const idxKey = `app:notifications:index:${userId}`;
    const ids: string[] = await redis.smembers(idxKey);
    const keys = ids.map((id: string) => `app:notifications:plan:${id}`);
    if (keys.length === 0) return [] as unknown[];
    const vals: Array<string | null> = await redis.mget(keys);
    return vals
      .map((v: string | null) => (v ? JSON.parse(v) : null))
      .filter(Boolean);
  },

  async getPlan(notificationId: string) {
    const planKey = `app:notifications:plan:${notificationId}`;
    const v = await redis.get(planKey);
    return v ? JSON.parse(v) : null;
  },

  async getJobId(notificationId: string) {
    const jobKey = `app:notifications:job:${notificationId}`;
    return (await redis.get(jobKey)) as string | null;
  },

  async removeJobById(jobId: string) {
    const job = await notificationQueue.getJob(jobId);
    if (!job) return false;
    await job.remove();
    return true;
  },

  async setPlanStatus(notificationId: string, status: PlanStatus) {
    const planKey = `app:notifications:plan:${notificationId}`;
    const curr = JSON.parse((await redis.get(planKey)) || '{}');
    await redis.set(
      planKey,
      JSON.stringify({ ...curr, status, updatedAt: new Date().toISOString() })
    );
  },

  async cancelByNotificationId(notificationId: string) {
    const jobId = await this.getJobId(notificationId);
    if (!jobId) return false;
    const ok = await this.removeJobById(jobId);
    if (!ok) return false;
    await this.setPlanStatus(notificationId, 'canceled');
    return true;
  },
};
