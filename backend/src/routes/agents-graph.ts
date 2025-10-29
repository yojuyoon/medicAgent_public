import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SimpleAgentGraph } from '../agents/graph/SimpleAgentGraph.js';
import { AgentEventBus } from '../agents/graph/AgentEventBus.js';
import type { LLMService } from '../services/llm.js';

interface ChatRequest {
  userId: string;
  sessionId: string;
  message: string;
  metadata?: {
    timezone?: string;
    locale?: string;
    googleAccessToken?: string;
  };
}

export async function agentsGraphRoutes(
  fastify: FastifyInstance,
  options: { llm: LLMService }
) {
  const { llm } = options;

  // Initialize A2A event bus
  const eventBus = new AgentEventBus(fastify.log);

  // Initialize SimpleAgentGraph
  const agentGraph = new SimpleAgentGraph(llm, fastify.log);

  // Set event bus for all agents
  // (Actually handled inside AgentGraph, but can be set individually if needed)

  // A2A chat endpoint
  fastify.post<{
    Body: ChatRequest & { timeline?: boolean; tokenStream?: boolean };
  }>('/chat', async (request, reply) => {
    try {
      const { userId, sessionId, message, metadata } = request.body;

      if (!userId || !sessionId || !message) {
        return reply.status(400).send({
          error: 'Missing required fields: userId, sessionId, message',
        });
      }

      fastify.log.info(`Processing A2A chat request: ${message}`);

      // SSE streaming mode (optional)
      const stream = (request.body as any)?.stream;
      const wantTimeline = Boolean((request.body as any)?.timeline);
      const tokenStream = Boolean((request.body as any)?.tokenStream);
      if (stream) {
        // Set up Server-Sent Events
        reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
        reply.raw.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
        reply.raw.setHeader('X-Accel-Buffering', 'no');

        // Try to flush headers early if supported
        try {
          // @ts-ignore
          reply.raw.flushHeaders?.();
        } catch {}

        // Send initial status
        reply.raw.write(`data: ${JSON.stringify({ type: 'status' })}\n\n`);
        try {
          // @ts-ignore
          reply.raw.flush?.();
        } catch {}

        try {
          const result = await agentGraph.process({
            userId,
            sessionId,
            message,
            metadata,
          });

          // Optional step event (placeholder for token/step streaming)
          if (tokenStream) {
            reply.raw.write(
              `data: ${JSON.stringify({
                type: 'step',
                data: { note: 'token/step streaming placeholder' },
              })}\n\n`
            );
          }

          // Send the final result
          reply.raw.write(
            `data: ${JSON.stringify({
              type: 'result',
              data: {
                reply: result.finalOutput?.reply || 'No response generated',
                actions: result.finalOutput?.actions || [],
                followups: result.finalOutput?.followups || [],
                a2aMessages: result.messages || [],
                context: result.context,
                currentAgent: result.currentAgent,
                error: result.error,
                timeline: wantTimeline ? result.timeline || [] : undefined,
              },
            })}\n\n`
          );
          try {
            // @ts-ignore
            reply.raw.flush?.();
          } catch {}
          reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        } catch (error) {
          reply.raw.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: String(error),
            })}\n\n`
          );
        }

        reply.raw.end();
        return;
      }

      // Process A2A through AgentGraph
      const result = await agentGraph.process({
        userId,
        sessionId,
        message,
        metadata,
      });

      // Respond with A2A message history included
      const response = {
        reply: result.finalOutput?.reply || 'No response generated',
        actions: result.finalOutput?.actions || [],
        followups: result.finalOutput?.followups || [],
        a2aMessages: result.messages || [],
        context: result.context,
        currentAgent: result.currentAgent,
        error: result.error,
        timeline: wantTimeline ? result.timeline || [] : undefined,
      };

      return reply.send(response);
    } catch (error) {
      fastify.log.error('A2A chat error:', error as any);
      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to process A2A chat request',
      });
    }
  });

  // A2A message history retrieval
  fastify.get('/messages/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { agent, limit } = request.query as {
        agent?: string;
        limit?: number;
      };

      const messages = eventBus.getMessageHistory(
        agent,
        limit ? parseInt(limit.toString()) : undefined
      );

      // Filter by session (actual implementation would need session-based message storage)
      const sessionMessages = messages.filter(
        msg => msg.content?.sessionId === sessionId
      );

      return reply.send({
        sessionId,
        messages: sessionMessages,
        total: sessionMessages.length,
      });
    } catch (error) {
      fastify.log.error('A2A message history error:', error as any);
      return reply.status(500).send({
        error: 'Failed to retrieve message history',
      });
    }
  });

  // A2A collaboration session creation
  fastify.post('/collaboration', async (request, reply) => {
    try {
      const { sessionId, participants, purpose } = request.body as {
        sessionId: string;
        participants: string[];
        purpose: string;
      };

      if (!sessionId || !participants || !purpose) {
        return reply.status(400).send({
          error: 'Missing required fields: sessionId, participants, purpose',
        });
      }

      eventBus.createSession(sessionId, participants);

      return reply.send({
        success: true,
        sessionId,
        participants,
        purpose,
        message: 'A2A collaboration session created',
      });
    } catch (error) {
      fastify.log.error('A2A collaboration error:', error as any);
      return reply.status(500).send({
        error: 'Failed to create collaboration session',
      });
    }
  });

  // A2A agent status retrieval
  fastify.get('/status', async (request, reply) => {
    try {
      const status = {
        agents: [
          {
            name: 'router',
            status: 'active',
            capabilities: ['route', 'classify', 'plan'],
          },
          {
            name: 'appointment',
            status: 'active',
            capabilities: [
              'find_free_slots',
              'create_event',
              'cancel_event',
              'get_events',
            ],
          },
          {
            name: 'chat',
            status: 'active',
            capabilities: ['general-health-advice'],
          },
          {
            name: 'medication',
            status: 'active',
            capabilities: [
              'save_schedule',
              'notify_schedule',
              'interaction_check',
            ],
          },
          {
            name: 'report',
            status: 'active',
            capabilities: ['aggregate_metrics', 'generate_summary'],
          },
        ],
        eventBus: {
          status: 'active',
          messageCount: eventBus.getMessageHistory().length,
        },
        graph: {
          status: 'active',
          nodes: 7, // router, appointment, chat, medication, report, collaboration, error_handler
          edges: 'dynamic',
        },
      };

      return reply.send(status);
    } catch (error) {
      fastify.log.error('A2A status error:', error as any);
      return reply.status(500).send({
        error: 'Failed to retrieve A2A status',
      });
    }
  });

  // Direct A2A message sending between agents (for testing)
  fastify.post('/message', async (request, reply) => {
    try {
      const { from, to, type, content } = request.body as {
        from: string;
        to: string;
        type: 'request' | 'response' | 'notification';
        content: any;
      };

      if (!from || !to || !type || !content) {
        return reply.status(400).send({
          error: 'Missing required fields: from, to, type, content',
        });
      }

      eventBus.sendMessage(from, to, type, content);

      return reply.send({
        success: true,
        message: `A2A message sent from ${from} to ${to}`,
        type,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error('A2A direct message error:', error as any);
      return reply.status(500).send({
        error: 'Failed to send A2A message',
      });
    }
  });
}
