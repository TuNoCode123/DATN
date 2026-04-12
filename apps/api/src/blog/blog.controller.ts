import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ListBlogPostsDto } from './dto/list-blog-posts.dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly service: BlogService) {}

  @Get()
  list(@Query() query: ListBlogPostsDto) {
    return this.service.listPublic(query);
  }

  @Get('sitemap')
  sitemap() {
    return this.service.listSlugsForSitemap();
  }

  @Get(':slug')
  getOne(@Param('slug') slug: string) {
    return this.service.getPublicBySlug(slug);
  }

  @Get(':slug/related')
  related(@Param('slug') slug: string) {
    return this.service.getRelated(slug);
  }

  @Post(':slug/view')
  view(@Param('slug') slug: string) {
    return this.service.incrementView(slug);
  }
}
