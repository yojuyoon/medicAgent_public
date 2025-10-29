import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_ANON_KEY: z.string(),
  CHROMA_URL: z.string(),
  CHROMA_USERNAME: z.string(),
  CHROMA_PASSWORD: z.string(),
  CHROMA_SERVER_HOST: z.string(),
  CHROMA_SERVER_HTTP_PORT: z.string(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.string(),
  REDIS_PASSWORD: z.string().optional(),
  OLLAMA_BASE: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(['ollama', 'openai']).default('ollama'),
  DEFAULT_TZ: z.string().default('Australia/Sydney'),
});

export const env = envSchema.parse(process.env);
