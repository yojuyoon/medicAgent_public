import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIService } from '../src/services/llm';

describe('OpenAI Service', () => {
  let openaiService: OpenAIService;

  beforeAll(() => {
    // Mock API key for testing
    const mockApiKey = 'sk-test-key';
    const mockLogger = console as any;
    openaiService = new OpenAIService(mockLogger, mockApiKey);
  });

  it('should create OpenAI service instance', () => {
    expect(openaiService).toBeDefined();
  });

  it('should throw error when API key is missing', () => {
    const mockLogger = console as any;
    expect(() => {
      new OpenAIService(mockLogger, undefined);
    }).toThrow('OpenAI API key is required');
  });

  it('should throw error when API key is empty', () => {
    const mockLogger = console as any;
    expect(() => {
      new OpenAIService(mockLogger, '');
    }).toThrow('OpenAI API key is required');
  });
});
