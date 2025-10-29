import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import { pingSupabase } from './lib/supabase';
import { chromaService } from './lib/chroma';
import { checkRedisConnection } from './lib/redis';
import { pingNotificationQueue } from './lib/bullmq';
import calendarRoutes from './routes/calendar';
import { agentsGraphRoutes } from './routes/agents-graph';

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: true, credentials: true });

  const dbStatus = await pingSupabase();
  dbStatus.connected
    ? app.log.info(dbStatus.message)
    : app.log.error(dbStatus.message);

  const chromaStatus = await chromaService.ping();
  chromaStatus.connected
    ? app.log.info(chromaStatus.message)
    : app.log.error(chromaStatus.message);

  const redisStatus = await checkRedisConnection();
  redisStatus.connected
    ? app.log.info(redisStatus.message)
    : app.log.error(redisStatus.message);

  const notificationQueueStatus = await pingNotificationQueue();
  notificationQueueStatus.connected
    ? app.log.info(notificationQueueStatus.message)
    : app.log.error(notificationQueueStatus.message);

  setupOllama(app.log).catch(err =>
    app.log.error(`model setup failed: ${err}`)
  );

  app.register(healthRoutes, { prefix: '/health' });
  // app.register(authRoutes, { prefix: '/auth' });
  // app.register(agentsRoutes, { prefix: '/agents' }); // @todo replace this with agentsGraph
  // app.register(calendarRoutes, { prefix: '/calendar' });

  // A2A LangGraph routes
  const { llmService } = await import('./services/llm');
  app.register(agentsGraphRoutes, { prefix: '/agents', llm: llmService });

  await app.listen({
    port: process.env.PORT ? parseInt(process.env.PORT) : 4000,
    host: '0.0.0.0',
  });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
