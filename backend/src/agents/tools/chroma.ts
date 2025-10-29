import type { FastifyBaseLogger } from 'fastify';
import { chromaService } from '../../lib/chroma';

export async function saveToChromaTool(
  logger: FastifyBaseLogger,
  params: {
    collection: string;
    documents: string[];
    metadatas?: Record<string, any>[];
    ids?: string[];
  }
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  try {
    const { collection, documents, metadatas, ids } = params;
    const res = (await chromaService.addDocuments(
      collection,
      documents,
      metadatas,
      ids
    )) as any;
    const outIds: string[] = res?.ids ?? ids ?? [];
    logger.info(
      {
        collection,
        numDocuments: documents?.length ?? 0,
        ids: outIds,
      },
      'saveToChromaTool ok'
    );
    return { ok: true, ids: outIds };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'saveToChromaTool failed');
    return { ok: false, error: message };
  }
}

export type RetrievedChunk = {
  text: string;
  score: number | null;
  metadata: Record<string, any> | null;
};

export async function retrieveContextWithFilterTool(
  logger: FastifyBaseLogger,
  params: {
    query: string;
    collection: string;
    topK?: number;
    where?: Record<string, any>;
  }
): Promise<
  { ok: true; chunks: RetrievedChunk[] } | { ok: false; error: string }
> {
  try {
    const { query, collection, topK = 5, where } = params;
    const res = await chromaService.query(collection, [query], topK, where);
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
    logger.info(
      {
        collection,
        query,
        topK,
        where,
        resultCount: chunks.length,
      },
      'retrieveContextWithFilterTool ok'
    );
    return { ok: true, chunks };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err }, 'retrieveContextWithFilterTool failed');
    return { ok: false, error: message };
  }
}
