import type { FastifyBaseLogger } from 'fastify';
import { OllamaService } from '../services/llm';
import { RouterAgent } from './router/RouterAgent';
import { GPAgent } from './specialized/GPAgent';
import { AppointmentAgent } from './specialized/AppointmentAgent';
import { ReportAgent } from './specialized/ReportAgent';
import { NotificationAgent } from './specialized/NotificationAgent';

export function buildAgents(logger: FastifyBaseLogger) {
  const llm = new OllamaService(logger);
  const router = new RouterAgent(llm, logger);

  const gp = new GPAgent(llm, logger);
  const appt = new AppointmentAgent(llm, logger);
  const report = new ReportAgent(llm, logger);
  const notification = new NotificationAgent(llm, logger);

  router.register('gp', gp);
  router.register('appointment', appt);
  router.register('report', report);
  router.register('notification', notification);

  return { router, gp, appt, report, notification } as const;
}
