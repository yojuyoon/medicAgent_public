import axios from 'axios';
import type { FastifyBaseLogger } from 'fastify';
import OpenAI from 'openai';
import { env } from '../lib/env';

export type LLMUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export interface LLMService {
  generate(prompt: string, options?: { temperature?: number }): Promise<string>;
  generateWithUsage?: (
    prompt: string,
    options?: { temperature?: number }
  ) => Promise<{ text: string; usage?: LLMUsage }>;
}

export class OllamaService implements LLMService {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger, baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl ?? env.OLLAMA_BASE ?? 'http://localhost:11434';
    this.model = model ?? env.OLLAMA_MODEL ?? 'llama3';
    this.logger = logger;
  }

  async generate(
    prompt: string,
    options?: { temperature?: number }
  ): Promise<string> {
    const body = {
      model: this.model,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.2,
        // Balanced token limit for complete reports without excessive delay
        num_predict: 512,
      },
    } as const;

    try {
      const res = await axios.post(`${this.baseUrl}/api/generate`, body, {
        headers: { 'content-type': 'application/json' },
      });
      const text: string = res.data?.response ?? '';
      return text;
    } catch (error) {
      this.logger.error({ err: error }, 'ollama generate failed');
      throw error;
    }
  }

  // Optional usage-aware API (best-effort; Ollama may not return usage)
  async generateWithUsage(
    prompt: string,
    options?: { temperature?: number }
  ): Promise<{ text: string; usage?: LLMUsage }> {
    const text = await this.generate(prompt, options);
    // If upstream starts returning usage, parse and map here.
    return { text };
  }
}

export class OpenAIService implements LLMService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: FastifyBaseLogger;

  constructor(logger: FastifyBaseLogger, apiKey?: string, model?: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey });
    this.model = model ?? 'gpt-5-nano';
    this.logger = logger;
    this.logger.info(`OpenAI service initialized with model: ${this.model}`);
  }

  async generate(
    prompt: string,
    options?: { temperature?: number }
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.1,
        max_tokens: 512, // Balanced token limit for complete reports without excessive delay
      });

      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      this.logger.error({ err: error }, 'OpenAI generate failed');
      throw error;
    }
  }

  async generateWithUsage(
    prompt: string,
    options?: { temperature?: number }
  ): Promise<{ text: string; usage?: LLMUsage }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.1,
        max_tokens: 512, // Balanced token limit for complete reports without excessive delay
      });

      const text = response.choices[0]?.message?.content ?? '';

      if (response.usage) {
        const usage: LLMUsage = {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        };
        return { text, usage };
      }

      return { text };
    } catch (error) {
      this.logger.error({ err: error }, 'OpenAI generateWithUsage failed');
      throw error;
    }
  }
}

// Factory function to create LLM service based on environment
export function createLLMService(logger: FastifyBaseLogger): LLMService {
  const provider = env.LLM_PROVIDER;

  switch (provider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new Error(
          'OPENAI_API_KEY is required when LLM_PROVIDER is set to openai'
        );
      }
      return new OpenAIService(logger, env.OPENAI_API_KEY);

    case 'ollama':
    default:
      return new OllamaService(logger);
  }
}

// Global LLM service instance (temporary using console)
export const llmService = createLLMService(console as any);
