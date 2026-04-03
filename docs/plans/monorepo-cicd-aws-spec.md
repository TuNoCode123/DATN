# IELTS AI Platform — Enterprise AWS Infrastructure Spec

## 1. High-Level Architecture Diagram

```
                            ┌─────────────────────────┐
                            │     Route 53 (DNS)       │
                            │  ielts-platform.com      │
                            └────────┬────────────────┘
                                     │
                            ┌────────▼────────────────┐
                            │     CloudFront CDN       │
                            │  Edge caching, WAF,      │
                            │  SSL termination          │
                            │                          │
                            │  Behaviors:              │
                            │  /api/*  → ALB origin    │
                            │  /*      → ALB origin    │
                            │  /assets → S3 origin     │
                            └────────┬────────────────┘
                                     │
  ┌──────────────────────────────────▼──────────────────────────────────────────┐
  │                            VPC  (10.0.0.0/16)                              │
  │                                                                            │
  │  ┌─── Public Subnets (10.0.1.0/24, 10.0.2.0/24) ── 2 AZs ─────────────┐  │
  │  │                                                                      │  │
  │  │  ┌────────────────────────────────────────────────────────────────┐   │  │
  │  │  │           Application Load Balancer (ALB)                     │   │  │
  │  │  │                                                                │   │  │
  │  │  │   Listener :443 (HTTPS — ACM cert)                            │   │  │
  │  │  │   ┌──────────────────┐  ┌──────────────────────────────────┐  │   │  │
  │  │  │   │ /api/*           │  │ /* (default)                     │  │   │  │
  │  │  │   │ → API Target Grp │  │ → Web Target Group               │  │   │  │
  │  │  │   └────────┬─────────┘  └────────┬─────────────────────────┘  │   │  │
  │  │  │            │                      │                            │   │  │
  │  │  │   /socket.io/*                                                 │   │  │
  │  │  │   → API Target Grp (WebSocket sticky)                         │   │  │
  │  │  └────────────┼──────────────────────┼────────────────────────────┘   │  │
  │  │               │                      │                                │  │
  │  │  ┌────────────┤    NAT Gateway ──────┤──── (for private subnet       │  │
  │  │  │            │    outbound traffic) │      internet access)         │  │
  │  └──┼────────────┼──────────────────────┼───────────────────────────────┘  │
  │     │            │                      │                                  │
  │  ┌──┼────────────▼──────────────────────▼── Private Subnets ────────────┐  │
  │  │  │         (10.0.10.0/24, 10.0.11.0/24) ── 2 AZs                    │  │
  │  │  │                                                                    │  │
  │  │  │  ┌─────────────────────────────────────────────────────────────┐   │  │
  │  │  │  │              ECS Cluster (EC2 Launch Type)                  │   │  │
  │  │  │  │              Auto Scaling Group: 1-3 t3.medium              │   │  │
  │  │  │  │                                                             │   │  │
  │  │  │  │  ┌─────────────────────┐  ┌─────────────────────────────┐  │   │  │
  │  │  │  │  │  ECS Service: API   │  │  ECS Service: Web           │  │   │  │
  │  │  │  │  │  (NestJS :4000)     │  │  (Next.js :3000)            │  │   │  │
  │  │  │  │  │  Desired: 1-2       │  │  Desired: 1-2               │  │   │  │
  │  │  │  │  │  CPU: 512 / Mem: 1G │  │  CPU: 512 / Mem: 1G        │  │   │  │
  │  │  │  │  └────┬──┬────────────┘  └─────────────────────────────┘  │   │  │
  │  │  │  │       │  │                                               │   │  │
  │  │  │  └───────┼──┼──────────────────────────────────────────────┘    │  │
  │  │  │          │  │ REDIS_URL (Socket.IO adapter + cache)             │  │
  │  │  │          │  │                                                   │  │
  │  │  │          │  └─────────────────────────────────────────────┐     │  │
  │  │  │          │ DATABASE_URL                                   │     │  │
  │  │  │  ┌───────▼───────────────────────────────────────────┐   │     │  │
  │  │  │  │  RDS PostgreSQL (db.t3.micro, single-AZ)          │   │     │  │
  │  │  │  │  :5432 — SG allows from ECS SG only               │   │     │  │
  │  │  │  │  Automated backups, encrypted, Perf Insights      │   │     │  │
  │  │  │  └───────────────────────────────────────────────────┘   │     │  │
  │  │  │                                                          │     │  │
  │  │  │  ┌───────────────────────────────────────────────────┐   │     │  │
  │  │  │  │  ElastiCache Redis (cache.t3.micro, single-node)◀─┘     │  │
  │  │  │  │  :6379 — SG allows from ECS SG only               │         │  │
  │  │  │  │                                                    │         │  │
  │  │  │  │  1. Socket.IO Redis Adapter (WS pub/sub fanout)   │         │  │
  │  │  │  │  2. User presence & online status (key-value)     │         │  │
  │  │  │  │  3. Chat room membership tracking                 │         │  │
  │  │  │  │  4. API response cache (optional)                 │         │  │
  │  │  │  └───────────────────────────────────────────────────┘         │  │
  │  │  │                                                                │  │
  │  └──┼────────────────────────────────────────────────────────────────┘  │
  │     │                                                                      │
  └─────┼──────────────────────────────────────────────────────────────────────┘
        │
  ┌─────▼──────────────────────────────────────────────────────────────────────┐
  │                        Async / Event-Driven Layer                          │
  │                                                                            │
  │  ┌──────────┐   ┌──────────────┐   ┌────────────────┐   ┌──────────────┐  │
  │  │   SNS    │──▶│   SQS        │──▶│   Lambda       │   │     SES      │  │
  │  │  Topics  │   │   Queues     │   │   Workers      │   │   Email      │  │
  │  │          │   │              │   │                │   │              │  │
  │  │ notif-   │   │ email-queue  │   │ email-worker   │──▶│ Send emails  │  │
  │  │ ication  │   │ notif-queue  │   │ notif-worker   │   │ templates    │  │
  │  │ file-    │   │ file-queue   │   │ file-processor │   │              │  │
  │  │ process  │   │   + DLQs     │   │                │   │              │  │
  │  └──────────┘   └──────────────┘   └────────────────┘   └──────────────┘  │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────────┐
  │                          Storage & Static Assets                           │
  │                                                                            │
  │  ┌──────────────────────┐   ┌──────────────────────┐                      │
  │  │  S3: Assets Bucket   │   │  S3: Uploads Bucket  │                      │
  │  │  Static files, media │   │  User file uploads   │                      │
  │  │  → CloudFront origin │   │  Presigned URLs      │                      │
  │  └──────────────────────┘   └──────────────────────┘                      │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────────┐
  │                         Observability & Monitoring                         │
  │                                                                            │
  │  CloudWatch Logs  ←── ECS tasks, Lambda, ALB access logs                  │
  │  CloudWatch Metrics ← ECS CPU/Mem, RDS connections, ALB latency           │
  │  CloudWatch Alarms → SNS → Email alerts                                   │
  │  X-Ray Tracing (optional) ← API request tracing                           │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────────┐
  │                              CI/CD Pipeline                                │
  │                                                                            │
  │  GitHub Actions → Build Docker → Push ECR → Deploy ECS (rolling update)   │
  │  Terraform → Plan on PR → Apply on merge to main                          │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Detailed Infrastructure Design

### 2.1 Service Inventory

| Component | AWS Service | Justification |
|-----------|------------|---------------|
| **Frontend** | Next.js on ECS (EC2) | SSR requires server; container orchestration via ECS |
| **Backend API** | NestJS on ECS (EC2) | Containerized, auto-scaling, health-checked |
| **Database** | RDS PostgreSQL | Managed backups, encryption, private subnet isolation |
| **CDN** | CloudFront | Edge caching, DDoS protection, global performance |
| **Load Balancer** | ALB | Path-based routing, health checks, SSL termination |
| **DNS** | Route 53 | Hosted zone, alias records to CloudFront |
| **SSL** | ACM | Free managed certificates, auto-renewal |
| **Container Registry** | ECR | Private Docker image storage, lifecycle policies |
| **File Storage** | S3 | Static assets, user uploads, presigned URLs |
| **Cache / Pub-Sub** | ElastiCache Redis | Socket.IO adapter for WebSocket fanout across ECS tasks, user presence, caching |
| **Email** | SES | Transactional emails, templates |
| **Event Bus** | SNS | Fan-out notifications to multiple queues |
| **Job Queue** | SQS + DLQ | Reliable async processing, retry with dead-letter |
| **Workers** | Lambda | Serverless async processors, pay-per-invocation |
| **Monitoring** | CloudWatch | Logs, metrics, alarms, dashboards |
| **IaC** | Terraform | Reproducible, version-controlled infrastructure |
| **CI/CD** | GitHub Actions | Build, test, deploy automation |

### 2.2 Why ECS EC2 (not Fargate)

For a thesis project demonstrating cloud engineering depth:

| Aspect | ECS EC2 | Fargate |
|--------|---------|---------|
| **Demonstrates** | EC2 management, ASG, capacity providers, instance roles | Just container config |
| **Visibility** | Can SSH into instances, see Docker daemon, inspect | Black box |
| **Cost control** | Can stop EC2 instances = $0 | Pay per running task |
| **Talking points** | Launch templates, user data, EBS, instance profiles | Less to discuss |
| **Real-world** | Many companies still use EC2 launch type | Common but simpler |

---

## 3. AWS Networking Design

### 3.1 VPC Layout

```
VPC: 10.0.0.0/16 (65,536 IPs)

Public Subnets (ALB, NAT Gateway):
  ├── 10.0.1.0/24  — ap-southeast-1a  (256 IPs)
  └── 10.0.2.0/24  — ap-southeast-1b  (256 IPs)

Private Subnets (ECS, RDS, Lambda):
  ├── 10.0.10.0/24 — ap-southeast-1a  (256 IPs)
  └── 10.0.11.0/24 — ap-southeast-1b  (256 IPs)
