export const FALLBACK_INTENT = 'health.advice' as const;

export const INTENT_TO_ROUTE: Record<
  string,
  'appointment' | 'report' | 'notification' | 'gp'
> = {
  'appointment.book': 'appointment',
  'appointment.check': 'appointment',
  'report.cognitive.weekly': 'report',
  'report.generate': 'report',
  'report.summary': 'report',
  'report.status': 'report',
  'health.advice': 'gp',
  'notification.schedule': 'notification',
};

export function resolveRoute(
  intent: string
): 'appointment' | 'report' | 'notification' | 'gp' {
  return INTENT_TO_ROUTE[intent] ?? 'gp';
}

type GuardInput = {
  intent: string;
  entities?: Record<string, unknown>;
  metadata?: any;
};

export type BlockResult = { blocked: boolean; reason?: string };

export const BLOCK_RULES: Array<(input: GuardInput) => BlockResult> = [
  // Block appointment intents when missing Google token
  ({ intent, metadata }) => {
    if (
      /^appointment\./.test(intent) &&
      (!metadata ||
        !metadata.googleAccessToken ||
        metadata.googleAccessToken === 'test-token')
    ) {
      return {
        blocked: true,
        reason: 'Google Calendar access is required to manage appointments.',
      };
    }
    return { blocked: false };
  },
];
