import type { FastifyBaseLogger } from 'fastify';
import { chromaService } from '../../lib/chroma';

export type RetrievedChunk = {
  text: string;
  score: number | null;
  metadata: Record<string, any> | null;
};

export async function retrieveContextTool(
  logger: FastifyBaseLogger,
  params: { query: string; collection: string; topK?: number }
): Promise<
  { ok: true; chunks: RetrievedChunk[] } | { ok: false; error: string }
> {
  try {
    const { query, collection, topK = 5 } = params;
    const res = await chromaService.query(collection, [query], topK);
    // Chroma query returns arrays-per-query
    const documents = (res as any)?.documents?.[0] as string[] | undefined;
    const metadatas = (res as any)?.metadatas?.[0] as
      | Record<string, any>[]
      | undefined;
    const distances = (res as any)?.distances?.[0] as number[] | undefined;

    const chunks: RetrievedChunk[] = (documents || []).map((text, i) => ({
      text,
      score:
        distances && typeof distances[i] === 'number' ? distances[i] : null,
      metadata: metadatas ? (metadatas[i] as Record<string, any>) : null,
    }));
    return { ok: true, chunks };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'retrieveContextTool failed');
    return { ok: false, error: message };
  }
}
