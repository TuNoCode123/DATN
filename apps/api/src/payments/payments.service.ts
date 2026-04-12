import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CreditReason, PaymentOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { PayPalClient, PayPalCapture } from './paypal.client';

interface PaypalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    amount?: { value?: string; currency_code?: string };
    links?: Array<{ rel?: string; href?: string }>;
    supplementary_data?: {
      related_ids?: { order_id?: string; capture_id?: string };
    };
  };
}

// Refund webhooks don't always carry `related_ids.capture_id`, but the
// `up` link on the refund resource always points to the parent capture:
//   https://api-m.paypal.com/v2/payments/captures/<capture_id>
function extractCaptureIdFromLinks(
  links: Array<{ rel?: string; href?: string }> | undefined,
): string | null {
  const up = links?.find((l) => l.rel === 'up')?.href;
  if (!up) return null;
  const match = up.match(/\/captures\/([^/?#]+)/);
  return match?.[1] ?? null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PayPalClient,
    private readonly credits: CreditsService,
  ) {}

  listPackages() {
    return this.prisma.creditPackage.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        priceUsd: true,
        baseCredits: true,
        bonusCredits: true,
        sortOrder: true,
      },
    });
  }

  async createOrder(userId: string, packageId: string) {
    const pkg = await this.prisma.creditPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg || !pkg.active) {
      throw new NotFoundException('Credit package not found');
    }

    const priceStr = pkg.priceUsd.toFixed(2);
    const totalCredits = pkg.baseCredits + pkg.bonusCredits;
    const description = `${pkg.name} — ${totalCredits} credits`;
    const itemDescription = pkg.bonusCredits > 0
      ? `${pkg.baseCredits} credits + ${pkg.bonusCredits} bonus`
      : `${pkg.baseCredits} credits`;

    const paypalOrder = await this.paypal.createOrder({
      referenceId: `${userId.slice(0, 8)}-${packageId}`,
      amountUsd: priceStr,
      description,
      itemName: pkg.name,
      itemDescription,
    });

    const order = await this.prisma.paymentOrder.create({
      data: {
        userId,
        packageId: pkg.id,
        provider: 'PAYPAL',
        providerOrderId: paypalOrder.id,
        status: PaymentOrderStatus.CREATED,
        amountUsd: pkg.priceUsd,
        currency: 'USD',
        creditsGranted: 0,
        rawCreate: paypalOrder as object,
      },
    });

    const approveLink = paypalOrder.links?.find((l) => l.rel === 'approve')?.href;

    return {
      orderId: order.id,
      providerOrderId: paypalOrder.id,
      approveUrl: approveLink,
      amountUsd: priceStr,
      package: {
        id: pkg.id,
        name: pkg.name,
        credits: pkg.baseCredits + pkg.bonusCredits,
      },
    };
  }

  async captureOrder(userId: string, providerOrderId: string) {
    const existing = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId },
      include: { package: true },
    });
    if (!existing) throw new NotFoundException('Order not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not your order');

    // Idempotent: already captured → return as-is
    if (existing.status === PaymentOrderStatus.CAPTURED) {
      const balance = await this.credits.getBalance(userId);
      return {
        status: existing.status,
        creditsGranted: existing.creditsGranted,
        balance,
        alreadyCaptured: true,
      };
    }

    if (existing.status === PaymentOrderStatus.FAILED) {
      throw new BadRequestException('Order previously failed');
    }

    let capture: PayPalCapture;
    try {
      capture = await this.paypal.captureOrder(providerOrderId);
    } catch (err) {
      await this.prisma.paymentOrder.update({
        where: { id: existing.id },
        data: {
          status: PaymentOrderStatus.FAILED,
          rawCapture: { error: String(err) } as object,
        },
      });
      throw err;
    }

    const captureUnit = capture.purchase_units?.[0]?.payments?.captures?.[0];
    const captureAmount = captureUnit?.amount?.value;
    const captureStatus = captureUnit?.status;
    const captureId = captureUnit?.id ?? null;
    const expectedAmount = existing.amountUsd.toFixed(2);

    if (
      capture.status !== 'COMPLETED' ||
      captureStatus !== 'COMPLETED' ||
      captureAmount !== expectedAmount
    ) {
      await this.prisma.paymentOrder.update({
        where: { id: existing.id },
        data: {
          status: PaymentOrderStatus.FAILED,
          rawCapture: capture as object,
        },
      });
      this.logger.warn(
        `Capture mismatch for order ${providerOrderId}: status=${capture.status}/${captureStatus} amount=${captureAmount} expected=${expectedAmount}`,
      );
      throw new BadRequestException('Payment capture failed verification');
    }

    const credits = existing.package.baseCredits + existing.package.bonusCredits;

    // Persist captured order + grant credits atomically.
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentOrder.update({
        where: { id: existing.id },
        data: {
          status: PaymentOrderStatus.CAPTURED,
          capturedAt: new Date(),
          creditsGranted: credits,
          providerCaptureId: captureId,
          rawCapture: capture as object,
        },
      });
    });

    const newBalance = await this.credits.grant(
      userId,
      credits,
      CreditReason.PAYPAL_PURCHASE,
      existing.id,
      { providerOrderId, packageId: existing.packageId },
    );

    this.logger.log(
      `Granted ${credits} credits to ${userId} for order ${existing.id} (paypal ${providerOrderId})`,
    );

    return {
      status: PaymentOrderStatus.CAPTURED,
      creditsGranted: credits,
      balance: newBalance,
      alreadyCaptured: false,
    };
  }

  async handlePaypalWebhook(input: {
    rawBody: string;
    headers: {
      authAlgo: string;
      certUrl: string;
      transmissionId: string;
      transmissionSig: string;
      transmissionTime: string;
    };
  }): Promise<{ received: boolean; duplicate?: boolean; ignored?: boolean }> {
    let event: PaypalWebhookEvent;
    try {
      event = JSON.parse(input.rawBody);
    } catch {
      this.logger.warn('PayPal webhook: invalid JSON body');
      throw new BadRequestException('Invalid JSON');
    }

    if (
      !input.headers.authAlgo ||
      !input.headers.certUrl ||
      !input.headers.transmissionId ||
      !input.headers.transmissionSig ||
      !input.headers.transmissionTime
    ) {
      throw new BadRequestException('Missing PayPal signature headers');
    }

    const verified = await this.paypal.verifyWebhookSignature({
      authAlgo: input.headers.authAlgo,
      certUrl: input.headers.certUrl,
      transmissionId: input.headers.transmissionId,
      transmissionSig: input.headers.transmissionSig,
      transmissionTime: input.headers.transmissionTime,
      webhookEvent: event,
    });
    if (!verified) {
      this.logger.warn(`PayPal webhook signature verification failed (id=${event.id})`);
      throw new BadRequestException('Webhook signature invalid');
    }

    if (!event.id || !event.event_type) {
      throw new BadRequestException('Malformed webhook event');
    }

    const resourceId = event.resource?.id ?? null;

    // Idempotency: skip if we've already processed this event.
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          eventId: event.id,
          eventType: event.event_type,
          resourceId,
          payload: event as object,
        },
      });
    } catch (err) {
      // Unique violation — duplicate delivery
      this.logger.log(`PayPal webhook duplicate event ${event.id} — skipping`);
      return { received: true, duplicate: true };
    }

    try {
      switch (event.event_type) {
        case 'PAYMENT.CAPTURE.REFUNDED':
        case 'PAYMENT.CAPTURE.REVERSED':
          await this.handleRefundOrReversal(event);
          break;
        case 'PAYMENT.CAPTURE.COMPLETED':
        case 'PAYMENT.CAPTURE.DENIED':
        case 'CHECKOUT.ORDER.APPROVED':
          // Synchronous capture flow already handles these; record-only.
          break;
        default:
          this.logger.log(`PayPal webhook unhandled event_type=${event.event_type}`);
          return { received: true, ignored: true };
      }

      await this.prisma.paymentWebhookEvent.update({
        where: { eventId: event.id },
        data: { processedAt: new Date() },
      });
      return { received: true };
    } catch (err) {
      this.logger.error(
        `PayPal webhook handler failed for event ${event.id} (${event.event_type}): ${String(err)}`,
      );
      throw err;
    }
  }

  private async handleRefundOrReversal(event: PaypalWebhookEvent): Promise<void> {
    const relatedIds = event.resource?.supplementary_data?.related_ids ?? {};
    const captureIdFromRelated = relatedIds.capture_id;
    const captureIdFromLinks = extractCaptureIdFromLinks(event.resource?.links);
    const paypalCaptureId = captureIdFromRelated ?? captureIdFromLinks ?? null;
    const paypalOrderId = relatedIds.order_id ?? null;

    let order = paypalCaptureId
      ? await this.prisma.paymentOrder.findUnique({
          where: { providerCaptureId: paypalCaptureId },
        })
      : null;

    if (!order && paypalOrderId) {
      order = await this.prisma.paymentOrder.findUnique({
        where: { providerOrderId: paypalOrderId },
      });
    }

    if (!order) {
      this.logger.warn(
        `Refund event ${event.id} (${event.event_type}): no local order match — ` +
          `capture_id=${paypalCaptureId ?? 'none'} order_id=${paypalOrderId ?? 'none'}`,
      );
      return;
    }

    if (order.status === PaymentOrderStatus.REFUNDED) {
      this.logger.log(`Order ${order.id} already fully REFUNDED — no-op`);
      return;
    }
    if (
      order.status !== PaymentOrderStatus.CAPTURED &&
      order.status !== PaymentOrderStatus.PARTIALLY_REFUNDED
    ) {
      this.logger.warn(
        `Refund for non-captured order ${order.id} (status=${order.status}) — marking REFUNDED without credit change`,
      );
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: PaymentOrderStatus.REFUNDED },
      });
      return;
    }

    // Refund amount comes on the refund resource itself; reversals carry it too.
    // Fall back to the full remaining amount if PayPal omits it (defensive).
    const orderTotal = Number(order.amountUsd);
    const alreadyRefunded = Number(order.refundedAmountUsd);
    const remainingAmount = Math.max(orderTotal - alreadyRefunded, 0);

    const refundValueRaw = event.resource?.amount?.value;
    const parsedRefund = refundValueRaw ? Number(refundValueRaw) : NaN;
    const refundAmount = Number.isFinite(parsedRefund) && parsedRefund > 0
      ? Math.min(parsedRefund, remainingAmount)
      : remainingAmount;

    if (refundAmount <= 0) {
      this.logger.warn(
        `Refund event ${event.id} for order ${order.id}: zero remaining refundable amount — marking REFUNDED`,
      );
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: PaymentOrderStatus.REFUNDED },
      });
      return;
    }

    const newRefundedAmount = alreadyRefunded + refundAmount;
    const isFullRefund = newRefundedAmount + 0.005 >= orderTotal;

    // Prorate credits. On the final refund, claw back the exact remainder so
    // rounding errors across multiple partials can't leave dust behind.
    const remainingCredits = order.creditsGranted - order.refundedCredits;
    let clawback: number;
    if (isFullRefund) {
      clawback = remainingCredits;
    } else if (orderTotal > 0) {
      clawback = Math.min(
        remainingCredits,
        Math.round((refundAmount / orderTotal) * order.creditsGranted),
      );
    } else {
      clawback = 0;
    }
    if (clawback < 0) clawback = 0;

    const nextStatus = isFullRefund
      ? PaymentOrderStatus.REFUNDED
      : PaymentOrderStatus.PARTIALLY_REFUNDED;

    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        refundedAmountUsd: newRefundedAmount.toFixed(2),
        refundedCredits: order.refundedCredits + clawback,
      },
    });

    if (clawback > 0) {
      try {
        await this.credits.deduct(
          order.userId,
          clawback,
          CreditReason.PAYPAL_REFUND,
          order.id,
          {
            providerOrderId: paypalOrderId,
            providerCaptureId: paypalCaptureId,
            eventId: event.id,
            eventType: event.event_type,
            refundAmountUsd: refundAmount.toFixed(2),
            partial: !isFullRefund,
          },
        );
      } catch (err) {
        // User may have already spent the credits — log and continue. The
        // order is already flipped so a reconciliation job can replay later.
        this.logger.error(
          `Clawback failed for user ${order.userId}, order ${order.id}: ${String(err)} — balance may now be inconsistent`,
        );
      }
    }

    this.logger.log(
      `Refund applied to order ${order.id}: -$${refundAmount.toFixed(2)} (${clawback} credits), status=${nextStatus}`,
    );
  }

  async listUserOrders(userId: string, limit = 20, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          package: {
            select: { id: true, name: true, baseCredits: true, bonusCredits: true },
          },
        },
      }),
      this.prisma.paymentOrder.count({ where: { userId } }),
    ]);
    return { items, total, limit, offset };
  }
}
