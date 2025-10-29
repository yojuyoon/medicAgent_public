import type { FastifyPluginAsync } from 'fastify';
import { buildAgents } from '../agents/index';

const routes: FastifyPluginAsync = async app => {
  const { router } = buildAgents(app.log);

  app.post('/chat', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const { userId, sessionId, message, metadata, stream } = body;

    if (!userId || !sessionId || !message) {
      return reply
        .code(400)
        .send({ error: 'userId, sessionId, and message are required' });
    }

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
      reply.raw.write(
        `data: ${JSON.stringify({
          type: 'status',
        })}\n\n`
      );
      try {
        // @ts-ignore
        reply.raw.flush?.();
      } catch {}

      try {
        const result = await router.process({
          userId,
          sessionId,
          message,
          metadata,
          stream,
        });

        // Send the final result
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'result', data: result })}\n\n`
        );
        try {
          // @ts-ignore
          reply.raw.flush?.();
        } catch {}
        reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      } catch (error) {
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`
        );
      }

      reply.raw.end();
      return;
    }

    // Non-streaming response
    const result = await router.process({
      userId,
      sessionId,
      message,
      metadata,
      stream,
    });
    return reply.send(result);
  });
};

export default routes;
