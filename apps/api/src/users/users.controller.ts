import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser('id') userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    const { passwordHash, ...result } = user;
    return result;
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(@Query('q') query: string) {
    if (!query || query.length < 2) return [];
    return this.usersService.search(query);
  }
}
