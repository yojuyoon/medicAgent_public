import type { FastifyPluginAsync } from 'fastify';

const routes: FastifyPluginAsync = async app => {
  app.get('/', async () => ({ ok: true, ts: new Date().toISOString() }));
};

export default routes;