```

### 3.2 Route Tables

| Route Table | Destination | Target | Purpose |
|-------------|-------------|--------|---------|
| **Public RT** | 0.0.0.0/0 | Internet Gateway | Public subnet internet access |
| **Public RT** | 10.0.0.0/16 | local | VPC internal |
| **Private RT** | 0.0.0.0/0 | NAT Gateway | ECS pulling images, Lambda calling APIs |
| **Private RT** | 10.0.0.0/16 | local | VPC internal |

### 3.3 Security Groups

```
┌─────────────────────────────────────────────────────────────────┐
│                     Security Group Map                          │
│                                                                 │
│  sg-alb (ALB)                                                   │
│    Inbound:  80/443 from 0.0.0.0/0                             │
│    Outbound: all                                                │
│                                                                 │
│  sg-ecs (ECS EC2 instances)                                     │
│    Inbound:  dynamic ports (32768-65535) from sg-alb             │
│    Inbound:  22 from your-ip/32 (SSH for debugging)             │
│    Outbound: all                                                │
│                                                                 │
│  sg-rds (RDS)                                                   │
│    Inbound:  5432 from sg-ecs                                   │
│    Inbound:  5432 from sg-lambda                                │
│    Outbound: none needed                                        │
│                                                                 │
│  sg-redis (ElastiCache Redis)                                   │
│    Inbound:  6379 from sg-ecs                                   │
│    Outbound: none needed                                        │
│                                                                 │
│  sg-lambda (Lambda functions)                                   │
│    Inbound:  none                                               │
│    Outbound: all (reaches RDS, SES, S3 via VPC/NAT)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 NAT Gateway Strategy (Cost-Optimized)

NAT Gateway costs ~$32/mo + data transfer. For a thesis project:

**Option A: Single NAT Gateway (recommended for demo)**
- 1 NAT GW in one AZ → both private subnets route through it
- Cost: ~$32/mo
- Risk: single point of failure (acceptable for demo)

**Option B: No NAT Gateway (cheapest)**
- Use VPC endpoints for ECR, S3, CloudWatch (free/cheap)
- Lambda can use VPC endpoints instead of NAT
- ECS pulls images via VPC endpoint for ECR
- Cost: ~$0-3/mo for VPC endpoints
- Limitation: ECS tasks cannot reach arbitrary internet APIs

**Recommendation**: Use Option B with VPC endpoints during development, switch to Option A only for final demo if needed.

#### VPC Endpoints (replaces NAT for AWS services)

| Endpoint | Type | Purpose | Cost |
|----------|------|---------|------|
| `com.amazonaws.*.ecr.api` | Interface | ECR API calls | ~$7/mo |
| `com.amazonaws.*.ecr.dkr` | Interface | Docker image pulls | ~$7/mo |
| `com.amazonaws.*.s3` | Gateway | S3 access | **Free** |
| `com.amazonaws.*.logs` | Interface | CloudWatch Logs | ~$7/mo |
| `com.amazonaws.*.sqs` | Interface | SQS access | ~$7/mo |
| `com.amazonaws.*.sns` | Interface | SNS access | ~$7/mo |

**Total VPC endpoints**: ~$35/mo (similar to NAT, but more secure and explicit)

**Pragmatic decision**: Use a single NAT Gateway (~$32/mo). Simpler to configure, covers all outbound traffic, and is the standard enterprise pattern worth discussing in your thesis.

---

## 4. ECS Cluster & Service Plan

### 4.1 Cluster Configuration

```hcl
# ECS Cluster with EC2 Capacity Provider
ECS Cluster: "ielts-ai-cluster"
  ├── Capacity Provider: EC2 Auto Scaling Group
  │   ├── Launch Template: Amazon Linux 2023 ECS-optimized AMI
  │   ├── Instance Type: t3.medium (2 vCPU, 4 GB RAM)
  │   ├── Min: 1, Desired: 1, Max: 3
  │   ├── EBS: 30 GB gp3
  │   └── User Data: ECS agent config + CloudWatch agent
  │
  ├── Service: ielts-api
  │   ├── Task Definition:
  │   │   ├── Image: ECR ielts-ai-api:latest
  │   │   ├── CPU: 512 (0.5 vCPU)
  │   │   ├── Memory: 1024 MB
  │   │   ├── Port: 4000 (dynamic host port mapping)
  │   │   ├── Health Check: GET /api/health
  │   │   ├── Environment: DATABASE_URL, JWT_SECRET, etc.
  │   │   └── Log Driver: awslogs → CloudWatch
  │   ├── Desired Count: 1 (scale to 2)
  │   ├── Deployment: rolling update (min 50%, max 200%)
  │   └── Target Group: tg-api (ALB)
  │
  └── Service: ielts-web
      ├── Task Definition:
      │   ├── Image: ECR ielts-ai-web:latest
      │   ├── CPU: 512 (0.5 vCPU)
      │   ├── Memory: 1024 MB
      │   ├── Port: 3000 (dynamic host port mapping)
      │   ├── Health Check: GET /
      │   ├── Environment: NEXT_PUBLIC_API_URL
      │   └── Log Driver: awslogs → CloudWatch
      ├── Desired Count: 1 (scale to 2)
      ├── Deployment: rolling update
      └── Target Group: tg-web (ALB)
```

### 4.2 ALB Routing Rules

```
ALB Listener :443 (HTTPS)
  ├── Rule 1: Path /api/*       → Target Group: tg-api   (priority 10)
  ├── Rule 2: Path /socket.io/* → Target Group: tg-api   (priority 20, sticky sessions)
  └── Default:                  → Target Group: tg-web   (priority 99)

ALB Listener :80 (HTTP)
  └── Redirect → HTTPS 443
```

### 4.3 Auto Scaling

```
ECS Service Auto Scaling:
  API Service:
    Min: 1, Max: 3
    Scale out: CPU > 70% for 3 minutes
    Scale in:  CPU < 30% for 10 minutes

  Web Service:
    Min: 1, Max: 3
    Scale out: CPU > 70% for 3 minutes
    Scale in:  CPU < 30% for 10 minutes

EC2 ASG (Cluster Capacity):
    Min: 1, Max: 3
    Capacity Provider: managed scaling (target 80% utilization)
    Scale based on ECS CapacityProviderReservation metric
```

### 4.4 ECS EC2 Instance User Data

```bash
#!/bin/bash
# ECS-optimized AMI — agent is pre-installed
echo "ECS_CLUSTER=ielts-ai-cluster" >> /etc/ecs/ecs.config
echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config
echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config

# CloudWatch agent for instance-level metrics
yum install -y amazon-cloudwatch-agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << 'EOF'
{
  "metrics": {
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent"] },
      "disk": { "measurement": ["disk_used_percent"], "resources": ["/"]}
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/ecs/ecs-agent.log", "log_group_name": "/ecs/agent" }
        ]
      }
    }
  }
}
EOF
amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json -s
```

---

## 5. WebSocket Scaling with Redis (ElastiCache)

### 5.1 The Problem: WebSocket + Multiple ECS Tasks

When the API service scales to 2+ tasks behind ALB, each task holds its own set of WebSocket connections. A message sent by User A (connected to Task 1) won't reach User B (connected to Task 2) because Socket.IO stores connections in local memory.

```
WITHOUT Redis — messages lost across tasks:

  User A ──ws──▶ ECS Task 1 (has User A's socket)
                  │
                  │  API emits "new-message" to room "chat-42"
                  │  ✅ User A receives it (local socket)
                  │  ❌ User B does NOT receive it (different task)
                  │
  User B ──ws──▶ ECS Task 2 (has User B's socket)
```

### 5.2 The Solution: Socket.IO Redis Adapter

The `@socket.io/redis-adapter` uses Redis Pub/Sub to broadcast events across all ECS tasks. Every task subscribes to Redis channels — when one task emits, Redis fans out to all tasks, which then push to their local WebSocket clients.

```
WITH Redis Adapter — all users receive messages:

  User A ──ws──▶ ECS Task 1 ──publish──▶ Redis (Pub/Sub) ──subscribe──▶ ECS Task 2 ──ws──▶ User B
                  │                         │                             │
                  │                         │                             │
                  └─── also delivers ───────┘──── to local sockets ──────┘
                       to User A

  Flow:
  1. Task 1 receives "send message to room chat-42"
  2. Task 1 publishes event to Redis channel "socket.io#chat-42"
  3. Redis fans out to ALL subscribed tasks (Task 1 + Task 2)
  4. Each task checks local sockets in room "chat-42"
  5. Each task pushes message to its local WebSocket clients
  6. ✅ All users in room "chat-42" receive the message
```

### 5.3 Redis Data Model

```
Redis Key-Value Store:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Pub/Sub Channels (Socket.IO Adapter — automatic):           │
│    socket.io#/#              ← broadcast channel             │
│    socket.io#/chat#room-42   ← room-specific channel         │
│    socket.io-request#...     ← inter-node request channel    │
│                                                              │
│  User Presence (application-managed):                        │
│    presence:{userId}  →  { socketId, taskId, lastSeen }      │
│    TTL: 60s (auto-expire if heartbeat stops)                 │
│                                                              │
│  Online Users per Room:                                      │
│    room:{roomId}:members  →  SET { userId1, userId2, ... }   │
│                                                              │
│  Typing Indicators (ephemeral):                              │
│    typing:{roomId}:{userId}  →  "1"   TTL: 3s               │
│                                                              │
│  Unread Counts (optional):                                   │
│    unread:{userId}:{roomId}  →  count                        │
│                                                              │
│  API Cache (optional):                                       │
│    cache:tests:list  →  JSON   TTL: 300s                     │
│    cache:user:{id}   →  JSON   TTL: 60s                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 NestJS Implementation

```typescript
// apps/api/src/chat/chat.gateway.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({
      url: process.env.REDIS_URL, // redis://ielts-ai-redis.xxxxx.apse1.cache.amazonaws.com:6379
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    server.adapter(this.adapterConstructor);
    return server;
  }
}

