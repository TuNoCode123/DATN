import { Test, TestingModule } from '@nestjs/testing';
import { AttemptsService } from './attempts.service';
import { ScoringService } from '../scoring/scoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus } from '@prisma/client';

// Mock PrismaService with chainable methods
const mockPrismaService = () => {
  const mock: any = {
    test: { findUnique: jest.fn() },
    userAttempt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userAnswer: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    question: { count: jest.fn() },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };
  // Add test.update
  mock.test.update = jest.fn();
  return mock;
};

describe('AttemptsService', () => {
  let service: AttemptsService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let scoringService: ScoringService;

  beforeEach(async () => {
    prisma = mockPrismaService();
    scoringService = new ScoringService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttemptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScoringService, useValue: scoringService },
      ],
    }).compile();

    service = module.get<AttemptsService>(AttemptsService);
  });

  describe('submitAttempt', () => {
    const userId = 'user-1';
    const attemptId = 'attempt-1';

    it('should compute IELTS band scores on submit', async () => {
      const mockAttempt = {
        id: attemptId,
        userId,
        testId: 'test-1',
        status: AttemptStatus.IN_PROGRESS,
        answers: [
          // 30 correct out of 40 listening questions
          ...Array.from({ length: 30 }, (_, i) => ({
            id: `ans-${i}`,
            answerText: 'correct',
            question: {
              correctAnswer: 'correct',
              group: { section: { skill: 'LISTENING' } },
            },
          })),
          ...Array.from({ length: 10 }, (_, i) => ({
            id: `ans-wrong-${i}`,
            answerText: 'wrong',
            question: {
              correctAnswer: 'correct',
              group: { section: { skill: 'LISTENING' } },
            },
          })),
        ],
        sections: [{ sectionId: 'sec-1' }],
      };

      const mockTest = {
        id: 'test-1',
        examType: 'IELTS_ACADEMIC',
      };

      prisma.userAttempt.findUnique.mockResolvedValue(mockAttempt);
      prisma.test.findUnique.mockResolvedValue(mockTest);
      prisma.question.count.mockResolvedValue(40);
      prisma.userAnswer.update.mockResolvedValue({});

      // Mock the sections with their skills for per-section scoring
      // We need to mock a query that gets section details
      const mockSections = [
        {
          id: 'sec-1',
          skill: 'LISTENING',
          questionGroups: [
            {
              questions: Array.from({ length: 40 }, (_, i) => ({
                id: `q-${i}`,
              })),
            },
          ],
        },
      ];

      // The service needs to query sections to get skills
      // Let's mock the test with sections included
      prisma.test.findUnique.mockResolvedValue({
        ...mockTest,
        sections: mockSections,
      });

      const updateData: any = {};
      prisma.userAttempt.update.mockImplementation(({ data }: any) => {
        Object.assign(updateData, data);
        return Promise.resolve({ ...mockAttempt, ...data });
      });
      prisma.test.update.mockResolvedValue({});

      await service.submitAttempt(attemptId, userId);

      // Verify that bandScore was computed
      expect(updateData.bandScore).toBeDefined();
      expect(updateData.bandScore).toBeGreaterThan(0);
      expect(updateData.scaledScore).toBeNull();
      expect(updateData.sectionScores).toBeDefined();
      expect(updateData.correctCount).toBe(30);
      expect(updateData.totalQuestions).toBe(40);
    });

    it('should compute TOEIC scaled scores on submit', async () => {
      const listeningAnswers = [
        ...Array.from({ length: 85 }, (_, i) => ({
          id: `ans-l-${i}`,
          answerText: 'correct',
          question: {
            correctAnswer: 'correct',
            group: { section: { skill: 'LISTENING' } },
          },
        })),
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `ans-l-wrong-${i}`,
          answerText: 'wrong',
          question: {
            correctAnswer: 'correct',
            group: { section: { skill: 'LISTENING' } },
          },
        })),
      ];

      const readingAnswers = [
        ...Array.from({ length: 78 }, (_, i) => ({
          id: `ans-r-${i}`,
          answerText: 'correct',
          question: {
            correctAnswer: 'correct',
            group: { section: { skill: 'READING' } },
          },
        })),
        ...Array.from({ length: 22 }, (_, i) => ({
          id: `ans-r-wrong-${i}`,
          answerText: 'wrong',
          question: {
            correctAnswer: 'correct',
            group: { section: { skill: 'READING' } },
          },
        })),
      ];

      const mockAttempt = {
        id: attemptId,
        userId,
        testId: 'test-2',
        status: AttemptStatus.IN_PROGRESS,
        answers: [...listeningAnswers, ...readingAnswers],
        sections: [{ sectionId: 'sec-l' }, { sectionId: 'sec-r' }],
      };

      const mockTest = {
        id: 'test-2',
        examType: 'TOEIC_LR',
        sections: [
          {
            id: 'sec-l',
            skill: 'LISTENING',
            questionGroups: [
              {
                questions: Array.from({ length: 100 }, (_, i) => ({
                  id: `q-l-${i}`,
                })),
              },
            ],
          },
          {
            id: 'sec-r',
            skill: 'READING',
            questionGroups: [
              {
                questions: Array.from({ length: 100 }, (_, i) => ({
                  id: `q-r-${i}`,
                })),
              },
            ],
          },
        ],
      };

      prisma.userAttempt.findUnique.mockResolvedValue(mockAttempt);
      prisma.test.findUnique.mockResolvedValue(mockTest);
      prisma.question.count.mockResolvedValue(200);
      prisma.userAnswer.update.mockResolvedValue({});

      const updateData: any = {};
      prisma.userAttempt.update.mockImplementation(({ data }: any) => {
        Object.assign(updateData, data);
        return Promise.resolve({ ...mockAttempt, ...data });
      });
      prisma.test.update.mockResolvedValue({});

      await service.submitAttempt(attemptId, userId);

      expect(updateData.scaledScore).toBeDefined();
      expect(updateData.scaledScore).toBeGreaterThanOrEqual(10);
      expect(updateData.scaledScore).toBeLessThanOrEqual(990);
      expect(updateData.bandScore).toBeNull();
      expect(updateData.sectionScores).toBeDefined();
    });

    it('should throw if attempt not found', async () => {
      prisma.userAttempt.findUnique.mockResolvedValue(null);
      await expect(service.submitAttempt('bad-id', userId)).rejects.toThrow(
        'Attempt not found',
      );
    });

    it('should throw if user is not the owner', async () => {
      prisma.userAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: 'other-user',
        status: AttemptStatus.IN_PROGRESS,
        answers: [],
        sections: [],
      });
      await expect(service.submitAttempt(attemptId, userId)).rejects.toThrow();
    });

    it('should throw if attempt already submitted', async () => {
      prisma.userAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId,
        status: AttemptStatus.SUBMITTED,
        answers: [],
        sections: [],
      });
      await expect(service.submitAttempt(attemptId, userId)).rejects.toThrow(
        'Attempt already submitted',
      );
    });
  });
});
