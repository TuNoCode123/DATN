import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ExamType } from '@prisma/client';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestMetadataDto } from './dto/update-test.dto';
import { CreateFromTemplateDto } from './dto/template.dto';
import {
  SyncTestDto,
  SyncSectionDto,
  SyncPassageDto,
  SyncGroupDto,
  SyncQuestionDto,
} from './dto/sync-test.dto';

@Injectable()
export class AdminTestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    examType?: ExamType;
    isPublished?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TestWhereInput = {};

    if (filters.examType) where.examType = filters.examType;
    if (filters.isPublished !== undefined)
      where.isPublished = filters.isPublished;
    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.test.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          _count: { select: { attempts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.test.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            passages: { orderBy: { orderIndex: 'asc' } },
            questionGroups: {
              orderBy: { orderIndex: 'asc' },
              include: {
                questions: { orderBy: { orderIndex: 'asc' } },
              },
            },
          },
        },
        tags: { include: { tag: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    return { ...test, hasAttempts: test._count.attempts > 0 };
  }

  async create(dto: CreateTestDto) {
    const test = await this.prisma.$transaction(async (tx) => {
      let totalQuestions = 0;

      const test = await tx.test.create({
        data: {
          title: dto.title,
          examType: dto.examType,
          durationMins: dto.durationMins,
          description: dto.description,
          isPublished: dto.isPublished ?? false,
          sectionCount: dto.sections.length,
        },
      });

      // Create tags
      if (dto.tagIds?.length) {
        await tx.testTag.createMany({
          data: dto.tagIds.map((tagId) => ({ testId: test.id, tagId })),
        });
      }

      // Create sections → passages → groups → questions
      for (const sectionDto of dto.sections) {
        let sectionQuestionCount = 0;

        const section = await tx.testSection.create({
          data: {
            testId: test.id,
            title: sectionDto.title,
            skill: sectionDto.skill,
            orderIndex: sectionDto.orderIndex,
            instructions: sectionDto.instructions,
            audioUrl: sectionDto.audioUrl,
            durationMins: sectionDto.durationMins,
          },
        });

        // Create passages
        if (sectionDto.passages?.length) {
          await tx.passage.createMany({
            data: sectionDto.passages.map((p) => ({
              sectionId: section.id,
              title: p.title,
              contentHtml: p.contentHtml,
              orderIndex: p.orderIndex,
            })),
          });
        }

        for (const groupDto of sectionDto.questionGroups) {
          const group = await tx.questionGroup.create({
            data: {
              sectionId: section.id,
              questionType: groupDto.questionType,
              orderIndex: groupDto.orderIndex,
              instructions: groupDto.instructions,
              matchingOptions: groupDto.matchingOptions ?? Prisma.DbNull,
              audioUrl: groupDto.audioUrl,
              imageUrl: groupDto.imageUrl,
            },
          });

          if (groupDto.questions.length > 0) {
            await tx.question.createMany({
              data: groupDto.questions.map((q) => ({
                groupId: group.id,
                questionNumber: q.questionNumber,
                orderIndex: q.orderIndex,
                stem: q.stem,
                options: q.options ?? Prisma.DbNull,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                imageUrl: q.imageUrl,
                audioUrl: q.audioUrl,
              })),
            });
          }

          sectionQuestionCount += groupDto.questions.length;
          totalQuestions += groupDto.questions.length;
        }

        // Update section question count
        await tx.testSection.update({
          where: { id: section.id },
          data: { questionCount: sectionQuestionCount },
        });
      }

      // Update test question count
      await tx.test.update({
        where: { id: test.id },
        data: { questionCount: totalQuestions },
      });

      return test;
    });

    return this.findById(test.id);
  }

  async update(id: string, dto: CreateTestDto) {
    const existing = await this.prisma.test.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Test not found');

    return this.prisma.$transaction(async (tx) => {
      // Delete all children (cascade from sections handles groups, questions, passages)
      await tx.testSection.deleteMany({ where: { testId: id } });
      await tx.testTag.deleteMany({ where: { testId: id } });

      let totalQuestions = 0;

      // Update test metadata
      await tx.test.update({
        where: { id },
        data: {
          title: dto.title,
          examType: dto.examType,
          durationMins: dto.durationMins,
          description: dto.description,
          isPublished: dto.isPublished ?? existing.isPublished,
          sectionCount: dto.sections.length,
        },
      });

      // Recreate tags
      if (dto.tagIds?.length) {
        await tx.testTag.createMany({
          data: dto.tagIds.map((tagId) => ({ testId: id, tagId })),
        });
      }

      // Recreate sections → passages → groups → questions
      for (const sectionDto of dto.sections) {
        let sectionQuestionCount = 0;

        const section = await tx.testSection.create({
          data: {
            testId: id,
            title: sectionDto.title,
            skill: sectionDto.skill,
            orderIndex: sectionDto.orderIndex,
            instructions: sectionDto.instructions,
            audioUrl: sectionDto.audioUrl,
            durationMins: sectionDto.durationMins,
          },
        });

        // Create passages
        if (sectionDto.passages?.length) {
          await tx.passage.createMany({
            data: sectionDto.passages.map((p) => ({
              sectionId: section.id,
              title: p.title,
              contentHtml: p.contentHtml,
              orderIndex: p.orderIndex,
            })),
          });
        }

        for (const groupDto of sectionDto.questionGroups) {
          const group = await tx.questionGroup.create({
            data: {
              sectionId: section.id,
              questionType: groupDto.questionType,
              orderIndex: groupDto.orderIndex,
              instructions: groupDto.instructions,
              matchingOptions: groupDto.matchingOptions ?? Prisma.DbNull,
              audioUrl: groupDto.audioUrl,
              imageUrl: groupDto.imageUrl,
            },
          });

          if (groupDto.questions.length > 0) {
            await tx.question.createMany({
              data: groupDto.questions.map((q) => ({
                groupId: group.id,
                questionNumber: q.questionNumber,
                orderIndex: q.orderIndex,
                stem: q.stem,
                options: q.options ?? Prisma.DbNull,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                imageUrl: q.imageUrl,
                audioUrl: q.audioUrl,
              })),
            });
          }

          sectionQuestionCount += groupDto.questions.length;
          totalQuestions += groupDto.questions.length;
        }

        await tx.testSection.update({
          where: { id: section.id },
          data: { questionCount: sectionQuestionCount },
        });
      }

      await tx.test.update({
        where: { id },
        data: { questionCount: totalQuestions },
      });
    });

    return this.findById(id);
  }

  async updateMetadata(id: string, dto: UpdateTestMetadataDto) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Test not found');

    // Update tags if provided
    if (dto.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.testTag.deleteMany({ where: { testId: id } }),
        ...(dto.tagIds.length > 0
          ? [
              this.prisma.testTag.createMany({
                data: dto.tagIds.map((tagId) => ({ testId: id, tagId })),
              }),
            ]
          : []),
      ]);
    }

    return this.prisma.test.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.examType !== undefined && { examType: dto.examType }),
        ...(dto.durationMins !== undefined && { durationMins: dto.durationMins }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: { tags: { include: { tag: true } } },
    });
  }

  async duplicate(id: string) {
    const source = await this.findById(id);

    return this.prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          title: `${source.title} (Copy)`,
          examType: source.examType,
          durationMins: source.durationMins,
          description: source.description,
          isPublished: false,
          sectionCount: source.sectionCount,
          questionCount: source.questionCount,
        },
      });

      // Clone tags
      if (source.tags.length > 0) {
        await tx.testTag.createMany({
          data: source.tags.map((t) => ({ testId: test.id, tagId: t.tagId })),
        });
      }

      // Clone sections → passages → groups → questions
      for (const section of source.sections) {
        const newSection = await tx.testSection.create({
          data: {
            testId: test.id,
            title: section.title,
            skill: section.skill,
            orderIndex: section.orderIndex,
            instructions: section.instructions,
            audioUrl: section.audioUrl,
            durationMins: section.durationMins,
            questionCount: section.questionCount,
          },
        });

        // Clone passages
        if (section.passages?.length) {
          await tx.passage.createMany({
            data: section.passages.map((p) => ({
              sectionId: newSection.id,
              title: p.title,
              contentHtml: p.contentHtml,
              orderIndex: p.orderIndex,
            })),
          });
        }

        // Clone groups → questions
        for (const group of section.questionGroups) {
          const newGroup = await tx.questionGroup.create({
            data: {
              sectionId: newSection.id,
              questionType: group.questionType,
              orderIndex: group.orderIndex,
              instructions: group.instructions,
              matchingOptions: group.matchingOptions ?? Prisma.DbNull,
              audioUrl: group.audioUrl,
              imageUrl: group.imageUrl,
            },
          });

          if (group.questions.length > 0) {
            await tx.question.createMany({
              data: group.questions.map((q) => ({
                groupId: newGroup.id,
                questionNumber: q.questionNumber,
                orderIndex: q.orderIndex,
                stem: q.stem,
                options: q.options ?? Prisma.DbNull,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                imageUrl: q.imageUrl,
                audioUrl: q.audioUrl,
              })),
            });
          }
        }
      }

      return test;
    });
  }

  async recount(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: { questionGroups: { include: { questions: { select: { id: true } } } } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const sectionCount = test.sections.length;
    let questionCount = 0;

    for (const section of test.sections) {
      const qc = section.questionGroups.reduce((s, g) => s + g.questions.length, 0);
      questionCount += qc;
      await this.prisma.testSection.update({
        where: { id: section.id },
        data: { questionCount: qc },
      });
    }

    await this.prisma.test.update({
      where: { id },
      data: { sectionCount, questionCount },
    });

    return { sectionCount, questionCount };
  }

  async togglePublish(id: string) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Test not found');

    return this.prisma.test.update({
      where: { id },
      data: { isPublished: !test.isPublished },
    });
  }

  async delete(id: string) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Test not found');

    await this.prisma.$transaction(async (tx) => {
      // Delete user answers first (referenced by both attempts and questions)
      await tx.userAnswer.deleteMany({
        where: { attempt: { testId: id } },
      });
      // Delete attempt sections and attempts
      await tx.attemptSection.deleteMany({
        where: { attempt: { testId: id } },
      });
      await tx.userAttempt.deleteMany({ where: { testId: id } });
      // Now safe to delete the test (cascades to sections/groups/questions/passages)
      await tx.test.delete({ where: { id } });
    });

    return { deleted: true };
  }

  async createFromTemplate(dto: CreateFromTemplateDto) {
    const template = this.getTemplate(dto.examType, dto.skill);

    const test = await this.prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          title: template.title,
          examType: dto.examType,
          durationMins: template.durationMins,
          description: template.description,
          isPublished: false,
          sectionCount: template.sections.length,
        },
      });

      for (let i = 0; i < template.sections.length; i++) {
        const s = template.sections[i];
        await tx.testSection.create({
          data: {
            testId: test.id,
            title: s.title,
            skill: s.skill,
            orderIndex: i,
            instructions: s.instructions,
          },
        });
      }

      return test;
    });

    return this.findById(test.id);
  }

  async validate(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            passages: true,
            questionGroups: {
              include: { questions: { select: { id: true, correctAnswer: true } } },
            },
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const warnings: string[] = [];
    const totalQuestions = test.sections.reduce(
      (sum, s) => sum + s.questionGroups.reduce((gs, g) => gs + g.questions.length, 0),
      0,
    );

    // Check missing correct answers
    for (const section of test.sections) {
      for (const group of section.questionGroups) {
        for (const q of group.questions) {
          if (!q.correctAnswer || q.correctAnswer.trim() === '') {
            warnings.push(`Question in "${section.title}" is missing a correct answer`);
          }
        }
      }
    }

    // Exam-specific validation
    if (test.examType === 'IELTS_ACADEMIC' || test.examType === 'IELTS_GENERAL') {
      const listeningSkill = test.sections.filter((s) => s.skill === 'LISTENING');
      const readingSkill = test.sections.filter((s) => s.skill === 'READING');

      if (listeningSkill.length > 0) {
        if (listeningSkill.length !== 4) {
          warnings.push(`IELTS Listening should have 4 sections (has ${listeningSkill.length})`);
        }
        const lQ = listeningSkill.reduce(
          (sum, s) => sum + s.questionGroups.reduce((gs, g) => gs + g.questions.length, 0), 0,
        );
        if (lQ !== 40) warnings.push(`IELTS Listening should have 40 questions (has ${lQ})`);
        for (const s of listeningSkill) {
          if (!s.audioUrl) warnings.push(`"${s.title}" has no audio file`);
        }
      }

      if (readingSkill.length > 0) {
        if (readingSkill.length !== 3) {
          warnings.push(`IELTS Reading should have 3 passages (has ${readingSkill.length})`);
        }
        const rQ = readingSkill.reduce(
          (sum, s) => sum + s.questionGroups.reduce((gs, g) => gs + g.questions.length, 0), 0,
        );
        if (rQ !== 40) warnings.push(`IELTS Reading should have 40 questions (has ${rQ})`);
        for (const s of readingSkill) {
          if (s.passages.length === 0) warnings.push(`"${s.title}" has no passage text`);
        }
      }
    }

    if (test.examType === 'TOEIC_LR') {
      if (test.sections.length !== 7) {
        warnings.push(`TOEIC LR should have 7 parts (has ${test.sections.length})`);
      }
      if (totalQuestions !== 200) {
        warnings.push(`TOEIC LR should have 200 questions (has ${totalQuestions})`);
      }
    }

    if (test.examType === 'TOEIC_SW') {
      if (totalQuestions !== 19) {
        warnings.push(`TOEIC SW should have 19 questions (has ${totalQuestions})`);
      }
    }

    return {
      valid: warnings.length === 0,
      totalQuestions,
      sectionCount: test.sections.length,
      warnings,
    };
  }

  async addMissingSections(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: { sections: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!test) throw new NotFoundException('Test not found');

    // For IELTS, infer skill from existing sections
    let skill: string | undefined;
    if (test.examType === 'IELTS_ACADEMIC' || test.examType === 'IELTS_GENERAL') {
      const skills = [...new Set(test.sections.map((s) => s.skill))];
      skill = skills.length === 1 ? skills[0] : undefined;
    }

    const template = this.getTemplate(test.examType, skill);
    if (!template || template.sections.length === 0) {
      return { added: 0, sections: [] };
    }

    const existingTitles = new Set(test.sections.map((s) => s.title));
    const missingSections = template.sections.filter(
      (ts) => !existingTitles.has(ts.title),
    );

    if (missingSections.length === 0) {
      return { added: 0, sections: [] };
    }

    let maxOrder = test.sections.length > 0
      ? Math.max(...test.sections.map((s) => s.orderIndex))
      : -1;

    // For TOEIC/IELTS, insert in template order — find correct position
    const templateOrder = template.sections.map((s) => s.title);
    const allSections = [...test.sections.map((s) => ({ title: s.title, existing: true }))];

    // Build the full ordered list based on template
    const created: any[] = [];
    for (const ms of missingSections) {
      maxOrder++;
      const section = await this.prisma.testSection.create({
        data: {
          testId: id,
          title: ms.title,
          skill: ms.skill,
          orderIndex: maxOrder,
          instructions: ms.instructions,
        },
        include: { passages: true, questionGroups: { include: { questions: true } } },
      });
      created.push(section);
    }

    // Reorder all sections according to template order
    const allSectionsNow = await this.prisma.testSection.findMany({
      where: { testId: id },
      orderBy: { orderIndex: 'asc' },
    });

    const sorted = allSectionsNow.sort((a, b) => {
      const aIdx = templateOrder.indexOf(a.title);
      const bIdx = templateOrder.indexOf(b.title);
      // If not in template, keep at end
      const aPos = aIdx >= 0 ? aIdx : 999;
      const bPos = bIdx >= 0 ? bIdx : 999;
      return aPos - bPos;
    });

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].orderIndex !== i) {
        await this.prisma.testSection.update({
          where: { id: sorted[i].id },
          data: { orderIndex: i },
        });
      }
    }

    return { added: created.length, sections: created };
  }

  // ── Unified sync: smart create/update/delete in one transaction ──

  async syncTest(id: string, dto: SyncTestDto) {
    const existing = await this.prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            passages: true,
            questionGroups: {
              include: { questions: true },
            },
          },
        },
        tags: true,
      },
    });
    if (!existing) throw new NotFoundException('Test not found');

    await this.prisma.$transaction(async (tx) => {
      // 1. Update test metadata
      await tx.test.update({
        where: { id },
        data: {
          title: dto.title,
          examType: dto.examType,
          durationMins: dto.durationMins,
          description: dto.description ?? null,
        },
      });

      // 2. Sync tags
      await tx.testTag.deleteMany({ where: { testId: id } });
      if (dto.tagIds?.length) {
        await tx.testTag.createMany({
          data: dto.tagIds.map((tagId) => ({ testId: id, tagId })),
        });
      }

      // 3. Sync sections — determine deletes, updates, creates
      const existingSectionIds = new Set(existing.sections.map((s) => s.id));
      const incomingSectionIds = new Set(
        dto.sections.filter((s) => s.id).map((s) => s.id!),
      );

      // Delete sections not in incoming (cascade deletes passages/groups/questions)
      const sectionIdsToDelete = [...existingSectionIds].filter(
        (sid) => !incomingSectionIds.has(sid),
      );
      if (sectionIdsToDelete.length > 0) {
        await tx.testSection.deleteMany({
          where: { id: { in: sectionIdsToDelete } },
        });
      }

      let totalQuestions = 0;

      // Process each incoming section
      for (const sectionDto of dto.sections) {
        let sectionId: string;
        let sectionQuestionCount = 0;

        if (sectionDto.id && existingSectionIds.has(sectionDto.id)) {
          // UPDATE existing section
          sectionId = sectionDto.id;
          await tx.testSection.update({
            where: { id: sectionId },
            data: {
              title: sectionDto.title,
              skill: sectionDto.skill,
              orderIndex: sectionDto.orderIndex,
              instructions: sectionDto.instructions ?? null,
              audioUrl: sectionDto.audioUrl ?? null,
              durationMins: sectionDto.durationMins ?? null,
            },
          });
        } else {
          // CREATE new section
          const created = await tx.testSection.create({
            data: {
              testId: id,
              title: sectionDto.title,
              skill: sectionDto.skill,
              orderIndex: sectionDto.orderIndex,
              instructions: sectionDto.instructions,
              audioUrl: sectionDto.audioUrl,
              durationMins: sectionDto.durationMins,
            },
          });
          sectionId = created.id;
        }

        // 4. Sync passages within this section
        const existingSection = existing.sections.find(
          (s) => s.id === sectionDto.id,
        );
        const existingPassages = existingSection?.passages ?? [];
        const existingPassageIds = new Set(existingPassages.map((p) => p.id));
        const incomingPassages = sectionDto.passages ?? [];
        const incomingPassageIds = new Set(
          incomingPassages.filter((p) => p.id).map((p) => p.id!),
        );

        // Delete removed passages
        const passageIdsToDelete = [...existingPassageIds].filter(
          (pid) => !incomingPassageIds.has(pid),
        );
        if (passageIdsToDelete.length > 0) {
          await tx.passage.deleteMany({
            where: { id: { in: passageIdsToDelete } },
          });
        }

        // Map _tempId → real passage id (for new passages referenced by groups)
        const tempPassageIdMap = new Map<string, string>();

        for (const passageDto of incomingPassages) {
          if (passageDto.id && existingPassageIds.has(passageDto.id)) {
            // UPDATE existing passage
            await tx.passage.update({
              where: { id: passageDto.id },
              data: {
                title: passageDto.title ?? null,
                contentHtml: passageDto.contentHtml,
                orderIndex: passageDto.orderIndex,
              },
            });
            // Map _tempId if provided (for consistency)
            if (passageDto._tempId) {
              tempPassageIdMap.set(passageDto._tempId, passageDto.id);
            }
          } else {
            // CREATE new passage
            const created = await tx.passage.create({
              data: {
                sectionId,
                title: passageDto.title,
                contentHtml: passageDto.contentHtml,
                orderIndex: passageDto.orderIndex,
              },
            });
            if (passageDto._tempId) {
              tempPassageIdMap.set(passageDto._tempId, created.id);
            }
          }
        }

        // 5. Sync question groups within this section
        const existingGroups = existingSection?.questionGroups ?? [];
        const existingGroupIds = new Set(existingGroups.map((g) => g.id));
        const incomingGroupIds = new Set(
          sectionDto.questionGroups.filter((g) => g.id).map((g) => g.id!),
        );

        // Delete removed groups (cascade deletes questions)
        const groupIdsToDelete = [...existingGroupIds].filter(
          (gid) => !incomingGroupIds.has(gid),
        );
        if (groupIdsToDelete.length > 0) {
          await tx.questionGroup.deleteMany({
            where: { id: { in: groupIdsToDelete } },
          });
        }

        for (const groupDto of sectionDto.questionGroups) {
          let groupId: string;

          // Resolve passageId: could be a real id, or a _tempPassageId
          let resolvedPassageId: string | null = groupDto.passageId ?? null;
          if (!resolvedPassageId && groupDto._tempPassageId) {
            resolvedPassageId =
              tempPassageIdMap.get(groupDto._tempPassageId) ?? null;
          }

          if (groupDto.id && existingGroupIds.has(groupDto.id)) {
            // UPDATE existing group
            groupId = groupDto.id;
            await tx.questionGroup.update({
              where: { id: groupId },
              data: {
                questionType: groupDto.questionType,
                orderIndex: groupDto.orderIndex,
                passageId: resolvedPassageId,
                instructions: groupDto.instructions ?? null,
                matchingOptions: groupDto.matchingOptions ?? Prisma.DbNull,
                audioUrl: groupDto.audioUrl ?? null,
                imageUrl: groupDto.imageUrl ?? null,
              },
            });
          } else {
            // CREATE new group
            const created = await tx.questionGroup.create({
              data: {
                sectionId,
                questionType: groupDto.questionType,
                orderIndex: groupDto.orderIndex,
                passageId: resolvedPassageId,
                instructions: groupDto.instructions,
                matchingOptions: groupDto.matchingOptions ?? Prisma.DbNull,
                audioUrl: groupDto.audioUrl,
                imageUrl: groupDto.imageUrl,
              },
            });
            groupId = created.id;
          }

          // 6. Sync questions within this group
          const existingGroup = existingGroups.find(
            (g) => g.id === groupDto.id,
          );
          const existingQuestions = existingGroup?.questions ?? [];
          const existingQuestionIds = new Set(
            existingQuestions.map((q) => q.id),
          );
          const incomingQuestionIds = new Set(
            groupDto.questions.filter((q) => q.id).map((q) => q.id!),
          );

          // Delete removed questions
          const questionIdsToDelete = [...existingQuestionIds].filter(
            (qid) => !incomingQuestionIds.has(qid),
          );
          if (questionIdsToDelete.length > 0) {
            await tx.question.deleteMany({
              where: { id: { in: questionIdsToDelete } },
            });
          }

          // Update existing questions
          for (const qDto of groupDto.questions) {
            if (qDto.id && existingQuestionIds.has(qDto.id)) {
              await tx.question.update({
                where: { id: qDto.id },
                data: {
                  questionNumber: qDto.questionNumber,
                  orderIndex: qDto.orderIndex,
                  stem: qDto.stem ?? null,
                  options: qDto.options ?? Prisma.DbNull,
                  correctAnswer: qDto.correctAnswer,
                  explanation: qDto.explanation ?? null,
                  imageUrl: qDto.imageUrl ?? null,
                  audioUrl: qDto.audioUrl ?? null,
                },
              });
            }
          }

          // Batch create new questions
          const newQuestions = groupDto.questions.filter((q) => !q.id);
          if (newQuestions.length > 0) {
            await tx.question.createMany({
              data: newQuestions.map((q) => ({
                groupId,
                questionNumber: q.questionNumber,
                orderIndex: q.orderIndex,
                stem: q.stem,
                options: q.options ?? Prisma.DbNull,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                imageUrl: q.imageUrl,
                audioUrl: q.audioUrl,
              })),
            });
          }

          sectionQuestionCount += groupDto.questions.length;
        }

        // Update section question count
        await tx.testSection.update({
          where: { id: sectionId },
          data: { questionCount: sectionQuestionCount },
        });

        totalQuestions += sectionQuestionCount;
      }

      // 7. Update test counts
      await tx.test.update({
        where: { id },
        data: {
          sectionCount: dto.sections.length,
          questionCount: totalQuestions,
        },
      });
    });

    return this.findById(id);
  }

  private getTemplate(examType: ExamType, skill?: string) {
    if (examType === 'IELTS_ACADEMIC' || examType === 'IELTS_GENERAL') {
      const label = examType === 'IELTS_ACADEMIC' ? 'Academic' : 'General Training';

      if (skill === 'LISTENING') {
        return {
          title: `IELTS ${label} Listening Test`,
          durationMins: 40,
          description: `IELTS ${label} Listening — 4 recordings, 40 questions`,
          sections: [
            { title: 'Section 1: Social Conversation', skill: 'LISTENING' as const, instructions: 'Questions 1-10. Listen to a conversation and answer the questions.' },
            { title: 'Section 2: Social Monologue', skill: 'LISTENING' as const, instructions: 'Questions 11-20. Listen to a monologue and answer the questions.' },
            { title: 'Section 3: Academic Discussion', skill: 'LISTENING' as const, instructions: 'Questions 21-30. Listen to a discussion and answer the questions.' },
            { title: 'Section 4: Academic Lecture', skill: 'LISTENING' as const, instructions: 'Questions 31-40. Listen to a lecture and answer the questions.' },
          ],
        };
      }

      if (skill === 'READING') {
        return {
          title: `IELTS ${label} Reading Test`,
          durationMins: 60,
          description: `IELTS ${label} Reading — 3 passages, 40 questions`,
          sections: [
            { title: 'Passage 1', skill: 'READING' as const, instructions: 'Questions 1-13. Read the passage and answer the questions.' },
            { title: 'Passage 2', skill: 'READING' as const, instructions: 'Questions 14-26. Read the passage and answer the questions.' },
            { title: 'Passage 3', skill: 'READING' as const, instructions: 'Questions 27-40. Read the passage and answer the questions.' },
          ],
        };
      }

      if (skill === 'WRITING') {
        return {
          title: `IELTS ${label} Writing Test`,
          durationMins: 60,
          description: `IELTS ${label} Writing — 2 tasks`,
          sections: [
            { title: 'Task 1', skill: 'WRITING' as const, instructions: examType === 'IELTS_ACADEMIC' ? 'Summarise the information by selecting and reporting the main features.' : 'Write a letter.' },
            { title: 'Task 2', skill: 'WRITING' as const, instructions: 'Write an essay in response to the given topic.' },
          ],
        };
      }

      if (skill === 'SPEAKING') {
        return {
          title: `IELTS ${label} Speaking Test`,
          durationMins: 15,
          description: `IELTS ${label} Speaking — 3 parts`,
          sections: [
            { title: 'Part 1: Introduction & Interview', skill: 'SPEAKING' as const, instructions: 'Answer questions about familiar topics.' },
            { title: 'Part 2: Long Turn', skill: 'SPEAKING' as const, instructions: 'Speak about a given topic for 1-2 minutes.' },
            { title: 'Part 3: Discussion', skill: 'SPEAKING' as const, instructions: 'Answer discussion questions related to the Part 2 topic.' },
          ],
        };
      }
    }

    if (examType === 'TOEIC_LR') {
      return {
        title: 'TOEIC Listening & Reading Test',
        durationMins: 120,
        description: 'TOEIC LR — 7 parts, 200 questions',
        sections: [
          { title: 'Part 1: Photographs', skill: 'LISTENING' as const, instructions: 'Select the statement that best describes the photograph.' },
          { title: 'Part 2: Question-Response', skill: 'LISTENING' as const, instructions: 'Select the best response to the question or statement.' },
          { title: 'Part 3: Conversations', skill: 'LISTENING' as const, instructions: 'Listen to conversations and answer the questions.' },
          { title: 'Part 4: Talks', skill: 'LISTENING' as const, instructions: 'Listen to talks and answer the questions.' },
          { title: 'Part 5: Incomplete Sentences', skill: 'READING' as const, instructions: 'Choose the best word or phrase to complete each sentence.' },
          { title: 'Part 6: Text Completion', skill: 'READING' as const, instructions: 'Choose the best word, phrase or sentence to complete each text.' },
          { title: 'Part 7: Reading Comprehension', skill: 'READING' as const, instructions: 'Read the passages and answer the questions.' },
        ],
      };
    }

    if (examType === 'TOEIC_SW') {
      return {
        title: 'TOEIC Speaking & Writing Test',
        durationMins: 80,
        description: 'TOEIC SW — Speaking (20 min) + Writing (60 min)',
        sections: [
          { title: 'Speaking: Read Aloud', skill: 'SPEAKING' as const, instructions: 'Read the text aloud.' },
          { title: 'Speaking: Describe a Picture', skill: 'SPEAKING' as const, instructions: 'Describe the picture in as much detail as possible.' },
          { title: 'Speaking: Respond to Questions', skill: 'SPEAKING' as const, instructions: 'Answer the questions.' },
          { title: 'Speaking: Propose a Solution', skill: 'SPEAKING' as const, instructions: 'Propose a solution to the problem described.' },
          { title: 'Speaking: Express an Opinion', skill: 'SPEAKING' as const, instructions: 'Express and support your opinion on the given topic.' },
          { title: 'Writing: Write Sentences', skill: 'WRITING' as const, instructions: 'Write a sentence based on the picture.' },
          { title: 'Writing: Respond to Request', skill: 'WRITING' as const, instructions: 'Respond to the written request.' },
          { title: 'Writing: Write an Opinion Essay', skill: 'WRITING' as const, instructions: 'Write an essay expressing your opinion on the given topic.' },
        ],
      };
    }

    // Fallback
    return {
      title: 'New Test',
      durationMins: 60,
      description: '',
      sections: [],
    };
  }
}