// apps/api/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);

  await app.listen(4000);
}
```

```typescript
// apps/api/src/chat/chat.gateway.ts — Gateway using rooms
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway {
  @WebSocketServer() server: Server;

  constructor(
    private readonly redis: RedisService,  // ioredis for key-value ops
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;

    // Track presence in Redis (key-value, not pub/sub)
    await this.redis.set(`presence:${userId}`, JSON.stringify({
      socketId: client.id,
      connectedAt: Date.now(),
    }), 'EX', 60); // TTL 60s, refreshed by heartbeat
  }

  async handleDisconnect(client: Socket) {
    const userId = client.handshake.auth.userId;
    await this.redis.del(`presence:${userId}`);

    // Remove from all room member sets
    const rooms = await this.redis.smembers(`user:${userId}:rooms`);
    for (const roomId of rooms) {
      await this.redis.srem(`room:${roomId}:members`, userId);
    }
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(client: Socket, roomId: string) {
    const userId = client.handshake.auth.userId;

    client.join(roomId);  // Socket.IO room — synced via Redis adapter
    await this.redis.sadd(`room:${roomId}:members`, userId);
    await this.redis.sadd(`user:${userId}:rooms`, roomId);

    // Notify room — works across ALL ECS tasks via Redis adapter
    this.server.to(roomId).emit('user-joined', { userId, roomId });
  }

  @SubscribeMessage('send-message')
  async handleMessage(client: Socket, data: { roomId: string; content: string }) {
    // Save to PostgreSQL (via service)
    const message = await this.chatService.saveMessage(data);

    // Emit to room — Redis adapter ensures ALL tasks receive this
    this.server.to(data.roomId).emit('new-message', message);

    // Update unread counts in Redis for offline room members
    const members = await this.redis.smembers(`room:${data.roomId}:members`);
    for (const memberId of members) {
      if (memberId !== client.handshake.auth.userId) {
        await this.redis.incr(`unread:${memberId}:${data.roomId}`);
      }
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(client: Socket, roomId: string) {
    const userId = client.handshake.auth.userId;
    // Ephemeral — 3s TTL, no DB write
    await this.redis.set(`typing:${roomId}:${userId}`, '1', 'EX', 3);
    client.to(roomId).emit('user-typing', { userId, roomId });
  }
}
```

### 5.5 ALB Sticky Sessions for WebSocket

WebSocket requires the initial HTTP upgrade request and subsequent frames to hit the **same ECS task**. ALB handles this with sticky sessions on the target group.

```
ALB WebSocket flow:
1. Client sends HTTP GET /socket.io/?transport=polling (long-polling handshake)
2. ALB routes to Task 1, sets AWSALB cookie
3. Client upgrades to WebSocket: GET /socket.io/?transport=websocket
4. ALB uses AWSALB cookie → routes to same Task 1
5. WebSocket connection established with Task 1
6. All subsequent frames stay on Task 1 (TCP connection pinned)

Why sticky sessions matter:
- Socket.IO starts with long-polling, then upgrades to WebSocket
- The polling phase makes multiple HTTP requests → must hit same task
- Without stickiness, poll request 2 might hit Task 2 (which has no session)
- After WebSocket upgrade, ALB keeps the TCP connection pinned anyway
```

### 5.6 ElastiCache Configuration

```
ElastiCache Redis:
  ├── Engine: Redis 7.x
  ├── Node Type: cache.t3.micro (free tier eligible)
  │   ├── 0.5 GiB RAM — sufficient for pub/sub + presence
  │   └── Network: up to 5 Gbps
  ├── Num Nodes: 1 (single-node, no replication for demo)
  ├── Subnet Group: private subnets (same as RDS)
  ├── Security Group: sg-redis (port 6379 from sg-ecs only)
  ├── Encryption: in-transit (TLS) + at-rest
  ├── Parameter Group: default.redis7
  ├── Maintenance: sun:05:00-sun:06:00
  └── Backup: none (ephemeral data, no backup needed)
```

### 5.7 What Redis Stores vs What PostgreSQL Stores

| Data | Storage | Why |
|------|---------|-----|
| Chat messages | PostgreSQL | Permanent, queryable, paginated |
| Message read receipts | PostgreSQL | Permanent history |
| User profiles | PostgreSQL | Permanent |
| Room/conversation metadata | PostgreSQL | Permanent |
| Socket.IO pub/sub channels | Redis (automatic) | Ephemeral, cross-task fanout |
| User presence (online/offline) | Redis (TTL 60s) | Ephemeral, high-frequency updates |
| Room member sets (live) | Redis SET | Ephemeral, fast lookups |
| Typing indicators | Redis (TTL 3s) | Ephemeral, ultra-short-lived |
| Unread message counts | Redis (counter) | Fast increment, sync to PG periodically |
| API response cache | Redis (TTL) | Optional performance optimization |

### 5.8 Redis Implementation Spec — Chat Module

Redis is used **exclusively for the chat module**: Socket.IO cross-task pub/sub, user presence, chat room state, typing indicators, and unread counts. All other features (attempts, AI tutor, writing, caching) use PostgreSQL + REST as they do today.

#### 5.8.1 Dependencies

```bash
# Core Redis
pnpm add --filter api ioredis

# Socket.IO with Redis adapter
pnpm add --filter api @nestjs/websockets @nestjs/platform-socket.io socket.io
pnpm add --filter api @socket.io/redis-adapter
```

#### 5.8.2 Module Structure

```
apps/api/src/
├── redis/                           # Redis core module (global)
│   ├── redis.module.ts              # Global module, provides RedisService
│   └── redis.service.ts             # ioredis wrapper for key-value ops
│
├── chat/                            # Chat module (WebSocket + REST)
│   ├── chat.module.ts               # Imports Redis, Prisma
│   ├── chat.gateway.ts              # Socket.IO gateway: rooms, messages, typing
│   ├── chat.service.ts              # Business logic: save messages, manage rooms
│   ├── chat.controller.ts           # REST: GET /api/chat/conversations, GET /api/chat/messages
│   ├── redis-io.adapter.ts          # Socket.IO Redis adapter (pub/sub fanout)
│   └── dto/
│       ├── send-message.dto.ts
│       └── create-conversation.dto.ts
│
└── main.ts                          # Bootstrap with RedisIoAdapter
```

#### 5.8.3 Database Schema (Chat tables — add to Prisma)

```prisma
// apps/api/prisma/schema.prisma — new models for chat

model Conversation {
  id        String   @id @default(cuid())
  title     String?  // null for DMs, set for group chats
  isGroup   Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  members  ConversationMember[]
  messages ChatMessage[]

  @@map("conversations")
}

model ConversationMember {
  id             String   @id @default(cuid())
  conversationId String   @map("conversation_id")
  userId         String   @map("user_id")
  joinedAt       DateTime @default(now()) @map("joined_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@map("conversation_members")
}

model ChatMessage {
  id             String   @id @default(cuid())
  conversationId String   @map("conversation_id")
  senderId       String   @map("sender_id")
  content        String
  createdAt      DateTime @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("chat_messages")
}
```

#### 5.8.4 Redis Key Schema (Chat-only)

All keys are scoped to chat. No other module uses Redis.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Redis Key Schema — Chat Only                       │
│                                                                          │
│  ── Socket.IO Adapter (automatic, @socket.io/redis-adapter) ──────────  │
│  socket.io#/#                         Broadcast channel (pub/sub)        │
│  socket.io#/chat#conv-{id}            Room-specific channel (pub/sub)    │
│  socket.io-request#...                Inter-node requests (pub/sub)      │
│                                                                          │
│  ── User Presence ────────────────────────────────────────────────────  │
│  chat:presence:{userId}               → JSON { socketId, connectedAt }   │
│    TTL: 120s (refreshed every 30s by heartbeat)                         │
│                                                                          │
│  ── Room Members (live WS connections) ───────────────────────────────  │
│  chat:room:{conversationId}:online    → SET { userId1, userId2, ... }    │
│    No TTL — cleaned up on disconnect                                    │
│  chat:user:{userId}:rooms             → SET { convId1, convId2, ... }    │
│    No TTL — cleaned up on disconnect                                    │
│                                                                          │
│  ── Typing Indicators ────────────────────────────────────────────────  │
│  chat:typing:{conversationId}:{uId}   → "1"                             │
│    TTL: 3s (auto-expire, no cleanup needed)                             │
│                                                                          │
│  ── Unread Counts ────────────────────────────────────────────────────  │
│  chat:unread:{userId}:{conversationId} → counter (integer)               │
│    No TTL — reset to 0 when user opens conversation                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**What goes where:**

| Data | Storage | Why |
|------|---------|-----|
| Messages | **PostgreSQL** | Permanent, paginated history |
| Conversations & members | **PostgreSQL** | Permanent, relational |
| Socket.IO pub/sub | **Redis** (automatic) | Cross-task fanout for multi-instance |
| User online/offline | **Redis** (TTL 120s) | Ephemeral, high-frequency heartbeat |
| Who's in a chat room right now | **Redis** SET | Ephemeral, changes on every connect/disconnect |
| Typing indicators | **Redis** (TTL 3s) | Ultra-short-lived, no persistence needed |
| Unread message counts | **Redis** counter | Fast increment; not critical if lost on restart |

#### 5.8.5 Core Implementation

**Redis Module (Global):**

```typescript
// apps/api/src/redis/redis.module.ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

```typescript
// apps/api/src/redis/redis.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  getClient(): Redis { return this.client; }

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

  async onModuleDestroy() {
    await this.client.quit();
  }
}
```

**Redis IO Adapter (Socket.IO pub/sub):**

```typescript
// apps/api/src/chat/redis-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';
import { INestApplication, Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => this.logger.error('Redis pub error', err));
    subClient.on('error', (err) => this.logger.error('Redis sub error', err));

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingInterval: 25000,
      pingTimeout: 20000,
    });

    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

#### 5.8.6 Chat Gateway (WebSocket)

```typescript
// apps/api/src/chat/chat.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { RedisService } from '../redis/redis.service';

const KEY = {
  presence: (uid: string) => `chat:presence:${uid}`,
  roomOnline: (convId: string) => `chat:room:${convId}:online`,
  userRooms: (uid: string) => `chat:user:${uid}:rooms`,
  typing: (convId: string, uid: string) => `chat:typing:${convId}:${uid}`,
  unread: (uid: string, convId: string) => `chat:unread:${uid}:${convId}`,
};

const TTL = {
  PRESENCE: 120,  // 2 min, refreshed every 30s
  TYPING: 3,      // 3 seconds
};

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly redis: RedisService,
  ) {}

  // ── Connection lifecycle ─────────────────────────
  async handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (!userId) {
      client.disconnect();
      return;
    }

    this.logger.log(`Chat connected: ${userId} (${client.id})`);

    // Mark user as online
    await this.redis.setJson(KEY.presence(userId), {
      socketId: client.id,
      connectedAt: Date.now(),
    }, TTL.PRESENCE);

    // Auto-join all conversations this user belongs to
    const conversations = await this.chatService.getUserConversationIds(userId);
    for (const convId of conversations) {
      client.join(convId);
      await this.redis.sadd(KEY.roomOnline(convId), userId);
      await this.redis.sadd(KEY.userRooms(userId), convId);

      // Notify other members this user came online
      client.to(convId).emit('user-online', { userId, conversationId: convId });
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    this.logger.log(`Chat disconnected: ${userId} (${client.id})`);

    // Mark offline
    await this.redis.del(KEY.presence(userId));

    // Remove from all room online sets
    const rooms = await this.redis.smembers(KEY.userRooms(userId));
    for (const convId of rooms) {
      await this.redis.srem(KEY.roomOnline(convId), userId);
      this.server.to(convId).emit('user-offline', { userId, conversationId: convId });
    }
    await this.redis.del(KEY.userRooms(userId));
  }

  // ── Heartbeat ────────────────────────────────────
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    const data = await this.redis.getJson<any>(KEY.presence(userId));
    if (data) {
      data.lastSeen = Date.now();
      await this.redis.setJson(KEY.presence(userId), data, TTL.PRESENCE);
    }
  }

  // ── Send message ─────────────────────────────────
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    // Persist to PostgreSQL
    const message = await this.chatService.saveMessage({
      conversationId: data.conversationId,
      senderId: userId,
      content: data.content,
    });

    // Broadcast to all members in room (Redis adapter fans out across ECS tasks)
    this.server.to(data.conversationId).emit('new-message', message);

    // Increment unread counts for offline members in this room
    const onlineMembers = await this.redis.smembers(KEY.roomOnline(data.conversationId));
    const allMembers = await this.chatService.getConversationMemberIds(data.conversationId);

    for (const memberId of allMembers) {
      if (memberId !== userId && !onlineMembers.includes(memberId)) {
        await this.redis.incr(KEY.unread(memberId, data.conversationId));
      }
    }
  }

  // ── Typing indicator ─────────────────────────────
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    await this.redis.set(KEY.typing(conversationId, userId), '1', TTL.TYPING);
    client.to(conversationId).emit('user-typing', { userId, conversationId });
  }

  @SubscribeMessage('stop-typing')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    await this.redis.del(KEY.typing(conversationId, userId));
    client.to(conversationId).emit('user-stop-typing', { userId, conversationId });
  }

  // ── Mark as read ─────────────────────────────────
  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    await this.redis.del(KEY.unread(userId, conversationId));
  }

  // ── Get online members in a conversation ─────────
  @SubscribeMessage('get-online')
  async handleGetOnline(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const online = await this.redis.smembers(KEY.roomOnline(conversationId));
    client.emit('online-members', { conversationId, userIds: online });
  }
}
```

#### 5.8.7 Chat Service (PostgreSQL persistence)

```typescript
// apps/api/src/chat/chat.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getUserConversationIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    return memberships.map(m => m.conversationId);
  }

  async getConversationMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map(m => m.userId);
  }

  async saveMessage(data: {
    conversationId: string;
    senderId: string;
    content: string;
  }) {
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.content,
      },
      include: {
        sender: { select: { id: true, name: true } },
      },
    });

    // Update conversation updatedAt
    await this.prisma.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async getMessages(conversationId: string, page = 1, limit = 50) {
    const [data, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { conversationId },
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatMessage.count({ where: { conversationId } }),
    ]);
    return { data: data.reverse(), total, page, limit };
  }

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createConversation(creatorId: string, memberIds: string[], title?: string) {
    const allMembers = [...new Set([creatorId, ...memberIds])];
    return this.prisma.conversation.create({
      data: {
        title,
        isGroup: allMembers.length > 2,
        members: {
          create: allMembers.map(userId => ({ userId })),
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }
}
```

#### 5.8.8 Chat REST Controller (history, conversations)

```typescript
// apps/api/src/chat/chat.controller.ts

import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { RedisService } from '../redis/redis.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatService: ChatService,
    private redis: RedisService,
  ) {}

  // GET /api/chat/conversations — list user's conversations
  @Get('conversations')
  async getConversations(@Request() req) {
    return this.chatService.getConversations(req.user.id);
  }

  // POST /api/chat/conversations — create DM or group chat
  @Post('conversations')
  async createConversation(
    @Request() req,
    @Body() body: { memberIds: string[]; title?: string },
  ) {
    return this.chatService.createConversation(req.user.id, body.memberIds, body.title);
  }

  // GET /api/chat/conversations/:id/messages — paginated message history
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(
      conversationId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  // GET /api/chat/unread — get all unread counts for current user
  @Get('unread')
  async getUnreadCounts(@Request() req) {
    const convIds = await this.chatService.getUserConversationIds(req.user.id);
    const counts: Record<string, number> = {};
    for (const convId of convIds) {
      const val = await this.redis.get(`chat:unread:${req.user.id}:${convId}`);
      if (val && parseInt(val) > 0) {
        counts[convId] = parseInt(val);
      }
    }
    return counts;
  }
}
```

#### 5.8.9 Bootstrap (main.ts)

```typescript
// apps/api/src/main.ts — add Redis adapter
import { RedisIoAdapter } from './chat/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Redis-backed Socket.IO adapter (for chat WebSocket fanout across ECS tasks)
  if (process.env.REDIS_URL) {
    const redisAdapter = new RedisIoAdapter(app);
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);
  }

  await app.listen(process.env.PORT || 4000);
}
bootstrap();
```

#### 5.8.10 App Module Registration

```typescript
// apps/api/src/app.module.ts — add Redis + Chat
import { RedisModule } from './redis/redis.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    RedisModule,     // Global — provides RedisService to ChatModule
    ChatModule,      // WebSocket gateway + REST endpoints + chat service
    PrismaModule,
    AuthModule,
    UsersModule,
    TagsModule,
    TestsModule,
    AttemptsModule,
    CommentsModule,
  ],
})
export class AppModule {}
```

#### 5.8.11 Environment & Local Dev

```env
# apps/api/.env — add
REDIS_URL=redis://localhost:6379

