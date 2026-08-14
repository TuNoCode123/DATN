import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI, type Content, type Part } from '@google-cloud/vertexai';

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

// Claude on Vertex AI Model Garden requires per-model quota that Google
// only grants after the model is explicitly enabled (EULA accepted) in the
// project's Model Garden console — a manual, per-project step with no API.
// Gemini is Google's own first-party model family: any project with the
// Vertex AI API enabled already has default quota for it, no extra
// enablement step. Swapping the backend here (instead of at every call
// site) means every consumer — pronunciation, writing grading, chat,
// flashcards, translation — keeps working unchanged.
const DEFAULT_MODEL = 'gemini-2.5-flash';

@Injectable()
export class VertexAiService {
  private client: VertexAI;
  private readonly logger = new Logger(VertexAiService.name);

  constructor(private config: ConfigService) {
    const projectId = this.config.getOrThrow<string>('GCP_PROJECT_ID');
    const region = this.config.get<string>('GEMINI_VERTEX_REGION') || 'us-central1';

    // Auth via Application Default Credentials — the Cloud Run service
    // account in production, `gcloud auth application-default login`
    // locally. No API key or exported key file involved.
    this.client = new VertexAI({ project: projectId, location: region });
    this.logger.log(`Vertex AI (Gemini) client initialised (project: ${projectId}, region: ${region})`);
  }

  /** Drop-in compatible messages API so callers keep working unchanged */
  get messages() {
    return {
      create: async (params: CreateParams): Promise<CreateResponse> => {
        const model = this.client.getGenerativeModel({
          model: params.model || DEFAULT_MODEL,
          ...(params.system
            ? { systemInstruction: { role: 'system', parts: [{ text: params.system }] } }
            : {}),
        });

        const result = await model.generateContent({
          contents: this.toGeminiContents(params.messages),
          generationConfig: {
            maxOutputTokens: params.max_tokens ?? 1024,
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
          },
        });

        const text = this.extractText(result.response.candidates?.[0]?.content?.parts);

        return {
          id: `gemini-${Date.now()}`,
          content: [{ type: 'text', text }],
        };
      },
    };
  }

  /** Stream a conversation response, yielding text chunks as they arrive */
  async *streamConverse(params: CreateParams): AsyncGenerator<string> {
    const model = this.client.getGenerativeModel({
      model: params.model || DEFAULT_MODEL,
      ...(params.system
        ? { systemInstruction: { role: 'system', parts: [{ text: params.system }] } }
        : {}),
    });

    const streamResult = await model.generateContentStream({
      contents: this.toGeminiContents(params.messages),
      generationConfig: {
        maxOutputTokens: params.max_tokens ?? 1024,
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      },
    });

    for await (const chunk of streamResult.stream) {
      const text = this.extractText(chunk.candidates?.[0]?.content?.parts);
      if (text) yield text;
    }
  }

  private extractText(parts: Part[] | undefined): string {
    if (!parts) return '';
    return parts.map((p) => p.text ?? '').join('');
  }

  private toGeminiContents(messages: Message[]): Content[] {
    // Gemini has no "system" role in `contents` (handled via
    // systemInstruction above) and calls the assistant turn "model".
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: this.toGeminiParts(m.content),
      }));
  }

  private toGeminiParts(content: MessageContent): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }
    return content.map((block): Part =>
      block.type === 'image'
        ? { inlineData: { mimeType: block.source.media_type, data: block.source.data } }
        : { text: block.text },
    );
  }
}
