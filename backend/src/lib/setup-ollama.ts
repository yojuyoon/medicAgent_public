import type { FastifyBaseLogger } from 'fastify';
import { env } from './env';
import axios from 'axios';

async function ensurePulled(
  model: string,
  baseUrl: string,
  logger: FastifyBaseLogger
) {
  logger.info(`Checking if ${model} is pulled`);

  const tagsRes = await axios.get(`${baseUrl}/api/tags`);
  const hasIt = (tagsRes.data?.models || []).some((m: any) => m.name === model);
  if (hasIt) {
    logger.info(`${model} is already pulled`);
    return true;
  }

  logger.info(`Pulling ${model}`);

  const res = await axios.post(
    `${baseUrl}/api/pull`,
    { model, stream: true },
    { responseType: 'stream', headers: { 'content-type': 'application/json' } }
  );

  res.data.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().trim().split('\n');
    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        // logger.info(evt);
      } catch {
        // ignore parse errors
      }
    }
  });

  return new Promise((resolve, reject) => {
    res.data.on('end', () => {
      logger.info(`${model} pulled successfully`);
      resolve(true);
    });
    res.data.on('error', (err: any) => {
      logger.error('pull failed', err);
      reject(err);
    });
  });
}

export const setupOllama = async (
  logger: FastifyBaseLogger,
  baseUrl?: string,
  model?: string
) => {
  try {
    const resolvedBase = baseUrl ?? env.OLLAMA_BASE ?? 'http://localhost:11434';
    const resolvedModel = model ?? env.OLLAMA_MODEL ?? 'llama3';
    await ensurePulled(resolvedModel, resolvedBase, logger);
    logger.info(`${resolvedModel} ready`);
  } catch (err) {
    logger.error('pull error', err as any);
    throw err;
  }
};