# Production (ElastiCache):
# REDIS_URL=redis://ielts-ai-redis.xxxxx.apse1.cache.amazonaws.com:6379
```

```yaml
# docker-compose.yml — add Redis service
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ielts_platform
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru

volumes:
  pgdata:
```

#### 5.8.12 Chat API Summary

**REST Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/chat/conversations` | JWT | List user's conversations (with last message) |
| `POST` | `/api/chat/conversations` | JWT | Create DM or group chat. Body: `{ memberIds, title? }` |
| `GET` | `/api/chat/conversations/:id/messages` | JWT | Paginated message history. Query: `?page=&limit=` |
| `GET` | `/api/chat/unread` | JWT | Unread counts per conversation (from Redis) |

**WebSocket Events (namespace: `/chat`):**

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| Client → | `send-message` | `{ conversationId, content }` | Send chat message |
| Client → | `typing` | `conversationId` | Start typing indicator |
| Client → | `stop-typing` | `conversationId` | Stop typing indicator |
| Client → | `mark-read` | `conversationId` | Reset unread count |
| Client → | `heartbeat` | — | Refresh presence TTL |
| Client → | `get-online` | `conversationId` | Request online members |
| → Client | `new-message` | `{ id, content, sender, createdAt }` | New message in room |
| → Client | `user-typing` | `{ userId, conversationId }` | Someone is typing |
| → Client | `user-stop-typing` | `{ userId, conversationId }` | Someone stopped typing |
| → Client | `user-online` | `{ userId, conversationId }` | Member came online |
| → Client | `user-offline` | `{ userId, conversationId }` | Member went offline |
| → Client | `online-members` | `{ conversationId, userIds[] }` | Online member list |

**WS Handshake auth:**

```typescript
// Frontend: connect with JWT userId
const socket = io('ws://localhost:4000/chat', {
  auth: { userId: currentUser.id },
});
```

#### 5.8.13 Data Flow Diagram

```
┌──────────┐    WebSocket    ┌──────────────┐    Pub/Sub    ┌──────────────┐    WebSocket    ┌──────────┐
│ Client A │───────────────▶│  ECS Task 1  │─────────────▶│    Redis     │◀────────────────│ ECS Task 2│◀──────────────│ Client B │
│          │                │              │              │              │                │              │               │          │
│ send-msg │                │ 1. Save to   │              │ 2. Fan out   │                │ 3. Deliver   │               │ new-msg  │
│          │                │    PostgreSQL │              │    via pub/  │                │    to local  │               │          │
│          │                │ 2. Emit to   │              │    sub       │                │    sockets   │               │          │
│          │                │    room      │              │              │                │              │               │          │
└──────────┘                └──────────────┘              └──────────────┘                └──────────────┘               └──────────┘
                                   │                                                                                         │
                                   │  Permanent storage                                                                      │
                                   ▼                                                                                         │
                            ┌──────────────┐                                                                                 │
                            │  PostgreSQL  │  messages, conversations, members                                               │
                            └──────────────┘                                                                                 │

Redis stores ONLY ephemeral chat state:
  • Socket.IO pub/sub channels (automatic)
  • presence:{userId} — online status (TTL 120s)
  • room:{convId}:online — who's connected now (SET)
  • typing:{convId}:{userId} — typing indicator (TTL 3s)
  • unread:{userId}:{convId} — unread counter
```

---

## 6. Async / Event-Driven Architecture (SNS/SQS/Lambda)

### 6.1 SNS Topics

| Topic | Publishers | Purpose |
|-------|-----------|---------|
| `ielts-notification` | API (NestJS) | Fan-out user notifications |
| `ielts-file-process` | API (NestJS) | Trigger file processing after upload |

### 6.2 SQS Queues

| Queue | Subscriber | DLQ | Purpose |
|-------|-----------|-----|---------|
| `email-queue` | Lambda: email-worker | `email-dlq` | Send transactional emails via SES |
| `notification-queue` | Lambda: notif-worker | `notif-dlq` | Process and store notifications |
| `file-processing-queue` | Lambda: file-processor | `file-dlq` | Resize images, process uploads |

