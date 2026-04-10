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
  Request,
} from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDeckDto } from './dto/create-deck.dto';
import { UpdateDeckDto } from './dto/update-deck.dto';
import { AddCardsDto, UpdateCardDto, ReorderCardsDto } from './dto/card.dto';
import {
  StartPracticeDto,
  StartTestDto,
  StartAiStudyDto,
  FlipResultDto,
  SubmitAnswerDto,
  SubmitTestDto,
  RateCardDto,
} from './dto/session.dto';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private flashcardsService: FlashcardsService) {}

  // ─── Deck CRUD ─────────────────────────────────────────

  @Post('decks')
  createDeck(@Request() req: any, @Body() dto: CreateDeckDto) {
    return this.flashcardsService.createDeck(req.user.id, dto);
  }

  @Get('decks')
  findDecks(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('visibility') visibility?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.flashcardsService.findDecks(req.user.id, {
      search,
      visibility,
      tags: tags ? tags.split(',') : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('decks/:id')
  findDeck(@Request() req: any, @Param('id') id: string) {
    return this.flashcardsService.findDeckById(id, req.user.id);
  }

  @Patch('decks/:id')
  updateDeck(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDeckDto,
  ) {
    return this.flashcardsService.updateDeck(id, req.user.id, dto);
  }

  @Delete('decks/:id')
  deleteDeck(@Request() req: any, @Param('id') id: string) {
    return this.flashcardsService.deleteDeck(id, req.user.id);
  }

  @Post('decks/:id/clone')
  cloneDeck(@Request() req: any, @Param('id') id: string) {
    return this.flashcardsService.cloneDeck(id, req.user.id);
  }

  // ─── Card CRUD ─────────────────────────────────────────

  @Post('decks/:deckId/cards')
  addCards(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Body() dto: AddCardsDto,
  ) {
    return this.flashcardsService.addCards(deckId, req.user.id, dto);
  }

  @Patch('decks/:deckId/cards/:cardId')
  updateCard(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.flashcardsService.updateCard(deckId, cardId, req.user.id, dto);
  }

  @Delete('decks/:deckId/cards/:cardId')
  deleteCard(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.flashcardsService.deleteCard(deckId, cardId, req.user.id);
  }

  @Post('decks/:deckId/cards/reorder')
  reorderCards(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Body() dto: ReorderCardsDto,
  ) {
    return this.flashcardsService.reorderCards(deckId, req.user.id, dto.cardIds);
  }

  // ─── Study Mode ────────────────────────────────────────

  @Post('decks/:deckId/study/start')
  startStudy(@Request() req: any, @Param('deckId') deckId: string) {
    return this.flashcardsService.startStudy(deckId, req.user.id);
  }

  @Post('sessions/:sessionId/flip')
  recordFlip(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: FlipResultDto,
  ) {
    return this.flashcardsService.recordFlip(sessionId, req.user.id, dto);
  }

  @Post('sessions/:sessionId/study/complete')
  completeStudy(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.flashcardsService.completeStudy(sessionId, req.user.id);
  }

  // ─── AI Study Mode ─────────────────────────────────────

  @Post('decks/:deckId/ai-study/start')
  startAiStudy(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Body() dto: StartAiStudyDto,
  ) {
    return this.flashcardsService.startAiStudy(deckId, req.user.id, dto);
  }

  // ─── Practice Mode ────────────────────────────────────

  @Post('decks/:deckId/practice/start')
  startPractice(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Body() dto: StartPracticeDto,
  ) {
    return this.flashcardsService.startPractice(deckId, req.user.id, dto);
  }

  @Post('sessions/:sessionId/answer')
  submitPracticeAnswer(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.flashcardsService.submitPracticeAnswer(
      sessionId,
      req.user.id,
      dto,
    );
  }

  @Post('sessions/:sessionId/practice/complete')
  completePractice(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.flashcardsService.completePractice(sessionId, req.user.id);
  }

  // ─── Test Mode ─────────────────────────────────────────

  @Post('decks/:deckId/test/start')
  startTest(
    @Request() req: any,
    @Param('deckId') deckId: string,
    @Body() dto: StartTestDto,
  ) {
    return this.flashcardsService.startTest(deckId, req.user.id, dto);
  }

  @Get('sessions/:sessionId/questions')
  getTestQuestions(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.flashcardsService.getTestQuestions(sessionId, req.user.id);
  }

  @Post('sessions/:sessionId/test/submit')
  submitTest(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitTestDto,
  ) {
    return this.flashcardsService.submitTest(sessionId, req.user.id, dto);
  }

  // ─── Review Mode ───────────────────────────────────────

  @Get('review/due')
  getDueCards(@Request() req: any, @Query('deckId') deckId?: string) {
    return this.flashcardsService.getDueCards(req.user.id, deckId);
  }

  @Post('review/start')
  startReview(@Request() req: any, @Body('deckId') deckId?: string, @Body('force') force?: boolean) {
    return this.flashcardsService.startReview(req.user.id, deckId, force);
  }

  @Post('review/:sessionId/rate')
  rateCard(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: RateCardDto,
  ) {
    return this.flashcardsService.rateCard(sessionId, req.user.id, dto);
  }

  @Get('review/stats')
  getReviewStats(@Request() req: any, @Query('deckId') deckId?: string) {
    return this.flashcardsService.getReviewStats(req.user.id, deckId);
  }
}
