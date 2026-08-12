import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

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

// Vertex AI Model Garden's Claude model IDs use an `@<release-date>` suffix
// rather than Bedrock's `us.anthropic.<id>-v1:0` format — see
// https://platform.claude.com/docs/en/api/claude-on-vertex-ai for the full
// model ID table.
const DEFAULT_MODEL = 'claude-haiku-4-5@20251001';

@Injectable()
export class VertexAiService {
  private client: AnthropicVertex;
  private readonly logger = new Logger(VertexAiService.name);

  constructor(private config: ConfigService) {
    const projectId = this.config.getOrThrow<string>('GCP_PROJECT_ID');
    // "global" is Anthropic's own recommendation on Vertex: dynamically
    // routed for maximum availability, no regional pricing premium, and
    // sidesteps having to verify Claude's available in whichever region the
    // rest of the stack (Cloud Run, Cloud SQL, ...) happens to run in.
    const region = this.config.get<string>('VERTEX_AI_REGION') || 'global';

    // Auth via Application Default Credentials — the Cloud Run service
    // account in production, `gcloud auth application-default login`
    // locally. No API key or exported key file involved.
    this.client = new AnthropicVertex({ projectId, region });
    this.logger.log(`Vertex AI (Claude) client initialised (project: ${projectId}, region: ${region})`);
  }

  /** Drop-in compatible messages API so callers keep working unchanged */
  get messages() {
    return {
      create: async (params: CreateParams): Promise<CreateResponse> => {
        const messages = this.toVertexMessages(params.messages);

        const response = await this.client.messages.create({
          model: params.model || DEFAULT_MODEL,
          max_tokens: params.max_tokens ?? 1024,
          temperature: params.temperature,
          system: params.system,
          messages,
        });

        const textBlock = response.content.find((block) => block.type === 'text');

        return {
          id: response.id,
          content: [{ type: 'text', text: textBlock?.text ?? '' }],
        };
      },
    };
  }

  private toVertexMessages(messages: Message[]) {
    // Anthropic's native content-block shape (used by both the direct API
    // and Vertex) is exactly what MessageContent/ImageContentBlock already
    // model here — unlike the Bedrock ConverseCommand shape this replaced,
    // no per-block translation is needed.
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  /** Stream a conversation response, yielding text chunks as they arrive */
  async *streamConverse(params: CreateParams): AsyncGenerator<string> {
    const messages = this.toVertexMessages(params.messages);

    const stream = this.client.messages.stream({
      model: params.model || DEFAULT_MODEL,
      max_tokens: params.max_tokens ?? 1024,
      temperature: params.temperature,
      system: params.system,
      messages,
    });

    // MessageStream is an AsyncIterable of raw SSE events, not text chunks —
    // pick out the text_delta payloads, same idea as the Bedrock version's
    // `event.contentBlockDelta?.delta?.text` check.
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
