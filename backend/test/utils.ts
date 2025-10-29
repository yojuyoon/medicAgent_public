import type { LLMService } from '../src/services/llm';
import { notificationQueue } from '../src/lib/bullmq';

export function ensureTestEnvVars() {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.SUPABASE_ANON_KEY = 'test';
  process.env.CHROMA_URL = 'http://localhost:8000';
  process.env.CHROMA_USERNAME = 'user';
  process.env.CHROMA_PASSWORD = 'pass';
  process.env.CHROMA_SERVER_HOST = 'localhost';
  process.env.CHROMA_SERVER_HTTP_PORT = '8000';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.OLLAMA_BASE = 'http://localhost:11434';
  process.env.OLLAMA_MODEL = 'llama3.2:1b';
}

export class NotificationStubLLM implements LLMService {
  private lastId: string | undefined;

  // Extract phone numbers from user text
  private extractPhoneNumbers(text: string): string[] {
    // More specific regex for phone numbers (E.164 format)
    const phoneRegex = /\+?[1-9]\d{7,14}/g;
    const matches = text.match(phoneRegex);
    return matches
      ? matches.map(phone => (phone.startsWith('+') ? phone : `+${phone}`))
      : [];
  }

  async generate(prompt: string): Promise<string> {
    const mUser = prompt.match(/User:\s*([\s\S]*?)\nJSON:/);
    const userText = mUser?.[1] ?? '';
    const phoneNumbers = this.extractPhoneNumbers(userText);

    if (/\bcancel\b/i.test(userText)) {
      const m = prompt.match(/id\s+([a-f0-9]{8,})/i);
      const id = m?.[1] || this.lastId || 'deadbeef';
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients:
          phoneNumbers.length > 0
            ? phoneNumbers.map(phone => ({ phoneE164: phone }))
            : [{ phoneE164: '+61412345678' }],
        schedule: { type: 'now' },
        operation: 'cancel',
        notificationId: id,
      });
    }
    if (/\bupdate\b/i.test(userText)) {
      const m = prompt.match(/id\s+([a-f0-9]{8,})/i);
      const id = m?.[1] || this.lastId || 'deadbeef';
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients:
          phoneNumbers.length > 0
            ? phoneNumbers.map(phone => ({ phoneE164: phone }))
            : [{ phoneE164: '+61412345678' }],
        schedule: { type: 'now' },
        operation: 'update',
        notificationId: id,
        message: 'updated',
      });
    }
    if (/\bquery\b/i.test(userText)) {
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients:
          phoneNumbers.length > 0
            ? phoneNumbers.map(phone => ({ phoneE164: phone }))
            : [{ phoneE164: '+61412345678' }],
        schedule: { type: 'now' },
        operation: 'query',
      });
    }
    if (/\binvalid\b/i.test(userText)) {
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients: [],
        schedule: { type: 'now' },
        message: 'hello',
      });
    }
    if (/\btemplate\b/i.test(userText)) {
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients:
          phoneNumbers.length > 0
            ? phoneNumbers.map(phone => ({ phoneE164: phone }))
            : [{ phoneE164: '+61412345678' }],
        schedule: { type: 'now' },
        templateKey: 'reminder.simple',
        variables: { name: 'John', text: 'Take pill' },
      });
    }
    if (/\b(in\s+10m|in\s+10 minutes)\b/i.test(userText)) {
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients:
          phoneNumbers.length > 0
            ? phoneNumbers.map(phone => ({ phoneE164: phone }))
            : [{ phoneE164: '+61412345678' }],
        schedule: { type: 'relative', durationISO8601: 'PT10M' },
        message: 'relative',
      });
    }
    if (/\bcron\b/i.test(userText)) {
      return JSON.stringify({
        intent: 'notify',
        channel: 'sms',
        recipients:
          phoneNumbers.length > 0
            ? phoneNumbers.map(phone => ({ phoneE164: phone }))
            : [{ phoneE164: '+61412345678' }],
        schedule: {
          type: 'cron',
          expr: '* * * * *',
          timezone: 'Australia/Sydney',
        },
        message: 'cron',
      });
    }
    return JSON.stringify({
      intent: 'notify',
      channel: 'sms',
      recipients:
        phoneNumbers.length > 0
          ? phoneNumbers.map(phone => ({ phoneE164: phone }))
          : [{ phoneE164: '+61412345678' }],
      schedule: { type: 'now' },
      message: 'hello',
    });
  }

  setLastId(id: string) {
    this.lastId = id;
  }
}

export async function clearNotificationQueue() {
  // Remove repeatable jobs (cron) first
  const repeatables = await notificationQueue.getRepeatableJobs();
  await Promise.all(
    repeatables.map(r => notificationQueue.removeRepeatableByKey(r.key))
  );
  // Then remove pending/active/delayed jobs
  const jobs = await notificationQueue.getJobs([
    'waiting',
    'delayed',
    'active',
  ]);
  await Promise.all(jobs.map(j => j?.remove?.()));
}
