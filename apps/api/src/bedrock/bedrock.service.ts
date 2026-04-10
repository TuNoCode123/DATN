import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

interface TextContentBlock {
  type: 'text';
  text: string;
}

type MessageContent = string | (TextContentBlock | ImageContentBlock)[];

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
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
  content: ContentBlock[];
}

const DEFAULT_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

@Injectable()
export class BedrockService {
  private client: BedrockRuntimeClient;
  private readonly logger = new Logger(BedrockService.name);

  constructor(private config: ConfigService) {
    const region = this.config.get<string>('AWS_BEDROCK_REGION') || 'us-east-1';

    this.client = new BedrockRuntimeClient({ region });
    this.logger.log(`Bedrock client initialised (region: ${region})`);
  }

  /** Drop-in compatible messages API so callers keep working unchanged */
  get messages() {
    return {
      create: async (params: CreateParams): Promise<CreateResponse> => {
        const bedrockMessages: BedrockMessage[] = params.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: this.toBedrockContent(m.content),
          }));

        const system: SystemContentBlock[] | undefined = params.system
          ? [{ text: params.system }]
          : undefined;

        const command = new ConverseCommand({
          modelId: params.model || DEFAULT_MODEL,
          messages: bedrockMessages,
          system,
          inferenceConfig: {
            maxTokens: params.max_tokens ?? 1024,
            temperature: params.temperature,
          },
        });

        const response = await this.client.send(command);

        const text =
          response.output?.message?.content?.[0]?.text ?? '';

        return {
          id: response.$metadata.requestId || '',
          content: [{ type: 'text', text }],
        };
      },
    };
  }

  private toBedrockContent(content: MessageContent) {
    if (typeof content === 'string') return [{ text: content }];
    return content.map((block) => {
      if (block.type === 'text') return { text: block.text };
      return {
        image: {
          format: block.source.media_type.split('/')[1] as 'jpeg' | 'png' | 'gif' | 'webp',
          source: { bytes: Buffer.from(block.source.data, 'base64') },
        },
      };
    });
  }

  /** Stream a conversation response, yielding text chunks as they arrive */
  async *streamConverse(params: CreateParams): AsyncGenerator<string> {
    const bedrockMessages: BedrockMessage[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: this.toBedrockContent(m.content),
      }));

    const system: SystemContentBlock[] | undefined = params.system
      ? [{ text: params.system }]
      : undefined;

    const command = new ConverseStreamCommand({
      modelId: params.model || DEFAULT_MODEL,
      messages: bedrockMessages,
      system,
      inferenceConfig: {
        maxTokens: params.max_tokens ?? 1024,
        temperature: params.temperature,
      },
    });

    const response = await this.client.send(command);

    if (!response.stream) {
      throw new Error('No stream in Bedrock response');
    }

    for await (const event of response.stream) {
      if (event.contentBlockDelta?.delta?.text) {
        yield event.contentBlockDelta.delta.text;
      }
    }
  }
}