Configuration per queue:
- Visibility timeout: 60s
- Max receive count: 3 (then → DLQ)
- DLQ retention: 14 days

### 6.3 Lambda Workers

```
Lambda: email-worker
  ├── Runtime: Node.js 20
  ├── Memory: 256 MB
  ├── Timeout: 30s
  ├── Trigger: SQS (email-queue)
  ├── Permissions: SES:SendEmail, SQS:ReceiveMessage
  └── Logic: Read message → render template → SES send

Lambda: notification-worker
  ├── Runtime: Node.js 20
  ├── Memory: 256 MB
  ├── Timeout: 30s
  ├── Trigger: SQS (notification-queue)
  ├── Permissions: RDS access (via VPC), SQS:ReceiveMessage
  └── Logic: Read message → write to notifications table

Lambda: file-processor
  ├── Runtime: Node.js 20
  ├── Memory: 512 MB
  ├── Timeout: 120s
  ├── Trigger: SQS (file-processing-queue)
  ├── Permissions: S3:GetObject, S3:PutObject
  └── Logic: Download from S3 → resize/process → upload result
```

### 6.4 SES Email

```
SES Configuration:
  ├── Verified domain: ielts-platform.com
  ├── DKIM: enabled
  ├── From: noreply@ielts-platform.com
  └── Templates: welcome, password-reset, test-result
```

### 6.5 Event Flow Example

```
User submits test → API saves result to RDS
                  → API publishes to SNS "ielts-notification"
                    ├── SQS email-queue → Lambda email-worker → SES
                    │   "Your test result is ready!"
                    └── SQS notification-queue → Lambda notif-worker → RDS
                        Save in-app notification record
```

---

## 7. CloudFront + S3 Design

### 7.1 CloudFront Distribution

```
Distribution: d1234.cloudfront.net
  ├── CNAME: ielts-platform.com
  ├── SSL: ACM certificate (us-east-1 for CloudFront)
  ├── WAF: AWS WAF (rate limiting, SQL injection protection)
  │
  ├── Origin 1: ALB (for dynamic content)
  │   ├── Behavior: /api/*    → ALB, no cache, all methods, CORS headers
  │   ├── Behavior: /socket.io/* → ALB, no cache, WebSocket upgrade
  │   └── Behavior: /* (default) → ALB, cache static assets (/_next/static/*)
  │
  └── Origin 2: S3 (for uploaded assets)
      └── Behavior: /uploads/* → S3 bucket, cache 7 days
```

### 7.2 S3 Buckets

| Bucket | Purpose | Access | Lifecycle |
|--------|---------|--------|-----------|
| `ielts-ai-uploads-prod` | User file uploads (audio, images) | Presigned URLs via API | Move to IA after 90 days |
| `ielts-ai-assets-prod` | Static assets served via CloudFront | CloudFront OAI | Immutable, long cache |
| `ielts-ai-terraform-state` | Terraform remote state | IAM only | Versioning enabled |

### 7.3 Presigned URL Flow

```
1. Frontend → POST /api/uploads/presign { filename, contentType }
2. API validates auth → generates S3 presigned PUT URL (5 min expiry)
3. API returns { uploadUrl, fileKey }
4. Frontend → PUT directly to S3 presigned URL (no API bandwidth)
5. Frontend → POST /api/uploads/complete { fileKey }
6. API publishes to SNS "file-process" → Lambda processes file
7. File available at: https://ielts-platform.com/uploads/{fileKey}
```

---

## 8. CI/CD Deployment Flow

### 8.1 Pipeline Overview

```
┌─────────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Developer   │────▶│  GitHub  │────▶│  GitHub  │────▶│  AWS ECS     │
│  git push    │     │  Repo    │     │  Actions │     │  Rolling     │
│              │     │  (main)  │     │  CI/CD   │     │  Deploy      │
└─────────────┘     └──────────┘     └──────────┘     └──────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    ┌──────────┐   ┌──────────┐   ┌──────────┐
                    │  Build   │   │  Push    │   │  Deploy  │
                    │  Docker  │   │  to ECR  │   │  ECS     │
                    │  Image   │   │          │   │  Service │
                    └──────────┘   └──────────┘   └──────────┘
```

### 8.2 API Deploy — `.github/workflows/deploy-api.yml`

```yaml
name: Deploy API

on:
  push:
    branches: [main]
    paths:
      - 'apps/api/**'
      - 'packages/**'
      - '.github/workflows/deploy-api.yml'

env:
  AWS_REGION: ap-southeast-1
  ECR_REPOSITORY: ielts-ai-api
  ECS_CLUSTER: ielts-ai-cluster
  ECS_SERVICE: ielts-api

permissions:
  id-token: write
  contents: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        working-directory: apps/api
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
                        -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY --all-tags

      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition ielts-api \
            --query taskDefinition \
            > task-definition.json

      - name: Update task definition with new image
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: api
          image: ${{ steps.ecr-login.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true

      - name: Run migrations
        run: |
          TASK_ARN=$(aws ecs run-task \
            --cluster $ECS_CLUSTER \
            --task-definition ielts-api-migrate \
            --launch-type EC2 \
            --query 'tasks[0].taskArn' \
            --output text)
          aws ecs wait tasks-stopped --cluster $ECS_CLUSTER --tasks $TASK_ARN
```

### 8.3 Web Deploy — `.github/workflows/deploy-web.yml`

```yaml
name: Deploy Web

on:
  push:
    branches: [main]
    paths:
      - 'apps/web/**'
      - 'packages/**'
      - '.github/workflows/deploy-web.yml'

env:
  AWS_REGION: ap-southeast-1
  ECR_REPOSITORY: ielts-ai-web
  ECS_CLUSTER: ielts-ai-cluster
  ECS_SERVICE: ielts-web

permissions:
  id-token: write
  contents: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        working-directory: apps/web
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build \
            --build-arg NEXT_PUBLIC_API_URL=${{ secrets.NEXT_PUBLIC_API_URL }} \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY --all-tags

      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition ielts-web \
            --query taskDefinition \
            > task-definition.json

      - name: Update task definition with new image
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: web
          image: ${{ steps.ecr-login.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
```

### 8.4 PR Validation — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: apps/api
      - run: npm run build
        working-directory: apps/api
      - run: npm test --if-present
        working-directory: apps/api

  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: apps/web
      - run: npm run build
        working-directory: apps/web
      - run: npm run lint --if-present
        working-directory: apps/web
```

### 8.5 Terraform Pipeline — `.github/workflows/infra.yml`

```yaml
name: Infrastructure

on:
  push:
    branches: [main]
    paths: ['infra/**']
  pull_request:
    branches: [main]
    paths: ['infra/**']

env:
  AWS_REGION: ap-southeast-1
  TF_VERSION: "1.9"

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: infra
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - run: terraform init
      - run: terraform validate
      - name: Terraform Plan
        id: plan
        run: terraform plan -no-color -out=tfplan

      - name: Comment PR with Plan
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const plan = `${{ steps.plan.outputs.stdout }}`;
            const truncated = plan.length > 60000 ? plan.substring(0, 60000) + '...' : plan;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Terraform Plan\n\`\`\`\n${truncated}\n\`\`\``
            });

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -auto-approve tfplan
```

### 8.6 Lambda Deploy — `.github/workflows/deploy-lambdas.yml`

```yaml
name: Deploy Lambdas

on:
  push:
    branches: [main]
    paths:
      - 'apps/lambdas/**'
      - '.github/workflows/deploy-lambdas.yml'

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        function: [email-worker, notification-worker, file-processor]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      - name: Install and build
        working-directory: apps/lambdas/${{ matrix.function }}
        run: |
          npm ci
          npm run build
          zip -r function.zip dist/ node_modules/

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-southeast-1

      - name: Deploy Lambda
        working-directory: apps/lambdas/${{ matrix.function }}
        run: |
          aws lambda update-function-code \
            --function-name ielts-${{ matrix.function }} \
            --zip-file fileb://function.zip
