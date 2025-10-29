import { ChromaClient } from 'chromadb';
import { env } from './env';

export class ChromaService {
  private client: ChromaClient;

  constructor() {
    this.client = new ChromaClient({
      ssl: false,
      host: env.CHROMA_SERVER_HOST,
      port: Number(env.CHROMA_SERVER_HTTP_PORT ?? 8000),
      auth: {
        credentials: env.CHROMA_USERNAME,
        provider: 'token',
        token: env.CHROMA_PASSWORD,
      },
    });
  }

  async ping(): Promise<{ connected: boolean; message: string }> {
    try {
      await this.client.heartbeat();
      return {
        connected: true,
        message: 'Chroma connected',
      };
    } catch (error) {
      return {
        connected: false,
        message: `Chroma connection failed: ${error}`,
      };
    }
  }

  async getOrCreateCollection(name: string) {
    try {
      return await this.client.getOrCreateCollection({
        name,
        metadata: {
          description: `Collection for ${name}`,
        },
      });
    } catch (error) {
      throw new Error(`Collection creation/retrieval failed: ${error}`);
    }
  }

  async addDocuments(
    collectionName: string,
    documents: string[],
    metadatas?: Record<string, any>[],
    ids?: string[]
  ) {
    try {
      const collection = await this.getOrCreateCollection(collectionName);

      const result = await collection.add({
        documents,
        metadatas: metadatas || documents.map(() => ({})),
        ids: ids || documents.map((_, i) => `doc_${Date.now()}_${i}`),
      });

      return result;
    } catch (error) {
      throw new Error(`Document addition failed: ${error}`);
    }
  }

  async query(
    collectionName: string,
    queryTexts: string[],
    nResults: number = 10,
    where?: Record<string, any>
  ) {
    try {
      const collection = await this.getOrCreateCollection(collectionName);

      const result = await collection.query({
        queryTexts,
        nResults,
        ...(where ? { where } : {}),
      });

      return result;
    } catch (error) {
      throw new Error(`Query failed: ${error}`);
    }
  }

  async deleteCollection(name: string) {
    try {
      await this.client.deleteCollection({
        name,
      });
      return { success: true, message: `Collection ${name} deleted` };
    } catch (error) {
      throw new Error(`Collection deletion failed: ${error}`);
    }
  }
}

export const chromaService = new ChromaService();
