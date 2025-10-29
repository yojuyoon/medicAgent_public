import type { AgentInput } from '../../base/AgentTypes';
import type { NotificationPlan } from '../../../lib/bullmq';

export type OperationType = 'create' | 'update' | 'cancel' | 'query';

export type NotificationIntent = {
  intent: 'notify' | 'remind' | 'follow_up';
  channel: 'sms' | 'whatsapp';
  recipients: Array<{ phoneE164: string; name?: string }>;
  schedule:
    | { type: 'now' }
    | { type: 'datetime'; iso: string; timezone?: string }
    | { type: 'relative'; durationISO8601: string }
    | { type: 'cron'; expr: string; timezone?: string; limit?: number };
  templateKey?: string;
  message?: string;
  variables?: Record<string, string | number>;
  timezone?: string;
  metadata?: Record<string, string>;
};

export type ParsedIntent = NotificationIntent & {
  operation?: OperationType;
  notificationId?: string;
};

export type PolicyContext = {
  defaultTz: string;
  input: AgentInput;
};

export type PolicyResult =
  | { ok: true; plan: NotificationPlan; notes: string[] }
  | { ok: false; error: string; notes?: string[] };
