import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { BlogAdminController } from './blog-admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BlogController, BlogAdminController],
  providers: [BlogService],
})
export class BlogModule {}
