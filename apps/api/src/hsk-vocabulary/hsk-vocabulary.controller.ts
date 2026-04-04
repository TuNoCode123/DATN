import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HskVocabularyService } from './hsk-vocabulary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// ── Public endpoints (learner) ──

@Controller('api/hsk-vocabulary')
export class HskVocabularyPublicController {
  constructor(private service: HskVocabularyService) {}

  @Get()
  findAll(
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      level: level ? parseInt(level) : undefined,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('search')
  search(@Query('q') query: string) {
    return this.service.search(query || '');
  }
}

// ── Admin endpoints ──

@Controller('api/admin/hsk-vocabulary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class HskVocabularyAdminController {
  constructor(private service: HskVocabularyService) {}

  @Get()
  findAll(
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      level: level ? parseInt(level) : undefined,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Post()
  create(
    @Body()
    body: {
      level: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      meaningEn: string;
      meaningVi?: string;
      partOfSpeech?: string;
    },
  ) {
    return this.service.create(body);
  }

  @Post('bulk')
  bulkCreate(@Body() body: { items: any[] }) {
    return this.service.bulkCreate(body.items);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
