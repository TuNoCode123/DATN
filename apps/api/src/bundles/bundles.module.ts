import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BundlesController } from './bundles.controller';
import { BundlesService } from './bundles.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [BundlesController],
  providers: [BundlesService, OptionalJwtAuthGuard],
})
export class BundlesModule {}
