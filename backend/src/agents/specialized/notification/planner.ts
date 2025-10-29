import type { LLMService } from '../../../services/llm';
import type { ParsedIntent } from './types';

export async function extractIntent(
  llm: LLMService,
  message: string
): Promise<ParsedIntent> {
  const system = `You are a strict JSON information extractor.
Return ONLY valid JSON with this TypeScript type (no comments, no markdown):
{
  "intent": "notify" | "remind" | "follow_up",
  "channel": "sms" | "whatsapp",
  "recipients": Array<{ "phoneE164": string, "name"?: string }> ,
  "schedule":
    | { "type": "now" }
    | { "type": "datetime", "iso": string, "timezone"?: string }
    | { "type": "relative", "durationISO8601": string }
    | { "type": "cron", "expr": string, "timezone"?: string, "limit"?: number },
  "templateKey"?: string,
  "message"?: string,
  "variables"?: Record<string, string | number>,
  "timezone"?: string,
  "metadata"?: Record<string, string>,
  "operation"?: "create" | "update" | "cancel" | "query",
  "notificationId"?: string
}

Rules:
- Use E.164 for phone numbers (e.g., +61412345678). If not provided, leave recipients empty.
- If unsure about schedule, use { "type": "now" }.
- Prefer channel "sms".
- Do not invent data.`;

  const prompt = `${system}\n\nUser: ${message}\nJSON:`;
  const raw = await llm.generate(prompt, { temperature: 0 });
  try {
    return JSON.parse(raw) as ParsedIntent;
  } catch {
    return {
      intent: 'notify',
      channel: 'sms',
      recipients: [],
      schedule: { type: 'now' },
    };
  }
}
