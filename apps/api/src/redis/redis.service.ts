import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly redisUrl: string;

  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(this.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
  }

  getClient(): Redis {
    return this.client;
  }

  /** Connection options suitable for BullMQ or other libs that create their own connections. */
  getConnectionOptions(): { host: string; port: number; password?: string; db: number } {
    const opts = this.client.options;
    return {
      host: opts.host || 'localhost',
      port: opts.port || 6379,
      password: opts.password,
      db: opts.db || 0,
    };
  }

  /** Create a fresh duplicate ioredis client (for pub/sub adapters). */
  duplicate(): Redis {
    return this.client.duplicate();
  }

  // ── Key-Value ────────────────────────────────────
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  // ── JSON helpers ─────────────────────────────────
  async getJson<T>(key: string): Promise<T | null> {
    const val = await this.client.get(key);
    return val ? JSON.parse(val) : null;
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // ── Set (for room members) ───────────────────────
  async sadd(key: string, ...members: string[]): Promise<void> {
    await this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    await this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  // ── List helpers ─────────────────────────────────
  async lpush(key: string, ...values: string[]): Promise<void> {
    await this.client.lpush(key, ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(key, start, stop);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
