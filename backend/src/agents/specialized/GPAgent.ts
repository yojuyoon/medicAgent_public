import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/AgentTypes';

export class GPAgent extends BaseAgent {
  constructor(llm: LLMService, logger: FastifyBaseLogger) {
    super(llm, logger, 'gp');
  }

  getCapabilities() {
    return ['general-practitioner-advice'];
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      const systemPrompt = `You are a General Practitioner (GP).
      Provide safe, evidence-based, and empathetic primary care advice.
      You can educate, triage, and suggest next steps, but you cannot diagnose nor prescribe.
      Escalate to emergency services for red flags (severe chest pain, stroke signs, suicidal ideation, severe bleeding).`;

      const userMessage = input.message;
      const prompt = `${systemPrompt}\n\nPatient: ${userMessage}\n\nGP:`;

      if (this.llm.generateWithUsage) {
        const { text, usage } = await this.llm.generateWithUsage(prompt, {
          temperature: 0.7,
        });
        const result: AgentOutput & { usageTotalTokens?: number } = {
          reply: text,
        };
        if (typeof usage?.totalTokens === 'number') {
          (result as any).usageTotalTokens = usage.totalTokens;
        }
        return result as AgentOutput;
      }

      const reply = await this.llm.generate(prompt, { temperature: 0.7 });
      return { reply };
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          userId: input.userId,
          sessionId: input.sessionId,
          originalMessage: input.message,
          metadata: input.metadata,
          intent: input.intent,
          entities: input.entities,
        },
        'GPAgent processing error:'
      );
      return {
        reply:
          "I'm sorry, I encountered an error while processing your request. Please try again.",
        actions: [
          {
            type: 'error',
            status: 'failed',
            payload: {
              reason: 'GP_PROCESSING_ERROR',
              details: String((error as any)?.message || error),
            },
          },
        ],
        followups: [
          {
            type: 'question',
            text: 'Is there anything else I can help you with?',
          },
        ],
      };
    }
  }
}
