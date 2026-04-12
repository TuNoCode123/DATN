import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { ListBlogPostsDto } from './dto/list-blog-posts.dto';

@Controller('admin/blog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BlogAdminController {
  constructor(private readonly service: BlogService) {}

  @Get()
  list(@Query() query: ListBlogPostsDto) {
    return this.service.listAdmin(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.getAdminById(id);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBlogPostDto,
  ) {
    return this.service.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/publish')
  togglePublish(@Param('id') id: string) {
    return this.service.togglePublish(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