```

---

## 9. Terraform Module Structure

### 9.1 Directory Layout

```
infra/
├── main.tf                    # Root — provider, module calls
├── variables.tf               # All input variables
├── outputs.tf                 # All outputs
├── terraform.tfvars           # Your values (.gitignored)
├── backend.tf                 # S3 remote state
│
├── modules/
│   ├── networking/            # VPC, subnets, IGW, NAT, route tables, SGs
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── alb/                   # ALB, listeners, target groups, ACM cert
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── ecs/                   # ECS cluster, capacity provider, ASG, launch template
│   │   ├── main.tf            # services, task definitions
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── user_data.sh
│   │
│   ├── ecr/                   # ECR repositories + lifecycle policies
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── rds/                   # RDS PostgreSQL, subnet group, parameter group
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── s3/                    # S3 buckets (uploads, assets)
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── cloudfront/            # CloudFront distribution, WAF, OAI
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── messaging/             # SNS topics, SQS queues, DLQs
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── elasticache/           # ElastiCache Redis (Socket.IO adapter, presence, cache)
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── lambda/                # Lambda functions, IAM roles, event source mappings
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── monitoring/            # CloudWatch log groups, alarms, dashboard
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── dns/                   # Route 53 hosted zone, records
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   └── iam/                   # IAM roles (ECS task, EC2 instance, GitHub OIDC, Lambda)
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
```

### 9.2 Root `main.tf`

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "ielts-ai-platform"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# CloudFront requires ACM cert in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "networking" {
  source       = "./modules/networking"
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  my_ip        = var.my_ip
}

module "ecr" {
  source       = "./modules/ecr"
  project_name = var.project_name
}

module "rds" {
  source                = "./modules/rds"
  project_name          = var.project_name
  environment           = var.environment
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = var.db_password
  db_instance_class     = var.db_instance_class
  private_subnet_ids    = module.networking.private_subnet_ids
  rds_security_group_id = module.networking.rds_security_group_id
}

module "elasticache" {
  source                  = "./modules/elasticache"
  project_name            = var.project_name
  environment             = var.environment
  private_subnet_ids      = module.networking.private_subnet_ids
  redis_security_group_id = module.networking.redis_security_group_id
  node_type               = var.redis_node_type
}

module "alb" {
  source              = "./modules/alb"
  project_name        = var.project_name
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  acm_certificate_arn = var.acm_certificate_arn
}

module "ecs" {
  source              = "./modules/ecs"
  project_name        = var.project_name
  environment         = var.environment
  aws_region          = var.aws_region
  vpc_id              = module.networking.vpc_id
  private_subnet_ids  = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id
  instance_type       = var.ecs_instance_type
  key_name            = var.key_name
  api_target_group_arn = module.alb.api_target_group_arn
  web_target_group_arn = module.alb.web_target_group_arn
  ecr_api_url         = module.ecr.api_repository_url
  ecr_web_url         = module.ecr.web_repository_url
  rds_endpoint        = module.rds.endpoint
  redis_endpoint      = module.elasticache.endpoint
  db_name             = var.db_name
  db_username         = var.db_username
  db_password         = var.db_password
}

module "s3" {
  source       = "./modules/s3"
  project_name = var.project_name
  environment  = var.environment
}

module "cloudfront" {
  source              = "./modules/cloudfront"
  project_name        = var.project_name
  domain_name         = var.domain_name
  alb_dns_name        = module.alb.dns_name
  uploads_bucket      = module.s3.uploads_bucket_domain
  acm_certificate_arn = var.acm_cf_certificate_arn  # must be us-east-1

  providers = {
    aws = aws.us_east_1
  }
}

module "messaging" {
  source       = "./modules/messaging"
  project_name = var.project_name
  environment  = var.environment
}

module "lambda" {
  source              = "./modules/lambda"
  project_name        = var.project_name
  environment         = var.environment
  private_subnet_ids  = module.networking.private_subnet_ids
  lambda_security_group_id = module.networking.lambda_security_group_id
  email_queue_arn     = module.messaging.email_queue_arn
  notif_queue_arn     = module.messaging.notification_queue_arn
  file_queue_arn      = module.messaging.file_processing_queue_arn
  uploads_bucket_arn  = module.s3.uploads_bucket_arn
}

module "monitoring" {
  source       = "./modules/monitoring"
  project_name = var.project_name
  ecs_cluster  = module.ecs.cluster_name
  alb_arn      = module.alb.arn
  rds_id       = module.rds.instance_id
  alarm_email  = var.alarm_email
}

module "dns" {
  source              = "./modules/dns"
  domain_name         = var.domain_name
  cloudfront_domain   = module.cloudfront.domain_name
  cloudfront_zone_id  = module.cloudfront.hosted_zone_id
}

module "iam" {
  source          = "./modules/iam"
  project_name    = var.project_name
  github_org      = var.github_org
  github_repo     = var.github_repo
  ecr_arns        = module.ecr.repository_arns
}
```

### 9.3 Key Module: Networking

```hcl
# infra/modules/networking/main.tf

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "${var.project_name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw" }
}

# ── Public Subnets (ALB, NAT GW) ───────────────────
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  tags = { Name = "${var.project_name}-public-a" }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true
  tags = { Name = "${var.project_name}-public-b" }
}

# ── Private Subnets (ECS, RDS, Lambda) ──────────────
resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.aws_region}a"
  tags = { Name = "${var.project_name}-private-a" }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.aws_region}b"
  tags = { Name = "${var.project_name}-private-b" }
}

# ── NAT Gateway (single, cost-optimized) ────────────
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
  tags          = { Name = "${var.project_name}-nat" }
}

# ── Route Tables ────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${var.project_name}-private-rt" }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}

# ── Security Groups ────────────────────────────────
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

resource "aws_security_group" "ecs" {
  name_prefix = "${var.project_name}-ecs-"
  vpc_id      = aws_vpc.main.id

  # Dynamic port range for ECS tasks (bridge networking)
  ingress {
    from_port       = 32768
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "ALB to ECS dynamic ports"
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip]
    description = "SSH from admin"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
    description     = "PostgreSQL from ECS"
  }

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
    description     = "PostgreSQL from Lambda"
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  description = "Security group for ElastiCache Redis — only allows from ECS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
    description     = "Redis from ECS only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle { create_before_destroy = true }

  tags = { Name = "${var.project_name}-redis-sg" }
}

resource "aws_security_group" "lambda" {
  name_prefix = "${var.project_name}-lambda-"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-lambda-sg" }
}
```

```hcl
# infra/modules/networking/outputs.tf

output "vpc_id"                    { value = aws_vpc.main.id }
output "public_subnet_ids"        { value = [aws_subnet.public_a.id, aws_subnet.public_b.id] }
output "private_subnet_ids"       { value = [aws_subnet.private_a.id, aws_subnet.private_b.id] }
output "alb_security_group_id"    { value = aws_security_group.alb.id }
output "ecs_security_group_id"    { value = aws_security_group.ecs.id }
output "rds_security_group_id"    { value = aws_security_group.rds.id }
output "redis_security_group_id"  { value = aws_security_group.redis.id }
output "lambda_security_group_id" { value = aws_security_group.lambda.id }
```

### 9.4 Key Module: ECS

```hcl
# infra/modules/ecs/main.tf

# ── ECS Cluster ─────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${var.project_name}-cluster" }
}

# ── ECS-optimized AMI ──────────────────────────────
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

# ── Launch Template ─────────────────────────────────
resource "aws_launch_template" "ecs" {
  name_prefix   = "${var.project_name}-ecs-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.instance_type
  key_name      = var.key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  vpc_security_group_ids = [var.ecs_security_group_id]

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 30
      volume_type = "gp3"
      encrypted   = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    cluster_name = "${var.project_name}-cluster"
  }))

  tag_specifications {
    resource_type = "instance"
    tags = { Name = "${var.project_name}-ecs-instance" }
  }
}

# ── Auto Scaling Group ──────────────────────────────
resource "aws_autoscaling_group" "ecs" {
  name                = "${var.project_name}-ecs-asg"
  min_size            = 1
  max_size            = 3
  desired_capacity    = 1
  vpc_zone_identifier = var.private_subnet_ids

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = true
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# ── Capacity Provider ───────────────────────────────
resource "aws_ecs_capacity_provider" "ec2" {
  name = "${var.project_name}-ec2-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.ecs.arn
    managed_termination_protection = "DISABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 80
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 2
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.ec2.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }
}

# ── IAM for EC2 instances ───────────────────────────
resource "aws_iam_role" "ecs_instance" {
  name = "${var.project_name}-ecs-instance-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_instance" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ecs_ssm" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecs_cloudwatch" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "ecs" {
  name = "${var.project_name}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance.name
}

# ── Task Execution Role (for ECR pulls, logs) ──────
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ── Task Role (for app-level permissions) ───────────
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_permissions" {
  name = "app-permissions"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.project_name}-uploads-*/*"
      },
      {
        Effect = "Allow"
        Action = ["sns:Publish"]
        Resource = "arn:aws:sns:*:*:${var.project_name}-*"
      },
      {
        Effect = "Allow"
        Action = ["sqs:SendMessage"]
        Resource = "arn:aws:sqs:*:*:${var.project_name}-*"
      },
      {
        Effect = "Allow"
        Action = ["ses:SendEmail", "ses:SendTemplatedEmail"]
        Resource = "*"
      }
    ]
  })
}

# ── CloudWatch Log Groups ──────────────────────────
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}/api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project_name}/web"
  retention_in_days = 14
}

# ── API Task Definition ────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family             = "${var.project_name}-api"
  execution_role_arn = aws_iam_role.ecs_task_execution.arn
  task_role_arn      = aws_iam_role.ecs_task.arn
  network_mode       = "bridge"

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${var.ecr_api_url}:latest"
    cpu       = 512
    memory    = 1024
    essential = true

    portMappings = [{
      containerPort = 4000
      hostPort      = 0  # Dynamic port mapping
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "4000" },
      { name = "DATABASE_URL", value = "postgresql://${var.db_username}:${var.db_password}@${var.rds_endpoint}/${var.db_name}" },
      { name = "REDIS_URL", value = "redis://${var.redis_endpoint}" },
    ]

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:4000/api/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

# ── Web Task Definition ────────────────────────────
resource "aws_ecs_task_definition" "web" {
  family             = "${var.project_name}-web"
  execution_role_arn = aws_iam_role.ecs_task_execution.arn
  network_mode       = "bridge"

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${var.ecr_web_url}:latest"
    cpu       = 512
    memory    = 1024
    essential = true

    portMappings = [{
      containerPort = 3000
      hostPort      = 0
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
    ]

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.web.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "web"
      }
    }
  }])
}

# ── API Service ─────────────────────────────────────
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = 4000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ── Web Service ─────────────────────────────────────
resource "aws_ecs_service" "web" {
  name            = "${var.project_name}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }

  load_balancer {
    target_group_arn = var.web_target_group_arn
    container_name   = "web"
    container_port   = 3000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}
```

### 9.5 Key Module: ALB

```hcl
# infra/modules/alb/main.tf

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  tags = { Name = "${var.project_name}-alb" }
}

# ── Target Groups ──────────────────────────────────
resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }

  # Sticky sessions — required for Socket.IO WebSocket handshake
  # Socket.IO starts with long-polling (multiple HTTP requests), then upgrades
  # to WebSocket. All requests must hit the same ECS task during handshake.
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400  # 24 hours
    enabled         = true
  }

  deregistration_delay = 30
}

resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-web-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }

  deregistration_delay = 30
}

# ── HTTPS Listener ──────────────────────────────────
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# ── Path-based routing ──────────────────────────────
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern { values = ["/api/*"] }
  }
}

resource "aws_lb_listener_rule" "websocket" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern { values = ["/socket.io/*"] }
  }
}

# ── HTTP → HTTPS Redirect ──────────────────────────
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
```

```hcl
# infra/modules/alb/outputs.tf

output "dns_name"             { value = aws_lb.main.dns_name }
output "zone_id"              { value = aws_lb.main.zone_id }
output "arn"                  { value = aws_lb.main.arn }
output "api_target_group_arn" { value = aws_lb_target_group.api.arn }
output "web_target_group_arn" { value = aws_lb_target_group.web.arn }
```

