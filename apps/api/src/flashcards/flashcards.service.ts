import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SrsService } from './srs.service';
import { AiGeneratorService, GeneratedQuestion } from './ai-generator.service';
import {
  DeckVisibility,
  FlashcardQuestionType,
  Prisma,
} from '@prisma/client';
import { CreateDeckDto } from './dto/create-deck.dto';
import { UpdateDeckDto } from './dto/update-deck.dto';
import { AddCardsDto, UpdateCardDto } from './dto/card.dto';
import {
  StartPracticeDto,
  StartTestDto,
  FlipResultDto,
  SubmitAnswerDto,
  SubmitTestDto,
  RateCardDto,
} from './dto/session.dto';

@Injectable()
export class FlashcardsService {
  constructor(
    private prisma: PrismaService,
    private srsService: SrsService,
    private aiGenerator: AiGeneratorService,
  ) {}

  // ─── Deck CRUD ─────────────────────────────────────────

  async createDeck(userId: string, dto: CreateDeckDto) {
    return this.prisma.deck.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        visibility: dto.visibility || 'PRIVATE',
        tags: dto.tags || [],
        cardCount: dto.cards.length,
        cards: {
          create: dto.cards.map((card, index) => ({
            word: card.word,
            meaning: card.meaning,
            exampleSentence: card.exampleSentence,
            ipa: card.ipa,
            audioUrl: card.audioUrl,
            imageUrl: card.imageUrl,
            orderIndex: index,
          })),
        },
      },
      include: { cards: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async findDecks(
    userId: string,
    filters: {
      search?: string;
      visibility?: string;
      tags?: string[];
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DeckWhereInput = {
      OR: [
        { userId },
        { visibility: 'PUBLIC' },
      ],
    };

    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }

    if (filters.visibility === 'PUBLIC') {
      delete where.OR;
      where.visibility = 'PUBLIC';
    } else if (filters.visibility === 'PRIVATE') {
      delete where.OR;
      where.userId = userId;
      where.visibility = 'PRIVATE';
    }

    if (filters.tags?.length) {
      where.tags = { hasSome: filters.tags };
    }

    const [data, total] = await Promise.all([
      this.prisma.deck.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          _count: { select: { cards: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deck.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findDeckById(id: string, userId?: string) {
    const deck = await this.prisma.deck.findUnique({
      where: { id },
      include: {
        cards: { orderBy: { orderIndex: 'asc' } },
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!deck) throw new NotFoundException('Deck not found');

    if (deck.visibility === 'PRIVATE' && deck.userId !== userId) {
      throw new ForbiddenException('This deck is private');
    }

    // Include user progress if authenticated
    let progress: any[] = [];
    if (userId) {
      progress = await this.prisma.userCardProgress.findMany({
        where: {
          userId,
          flashcardId: { in: deck.cards.map((c) => c.id) },
        },
      });
    }

    return { ...deck, progress };
  }

  async updateDeck(id: string, userId: string, dto: UpdateDeckDto) {
    const deck = await this.prisma.deck.findUnique({ where: { id } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not the owner');

    return this.prisma.deck.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        visibility: dto.visibility,
        tags: dto.tags,
      },
      include: { cards: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async deleteDeck(id: string, userId: string) {
    const deck = await this.prisma.deck.findUnique({ where: { id } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not the owner');

    await this.prisma.deck.delete({ where: { id } });
    return { message: 'Deck deleted' };
  }

  async cloneDeck(id: string, userId: string) {
    const deck = await this.prisma.deck.findUnique({
      where: { id },
      include: { cards: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.visibility === 'PRIVATE' && deck.userId !== userId) {
      throw new ForbiddenException('Cannot clone a private deck');
    }

    return this.prisma.deck.create({
      data: {
        userId,
        title: `${deck.title} (Copy)`,
        description: deck.description,
        visibility: 'PRIVATE',
        tags: deck.tags,
        cardCount: deck.cards.length,
        cards: {
          create: deck.cards.map((card) => ({
            word: card.word,
            meaning: card.meaning,
            exampleSentence: card.exampleSentence,
            ipa: card.ipa,
            audioUrl: card.audioUrl,
            imageUrl: card.imageUrl,
            orderIndex: card.orderIndex,
          })),
        },
      },
      include: { cards: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  // ─── Card CRUD ─────────────────────────────────────────

  async addCards(deckId: string, userId: string, dto: AddCardsDto) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not the owner');

    const maxOrder = await this.prisma.flashcard.findFirst({
      where: { deckId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const startIndex = (maxOrder?.orderIndex ?? -1) + 1;

    const created = await this.prisma.$transaction(
      dto.cards.map((card, i) =>
        this.prisma.flashcard.create({
          data: {
            deckId,
            word: card.word,
            meaning: card.meaning,
            exampleSentence: card.exampleSentence,
            ipa: card.ipa,
            audioUrl: card.audioUrl,
            imageUrl: card.imageUrl,
            orderIndex: startIndex + i,
          },
        }),
      ),
    );

    await this.prisma.deck.update({
      where: { id: deckId },
      data: { cardCount: { increment: dto.cards.length } },
    });

    return created;
  }

  async updateCard(
    deckId: string,
    cardId: string,
    userId: string,
    dto: UpdateCardDto,
  ) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not the owner');

    const card = await this.prisma.flashcard.findFirst({
      where: { id: cardId, deckId },
    });
    if (!card) throw new NotFoundException('Card not found in this deck');

    return this.prisma.flashcard.update({
      where: { id: cardId },
      data: {
        word: dto.word,
        meaning: dto.meaning,
        exampleSentence: dto.exampleSentence,
        ipa: dto.ipa,
        audioUrl: dto.audioUrl,
        imageUrl: dto.imageUrl,
      },
    });
  }

  async deleteCard(deckId: string, cardId: string, userId: string) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not the owner');

    const card = await this.prisma.flashcard.findFirst({
      where: { id: cardId, deckId },
    });
    if (!card) throw new NotFoundException('Card not found in this deck');

    await this.prisma.flashcard.delete({ where: { id: cardId } });
    await this.prisma.deck.update({
      where: { id: deckId },
      data: { cardCount: { decrement: 1 } },
    });

    return { message: 'Card deleted' };
  }

  async reorderCards(deckId: string, userId: string, cardIds: string[]) {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not the owner');

    await this.prisma.$transaction(
      cardIds.map((id, index) =>
        this.prisma.flashcard.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    );

    return { message: 'Cards reordered' };
  }

  // ─── Study Mode ────────────────────────────────────────

  async startStudy(deckId: string, userId: string) {
    const deck = await this.getDeckWithCards(deckId, userId);

    const session = await this.prisma.studySession.create({
      data: {
        userId,
        deckId,
        type: 'STUDY',
        totalCards: deck.cards.length,
      },
    });

    return { session, cards: deck.cards };
  }

  async recordFlip(sessionId: string, userId: string, dto: FlipResultDto) {
    const session = await this.getOwnSession(sessionId, userId);

    // Upsert progress
    await this.prisma.userCardProgress.upsert({
      where: {
        userId_flashcardId: { userId, flashcardId: dto.flashcardId },
      },
      create: {
        userId,
        flashcardId: dto.flashcardId,
        familiarity: dto.known ? 1 : 0,
      },
      update: {
        familiarity: dto.known ? { increment: 1 } : 0,
      },
    });

    // Record in session — find existing or create
    const existing = await this.prisma.studySessionAnswer.findFirst({
      where: { sessionId, flashcardId: dto.flashcardId },
    });

    if (existing) {
      await this.prisma.studySessionAnswer.update({
        where: { id: existing.id },
        data: { isCorrect: dto.known, answeredAt: new Date() },
      });
    } else {
      await this.prisma.studySessionAnswer.create({
        data: {
          sessionId,
          flashcardId: dto.flashcardId,
          isCorrect: dto.known,
          answeredAt: new Date(),
        },
      });
    }

    return { success: true };
  }

  async completeStudy(sessionId: string, userId: string) {
    const session = await this.getOwnSession(sessionId, userId);

    const answers = await this.prisma.studySessionAnswer.findMany({
      where: { sessionId },
    });

    const knownCount = answers.filter((a) => a.isCorrect).length;

    return this.prisma.studySession.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        knownCount,
      },
    });
  }

  // ─── Practice Mode ────────────────────────────────────

  async startPractice(deckId: string, userId: string, dto: StartPracticeDto) {
    const deck = await this.getDeckWithCards(deckId, userId);

    const questionTypes: FlashcardQuestionType[] =
      dto.questionTypes && dto.questionTypes.length > 0
        ? dto.questionTypes
        : ['MULTIPLE_CHOICE'];

    const count = Math.min(dto.questionCount || 10, deck.cards.length, 50);

    // Shuffle cards and pick
    const shuffled = [...deck.cards].sort(() => Math.random() - 0.5);
    const selectedCards = shuffled.slice(0, count);

    // Generate questions per type, distributing evenly
    const questionsPerType = Math.ceil(count / questionTypes.length);
    const allQuestions: GeneratedQuestion[] = [];
    let cardOffset = 0;

    for (const qType of questionTypes) {
      const cardsForType = selectedCards.slice(cardOffset, cardOffset + questionsPerType);
      cardOffset += questionsPerType;
      if (cardsForType.length === 0) break;

      const generated = await this.aiGenerator.generateQuestions(
        cardsForType.map((c) => ({ word: c.word, meaning: c.meaning })),
        qType,
        cardsForType.length,
      );
      allQuestions.push(...generated);
    }

    // Create session with pre-stored answers
    const session = await this.prisma.studySession.create({
      data: {
        userId,
        deckId,
        type: 'PRACTICE',
        questionTypes,
        questionCount: allQuestions.length,
        totalCards: allQuestions.length,
        answers: {
          create: allQuestions.map((q) => ({
            flashcardId: deck.cards.find((c) => c.word === q.word)?.id || deck.cards[0].id,
            questionType: q.questionType,
            question: q.question,
            options: q.options ?? undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          })),
        },
      },
      include: { answers: true },
    });

    // Return questions without correct answers
    const questions = session.answers.map((a) => ({
      id: a.id,
      flashcardId: a.flashcardId,
      questionType: a.questionType,
      question: a.question,
      options: a.options,
    }));

    return { session: { id: session.id, type: session.type, totalCards: session.totalCards }, questions };
  }

  async submitPracticeAnswer(
    sessionId: string,
    userId: string,
    dto: SubmitAnswerDto,
  ) {
    await this.getOwnSession(sessionId, userId);

    const answer = await this.prisma.studySessionAnswer.findFirst({
      where: { sessionId, flashcardId: dto.flashcardId },
    });

    if (!answer) throw new NotFoundException('Question not found');

    const isCorrect =
      dto.userAnswer.trim().toLowerCase() ===
      answer.correctAnswer?.trim().toLowerCase();

    const updated = await this.prisma.studySessionAnswer.update({
      where: { id: answer.id },
      data: {
        userAnswer: dto.userAnswer,
        isCorrect,
        answeredAt: new Date(),
      },
    });

    if (isCorrect) {
      await this.prisma.studySession.update({
        where: { id: sessionId },
        data: { correctCount: { increment: 1 } },
      });
    }

    return {
      isCorrect,
      correctAnswer: answer.correctAnswer,
      explanation: answer.explanation,
    };
  }

  async completePractice(sessionId: string, userId: string) {
    const session = await this.getOwnSession(sessionId, userId);

    const answers = await this.prisma.studySessionAnswer.findMany({
      where: { sessionId },
    });

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const scorePercent =
      answers.length > 0 ? (correctCount / answers.length) * 100 : 0;

    return this.prisma.studySession.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        correctCount,
        scorePercent,
      },
      include: {
        answers: true,
      },
    });
  }

  // ─── Test Mode ─────────────────────────────────────────

  async startTest(deckId: string, userId: string, dto: StartTestDto) {
    const deck = await this.getDeckWithCards(deckId, userId);

    const questionTypes: FlashcardQuestionType[] =
      dto.questionTypes && dto.questionTypes.length > 0
        ? dto.questionTypes
        : ['MULTIPLE_CHOICE', 'TYPING', 'FILL_IN_THE_BLANK'];

    const count = Math.min(dto.questionCount || 20, deck.cards.length, 50);

    const shuffled = [...deck.cards].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    // Generate all questions upfront
    const allQuestions: GeneratedQuestion[] = [];
    const perType = Math.ceil(count / questionTypes.length);

    for (let i = 0; i < questionTypes.length; i++) {
      const start = i * perType;
      const cardsForType = selected.slice(start, start + perType);
      if (cardsForType.length === 0) break;

      const generated = await this.aiGenerator.generateQuestions(
        cardsForType.map((c) => ({ word: c.word, meaning: c.meaning })),
        questionTypes[i],
        cardsForType.length,
      );
      allQuestions.push(...generated);
    }

    const session = await this.prisma.studySession.create({
      data: {
        userId,
        deckId,
        type: 'TEST',
        questionTypes,
        questionCount: allQuestions.length,
        totalCards: allQuestions.length,
        answers: {
          create: allQuestions.map((q) => ({
            flashcardId:
              deck.cards.find((c) => c.word === q.word)?.id ||
              deck.cards[0].id,
            questionType: q.questionType,
            question: q.question,
            options: q.options ?? undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          })),
        },
      },
      include: { answers: true },
    });

    // Return questions without answers
    const questions = session.answers.map((a) => ({
      id: a.id,
      flashcardId: a.flashcardId,
      questionType: a.questionType,
      question: a.question,
      options: a.options,
    }));

    return {
      session: { id: session.id, type: session.type, totalCards: session.totalCards },
      questions,
    };
  }

  async getTestQuestions(sessionId: string, userId: string) {
    await this.getOwnSession(sessionId, userId);

    const answers = await this.prisma.studySessionAnswer.findMany({
      where: { sessionId },
    });

    return answers.map((a) => ({
      id: a.id,
      flashcardId: a.flashcardId,
      questionType: a.questionType,
      question: a.question,
      options: a.options,
      userAnswer: a.userAnswer,
    }));
  }

  async submitTest(sessionId: string, userId: string, dto: SubmitTestDto) {
    await this.getOwnSession(sessionId, userId);

    const answers = await this.prisma.studySessionAnswer.findMany({
      where: { sessionId },
    });

    let correctCount = 0;
    const results: any[] = [];

    for (const answer of answers) {
      const submitted = dto.answers.find((a) => a.answerId === answer.id);
      const userAnswer = submitted?.userAnswer || '';
      const isCorrect =
        userAnswer.trim().toLowerCase() ===
        answer.correctAnswer?.trim().toLowerCase();

      if (isCorrect) correctCount++;

      await this.prisma.studySessionAnswer.update({
        where: { id: answer.id },
        data: { userAnswer, isCorrect, answeredAt: new Date() },
      });

      results.push({
        flashcardId: answer.flashcardId,
        questionType: answer.questionType,
        question: answer.question,
        userAnswer,
        correctAnswer: answer.correctAnswer,
        isCorrect,
        explanation: answer.explanation,
      });
    }

    const scorePercent =
      answers.length > 0 ? (correctCount / answers.length) * 100 : 0;

    await this.prisma.studySession.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        correctCount,
        scorePercent,
      },
    });

    return {
      totalQuestions: answers.length,
      correctCount,
      scorePercent,
      answers: results,
    };
  }

  // ─── Review Mode (Spaced Repetition) ──────────────────

  async getDueCards(userId: string, deckId?: string) {
    const where: Prisma.UserCardProgressWhereInput = {
      userId,
      nextReviewAt: { lte: new Date() },
    };

    if (deckId) {
      where.flashcard = { deckId };
    }

    const dueCards = await this.prisma.userCardProgress.findMany({
      where,
      include: {
        flashcard: {
          include: { deck: { select: { id: true, title: true } } },
        },
      },
      orderBy: { nextReviewAt: 'asc' },
      take: 50,
    });

    return dueCards;
  }

  async startReview(userId: string, deckId?: string) {
    const dueCards = await this.getDueCards(userId, deckId);

    if (dueCards.length === 0) {
      return { session: null, cards: [], message: 'All caught up! No cards due for review.' };
    }

    const targetDeckId = deckId || dueCards[0].flashcard.deckId;

    const session = await this.prisma.studySession.create({
      data: {
        userId,
        deckId: targetDeckId,
        type: 'REVIEW',
        totalCards: dueCards.length,
      },
    });

    return {
      session,
      cards: dueCards.map((p) => ({
        progressId: p.id,
        flashcard: p.flashcard,
        easeFactor: p.easeFactor,
        interval: p.interval,
        repetitions: p.repetitions,
      })),
    };
  }

  async rateCard(sessionId: string, userId: string, dto: RateCardDto) {
    await this.getOwnSession(sessionId, userId);

    const progress = await this.prisma.userCardProgress.findUnique({
      where: {
        userId_flashcardId: { userId, flashcardId: dto.flashcardId },
      },
    });

    if (!progress) {
      // Create fresh progress if none exists
      const result = this.srsService.calculate({
        quality: dto.quality,
        repetitions: 0,
        easeFactor: 2.5,
        interval: 0,
      });

      await this.prisma.userCardProgress.create({
        data: {
          userId,
          flashcardId: dto.flashcardId,
          easeFactor: result.easeFactor,
          interval: result.interval,
          repetitions: result.repetitions,
          nextReviewAt: result.nextReviewAt,
          lastReviewAt: new Date(),
        },
      });

      return result;
    }

    const result = this.srsService.calculate({
      quality: dto.quality,
      repetitions: progress.repetitions,
      easeFactor: progress.easeFactor,
      interval: progress.interval,
    });

    await this.prisma.userCardProgress.update({
      where: { id: progress.id },
      data: {
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReviewAt: result.nextReviewAt,
        lastReviewAt: new Date(),
      },
    });

    // Record in session
    await this.prisma.studySessionAnswer.create({
      data: {
        sessionId,
        flashcardId: dto.flashcardId,
        isCorrect: dto.quality >= 3,
        answeredAt: new Date(),
      },
    });

    return result;
  }

  async getReviewStats(userId: string) {
    const [totalCards, dueCards, learnedCards, masteredCards] =
      await Promise.all([
        this.prisma.userCardProgress.count({ where: { userId } }),
        this.prisma.userCardProgress.count({
          where: { userId, nextReviewAt: { lte: new Date() } },
        }),
        this.prisma.userCardProgress.count({
          where: { userId, repetitions: { gte: 1 } },
        }),
        this.prisma.userCardProgress.count({
          where: { userId, interval: { gte: 21 } },
        }),
      ]);

    // Recent review history (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSessions = await this.prisma.studySession.findMany({
      where: {
        userId,
        type: 'REVIEW',
        completedAt: { gte: sevenDaysAgo },
      },
      select: { completedAt: true, totalCards: true },
      orderBy: { completedAt: 'desc' },
    });

    const reviewsByDay = this.groupByDay(recentSessions);

    return {
      totalCards,
      dueToday: dueCards,
      learnedCards,
      masteredCards,
      streakDays: this.calculateStreak(reviewsByDay),
      reviewsByDay,
    };
  }

  // ─── Helpers ───────────────────────────────────────────

  private async getDeckWithCards(deckId: string, userId?: string) {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
      include: { cards: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!deck) throw new NotFoundException('Deck not found');
    if (deck.visibility === 'PRIVATE' && deck.userId !== userId) {
      throw new ForbiddenException('This deck is private');
    }
    if (deck.cards.length === 0) {
      throw new BadRequestException('Deck has no cards');
    }

    return deck;
  }

  private async getOwnSession(sessionId: string, userId: string) {
    const session = await this.prisma.studySession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your session');

    return session;
  }

  private groupByDay(
    sessions: { completedAt: Date | null; totalCards: number }[],
  ) {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.completedAt) continue;
      const day = s.completedAt.toISOString().split('T')[0];
      map.set(day, (map.get(day) || 0) + s.totalCards);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  private calculateStreak(reviewsByDay: { date: string; count: number }[]) {
    if (reviewsByDay.length === 0) return 0;
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (reviewsByDay.some((r) => r.date === dateStr)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }
}
