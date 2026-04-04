import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CreateParams {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  system?: string;
  messages: Message[];
}

interface ContentBlock {
  type: 'text';
  text: string;
}

interface CreateResponse {
  id: string;
  choices: { message: { content: string; reasoning: string } }[];
  content: ContentBlock[];
}

const DEFAULT_MODEL = 'qwen/qwen3.6-plus:free';

@Injectable()
export class AnthropicService {
  private apiKey: string;
  private readonly logger = new Logger(AnthropicService.name);

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENROUTER_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY not set — AI grading will be unavailable',
      );
    }
  }

  /** Drop-in compatible messages API matching the old Anthropic interface */
  get messages() {
    return {
      create: async (params: CreateParams): Promise<CreateResponse> => {
        const messages: { role: string; content: string }[] = [];

        if (params.system) {
          messages.push({ role: 'system', content: params.system });
        }
        messages.push(
          ...params.messages.map((m) => ({ role: m.role, content: m.content })),
        );

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        let response: Response;
        try {
          response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
              },
              body: JSON.stringify({
                model: params.model || DEFAULT_MODEL,
                max_tokens: params.max_tokens,
                temperature: params.temperature,
                messages,
              }),
              signal: controller.signal,
            },
          );
        } catch (err: unknown) {
          clearTimeout(timeout);
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('OpenRouter API request timed out after 60s');
          }
          throw err;
        }
        clearTimeout(timeout);

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenRouter API error ${response.status}: ${err}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Return in Anthropic-compatible shape so callers don't break
        return {
          id: data.id,
          choices: data.choices,
          content: [{ type: 'text', text }],
        };
      },
    };
  }
}
