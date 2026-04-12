import { Injectable, Logger } from '@nestjs/common';
import { FlashcardQuestionType } from '@prisma/client';
import { BedrockService } from '../bedrock/bedrock.service';

export interface CardInput {
  word: string;
  meaning: string;
  level?: string;
}

export interface GeneratedQuestion {
  word: string;
  questionType: FlashcardQuestionType;
  question: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
}

const SYSTEM_PROMPT = `You are an expert English vocabulary question generator. Your task is to create high-quality vocabulary practice questions.

## CRITICAL RULES

### For ALL question types:
- "word" must be EXACTLY the target word from the input (preserve original casing).
- "correctAnswer" must ALWAYS be the target word itself — never a definition, synonym, or phrase.
- All questions must be grammatically correct and use natural English.
- Explanations must be concise (1-2 sentences) and help the learner understand the word.
- Avoid cultural bias and offensive content.

### For MULTIPLE_CHOICE:
- Generate exactly 4 options. The correctAnswer (the target word) must be one of the 4 options.
- Distractors must be plausible (same word class, similar difficulty) but clearly wrong.
- The question should describe the meaning or give context — do NOT include the target word in the question.
- Example question: "Which word means 'happening every day'?" → correctAnswer: "daily"

### For TYPING:
- "options" must be null.
- "correctAnswer" is the target word (NOT a definition or synonym).
- The question should describe the meaning and ask the learner to type the word.
- Example question: "Type the word that means 'happening every day':" → correctAnswer: "daily"

### For FILL_IN_THE_BLANK:
- "options" must be null.
- "correctAnswer" is the target word.
- The question must contain exactly one blank marked as ___ where the target word fits.
- Example question: "We check the news on a ___ basis." → correctAnswer: "daily"

## Output Format
Return ONLY a valid JSON array. No markdown, no backticks, no explanation outside the JSON:
[
  {
    "word": "daily",
    "questionType": "TYPING",
    "question": "Type the word that means 'happening every day':",
    "options": null,
    "correctAnswer": "daily",
    "explanation": "'Daily' means happening or done every day."
  }
]`;

const COMMON_WORD_POOL = [
  'gentle', 'rapid', 'eager', 'humble', 'sincere', 'curious', 'fragile', 'sturdy',
  'vivid', 'subtle', 'modest', 'urgent', 'distant', 'hollow', 'steady', 'gloomy',
  'clever', 'brave', 'tender', 'loyal', 'fierce', 'graceful', 'awkward', 'silent',
  'wander', 'gather', 'reveal', 'pursue', 'observe', 'deliver', 'sustain', 'recover',
  'inspire', 'examine', 'achieve', 'persuade', 'announce', 'demonstrate', 'overcome',
  'progress', 'method', 'purpose', 'feature', 'attempt', 'session', 'instance',
  'concept', 'pattern', 'reason', 'effort', 'measure', 'detail', 'matter', 'option',
];

@Injectable()
export class AiGeneratorService {
  private readonly logger = new Logger(AiGeneratorService.name);

  constructor(private bedrock: BedrockService) {}

  async generateQuestions(
    cards: CardInput[],
    questionType: FlashcardQuestionType,
    count: number,
  ): Promise<GeneratedQuestion[]> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.bedrock.messages.create({
          max_tokens: 4000,
          temperature: 0.7,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Generate ${count} ${questionType} question(s) for the following vocabulary words.

IMPORTANT:
- The "correctAnswer" for EVERY question must be the TARGET WORD itself, not a definition or synonym.
- For MULTIPLE_CHOICE: every distractor MUST be a real English word of the same part of speech and similar difficulty as the target word. NEVER use placeholders like "(other word 1)", "option A", "word1", or any string containing parentheses, numbers, or the literal text "other word".
- Distractors must be semantically distinct from the target so the correct answer is unambiguous.

Words:
${cards.map((c) => `- "${c.word}" (meaning: ${c.meaning})`).join('\n')}

Question type: ${questionType}
Count: ${count}

Return a JSON array with ${count} question object(s).`,
            },
          ],
        });

        const content = response.content[0]?.text;
        if (!content) throw new Error('Empty AI response');

        const questions: GeneratedQuestion[] = JSON.parse(content);
        const validated = this.validateQuestions(questions, questionType);

        if (validated.length < count) {
          throw new Error(
            `AI returned ${validated.length}/${count} valid questions after validation`,
          );
        }

        return validated;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `AI generation attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`,
        );
      }
    }

    this.logger.error(
      `AI generation failed after ${maxAttempts} attempts, using safety-net pool: ${lastError?.message}`,
    );
    return this.buildSafetyNetQuestions(cards, questionType, count);
  }

  private buildSafetyNetQuestions(
    cards: CardInput[],
    questionType: FlashcardQuestionType,
    count: number,
  ): GeneratedQuestion[] {
    return cards.slice(0, count).map((card) => {
      if (questionType === 'MULTIPLE_CHOICE') {
        const targetLower = card.word.toLowerCase();
        const distractors = COMMON_WORD_POOL
          .filter((w) => w.toLowerCase() !== targetLower)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        const options = [card.word, ...distractors].sort(() => Math.random() - 0.5);
        return {
          word: card.word,
          questionType,
          question: `Which word means "${card.meaning}"?`,
          options,
          correctAnswer: card.word,
          explanation: `"${card.word}" means "${card.meaning}".`,
        };
      }
      if (questionType === 'FILL_IN_THE_BLANK') {
        return {
          word: card.word,
          questionType,
          question: `The word that means "${card.meaning}" is ___.`,
          options: null,
          correctAnswer: card.word,
          explanation: `"${card.word}" means "${card.meaning}".`,
        };
      }
      return {
        word: card.word,
        questionType: 'TYPING' as FlashcardQuestionType,
        question: `Type the word that means: "${card.meaning}"`,
        options: null,
        correctAnswer: card.word,
        explanation: `"${card.word}" means "${card.meaning}".`,
      };
    });
  }

  private validateQuestions(
    questions: GeneratedQuestion[],
    expectedType: FlashcardQuestionType,
  ): GeneratedQuestion[] {
    const placeholderPattern = /\(.*\)|^option\s*[a-d]$|^word\s*\d+$|other\s*word/i;

    return questions
      .map((q) => {
        if (!q.word || !q.question || !q.correctAnswer) return null;

        if (q.correctAnswer.toLowerCase() !== q.word.toLowerCase()) {
          q.correctAnswer = q.word;
        }

        if (expectedType === 'MULTIPLE_CHOICE') {
          if (!q.options || q.options.length !== 4) return null;

          if (q.options.some((o) => !o || placeholderPattern.test(o.trim()))) {
            return null;
          }

          const unique = new Set(q.options.map((o) => o.toLowerCase().trim()));
          if (unique.size !== 4) return null;

          if (!q.options.some((o) => o.toLowerCase() === q.correctAnswer.toLowerCase())) {
            return null;
          }
        }

        return q;
      })
      .filter(Boolean) as GeneratedQuestion[];
  }
}
