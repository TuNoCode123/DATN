import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Headers,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('paypal/webhook')
  @HttpCode(200)
  async paypalWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paypal-auth-algo') authAlgo: string,
    @Headers('paypal-cert-url') certUrl: string,
    @Headers('paypal-transmission-id') transmissionId: string,
    @Headers('paypal-transmission-sig') transmissionSig: string,
    @Headers('paypal-transmission-time') transmissionTime: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    return this.payments.handlePaypalWebhook({
      rawBody,
      headers: {
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
      },
    });
  }

  @Get('packages')
  @UseGuards(JwtAuthGuard)
  async listPackages() {
    const packages = await this.payments.listPackages();
    return { packages };
  }

  @Post('paypal/orders')
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.payments.createOrder(userId, dto.packageId);
  }

  @Post('paypal/orders/:providerOrderId/capture')
  @UseGuards(JwtAuthGuard)
  async captureOrder(
    @CurrentUser('id') userId: string,
    @Param('providerOrderId') providerOrderId: string,
  ) {
    return this.payments.captureOrder(userId, providerOrderId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async history(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.payments.listUserOrders(
      userId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
