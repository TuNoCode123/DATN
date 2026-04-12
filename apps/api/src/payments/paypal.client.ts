import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export interface PayPalCreateOrderInput {
  referenceId: string;
  amountUsd: string;
  description: string;
  itemName: string;
  itemDescription?: string;
  brandName?: string;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  [key: string]: unknown;
}

export interface PayPalCapture {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }>;
    };
  }>;
  [key: string]: unknown;
}

@Injectable()
export class PayPalClient {
  private readonly logger = new Logger(PayPalClient.name);
  private cachedToken: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('PAYPAL_BASE_URL') ||
      'https://api-m.sandbox.paypal.com'
    );
  }

  private get clientId(): string {
    const id = this.config.get<string>('PAYPAL_CLIENT_ID');
    if (!id) throw new InternalServerErrorException('PAYPAL_CLIENT_ID not set');
    return id;
  }

  private get clientSecret(): string {
    const s = this.config.get<string>('PAYPAL_CLIENT_SECRET');
    if (!s) throw new InternalServerErrorException('PAYPAL_CLIENT_SECRET not set');
    return s;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`PayPal token error: ${res.status} ${text}`);
      throw new InternalServerErrorException('PayPal auth failed');
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return data.access_token;
  }

  async createOrder(input: PayPalCreateOrderInput): Promise<PayPalOrder> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.referenceId,
            description: input.description.slice(0, 127),
            amount: {
              currency_code: 'USD',
              value: input.amountUsd,
              breakdown: {
                item_total: { currency_code: 'USD', value: input.amountUsd },
              },
            },
            items: [
              {
                name: input.itemName.slice(0, 127),
                description: (input.itemDescription ?? input.description).slice(0, 127),
                quantity: '1',
                category: 'DIGITAL_GOODS',
                unit_amount: { currency_code: 'USD', value: input.amountUsd },
              },
            ],
          },
        ],
        application_context: {
          brand_name: input.brandName ?? 'IELTS AI Platform',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
    });

    const data = (await res.json()) as PayPalOrder & { message?: string };
    if (!res.ok) {
      this.logger.error(`PayPal createOrder failed: ${res.status} ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(data.message || 'PayPal createOrder failed');
    }
    return data;
  }

  get webhookId(): string | null {
    return this.config.get<string>('PAYPAL_WEBHOOK_ID') || null;
  }

  async verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookEvent: unknown;
  }): Promise<boolean> {
    const webhookId = this.webhookId;
    if (!webhookId) {
      this.logger.warn('PAYPAL_WEBHOOK_ID not set — rejecting webhook');
      return false;
    }
    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: params.authAlgo,
          cert_url: params.certUrl,
          transmission_id: params.transmissionId,
          transmission_sig: params.transmissionSig,
          transmission_time: params.transmissionTime,
          webhook_id: webhookId,
          webhook_event: params.webhookEvent,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`verifyWebhookSignature http ${res.status}: ${text}`);
      return false;
    }
    const data = (await res.json()) as { verification_status?: string };
    return data.verification_status === 'SUCCESS';
  }

  async captureOrder(orderId: string): Promise<PayPalCapture> {
    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const data = (await res.json()) as PayPalCapture & { message?: string };
    if (!res.ok) {
      this.logger.error(`PayPal captureOrder failed: ${res.status} ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(data.message || 'PayPal captureOrder failed');
    }
    return data;
  }
}