### 9.6 Key Module: RDS

```hcl
# infra/modules/rds/main.tf

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "${var.project_name}-db-subnet-group" }
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-pg16-params"
  family = "postgres16"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.project_name}-postgres"
  engine         = "postgres"
  engine_version = "16.4"

  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  publicly_accessible = false

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  skip_final_snapshot      = true
  delete_automated_backups = true
  deletion_protection      = false

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = { Name = "${var.project_name}-postgres" }

  lifecycle {
    ignore_changes = [password]
  }
}
```

### 9.7 Key Module: ElastiCache Redis

```hcl
# infra/modules/elasticache/main.tf

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.project_name}-redis-subnet-group" }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1          # Single node for demo (no replication)
  port                 = 6379

  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [var.redis_security_group_id]

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false  # false = simpler connection string (no TLS)
                                      # set true in production

  # Maintenance
  maintenance_window   = "sun:05:00-sun:06:00"

  # No snapshots needed (ephemeral data)
  snapshot_retention_limit = 0

  tags = { Name = "${var.project_name}-redis" }
}
```

```hcl
# infra/modules/elasticache/variables.tf

variable "project_name"          { type = string }
variable "environment"           { type = string }
variable "private_subnet_ids"    { type = list(string) }
variable "redis_security_group_id" { type = string }
variable "node_type" {
  type    = string
  default = "cache.t3.micro"  # Free tier eligible (750h/mo for 12 months)
}
```

```hcl
# infra/modules/elasticache/outputs.tf

output "endpoint" {
  description = "Redis endpoint (host:port)"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
}

output "address" {
  description = "Redis hostname"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "port" {
  description = "Redis port"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}
```

---

## 10. Monitoring & Observability

### 10.1 CloudWatch Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                    IELTS AI Platform Dashboard                   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ ECS API      │  │ ECS Web      │  │ ALB                  │  │
│  │ CPU: 34%     │  │ CPU: 22%     │  │ Req/min: 120         │  │
│  │ Memory: 56%  │  │ Memory: 41%  │  │ 5xx errors: 0        │  │
│  │ Tasks: 1/1   │  │ Tasks: 1/1   │  │ Latency p99: 250ms   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ RDS          │  │ Redis        │  │ SQS Queues           │  │
│  │ Connections:8│  │ Connections:4│  │ email: 0             │  │
│  │ CPU: 12%     │  │ Memory: 22%  │  │ notif: 2             │  │
│  │ Free Stor:18G│  │ Pub/Sub ch:6 │  │ file:  0             │  │
│  │ Read IOPS: 5 │  │ Evictions: 0 │  │ DLQ total: 0         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐  │
│  │ Lambda       │  │ WebSocket (via Redis adapter)            │  │
│  │ email: 0 err │  │ Connected clients: 12                   │  │
│  │ notif: 0 err │  │ Rooms active: 5                         │  │
│  │ file:  0 err │  │ Messages/min: 34                        │  │
│  │ Inv: 45/day  │  │ Cross-task fanouts: 8/min               │  │
│  └──────────────┘  └──────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 CloudWatch Alarms

| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| ECS API High CPU | CPUUtilization | > 80% for 5 min | SNS → email |
| ECS API Unhealthy | HealthyHostCount | < 1 for 2 min | SNS → email |
| ALB 5xx Spike | HTTPCode_Target_5XX_Count | > 10 in 5 min | SNS → email |
| RDS High CPU | CPUUtilization | > 80% for 5 min | SNS → email |
| RDS Low Storage | FreeStorageSpace | < 2 GB | SNS → email |
| RDS High Connections | DatabaseConnections | > 50 | SNS → email |
| Redis High Memory | DatabaseMemoryUsagePercentage | > 80% | SNS → email |
| Redis Evictions | Evictions | > 0 for 5 min | SNS → email |
| SQS DLQ Not Empty | ApproximateNumberOfMessagesVisible | > 0 | SNS → email |
| Lambda Errors | Errors | > 3 in 5 min | SNS → email |

### 10.3 Log Groups

| Log Group | Source | Retention |
|-----------|--------|-----------|
| `/ecs/ielts-ai/api` | API containers | 14 days |
| `/ecs/ielts-ai/web` | Web containers | 14 days |
| `/ecs/agent` | ECS agent on EC2 | 7 days |
| `/lambda/email-worker` | Email Lambda | 14 days |
| `/lambda/notification-worker` | Notification Lambda | 14 days |
| `/lambda/file-processor` | File processor Lambda | 14 days |
| `/alb/ielts-ai` | ALB access logs | 30 days |

---

## 11. Cost Estimation

### 11.1 Monthly Cost (Active Development / Demo)

| Resource | Config | Monthly Cost |
|----------|--------|-------------|
| **EC2 (ECS)** | 1x t3.medium (free tier: t3.micro) | $0-30 |
| **ALB** | 1 ALB + LCUs | ~$18 |
| **RDS** | db.t3.micro (free tier) | $0-13 |
| **RDS Storage** | 20 GB gp3 | ~$2.30 |
| **NAT Gateway** | 1x single-AZ | ~$32 |
| **NAT Data Transfer** | ~5 GB | ~$0.23 |
| **CloudFront** | Low traffic (free tier: 1TB) | $0-1 |
| **Route 53** | 1 hosted zone | $0.50 |
| **ECR** | ~2 GB images | $0.20 |
| **S3** | < 5 GB | $0.12 |
| **SQS** | Free tier (1M requests) | $0 |
| **SNS** | Free tier (1M publishes) | $0 |
| **Lambda** | Free tier (1M requests) | $0 |
| **ElastiCache Redis** | cache.t3.micro (free tier) | $0-13 |
| **SES** | Free tier (from EC2) | $0 |
| **CloudWatch** | Logs + basic metrics | ~$2-5 |
| **EBS** | 30 GB gp3 | ~$2.40 |
| **Elastic IP (NAT)** | 1 EIP | $0 (attached) |
| | | |
| **Total (free tier)** | First 12 months | **~$55-60/mo** |
| **Total (post free tier)** | After 12 months | **~$115-125/mo** |

### 11.2 Cost Optimization Strategy

| Strategy | Savings | When to Use |
|----------|---------|-------------|
| **Stop ECS ASG to 0** (zero instances) | -$30/mo on EC2 | When not demoing |
| **Stop RDS** (manual stop, auto-starts after 7 days) | -$13/mo | When not demoing |
| **Use t3.micro for ECS** | -$15/mo vs t3.medium | If 1 service at a time |
| **Delete NAT GW when not needed** | -$32/mo | Biggest single savings |
| **Reserved Instance (1yr)** | -40% on EC2 + RDS | If running long-term |
| **Scheduled scaling** | Scale ASG to 0 at night | Automated cost savings |

### 11.3 "Demo Day" vs "Off" Mode

```
Demo Day (everything running):     ~$3-4/day
Off Mode (stopped, not destroyed): ~$1-2/day (just storage + Route 53)
```

---

## 12. STOP vs DESTROY Strategy

### 12.1 After Demo — What to STOP (keep state, resume later)

| Resource | Action | State Preserved | Resume Time |
|----------|--------|----------------|-------------|
| ECS Services | Set desired count → 0 | Task definitions kept | 1-2 min |
| EC2 ASG | Set min/max/desired → 0 | Launch template kept | 2-3 min |
| RDS | `aws rds stop-db-instance` | Data + snapshots kept | 5-10 min |
| ElastiCache | Delete cluster (stateless/ephemeral) | Recreate via Terraform | 5-8 min |
| NAT Gateway | Delete (stateless) | Recreate via Terraform | 2-3 min |

**Stop script** (`scripts/stop-infra.sh`):
```bash
#!/bin/bash
# Stop ECS services
aws ecs update-service --cluster ielts-ai-cluster --service ielts-api --desired-count 0
aws ecs update-service --cluster ielts-ai-cluster --service ielts-web --desired-count 0

# Scale ASG to 0
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name ielts-ai-ecs-asg \
  --min-size 0 --max-size 0 --desired-capacity 0

# Stop RDS (auto-restarts after 7 days — re-stop if needed)
aws rds stop-db-instance --db-instance-identifier ielts-ai-postgres

# Delete ElastiCache (ephemeral data — no backup needed, recreate via Terraform)
aws elasticache delete-cache-cluster --cache-cluster-id ielts-ai-redis

echo "Infrastructure stopped. Costs reduced to ~$1-2/day (storage only)."
echo "To resume: run start-infra.sh (ElastiCache needs terraform apply to recreate)"
```

**Resume script** (`scripts/start-infra.sh`):
```bash
#!/bin/bash
# Start RDS
aws rds start-db-instance --db-instance-identifier ielts-ai-postgres

# Wait for RDS
aws rds wait db-instance-available --db-instance-identifier ielts-ai-postgres

# Scale ASG back
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name ielts-ai-ecs-asg \
  --min-size 1 --max-size 3 --desired-capacity 1

# Wait for EC2 instance to join ECS
sleep 60

# Start ECS services
aws ecs update-service --cluster ielts-ai-cluster --service ielts-api --desired-count 1
aws ecs update-service --cluster ielts-ai-cluster --service ielts-web --desired-count 1

echo "Infrastructure started. Full availability in 5-10 minutes."
```

### 12.2 Project Done — What to DESTROY

```bash
# Destroy everything
cd infra
terraform destroy

# This removes:
# - VPC, subnets, IGW, NAT, route tables, security groups
# - ECS cluster, services, task definitions
# - EC2 instances (ASG)
# - ALB, target groups, listeners
# - RDS instance (data lost!)
# - ECR repositories (images lost!)
# - S3 buckets (files lost!)
# - CloudFront distribution
# - Route 53 records
# - SNS/SQS queues
# - Lambda functions
# - IAM roles
# - CloudWatch log groups

# Total cost after destroy: $0/mo
# Only Route 53 hosted zone ($0.50/mo) persists if you keep the domain
```

### 12.3 What to Backup Before Destroy

```bash
# 1. Database dump
pg_dump -h <rds-endpoint> -U ielts_user ielts > final-backup.sql

# 2. S3 uploads
aws s3 sync s3://ielts-ai-uploads-prod ./backup/uploads/

# 3. Terraform state (already in git or S3)
cp terraform.tfstate terraform.tfstate.final-backup
```

