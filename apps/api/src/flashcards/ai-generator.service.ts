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

const SYSTEM_PROMPT = `You are an expert IELTS vocabulary question generator. Your task is to create high-quality English vocabulary questions for IELTS learners.

## Rules
1. All questions must be grammatically correct and use natural English.
2. For MULTIPLE_CHOICE: generate exactly 4 options. Distractors must be plausible (same word class, similar difficulty level) but clearly wrong.
3. For FILL_IN_THE_BLANK: provide a sentence with exactly one blank (marked as ___). The blank must be the target word.
4. For TYPING: ask a definition-based or context-based question where the answer is the target word.
5. Explanations must be concise (1-2 sentences) and help the learner understand WHY the answer is correct.
6. Never use the target word in the question stem for MULTIPLE_CHOICE (to avoid giving it away).
7. Example sentences should be at the appropriate IELTS band level.
8. Avoid cultural bias and offensive content.

## Output Format
Return ONLY a JSON array, no markdown, no explanation outside the JSON:
[
  {
    "word": "the target word",
    "questionType": "MULTIPLE_CHOICE",
    "question": "the question text",
    "options": ["option1", "option2", "option3", "option4"],
    "correctAnswer": "the correct option (must match exactly one option)",
    "explanation": "Brief explanation of why this is correct"
  }
]

For TYPING type:
- "options" should be null
- "correctAnswer" is the target word
- "question" should prompt the user to type the word

For FILL_IN_THE_BLANK type:
- "options" should be null
- "correctAnswer" is the target word
- "question" should contain ___ where the word goes

## Quality Checklist
- Is the question unambiguous? (only ONE correct answer possible)
- Are distractors plausible but clearly wrong?
- Is the language natural and at the right level?
- Does the explanation teach something useful?`;

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
            content: JSON.stringify({ cards, questionType, count }),
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
    return questions.filter((q) => {
      if (!q.word || !q.question || !q.correctAnswer) return false;
      if (
        expectedType === 'MULTIPLE_CHOICE' &&
        (!q.options || q.options.length !== 4)
      )
        return false;
      if (
        expectedType === 'MULTIPLE_CHOICE' &&
        !q.options!.includes(q.correctAnswer)
      )
        return false;
      return true;
    });
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
