import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface VectorCollection {
  name: string;
  vectors: number;
  points: number;
}

class VectorService {
  private baseUrl: string;
  private grpcPort: number;
  private apiKey: string;

  constructor() {
    const host = config.qdrant.host.startsWith('http')
      ? config.qdrant.host
      : `http://${config.qdrant.host}`;
    this.baseUrl = host.includes('cloud.qdrant.io')
      ? `https://${config.qdrant.host}`
      : `${host}:${config.qdrant.port}`;
    this.grpcPort = config.qdrant.grpcPort;
    this.apiKey = config.qdrant.apiKey;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    };
  }

  private getCollectionName(userId: string): string {
    return `user_${userId}`.replace(/-/g, '_').replace(/:/g, '_');
  }

  async createCollection(name: string, vectorSize: number): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${name}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ err: body.slice(0, 300), name, status: response.status }, 'Qdrant createCollection failed');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), name }, 'Failed to create collection');
      return false;
    }
  }

  async deleteCollection(name: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${name}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error, name }, 'Failed to delete collection');
      throw error;
    }
  }

  async upsertPoints(collection: string, points: VectorPoint[]): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${collection}/points`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          points: points.map((p) => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload,
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ err: body.slice(0, 300), collection, status: response.status }, 'Qdrant upsert failed');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), collection, pointsCount: points.length }, 'Failed to upsert points');
      throw error;
    }
  }

  async searchPoints(
    collection: string,
    vector: number[],
    limit = 10,
    scoreThreshold = 0.0,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    try {
      const body: Record<string, unknown> = {
        query: vector,
        limit,
        with_payload: true,
      };
      if (scoreThreshold > 0) {
        body.score_threshold = scoreThreshold;
      }
      if (filter && Object.keys(filter).length > 0) {
        body.filter = {
          must: Object.entries(filter).map(([key, value]) => ({
            key,
            match: { value },
          })),
        };
      }

      const response = await fetch(`${this.baseUrl}/collections/${collection}/points/query`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Search failed: ${response.status} ${errText.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      const points = data.result?.points || [];

      return points.map((p: { id: string; score: number; payload: Record<string, unknown> }) => ({
        id: p.id,
        score: p.score,
        payload: p.payload ?? {},
      }));
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), collection, vectorSize: vector.length }, 'Failed to search points');
      throw error;
    }
  }

  async deletePoints(collection: string, ids: string[]): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${collection}/points/delete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          points: ids,
        }),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error, collection, ids }, 'Failed to delete points');
      throw error;
    }
  }

  async getCollections(): Promise<VectorCollection[]> {
    try {
      const response = await fetch(`${this.baseUrl}/collections`);
      
      if (!response.ok) {
        throw new Error(`Failed to get collections: ${response.statusText}`);
      }

      const data = await response.json() as any;
      const collections: Array<{ name: string }> = data.result?.collections || [];

      return collections.map(({ name }) => ({
        name,
        vectors: 0,
        points: 0,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get collections');
      throw error;
    }
  }

  async collectionExists(name: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${name}`, {
        headers: this.getHeaders(),
      });
      if (response.status === 404) return false;
      return response.ok;
    } catch {
      return false;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/readyz`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async updateCollectionMetadata(name: string, metadata: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${name}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          metadata,
        }),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error, name, metadata }, 'Failed to update collection metadata');
      throw error;
    }
  }

  async getCollectionInfo(name: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${name}`);
      if (!response.ok) {
        throw new Error(`Failed to get collection: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      logger.error({ error, name }, 'Failed to get collection info');
      throw error;
    }
  }
}

export const vectorService = new VectorService();