import type { FastifyBaseLogger } from 'fastify';
import type { LLMService } from '../../services/llm';
import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/AgentTypes';
import {
  saveInteractionTool,
  queryInteractionsTool,
  summarizeReportTool,
} from '../tools/report';
import { saveToChromaTool } from '../tools/chroma';

export class ReportAgent extends BaseAgent {
  constructor(llm: LLMService, logger: FastifyBaseLogger) {
    super(llm, logger, 'report');
  }

  getCapabilities() {
    return ['aggregate_metrics', 'generate_summary'];
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      const userMessage = input.message;

      // Ingest path: derive simple labels from the message
      const derived = this.deriveLabels(userMessage);
      const tsIso = new Date().toISOString();

      // Save to Supabase (best-effort)
      await saveInteractionTool(this.logger as FastifyBaseLogger, {
        user_id: input.userId || 'anonymous',
        session_id: input.sessionId || null,
        role: 'user',
        text: userMessage,
        created_at: tsIso,
        category: derived.category,
        tone: derived.tone,
        sentiment: derived.sentiment,
        cognitive_score: derived.cognitiveScore,
        mental_score: derived.mentalScore,
        physical_score: derived.physicalScore,
      });

      // Mirror to Chroma (best-effort)
      const chromaId = `interaction_${
        input.userId || 'anonymous'
      }_${Date.now()}`;
      await saveToChromaTool(this.logger as FastifyBaseLogger, {
        collection: 'interactions',
        documents: [userMessage],
        metadatas: [
          {
            userId: input.userId || 'anonymous',
            sessionId: input.sessionId || null,
            role: 'user',
            timestampISO: tsIso,
            category: derived.category,
          },
        ],
        ids: [chromaId],
      });

      // If this is a report request, generate report
      let tf = this.parseTimeframe(userMessage);
      const focus = this.parseFocus(userMessage);
      const isReportRequest = /(report|summary|status)/i.test(userMessage);

      if (isReportRequest && tf) {
        const q = await queryInteractionsTool(
          this.logger as FastifyBaseLogger,
          {
            userId: input.userId || 'anonymous',
            startIso: tf.startIso,
            endIso: tf.endIso,
            limit: 500,
          }
        );
        const rows = q.ok ? q.rows : [];
        const s = await summarizeReportTool(
          this.logger as FastifyBaseLogger,
          this.llm,
          {
            rows,
            timeframe: {
              startIso: tf.startIso,
              endIso: tf.endIso,
              label: tf.label,
            },
            focus,
          }
        );
        const reply = s.ok
          ? s.summary
          : `Unable to generate ${focus} report for ${tf.label} right now.`;
        return {
          reply,
          route: 'report',
          intent: `report.${focus}.${tf.label}`,
          actions: [
            {
              type: 'generate_report',
              status: s.ok ? 'done' : 'failed',
              payload: { timeframe: tf, focus },
            },
          ],
        };
      }

      // If report request without explicit timeframe, default to all available history
      if (isReportRequest && !tf) {
        const startIso = new Date(0).toISOString();
        const endIso = new Date().toISOString();
        const q = await queryInteractionsTool(
          this.logger as FastifyBaseLogger,
          {
            userId: input.userId || 'anonymous',
            startIso,
            endIso,
            limit: 2000,
          }
        );
        const rows = q.ok ? q.rows : [];
        const s = await summarizeReportTool(
          this.logger as FastifyBaseLogger,
          this.llm,
          {
            rows,
            timeframe: { startIso, endIso, label: 'all_history' },
            focus,
          }
        );
        const reply = s.ok
          ? s.summary
          : `Unable to generate ${focus} report for all history right now.`;
        return {
          reply,
          route: 'report',
          intent: `report.${focus}.all_history`,
          actions: [
            {
              type: 'generate_report',
              status: s.ok ? 'done' : 'failed',
              payload: {
                timeframe: { startIso, endIso, label: 'all_history' },
                focus,
              },
            },
          ],
        };
      }

      // Otherwise, be a helpful assistant asking for clarification
      const systemPrompt = `You are a helpful health report assistant.
      Help users understand their health data and generate meaningful reports.
      Be encouraging and focus on positive trends while acknowledging areas for improvement.
      Ask clarifying questions about what specific health metrics they want to see.`;
      const prompt = `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`;
      const reply = await this.llm.generate(prompt, { temperature: 0.7 });
      return {
        reply,
        route: 'report',
        intent: 'report.clarification',
        actions: [{ type: 'request_report_type', status: 'pending' }],
        followups: [
          {
            type: 'question',
            text: 'What timeframe (daily, weekly, monthly) and focus (cognitive, mental, physical) do you prefer?',
          },
        ],
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
          intent: input.intent,
          entities: input.entities,
        },
        'ReportAgent processing error:'
      );
      return {
        reply:
          "I'm sorry, I encountered an error while processing your report request. Please try again.",
        route: 'report',
        intent: 'report.error',
        actions: [
          {
            type: 'error',
            status: 'failed',
            payload: {
              reason: 'REPORT_PROCESSING_ERROR',
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

  private deriveLabels(text: string): {
    category: 'cognitive' | 'mental' | 'physical' | 'other';
    tone: string | null;
    sentiment: number | null;
    cognitiveScore: number | null;
    mentalScore: number | null;
    physicalScore: number | null;
  } {
    const t = text.toLowerCase();
    let category: 'cognitive' | 'mental' | 'physical' | 'other' = 'other';
    if (/(memory|focus|brain|cognitive)/.test(t)) category = 'cognitive';
    else if (/(mood|anxiety|stress|mental)/.test(t)) category = 'mental';
    else if (/(pain|sleep|exercise|physical|bp|blood pressure|heart)/.test(t))
      category = 'physical';

    const tone = /(tired|exhausted|anxious|calm|confident)/.test(t)
      ? (t.match(/tired|exhausted|anxious|calm|confident/)?.[0] as string)
      : null;
    const sentiment = /\b(good|better|improved|great)\b/.test(t)
      ? 0.6
      : /\b(bad|worse|terrible|painful)\b/.test(t)
      ? -0.6
      : null;
    const cognitiveScore = category === 'cognitive' ? 0.5 : null;
    const mentalScore = category === 'mental' ? 0.5 : null;
    const physicalScore = category === 'physical' ? 0.5 : null;
    return {
      category,
      tone,
      sentiment,
      cognitiveScore,
      mentalScore,
      physicalScore,
    };
  }

  private parseFocus(
    text: string
  ): 'cognitive' | 'mental' | 'physical' | 'overall' {
    const t = text.toLowerCase();
    if (/(cognitive|memory|brain)/.test(t)) return 'cognitive';
    if (/(mental|mood|stress)/.test(t)) return 'mental';
    if (/(physical|fitness|exercise|bp|blood pressure|heart)/.test(t))
      return 'physical';
    return 'overall';
  }

  private parseTimeframe(
    text: string
  ): { startIso: string; endIso: string; label: string } | null {
    const now = new Date();
    const t = text.toLowerCase();
    const startOfDay = (d: Date) =>
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0)
      );
    const endOfDay = (d: Date) =>
      new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          23,
          59,
          59
        )
      );

    if (/daily|today|day/.test(t)) {
      const s = startOfDay(now);
      const e = endOfDay(now);
      return {
        startIso: s.toISOString(),
        endIso: e.toISOString(),
        label: 'today',
      };
    }
    if (/weekly|this week|week/.test(t)) {
      const day = now.getUTCDay();
      const diff = (day + 6) % 7; // make Monday start
      const monday = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - diff
        )
      );
      const sunday = new Date(
        Date.UTC(
          monday.getUTCFullYear(),
          monday.getUTCMonth(),
          monday.getUTCDate() + 6
        )
      );
      return {
        startIso: startOfDay(monday).toISOString(),
        endIso: endOfDay(sunday).toISOString(),
        label: 'this_week',
      };
    }
    if (/monthly|this month|month/.test(t)) {
      const first = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      );
      const last = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
      );
      return {
        startIso: startOfDay(first).toISOString(),
        endIso: endOfDay(last).toISOString(),
        label: 'this_month',
      };
    }
    if (/last month/.test(t)) {
      const first = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      );
      const last = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)
      );
      return {
        startIso: startOfDay(first).toISOString(),
        endIso: endOfDay(last).toISOString(),
        label: 'last_month',
      };
    }
    if (/yesterday/.test(t)) {
      const y = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );
      return {
        startIso: startOfDay(y).toISOString(),
        endIso: endOfDay(y).toISOString(),
        label: 'yesterday',
      };
    }
    return null;
  }
}
