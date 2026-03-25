import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

import { AdminTagsController } from './admin-tags.controller';
import { AdminTagsService } from './admin-tags.service';

import { AdminTestsController } from './admin-tests.controller';
import { AdminTestsService } from './admin-tests.service';

import { AdminSectionsController } from './admin-sections.controller';
import { AdminSectionsService } from './admin-sections.service';

import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';

import { AdminQuestionsController } from './admin-questions.controller';
import { AdminQuestionsService } from './admin-questions.service';

import { AdminResultsController } from './admin-results.controller';
import { AdminResultsService } from './admin-results.service';

import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    AdminUsersController,
    AdminTagsController,
    AdminTestsController,
    AdminSectionsController,
    AdminGroupsController,
    AdminQuestionsController,
    AdminResultsController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminUsersService,
    AdminTagsService,
    AdminTestsService,
    AdminSectionsService,
    AdminGroupsService,
    AdminQuestionsService,
    AdminResultsService,
    AdminAnalyticsService,
  ],
})
export class AdminModule {}
