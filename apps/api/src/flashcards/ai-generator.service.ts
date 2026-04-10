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

@Injectable()
export class AiGeneratorService {
  private readonly logger = new Logger(AiGeneratorService.name);

  constructor(private bedrock: BedrockService) {}

  async generateQuestions(
    cards: CardInput[],
    questionType: FlashcardQuestionType,
    count: number,
  ): Promise<GeneratedQuestion[]> {
    try {
      const response = await this.bedrock.messages.create({
        max_tokens: 4000,
        temperature: 0.7,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Generate ${count} ${questionType} question(s) for the following vocabulary words.

IMPORTANT: The "correctAnswer" for EVERY question must be the TARGET WORD itself, not a definition or synonym.

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
      return this.validateQuestions(questions, questionType);
    } catch (error) {
      this.logger.error(`AI generation failed: ${error.message}`);
      return this.generateFallbackQuestions(cards, questionType, count);
    }
  }

  private validateQuestions(
    questions: GeneratedQuestion[],
    expectedType: FlashcardQuestionType,
  ): GeneratedQuestion[] {
    return questions
      .map((q) => {
        if (!q.word || !q.question || !q.correctAnswer) return null;

        // Enforce: correctAnswer must be the target word
        if (q.correctAnswer.toLowerCase() !== q.word.toLowerCase()) {
          q.correctAnswer = q.word;
        }

        // For MC: ensure correct answer is in options
        if (expectedType === 'MULTIPLE_CHOICE') {
          if (!q.options || q.options.length !== 4) return null;
          if (!q.options.some((o) => o.toLowerCase() === q.correctAnswer.toLowerCase())) {
            // Replace a random wrong option with the correct answer
            const idx = Math.floor(Math.random() * q.options.length);
            q.options[idx] = q.correctAnswer;
          }
        }

        return q;
      })
      .filter(Boolean) as GeneratedQuestion[];
  }

  generateFallbackQuestions(
    cards: CardInput[],
    questionType: FlashcardQuestionType,
    count: number,
  ): GeneratedQuestion[] {
    const selected = cards.slice(0, count);
    return selected.map((card) => {
      switch (questionType) {
        case 'MULTIPLE_CHOICE':
          return this.fallbackMCQ(card, cards);
        case 'FILL_IN_THE_BLANK':
          return this.fallbackFillBlank(card);
        case 'TYPING':
          return this.fallbackTyping(card);
        default:
          return this.fallbackTyping(card);
      }
    });
  }

  private fallbackMCQ(card: CardInput, allCards: CardInput[]): GeneratedQuestion {
    const distractors = allCards
      .filter((c) => c.word !== card.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => c.word);

    while (distractors.length < 3) {
      distractors.push(`(other word ${distractors.length + 1})`);
    }

    const options = [card.word, ...distractors].sort(() => Math.random() - 0.5);

    return {
      word: card.word,
      questionType: 'MULTIPLE_CHOICE',
      question: `Which word means "${card.meaning}"?`,
      options,
      correctAnswer: card.word,
      explanation: `"${card.word}" means "${card.meaning}".`,
    };
  }

  private fallbackFillBlank(card: CardInput): GeneratedQuestion {
    return {
      word: card.word,
      questionType: 'FILL_IN_THE_BLANK',
      question: `The word that means "${card.meaning}" is ___.`,
      options: null,
      correctAnswer: card.word,
      explanation: `"${card.word}" means "${card.meaning}".`,
    };
  }

  private fallbackTyping(card: CardInput): GeneratedQuestion {
    return {
      word: card.word,
      questionType: 'TYPING',
      question: `Type the word that means: "${card.meaning}"`,
      options: null,
      correctAnswer: card.word,
      explanation: `"${card.word}" means "${card.meaning}".`,
    };
  }
}
