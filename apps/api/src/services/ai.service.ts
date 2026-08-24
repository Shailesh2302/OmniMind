import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

class AIService {
  private baseUrl = process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
  private apiKey: string;
  private model = process.env.AI_CHAT_MODEL || 'stealth/ox-alpha';
  private embeddingModel = process.env.AI_EMBEDDING_MODEL || 'openai/text-embedding-3-small';
  private defaultTemperature = 0.6;
  private defaultTopP = 0.95;
  private defaultMaxTokens = Number(process.env.AI_MAX_TOKENS) || 2048;

  constructor() {
    this.apiKey = config.ai.apiKey;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Aether',
    };
  }

  private buildBody(request: ChatCompletionRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? this.defaultTemperature,
      top_p: this.defaultTopP,
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
      stream,
    };
    if ((process.env.AI_REASONING_EFFORT || 'low') !== 'high') {
      body.reasoning = { effort: process.env.AI_REASONING_EFFORT || 'low', exclude: true };
    }
    return body;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(request, false)),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error, status: response.status }, 'NVIDIA AI service error');
        throw new Error(`AI service error: ${response.status} - ${error}`);
      }

      return response.json() as Promise<ChatCompletionResponse>;
    } catch (error) {
      logger.error({ error }, 'Failed to get chat completion');
      throw error;
    }
  }

  async *streamChatCompletion(request: ChatCompletionRequest) {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(request, true)),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error, status: response.status }, 'NVIDIA AI stream error');
        throw new Error(`AI service error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content;
              if (content) {
                yield content;
              }
              const reasoning = delta?.reasoning ?? delta?.reasoning_content;
              if (reasoning) {
                yield `<!-- reasoning: ${reasoning} -->`;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to stream chat completion');
      throw error;
    }
  }

  async createEmbedding(input: string | string[]): Promise<number[]> {
    try {
      const textInput = Array.isArray(input) ? input : [input];
      
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          input: textInput,
          model: this.embeddingModel,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error, status: response.status }, 'Embedding service error');
        throw new Error(`Embedding service error: ${response.status}`);
      }

      const data = await response.json() as EmbeddingResponse;
      return data.data[0].embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to create embedding');
      throw error;
    }
  }

  async searchDocuments(query: string, context?: string): Promise<string> {
    const messages: ChatMessage[] = [];

    if (context) {
      messages.push({
        role: 'system',
        content: `You are a helpful assistant. Use the following context to answer questions. If the context doesn't contain relevant information, say so.\n\nContext:\n${context}`,
      });
    } else {
      messages.push({
        role: 'system',
        content: 'You are a helpful assistant specialized in answering questions about uploaded documents and videos.',
      });
    }

    messages.push({
      role: 'user',
      content: query,
    });

    const response = await this.chatCompletion({ messages });
    return response.choices[0]?.message?.content || '';
  }

  async generateClip(videoPath: string, startTime: number, endTime: number): Promise<{ url: string; thumbnail?: string }> {
    logger.info({ videoPath, startTime, endTime }, 'Generating clip via Rust worker');
    return {
      url: `/storage/clips/clip-${Date.now()}.mp4`,
    };
  }

  async summarizeText(text: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes text concisely and accurately.',
      },
      {
        role: 'user',
        content: `Please provide a concise summary of the following text:\n\n${text}`,
      },
    ];

    const response = await this.chatCompletion({ messages, maxTokens: 500 });
    return response.choices[0]?.message?.content || '';
  }

  async extractKeyPoints(text: string): Promise<string[]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that extracts key points from text. Return only a JSON array of strings, nothing else.',
      },
      {
        role: 'user',
        content: `Extract the key points from the following text as a JSON array:\n\n${text}`,
      },
    ];

    const response = await this.chatCompletion({ messages, maxTokens: 1000 });
    const content = response.choices[0]?.message?.content || '[]';
    
    try {
      return JSON.parse(content);
    } catch {
      return content.split('\n').filter((line) => line.trim());
    }
  }

  async transcribeAudio(audioPath: string): Promise<string> {
    logger.info({ audioPath }, 'Transcription requested - should use Python Whisper service');
    return 'Transcription would be handled by Python AI service with Whisper';
  }
}

export const aiService = new AIService();