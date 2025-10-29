import { z } from 'zod';

export const SharedDataSchema = z
  .object({
    medicationSchedule: z.any().optional(),
  })
  .partial()
  .default({});

export const ContextSchema = z.object({
  intent: z.string().optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
  sharedData: SharedDataSchema.optional(),
});

export type SharedData = z.infer<typeof SharedDataSchema>;
export type GraphContext = z.infer<typeof ContextSchema>;

export function validateContext(ctx: unknown): GraphContext {
  const parsed = ContextSchema.safeParse(ctx ?? {});
  if (parsed.success) return parsed.data;
  return { sharedData: {} };
}