---

## 13. Risk Analysis & Common Failure Points

### 13.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **NAT Gateway failure** | Low | High (ECS can't pull images) | Single-AZ is accepted risk for demo |
| **EC2 instance failure** | Low | High (all services down) | ASG replaces automatically |
| **RDS failure** | Very Low | Critical (data loss) | Automated backups, 7-day retention |
| **ECS task OOM kill** | Medium | Medium (service restart) | Memory limits + health checks |
| **ALB target unhealthy** | Medium | Medium (5xx errors) | Health checks, rolling deploys |
| **Docker image pull failure** | Low | High (deploy fails) | ECR in same region, retry policy |
| **SQS message loss** | Very Low | Low | DLQ catches failed messages |
| **Redis node failure** | Low | High (WS fanout stops, presence lost) | Ephemeral data, ECS tasks fall back to local-only delivery. Reconnect recovers state |
| **Lambda cold start** | High | Low (200-500ms delay) | Acceptable for async tasks |
| **SSL cert expiry** | Very Low | High | ACM auto-renews |
| **Cost overrun** | Medium | Medium | Billing alerts, stop scripts |

### 13.2 Single Points of Failure (Honest Assessment)

For a thesis project, these are **accepted trade-offs**:

| SPOF | Production Solution | Why We Accept It |
|------|-------------------|-----------------|
| Single NAT Gateway | Multi-AZ NAT | Cost: $32/mo × 2 = $64 |
| Single-AZ RDS | Multi-AZ RDS | Cost: $13 → $26/mo |
| 1 ECS instance | 2+ across AZs | Cost: $30 → $60/mo |
| Single Redis node | Redis replication group | Cost: $13 → $26/mo. Ephemeral data — failure is recoverable |
| Single CloudFront origin | Origin failover | Complexity vs. demo needs |

**Talking point**: "I designed this as single-AZ to optimize costs for a demo environment, but the architecture is ready to scale to multi-AZ by simply changing Terraform variables."

---

## 14. Technical Talking Points for Thesis Defense

### 14.1 Architecture Decisions

1. **"Why ECS EC2 instead of Fargate?"**
   - Demonstrates understanding of EC2 lifecycle, ASG, capacity providers
   - Can SSH into instances for debugging — shows operational depth
   - More control over instance types, EBS, networking
   - Cost optimization: can stop instances entirely

2. **"Why not Kubernetes (EKS)?"**
   - EKS control plane costs $74/mo — overkill for 2 services
   - ECS provides the same orchestration benefits at lower complexity
   - Shows pragmatic architecture decision-making
   - "I would consider EKS if we had 10+ microservices"

3. **"Why CloudFront in front of ALB?"**
   - Edge caching reduces origin load
   - WAF integration for security (SQL injection, XSS protection)
   - DDoS protection via AWS Shield Standard (free)
   - Global CDN for static assets
   - SSL termination at edge = lower latency

4. **"Why SNS + SQS + Lambda instead of just calling SES directly?"**
   - Demonstrates event-driven architecture pattern
   - Decouples API from email delivery (API responds faster)
   - DLQ ensures no message is lost
   - Lambda scales independently from API
   - Same pattern used by Netflix, Uber, etc.

### 14.2 Security Talking Points

5. **"How do you handle security?"**
   - Private subnets for ECS + RDS — no direct internet exposure
   - Security groups follow least-privilege (RDS only accepts from ECS SG)
   - IAM roles per service — task role vs execution role separation
   - S3 presigned URLs — no long-lived credentials for file uploads
   - RDS encrypted at rest + in transit
   - ALB SSL with TLS 1.3 policy
   - GitHub OIDC — no stored AWS keys

6. **"What about secrets management?"**
   - DATABASE_URL via ECS task definition environment (encrypted in transit)
   - Could use AWS Secrets Manager or SSM Parameter Store for rotation
   - No secrets in source code or Docker images

### 14.3 Scalability Talking Points

7. **"How does this scale?"**
   - ECS auto-scaling: service-level (task count) + cluster-level (EC2 count)
   - ALB distributes traffic across multiple tasks
   - RDS can scale vertically (db.t3.micro → db.r6g.large) without downtime
   - SQS naturally handles traffic spikes — messages queue up
   - Lambda auto-scales to handle queue backlog
   - CloudFront absorbs traffic spikes at edge

8. **"How do WebSockets work with multiple server instances?"**
   - Socket.IO connections are stateful — pinned to one ECS task
   - Problem: User A on Task 1 sends a message, User B on Task 2 never sees it
   - Solution: `@socket.io/redis-adapter` uses Redis Pub/Sub for cross-task fanout
   - When Task 1 emits to a room, Redis broadcasts to ALL tasks subscribing to that channel
   - Each task delivers the message to its own local WebSocket clients
   - ALB sticky sessions ensure the initial handshake + upgrade hit the same task
   - Redis also stores ephemeral state: user presence (TTL 60s), typing indicators (TTL 3s), room membership sets
   - PostgreSQL stores permanent data: messages, read receipts, conversation history
   - This is the same pattern used by Slack, Discord, and other real-time platforms

9. **"What if you need to add a new microservice?"**
   - Add new ECR repository, task definition, ECS service
   - Add ALB listener rule for new path
   - Add new Terraform module
   - CI/CD pipeline is already templated — copy deploy workflow

### 14.4 DevOps Talking Points

10. **"Explain your CI/CD pipeline"**
   - GitHub Actions with OIDC — no stored credentials
   - Path-based triggers — only rebuilds changed services
   - Docker multi-stage builds — smaller images
   - ECS rolling deployment — zero-downtime updates
   - Terraform plan on PR — infrastructure review before apply
   - Separate pipelines: app deploy vs infra changes

11. **"How do you handle database migrations?"**
    - Prisma migrate deploy runs as ECS one-off task after deploy
    - Migration runs in same VPC as RDS — no public exposure
    - Rollback: `prisma migrate resolve --rolled-back`

### 14.5 Cost & Operations Talking Points

12. **"How much does this cost?"**
    - Free tier: ~$55/mo — demonstrate understanding of AWS free tier
    - Stop/start scripts reduce cost to ~$1-2/day when not in use
    - `terraform destroy` brings cost to $0 — full IaC advantage
    - "In production, Reserved Instances would reduce cost by 40%"

13. **"How do you monitor this?"**
    - CloudWatch Logs for all containers and Lambda
    - CloudWatch Metrics dashboard with key indicators
    - Alarms with SNS email notifications
    - Container Insights for ECS cluster-level visibility
    - RDS Performance Insights for query analysis

---

## 15. GitHub Secrets Required

| Secret | Description | Source |
|--------|-------------|--------|
| `AWS_ROLE_ARN` | IAM role for GitHub OIDC | `terraform output github_actions_role_arn` |
| `ECR_REGISTRY` | ECR registry URL | `terraform output ecr_registry` |
| `NEXT_PUBLIC_API_URL` | Public URL | `https://ielts-platform.com` |

---

## 16. Implementation Order

### Phase 1 — Foundation (Day 1-2)
1. Install Terraform, configure AWS CLI
2. Create `infra/` with networking, ECR modules
3. `terraform apply` — VPC, subnets, security groups, ECR repos
4. Verify networking: subnets, route tables, NAT Gateway

### Phase 2 — Data Layer (Day 2-3)
5. Add RDS module, S3 module
6. `terraform apply` — RDS (wait 5-10 min), S3 buckets
7. Verify RDS connectivity from a test EC2

### Phase 3 — Compute Layer (Day 3-4)
8. Add ALB module, ECS module
9. Create task definitions, services
10. `terraform apply` — ALB, ECS cluster, ASG, services
11. Push Docker images to ECR manually for first deploy
12. Verify ALB routing: `/api/*` → API, `/*` → Web

### Phase 4 — Edge & CDN (Day 4-5)
13. Add CloudFront module, DNS module
14. Create ACM certificates (us-east-1 for CloudFront)
15. `terraform apply` — CloudFront, Route 53 records
16. Verify end-to-end: domain → CloudFront → ALB → ECS → RDS

### Phase 5 — Async Layer (Day 5-6)
17. Add messaging module (SNS, SQS)
18. Add Lambda module, write Lambda functions
19. `terraform apply` — queues, topics, Lambda functions
20. Test event flow: API → SNS → SQS → Lambda → SES

### Phase 6 — CI/CD (Day 6-7)
21. Add IAM module (GitHub OIDC)
22. Create GitHub Actions workflows
23. Add GitHub secrets
24. Test full CI/CD: push → build → ECR → ECS rolling deploy

### Phase 7 — Monitoring & Hardening (Day 7)
25. Add monitoring module (CloudWatch dashboard, alarms)
26. Create stop/start scripts
27. Test stop → resume cycle
28. Document architecture for thesis

---

## 17. Application Code Structure (Updated)

```
ielts-ai-platform/
├── package.json
├── infra/                          # Terraform (12 modules)
├── scripts/
│   ├── stop-infra.sh               # Stop all resources
│   └── start-infra.sh              # Resume all resources
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── health/             # GET /api/health (ALB check)
│   │   │   ├── uploads/            # S3 presigned URL generation
│   │   │   └── notifications/      # SNS publish
│   │   └── prisma/
│   ├── web/                        # Next.js frontend
│   │   └── Dockerfile
│   └── lambdas/                    # Lambda functions
│       ├── email-worker/
│       ├── notification-worker/
│       └── file-processor/
├── .github/
│   └── workflows/
│       ├── ci.yml                  # PR validation
│       ├── deploy-api.yml          # API → ECR → ECS
│       ├── deploy-web.yml          # Web → ECR → ECS
│       ├── deploy-lambdas.yml      # Lambda zip deploy
│       └── infra.yml               # Terraform plan/apply
└── docker-compose.yml              # Local development
```

---

## 18. `.gitignore` Additions

```gitignore
# Terraform
infra/.terraform/
infra/*.tfstate
infra/*.tfstate.backup
infra/*.tfplan
infra/terraform.tfvars
infra/.terraform.lock.hcl

# SSH keys
*.pem

# Lambda build artifacts
apps/lambdas/*/dist/
apps/lambdas/*/*.zip
```
