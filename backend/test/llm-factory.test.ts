import { describe, it, expect, vi } from 'vitest';
import { createLLMService } from '../src/services/llm';
import { env } from '../src/lib/env';

// Mock the env module
vi.mock('../src/lib/env', () => ({
  env: {
    LLM_PROVIDER: 'ollama',
    OPENAI_API_KEY: undefined,
  },
}));

describe('LLM Service Factory', () => {
  const mockLogger = console as any;

  it('should create OllamaService by default', () => {
    const service = createLLMService(mockLogger);
    expect(service).toBeDefined();
    expect(service.constructor.name).toBe('OllamaService');
  });

  it('should create OllamaService when LLM_PROVIDER is ollama', () => {
    vi.mocked(env).LLM_PROVIDER = 'ollama';
    const service = createLLMService(mockLogger);
    expect(service).toBeDefined();
    expect(service.constructor.name).toBe('OllamaService');
  });

  it('should create OpenAIService when LLM_PROVIDER is openai and API key is provided', () => {
    vi.mocked(env).LLM_PROVIDER = 'openai';
    vi.mocked(env).OPENAI_API_KEY = 'sk-test-key';

    const service = createLLMService(mockLogger);
    expect(service).toBeDefined();
    expect(service.constructor.name).toBe('OpenAIService');
  });

  it('should throw error when LLM_PROVIDER is openai but API key is missing', () => {
    vi.mocked(env).LLM_PROVIDER = 'openai';
    vi.mocked(env).OPENAI_API_KEY = undefined;

    expect(() => {
      createLLMService(mockLogger);
    }).toThrow('OPENAI_API_KEY is required when LLM_PROVIDER is set to openai');
  });
});
