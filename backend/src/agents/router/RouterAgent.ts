import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/AgentTypes';
import {
  BLOCK_RULES,
  FALLBACK_INTENT,
  INTENT_TO_ROUTE,
  resolveRoute,
} from './intent-routing';

export class RouterAgent extends BaseAgent {
  private readonly registry = new Map<string, BaseAgent>();

  constructor(llm: LLMService, logger: FastifyBaseLogger) {
    super(llm, logger, 'router');
  }

  register(name: string, agent: BaseAgent) {
    this.registry.set(name, agent);
  }

  getCapabilities() {
    return ['route', 'classify', 'plan'];
  }

  async process(
    input: AgentInput
  ): Promise<
    AgentOutput & { route: string; intent: string; usageTotalTokens?: number }
  > {
    try {
      const {
        intent,
        entities,
        usageTotalTokens,
        multiAgentRequest,
        additionalAgents,
      } = await this.classify(input.message);
      // apply guards
      for (const guard of BLOCK_RULES) {
        const res = guard({
          intent,
          entities,
          metadata: (input as any).metadata,
        });
        if (res.blocked) {
          return {
            route: 'none',
            intent: 'blocked',
            reply: res.reason || 'Request is blocked by guard rule.',
          } as unknown as AgentOutput & { route: string; intent: string };
        }
      }

      const route = resolveRoute(intent);
      const target = this.registry.get(route) ?? this.registry.get('gp');
      if (!target) {
        // Fallback to chat route semantics even if registry is empty
        return {
          route: 'gp',
          intent,
          reply: "I'm not sure how to help with that yet.",
        } as unknown as AgentOutput & { route: string; intent: string };
      }

      const result = await target.process({ ...input, intent, entities });
      const usagePart =
        typeof usageTotalTokens === 'number' ? { usageTotalTokens } : {};
      const multiAgentPart = {
        ...(multiAgentRequest && { multiAgentRequest }),
        ...(additionalAgents && { additionalAgents }),
      };
      return {
        route,
        intent,
        ...usagePart,
        ...multiAgentPart,
        ...result,
      } as AgentOutput & {
        route: string;
        intent: string;
        usageTotalTokens?: number;
        multiAgentRequest?: boolean;
        additionalAgents?: string[];
      };
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          userId: input.userId,
          sessionId: input.sessionId,
          originalMessage: input.message,
          metadata: input.metadata,
        },
        'RouterAgent processing error:'
      );
      return {
        route: 'gp',
        intent: 'error',
        reply:
          "I'm sorry, I encountered an error while processing your request. Please try again.",
        actions: [
          {
            type: 'error',
            status: 'failed',
            payload: {
              reason: 'ROUTER_PROCESSING_ERROR',
              details: String((error as any)?.message || error),
            },
          },
        ],
      } as unknown as AgentOutput & { route: string; intent: string };
    }
  }

  private async classify(message: string): Promise<{
    intent: string;
    entities: Record<string, unknown>;
    usageTotalTokens?: number;
    multiAgentRequest?: boolean;
    additionalAgents?: string[];
  }> {
    try {
      // Step 1: Try LLM-based multi-agent classification
      const llmResult = await this.llmBasedClassificationWithDetails(message);
      if (llmResult) {
        this.logger.info(
          {
            intent: llmResult.intent,
            method: 'llm-multi-agent',
            multiAgent: llmResult.multiAgentRequest,
            additionalAgents: llmResult.additionalAgents,
          },
          'Intent classified by LLM multi-agent system'
        );
        return llmResult;
      }

      // Step 2: Rule-based classification (fast, cheap)
      const quick = this.ruleBased(message);
      if (quick) {
        this.logger.info(
          { intent: quick, method: 'rule-based' },
          'Intent classified by rules'
        );
        return { intent: quick, entities: {} };
      }

      // Step 3: Hybrid classification with confidence scoring
      const classificationResult = await this.hybridClassify(message);

      this.logger.info(
        {
          intent: classificationResult.intent,
          confidence: classificationResult.confidence,
          method: 'hybrid',
          topK: classificationResult.topK,
        },
        'Intent classified by hybrid system'
      );

      return {
        intent: classificationResult.intent,
        entities: classificationResult.entities,
        ...(classificationResult.usageTotalTokens !== undefined
          ? { usageTotalTokens: classificationResult.usageTotalTokens }
          : {}),
      };
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          message,
        },
        'RouterAgent classify error:'
      );
      return { intent: FALLBACK_INTENT, entities: {} };
    }
  }

  // Hybrid classification with confidence scoring
  private async hybridClassify(message: string): Promise<{
    intent: string;
    entities: Record<string, unknown>;
    confidence: number;
    topK: Array<{ intent: string; score: number }>;
    usageTotalTokens?: number;
  }> {
    const prompt = `You are an intent classifier. Analyze the user message and return the most appropriate intent label with confidence score.

Priority order (highest to lowest):
1. notification.schedule - for SMS/push notifications, alarms, reminders (includes medication reminders)
2. appointment.book - for booking medical appointments  
3. report.cognitive.weekly - for health reports and summaries
4. health.advice - for general health questions and advice

Available labels: appointment.book, appointment.check, report.cognitive.weekly, health.advice, notification.schedule

User: ${message}

Respond with JSON format:
{
  "intent": "chosen_intent",
  "confidence": 0.95,
  "topK": [
    {"intent": "intent1", "score": 0.95},
    {"intent": "intent2", "score": 0.85}
  ]
}`;

    let responseText = '';
    let usageTotalTokens: number | undefined = undefined;

    if (this.llm.generateWithUsage) {
      const { text, usage } = await this.llm.generateWithUsage(prompt, {
        temperature: 0.1,
      });
      responseText = text;
      usageTotalTokens = usage?.totalTokens;
    } else {
      responseText = await this.llm.generate(prompt, { temperature: 0.1 });
    }

    try {
      const result = JSON.parse(responseText);
      const known = Object.keys(INTENT_TO_ROUTE);
      const intent = known.includes(result.intent)
        ? result.intent
        : FALLBACK_INTENT;

      return {
        intent,
        entities: {},
        confidence: result.confidence || 0.5,
        topK: result.topK || [{ intent, score: result.confidence || 0.5 }],
        ...(usageTotalTokens !== undefined ? { usageTotalTokens } : {}),
      };
    } catch (parseError) {
      // Fallback to simple classification
      const simpleResult = await this.simpleClassify(message);
      return {
        intent: simpleResult.intent,
        entities: simpleResult.entities,
        confidence: 0.5,
        topK: [{ intent: simpleResult.intent, score: 0.5 }],
        ...(simpleResult.usageTotalTokens !== undefined
          ? { usageTotalTokens: simpleResult.usageTotalTokens }
          : {}),
      };
    }
  }

  // LLM-based classification (primary method)
  private async llmBasedClassificationWithDetails(message: string): Promise<{
    intent: string;
    entities: Record<string, unknown>;
    multiAgentRequest?: boolean;
    additionalAgents?: string[];
  } | null> {
    const system = `You are an intent classifier for a medical assistant system.
Analyze the user's message and determine which agent(s) should handle it.

Available agents:
- notification: For scheduling SMS/notification reminders (includes medication reminders)
- appointment: For booking/managing medical appointments  
- report: For generating health reports
- gp: For general practitioner style advice and conversation

Return ONLY a JSON array of agent names that should handle this message.
If multiple agents are needed, return them in order of priority.

Examples:
- "Send me a blood pressure medication reminder tomorrow at 2pm" → ["notification"]
- "Book a doctor appointment" → ["appointment"] 
- "Set up my medication schedule" → ["notification"]
- "Generate my health status report" → ["report"]
- "I have a cold" → ["gp"]
- "Book GP appointment tomorrow at 1:30pm and send SMS reminder" → ["appointment", "notification"]
- "Book GP appointment and send SMS reminder" → ["appointment", "notification"]
- "Schedule GP appointment and notification" → ["appointment", "notification"]

Rules:
- Be precise: only include agents that are actually needed
- For single-purpose requests, return only one agent
- For multi-purpose requests, return multiple agents in priority order
- IMPORTANT: If message mentions "GP", "doctor", "appointment" AND "notification", "SMS", "reminder", return ["appointment", "notification"]
- Examples of multi-purpose requests:
  * "Book appointment and send reminder" → ["appointment", "notification"]
  * "Set medication schedule and add to calendar" → ["notification", "appointment"]
  * "Book GP appointment and send SMS reminder 30 minutes before" → ["appointment", "notification"]`;

    const prompt = `${system}\n\nUser message: "${message}"\n\nAgents:`;

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.1 });
      const agents = JSON.parse(response);

      if (Array.isArray(agents) && agents.length > 0) {
        const primaryAgent = this.agentToIntent(agents[0]);
        if (primaryAgent) {
          return {
            intent: primaryAgent,
            entities: {},
            multiAgentRequest: agents.length > 1,
            additionalAgents: agents.slice(1),
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        { error },
        'LLM classification failed, falling back to rules'
      );
    }

    return null;
  }

  private async llmBasedClassification(
    message: string
  ): Promise<string | null> {
    const system = `You are an intent classifier for a medical assistant system.
Analyze the user's message and determine which agent(s) should handle it.

Available agents:
- notification: For scheduling SMS/notification reminders (includes medication reminders)
- appointment: For booking/managing medical appointments  
- report: For generating health reports
- gp: For general practitioner style advice and conversation

Return ONLY a JSON array of agent names that should handle this message.
If multiple agents are needed, return them in order of priority.

Examples:
- "Send me a blood pressure medication reminder tomorrow at 2pm" → ["notification"]
- "Book a doctor appointment" → ["appointment"] 
- "Set up my medication schedule" → ["notification"]
- "Generate my health status report" → ["report"]
- "I have a cold" → ["gp"]

Rules:
- Be precise: only include agents that are actually needed
- For single-purpose requests, return only one agent
- For multi-purpose requests, return multiple agents in priority order
- Examples of multi-purpose requests:
  * "Book appointment and send reminder" → ["appointment", "notification"]
  * "Set medication schedule and add to calendar" → ["notification", "appointment"]
  * "Book GP appointment and send SMS reminder 30 minutes before" → ["appointment", "notification"]`;

    const prompt = `${system}\n\nUser message: "${message}"\n\nAgents:`;

    try {
      const response = await this.llm.generate(prompt, { temperature: 0.1 });
      const agents = JSON.parse(response);

      if (Array.isArray(agents) && agents.length > 0) {
        // For single agent, return the intent
        if (agents.length === 1) {
          return this.agentToIntent(agents[0]);
        }

        // For multiple agents, return the first one and store the rest for collaboration
        const primaryAgent = this.agentToIntent(agents[0]);
        if (primaryAgent) {
          // Store additional agents for potential collaboration
          this.logger.info(
            {
              primaryAgent,
              additionalAgents: agents.slice(1),
              message,
            },
            'Multi-agent request detected'
          );
          return primaryAgent;
        }
      }
    } catch (error) {
      this.logger.warn(
        { error },
        'LLM classification failed, falling back to rules'
      );
    }

    return null;
  }

  private agentToIntent(agent: string): string | null {
    const mapping: Record<string, string> = {
      notification: 'notification.schedule',
      appointment: 'appointment.book',
      medication: 'notification.schedule',
      report: 'report.cognitive.weekly',
      gp: 'health.advice',
    };

    return mapping[agent] || null;
  }

  // Simple classification fallback
  private async simpleClassify(message: string): Promise<{
    intent: string;
    entities: Record<string, unknown>;
    usageTotalTokens?: number;
  }> {
    // Try LLM-based classification first
    const llmIntent = await this.llmBasedClassification(message);
    if (llmIntent) {
      return {
        intent: llmIntent,
        entities: {},
      };
    }

    // Fallback to rule-based classification
    const ruleBasedIntent = this.ruleBased(message);
    if (ruleBasedIntent) {
      return {
        intent: ruleBasedIntent,
        entities: {},
      };
    }

    // Final fallback to original simple classification
    const prompt = `You are an intent classifier. Return one label only from this set:
appointment.book, appointment.check, report.cognitive.weekly, health.advice, notification.schedule

User: ${message}
Label:`;

    let labelText = '';
    let usageTotalTokens: number | undefined = undefined;

    if (this.llm.generateWithUsage) {
      const { text, usage } = await this.llm.generateWithUsage(prompt, {
        temperature: 0,
      });
      labelText = text;
      usageTotalTokens = usage?.totalTokens;
    } else {
      labelText = await this.llm.generate(prompt, { temperature: 0 });
    }

    const label = labelText.trim().toLowerCase();
    const known = Object.keys(INTENT_TO_ROUTE);
    const intent = known.includes(label) ? label : FALLBACK_INTENT;

    return {
      intent,
      entities: {},
      ...(usageTotalTokens !== undefined ? { usageTotalTokens } : {}),
    };
  }

  private ruleBased(message: string): string | null {
    const text = message.toLowerCase();

    // Notification-related patterns (highest priority)
    if (
      /(sms|notification|notify|push|message|text)/.test(text) &&
      /(remind|reminder|take|medication|pill|dose|medicine)/.test(text)
    ) {
      return 'notification.schedule';
    }

    // Appointment-related patterns
    if (
      /(book|schedule|appointment|gp|doctor)/.test(text) &&
      /(today|tomorrow|mon|tue|wed|thu|fri|sat|sun|am|pm|:\d\d|\d ?(am|pm)|next|this)/.test(
        text
      )
    ) {
      return 'appointment.book';
    }

    // Medication-related patterns now route to notification.schedule
    if (/(remind|reminder|take|medication|pill|dose|medicine)/.test(text)) {
      return 'notification.schedule';
    }

    // Report-related patterns
    if (/(report|summary|status)/.test(text)) {
      return 'report.generate';
    }

    // Specific report types
    if (/(weekly|cognitive)/.test(text) && /(report|summary)/.test(text)) {
      return 'report.cognitive.weekly';
    }

    return null;
  }

  private intentToRoute(intent: string): string {
    return resolveRoute(intent);
  }
}
