import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message as BedrockMessage,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

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
  content: ContentBlock[];
}

const DEFAULT_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';

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
            content: [{ text: m.content }],
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
}
