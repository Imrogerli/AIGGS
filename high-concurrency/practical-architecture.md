# AIggs 精简落地架构方案 v1.0

**编写日期:** 2026-03-27
**适用范围:** 0-1000 万用户渐进式扩展
**核心原则:** 剃刀原理 + 全世界模式 + Docker 优先 + 无 K8s（Phase 1-3）

---

## 1. 设计原则

### 1.1 剃刀原则
能不加的组件坚决不加。反面例子：
- **不用 WebSocket**：养鸡游戏不是实时对战，用户间无直接竞争。HTTP 短轮询 + SSE 足够，降低运维复杂度 50%。
- **不用 3 层缓存**：进程 LRU + Redis 已可应对 100 万并发，三层缓存引入的锁竞争反而降速。
- **不用 K8s（Phase 1-3）**：K8s 学习成本高、故障难排查。Docker Compose 足以支撑 100 万用户。

### 1.2 渐进式扩展
从 7 台机器向 100 万并发递进，每个 Phase 都是前一个的平滑升级：
- **Phase 1**（0-10 万用户）：单点部署，无分布式锁
- **Phase 2**（10-50 万）：加读从库和 Sentinel
- **Phase 3**（50-100 万）：数据库集群、Redis Cluster、微服务拆分
- **Phase 4**（100 万+）：完整 K8s 多区域部署

### 1.3 全世界模式 vs 分片
不分片、不按地区分组，所有玩家在同一个数据空间竞争：
- **为什么？** AI 交互高频，分片会破坏全局排行榜、偷蛋跨区协议、统一兑换市场。
- **可行性？** 用好数据库 + 缓存 + 批处理，100 万并发完全可撑。
- **成本？** 按剃刀原理，后期可选择地理分片（如中国区单独部署），但初期不必。

### 1.4 Docker 优先，不上 K8s（直到 Phase 4）
- **Phase 1-3**：Docker Compose + 简单 Systemd 自启
- **Phase 4**：AWS ECS 或 K8s，由此时的 DevOps 团队决策
- **好处**：学习曲线平缓，故障排查用 `docker logs`，扩容只需加机器 + 调 Compose

---

## 2. Phase 1 基础架构（0-10 万用户，7 台服务器）

### 2.1 服务器角色分配

| 服务器 | 配置 | 角色 | 部署内容 |
|--------|------|------|---------|
| 服务器 1 | t3.2xlarge | App Node 1 | Node.js App + Docker |
| 服务器 2 | t3.2xlarge | App Node 2 | Node.js App + Docker（热备） |
| 服务器 3 | r6i.4xlarge | PostgreSQL 主 | DB Master，SSD 500GB |
| 服务器 4 | r6i.4xlarge | PostgreSQL 从 | DB Replica，异步同步 |
| 服务器 5 | r6i.2xlarge | Redis 主 | Redis Master，主键数据 |
| 服务器 6 | r6i.2xlarge | Redis 从 | Redis Replica，备用 + 读 |
| 服务器 7 | t3.xlarge | Monitoring + MQ | CloudWatch Agent + Nginx + 简单 Job Queue |

**成本估算（AWS 按需）：**
```
App × 2:     t3.2xlarge × 2 × $0.3328/h × 730h = $486
DB × 2:      r6i.4xlarge × 2 × $1.44/h × 730h = $2,102
Redis × 2:   r6i.2xlarge × 2 × $0.72/h × 730h = $1,051
Monitor:     t3.xlarge × $0.1664/h × 730h = $121
EBS 存储:    5 × 500GB = 2.5TB × $0.1/GB/月 = $250
网络出口:    ~200GB/月 × $0.09 = $18
─────────────────────────────
小计: ~2000 美元/月
```

### 2.2 技术栈

| 组件 | 选择 | 理由 |
|------|------|------|
| 后端语言 | Node.js + TypeScript | 开发快、库丰富，容易协议化 |
| Web 框架 | Express.js | 轻量、稳定、中间件生态完善 |
| 数据库 | PostgreSQL | ACID 保证、JSON 支持、复杂查询 |
| 缓存 | Redis | 单线程原子操作、Lua 脚本、Sentinel 支持 |
| 消息队列 | 内存 Priority Queue（Phase 1） | 无网络开销，Restart 时可加持久化 |
| 容器化 | Docker + Docker Compose | 便携性好、开发=生产环境一致 |
| Web 流量 | Nginx（七层 LB） | 反向代理、会话粘性、健康检查 |
| 监控 | AWS CloudWatch + Shell 脚本 | 简洁，不依赖 Prometheus 复杂部署 |

### 2.3 HTTP 短轮询 + SSE 架构

**为什么不用 WebSocket？**
- 养鸡游戏：用户操作间隔长（产蛋 8h、偷蛋日 2 次）
- 用户端：大多数客户端是移动 App 或轻 Web，都支持 HTTP
- 成本：Socket.IO 需维持连接、内存占用高；HTTP 无状态、可伸缩
- 推送需求：只需通知用户"蛋产了"或"被偷了"，延迟 1-5 秒可接受

**实现方案：**
```typescript
// 服务端：SSE 推送（用于实时通知）
app.get('/api/events/user/:userId', (req, res) => {
  const userId = req.params.userId;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 连接客户端到事件广播队列
  const clientConnection = new SSEClient(userId);
  eventBus.subscribe(userId, clientConnection);

  // 心跳，保活连接
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.unsubscribe(userId, clientConnection);
  });
});

// 事件推送示例
function notifyEggProduced(userId: string, eggCount: number) {
  eventBus.publish(userId, {
    type: 'egg_produced',
    data: { eggCount, timestamp: Date.now() }
  });
}

// 客户端：轮询 + SSE
setInterval(async () => {
  // 短轮询：检查用户状态、排行榜（强一致性数据）
  const state = await fetch(`/api/user/${userId}/state`).then(r => r.json());
  updateUI(state);
}, 5000); // 5 秒一次

// SSE 监听：实时推送，延迟可控
const eventSource = new EventSource(`/api/events/user/${userId}`);
eventSource.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'egg_produced') {
    showNotification(`产蛋成功！+${data.eggCount}`);
  }
};
```

### 2.4 两层缓存设计

**为什么是两层而不是三层？**

三层缓存（本地 LRU + Redis + DB）的问题：
1. **缓存失效链太长**：更新时需同时失效 LRU 和 Redis，易遗漏
2. **锁竞争激增**：3 层中间多一层，更新时需多一次锁操作
3. **脏数据风险**：LRU 在内存中不共享，不同 App 节点数据可能不一致

**两层方案（本地 LRU + Redis）：**

```typescript
// LRU Cache（进程内，缓存热点数据）
const lruCache = new LRU<string, any>({
  max: 10000,  // 最多 10k 条记录
  ttl: 60000   // 60 秒过期
});

// 数据访问流程
async function getUserFarm(userId: string): Promise<Farm> {
  // 1. 检查本地 LRU
  const cached = lruCache.get(`farm:${userId}`);
  if (cached) {
    return cached;
  }

  // 2. 检查 Redis
  const redisData = await redis.get(`farm:${userId}`);
  if (redisData) {
    const parsed = JSON.parse(redisData);
    lruCache.set(`farm:${userId}`, parsed);
    return parsed;
  }

  // 3. 查询数据库
  const farm = await db.query(
    'SELECT * FROM farms WHERE user_id = $1',
    [userId]
  );

  // 4. 写回两层缓存
  lruCache.set(`farm:${userId}`, farm);
  await redis.setex(`farm:${userId}`, 300, JSON.stringify(farm)); // 5 分钟

  return farm;
}

// 更新农场时：清除两层缓存
async function updateFarm(userId: string, updates: Partial<Farm>) {
  await db.query('UPDATE farms SET ... WHERE user_id = $1', [userId, ...]);
  lruCache.delete(`farm:${userId}`);
  await redis.del(`farm:${userId}`);
}
```

**缓存策略：**
- **强一致性操作**（EGGS 余额、偷蛋、兑换）：**直读 DB + Redis 原子操作**，不走 LRU
- **弱一致性操作**（排行榜、用户统计）：走完整两层缓存，允许 1-5 分钟延迟

### 2.5 产蛋系统深度设计（重点）

**需求回顾：**
- 1000 万用户设计容量
- 全世界模式，不分片
- 母鸡每 8 小时产蛋一次

**Phase 1 方案：批量 UPDATE + Redis 原子计数器**

**数据库设计：**
```sql
-- 农场表
CREATE TABLE farms (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  chicken_count INT NOT NULL DEFAULT 1,
  eggs INT NOT NULL DEFAULT 0,
  last_egg_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_farms_last_egg_time ON farms(last_egg_time);

-- 产蛋记录表（可选，用于审计）
CREATE TABLE egg_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  egg_count INT NOT NULL,
  produced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**产蛋 Job（每 5 分钟运行一次，处理应产蛋的玩家）：**

```typescript
// 1. 找出满足条件的玩家（距离上次产蛋 >= 8h）
async function triggerEggProduction() {
  const eightHoursAgo = new Date(Date.now() - 8 * 3600 * 1000);

  // 分批查询，避免一次性加载百万级别数据
  const batchSize = 10000;
  let offset = 0;

  while (true) {
    const farms = await db.query(
      `SELECT id, user_id, chicken_count
       FROM farms
       WHERE last_egg_time < $1
       ORDER BY id
       LIMIT $2 OFFSET $3`,
      [eightHoursAgo, batchSize, offset]
    );

    if (farms.length === 0) break;

    // 2. 批量更新
    await db.query(
      `UPDATE farms
       SET eggs = eggs + chicken_count,
           last_egg_time = now(),
           updated_at = now()
       WHERE user_id = ANY($1)`,
      [farms.map(f => f.user_id)]
    );

    // 3. 推送通知（异步，不阻塞更新）
    for (const farm of farms) {
      const eggCount = farm.chicken_count;
      await jobQueue.enqueue({
        type: 'notify_egg_produced',
        userId: farm.user_id,
        eggCount,
        timestamp: Date.now()
      });
    }

    offset += batchSize;
  }

  logger.info(`Egg production done: processed ${offset} farms`);
}

// 4. 异步通知任务
async function processNotificationJob(job: Job) {
  const { userId, eggCount } = job.data;

  // 更新 Redis 计数器（用于首页统计）
  await redis.hincrby('user_stats', userId, eggCount);

  // SSE 推送
  eventBus.publish(userId, {
    type: 'egg_produced',
    data: { eggCount, timestamp: Date.now() }
  });

  // 清除用户农场缓存
  await redis.del(`farm:${userId}`);
  lruCache.delete(`farm:${userId}`);
}

// Job 队列（本地内存，Phase 1）
class JobQueue {
  private queue: Job[] = [];

  enqueue(data: any) {
    this.queue.push({ data, createdAt: Date.now() });
  }

  async process() {
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await processNotificationJob(job);
      } catch (e) {
        logger.error('Job failed', e, job);
        // Phase 2 可加 DLQ（死信队列）
      }
    }
  }
}
```

**成本分析（1000 万用户，100 万并发产蛋）：**
- **数据库：** 批量 UPDATE 语句，一次可处理 10k 用户，共需 1000 次 UPDATE，每次 ~100ms = 总耗时 100 秒（可接受，运行在非尖峰）
- **缓存：** 1000 万用户的计数器 = 100MB Redis 内存，可接受
- **网络：** 100 万推送，每个 100 字节 = 100MB，完全可管

### 2.6 偷蛋系统（核心博弈）

**需求：** 每用户每日 2 次偷蛋机会，概率 30% 成功，失败无消耗。

**方案：Redis Lua 脚本 + 乐观锁（不用分布式锁）**

```typescript
// Redis Lua 脚本：原子操作，无竞争
const stealEggScript = `
-- 参数：
-- KEYS[1]: 小偷 ID
-- KEYS[2]: 被偷者 ID
-- ARGV[1]: 当前时间戳
-- ARGV[2]: 随机数（0-100）
-- ARGV[3]: 成功概率阈值（30）

local thief_id = KEYS[1]
local victim_id = KEYS[2]
local now = tonumber(ARGV[1])
local rand = tonumber(ARGV[2])
local success_threshold = tonumber(ARGV[3])

-- 检查偷蛋次数（每日 2 次）
local steal_count_key = 'steal_count:' .. thief_id .. ':' .. os.date('%Y%m%d', now)
local steal_count = tonumber(redis.call('GET', steal_count_key) or 0)

if steal_count >= 2 then
  return {0, 'exceed_daily_limit'}
end

-- 增加次数计数
redis.call('INCR', steal_count_key)
redis.call('EXPIRE', steal_count_key, 86400)

-- 判断成功（30% 概率）
if rand > success_threshold then
  return {0, 'failed', victim_id}
end

-- 成功：从受害者偷走 EGGS，最多偷 50% 或上限 100
local victim_eggs_key = 'farm:' .. victim_id .. ':eggs'
local victim_eggs = tonumber(redis.call('GET', victim_eggs_key) or 0)
local steal_amount = math.floor(victim_eggs * 0.5)
if steal_amount > 100 then steal_amount = 100 end

if steal_amount <= 0 then
  return {0, 'victim_empty', victim_id}
end

-- 转移 EGGS
redis.call('DECRBY', victim_eggs_key, steal_amount)
redis.call('INCRBY', 'farm:' .. thief_id .. ':eggs', steal_amount)

-- 记录日志
redis.call('LPUSH', 'steal_log:' .. victim_id,
  cjson.encode({thief_id = thief_id, amount = steal_amount, time = now}))

return {1, 'success', steal_amount}
`;

// 执行偷蛋
async function stealEggs(thiefId: string, victimId: string): Promise<StealResult> {
  const now = Date.now();
  const rand = Math.random() * 100;
  const successThreshold = 30;

  const [success, message, data] = await redis.eval(
    stealEggScript,
    2,
    thiefId,
    victimId,
    now,
    Math.floor(rand),
    successThreshold
  ) as [number, string, any];

  if (success === 1) {
    // 异步同步到数据库（稍后一致性）
    jobQueue.enqueue({
      type: 'sync_steal_to_db',
      thiefId,
      victimId,
      amount: data,
      timestamp: now
    });

    // 清除缓存
    await redis.del(`farm:${thiefId}`, `farm:${victimId}`);
    lruCache.delete(`farm:${thiefId}`);
    lruCache.delete(`farm:${victimId}`);

    return {
      success: true,
      message: 'You stole ' + data + ' eggs!',
      stolenAmount: data
    };
  } else {
    if (message === 'failed') {
      return {
        success: false,
        message: 'Steal failed, victim laughed at you!',
        stolenAmount: 0
      };
    } else if (message === 'exceed_daily_limit') {
      return {
        success: false,
        message: 'You have reached your daily steal limit (2 times)',
        stolenAmount: 0
      };
    } else {
      return {
        success: false,
        message: 'Victim has no eggs to steal!',
        stolenAmount: 0
      };
    }
  }
}
```

**为什么用 Lua 而不是分布式锁？**
1. **性能：** Lua 脚本在 Redis 内部执行，单次往返，无网络开销
2. **原子性：** 脚本执行期间 Redis 不处理其他命令，保证一致性
3. **简洁：** 分布式锁需维护加锁、解锁、超时，易死锁
4. **可扩展：** Lua 脚本可处理数千并发，远超 Phase 1 需求

**乐观锁（如需版本检查）：**
```sql
-- 如果 EGGS 在 Redis 中被修改，同步到 DB 时版本不符则重试
UPDATE farms
SET eggs = eggs + $1, updated_at = now()
WHERE user_id = $2 AND version = $3
RETURNING version;
```

### 2.7 完整 Docker Compose 配置

```yaml
version: '3.8'

services:
  # PostgreSQL Master
  postgres-master:
    image: postgres:15-alpine
    container_name: postgres-master
    environment:
      POSTGRES_USER: aiggs
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: aiggs_db
    volumes:
      - postgres-master-data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    command: >
      postgres
      -c max_connections=500
      -c shared_buffers=4GB
      -c effective_cache_size=12GB
      -c wal_level=replica
      -c max_wal_senders=3
      -c wal_keep_size=1GB
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiggs"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - aiggs-network

  # PostgreSQL Replica
  postgres-replica:
    image: postgres:15-alpine
    container_name: postgres-replica
    environment:
      POSTGRES_USER: aiggs
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: aiggs_db
      PGUSER: aiggs
    volumes:
      - postgres-replica-data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    command: >
      bash -c "
      until pg_basebackup -h postgres-master -D /var/lib/postgresql/data -U aiggs -v -W -P; do
        echo 'Waiting for master...'; sleep 1s;
      done;
      echo 'standby_mode = on' >> /var/lib/postgresql/data/recovery.conf;
      postgres
      "
    depends_on:
      - postgres-master
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiggs"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - aiggs-network

  # Redis Master
  redis-master:
    image: redis:7-alpine
    container_name: redis-master
    command: >
      redis-server
      --appendonly yes
      --appendfsync everysec
      --maxmemory 4gb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis-master-data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - aiggs-network

  # Redis Replica
  redis-replica:
    image: redis:7-alpine
    container_name: redis-replica
    command: redis-server --slaveof redis-master 6379 --appendonly yes
    volumes:
      - redis-replica-data:/data
    ports:
      - "6380:6379"
    depends_on:
      - redis-master
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - aiggs-network

  # Node.js App 1
  app-1:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: aiggs-app-1
    environment:
      NODE_ENV: production
      DB_HOST: postgres-master
      DB_PORT: 5432
      DB_USER: aiggs
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: aiggs_db
      REDIS_HOST: redis-master
      REDIS_PORT: 6379
      REDIS_REPLICA_HOST: redis-replica
      REDIS_REPLICA_PORT: 6379
      APP_PORT: 3000
      NODE_ID: app-1
    depends_on:
      postgres-master:
        condition: service_healthy
      redis-master:
        condition: service_healthy
    ports:
      - "3000:3000"
    networks:
      - aiggs-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Node.js App 2
  app-2:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: aiggs-app-2
    environment:
      NODE_ENV: production
      DB_HOST: postgres-master
      DB_PORT: 5432
      DB_USER: aiggs
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: aiggs_db
      REDIS_HOST: redis-master
      REDIS_PORT: 6379
      REDIS_REPLICA_HOST: redis-replica
      REDIS_REPLICA_PORT: 6379
      APP_PORT: 3001
      NODE_ID: app-2
    depends_on:
      postgres-master:
        condition: service_healthy
      redis-master:
        condition: service_healthy
    ports:
      - "3001:3000"
    networks:
      - aiggs-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx 负载均衡
  nginx:
    image: nginx:1.25-alpine
    container_name: aiggs-nginx
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app-1
      - app-2
    networks:
      - aiggs-network
    restart: unless-stopped

volumes:
  postgres-master-data:
  postgres-replica-data:
  redis-master-data:
  redis-replica-data:

networks:
  aiggs-network:
    driver: bridge
```

**Nginx 配置（nginx.conf）：**
```nginx
upstream aiggs_app {
  least_conn;
  server app-1:3000 max_fails=3 fail_timeout=30s;
  server app-2:3000 max_fails=3 fail_timeout=30s;
  keepalive 32;
}

server {
  listen 80;
  server_name _;

  location / {
    proxy_pass http://aiggs_app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_request_buffering off;

    # SSE 配置
    proxy_cache off;
    proxy_redirect off;
  }

  location /health {
    access_log off;
    proxy_pass http://aiggs_app;
  }
}
```

### 2.8 部署步骤

```bash
# 1. 生成密钥
openssl rand -base64 32 > .env  # DB_PASSWORD

# 2. 构建镜像
docker-compose build

# 3. 启动
docker-compose up -d

# 4. 初始化数据库
docker-compose exec postgres-master psql -U aiggs -d aiggs_db -f /init-db.sql

# 5. 验证
docker-compose ps
curl http://localhost/health
```

---

## 3. Phase 2 扩展架构（10-50 万用户）

### 触发条件
- App CPU 持续 > 70%
- Redis 内存占用 > 80%
- DB 连接数 > 80
- API 响应时间 > 500ms

### 关键升级

**1. 数据库读写分离**
```yaml
services:
  postgres-replica-2:
    # 再增加 1 个只读副本
  postgres-replica-3:
    # 再增加 1 个只读副本
```

```typescript
// 应用层路由
class DatabaseRouter {
  async query(sql: string, params: any[], options?: { readOnly: boolean }) {
    if (options?.readOnly) {
      // 轮询从库
      const replicas = [this.replica1, this.replica2, this.replica3];
      const replica = replicas[Math.floor(Math.random() * replicas.length)];
      return replica.query(sql, params);
    } else {
      // 写操作只走主库
      return this.master.query(sql, params);
    }
  }
}
```

**2. Redis Sentinel 高可用**
```yaml
services:
  sentinel-1:
    image: redis:7-alpine
    command: redis-sentinel /etc/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/sentinel.conf
    ports:
      - "26379:26379"
```

**3. App 水平扩展（增至 4-6 个实例）**
- Nginx 配置自动负载均衡
- 成本 +2000$/月

### 成本估算
```
新增 2 台 App：     t3.2xlarge × 2 × $0.3328/h × 730 = $486
新增 2 个 DB 从：   r6i.4xlarge × 2 × $1.44/h × 730 = $2,102
Sentinel 节点：     t3.micro × 3 × $0.01/h × 730 = $22
─────────────────────────────
Phase 2 合计: ~5000 美元/月
```

---

## 4. Phase 3 规模化（50-100 万用户）

### 升级内容

**1. PostgreSQL 集群（Patroni）**
- 自动故障转移
- 3 主 + 3 从（或 1 主 + 2 从 + 1 Quorum）
- 成本：+3000$/月

**2. Redis Cluster（6 节点）**
- 分片存储
- 自动重平衡
- 成本：+1500$/月

**3. 微服务拆分（可选）**
- 产蛋服务独立（高吞吐 Job）
- 偷蛋服务独立（高并发 Lua 脚本）
- 兑换/交易服务独立

**4. 消息队列升级（RabbitMQ 或 Kafka）**
- 替换内存 Queue
- 持久化、可重试
- 成本：+500$/月

### 成本估算
```
增加 4 台 App：       t3.2xlarge × 4 × $0.3328/h × 730 = $972
DB 集群（3 主）：     r6i.4xlarge × 3 × $1.44/h × 730 = $3,153
Redis Cluster：       r6i.2xlarge × 6 × $0.72/h × 730 = $3,153
MQ（RabbitMQ）：      t3.xlarge × 2 × $0.1664/h × 730 = $242
─────────────────────────────
Phase 3 合计: ~12000 美元/月
```

---

## 5. Phase 4 终态（100 万+ / 1000 万设计容量）

完全参考 Sprint 6 蓝图：
- AWS ECS 或 Kubernetes 完整编排
- 跨区域多活部署（北美、欧洲、亚太）
- 全套可观测性（Prometheus + Grafana + Jaeger）
- API 网关、限流、熔断（Istio）
- 成本：20000$/月+

---

## 6. 产蛋系统深度设计（重点）

### 6.1 1000 万用户产蛋方案

**数据规模：**
- 1000 万用户，平均 1 只鸡，每 8 小时产 1 蛋
- 高峰期（假设 20% 在线）：200 万并发产蛋请求 / 8h = 约 70 qps
- 日产蛋总数：1000 万 × 1 = 1000 万枚

**数据库批处理流程：**

```sql
-- 一次性获取需产蛋的所有用户（避免单个 SELECT 超时）
EXPLAIN ANALYZE
SELECT id, user_id, chicken_count, eggs
FROM farms
WHERE last_egg_time < now() - interval '8 hours'
ORDER BY id
LIMIT 10000;
-- 预期耗时：50-100ms，因为有 last_egg_time 索引

-- 批量更新（一条 SQL，事务内完成）
BEGIN;
UPDATE farms
SET eggs = eggs + chicken_count,
    last_egg_time = now(),
    updated_at = now()
WHERE user_id = ANY(ARRAY[...10000 user ids...])
RETURNING user_id, eggs;
COMMIT;
-- 预期耗时：100-200ms，批量 I/O
```

**锁策略：**
- **产蛋 Job：** 无分布式锁，靠 `last_egg_time` 索引快速定位、批量 UPDATE 事务隔离
- **并发更新防护：** 使用 `FOR UPDATE` 行锁，但只在需要时（如用户主动产蛋检查时）
```sql
SELECT * FROM farms WHERE user_id = $1 FOR UPDATE;  -- 行级排他锁
```

### 6.2 不分片的全世界模式

**关键决策：** 所有产蛋都流向同一个 PostgreSQL 集群 + Redis 集群，通过水平扩展承载。

**可行性证明：**
```
单台 PostgreSQL（r6i.4xlarge，4 核）：
- 最大 IOPS：~50k
- 批处理（10k 条 UPDATE）：~200ms，占 IOPS 少于 1%
- 1000 万产蛋 / 8h = 1000 万条 UPDATE / 480 分钟 = 20833 条/分钟 = 347 条/秒
- 每条 UPDATE 1 IOPS，总需 347 IOPS < 50k，完全可承载

单台 Redis（r6i.2xlarge）：
- 最大吞吐：100k ops/sec
- 产蛋时产生的 Redis 写（计数、清缓存）：347 ops/sec < 100k
```

**扩展建议：**
- **Phase 1-2：** 1 主 DB + 2 从，足够百万并发
- **Phase 3+：** 集群分片（仍保持全世界逻辑一致，物理上分片隐藏于下层）

### 6.3 缓存一致性保证

强一致性操作（产蛋、偷蛋、兑换）的缓存策略：

```typescript
// 方案 A：Write-Through（推荐用于强一致）
async function produceEgg(userId: string) {
  // 1. 先更新 DB
  const result = await db.query(
    'UPDATE farms SET eggs = eggs + $1 WHERE user_id = $2 RETURNING *',
    [eggCount, userId]
  );

  // 2. 再写缓存（或直接删除缓存）
  await redis.del(`farm:${userId}`);  // Cache invalidation
  lruCache.delete(`farm:${userId}`);

  // 3. 返回最新值给用户
  return result.rows[0];
}

// 方案 B：Cache-Aside with Version（用于弱一致）
async function getUserFarm(userId: string) {
  const cached = await redis.get(`farm:${userId}`);
  if (cached) {
    const { data, version } = JSON.parse(cached);
    // 定期验证版本一致性（比如 1% 采样）
    if (Math.random() < 0.01) {
      const dbVersion = await db.query('SELECT version FROM farms WHERE user_id = $1', [userId]);
      if (dbVersion[0].version !== version) {
        // 版本不一致，清缓存并重新加载
        await redis.del(`farm:${userId}`);
        return await getUserFarmFresh(userId);
      }
    }
    return data;
  }
  return await getUserFarmFresh(userId);
}
```

---

## 7. 缓存策略深度设计

### 7.1 两层缓存的成本-收益

| 组件 | 命中率 | 减少 DB 压力 | 时延 |
|------|--------|-------------|------|
| 本地 LRU 仅 | 50% | 低 | 1ms |
| Redis 仅 | 70% | 中 | 5ms |
| LRU + Redis | 85% | 高 | 2ms（平均） |
| 三层 + 分布式锁 | 90% | 很高 | 10ms（锁竞争） |

**结论：** 两层缓存在命中率与时延间达到最优平衡。三层反而因锁而降速。

### 7.2 数据分类与缓存策略

```typescript
// 强一致性数据（直读 DB，绕缓存）
// - 用户 EGGS 余额
// - 账户金额
// - 道具数量

async function getEggBalance(userId: string): Promise<number> {
  return (await db.query(
    'SELECT eggs FROM farms WHERE user_id = $1',
    [userId]
  ))[0].eggs;
}

// 弱一致性数据（走完整两层缓存）
// - 排行榜
// - 用户统计
// - 农场风景

async function getLeaderboard(limit: number = 100): Promise<Leaderboard[]> {
  const cached = await redis.get('leaderboard:top100');
  if (cached) {
    return JSON.parse(cached);
  }

  const data = await db.query(
    'SELECT user_id, eggs, chicken_count FROM farms ORDER BY eggs DESC LIMIT $1',
    [limit]
  );

  // 缓存 5 分钟
  await redis.setex('leaderboard:top100', 300, JSON.stringify(data));
  return data;
}

// 操作型数据（不缓存）
// - 用户输入
// - 实时操作结果
// - 交易记录

async function stealEggs(...) {
  // 直接操作 Redis Lua + DB，无 LRU 缓存
}
```

### 7.3 缓存失效策略

```typescript
// 失效方式：
// 1. TTL（被动过期）- 适合弱一致数据
await redis.setex('key', 300, value);  // 5 分钟自动过期

// 2. 主动删除（强一致数据更新时）
await redis.del(`farm:${userId}`);

// 3. 版本校验（可选，用于长缓存）
await redis.set(`data:${id}:v1`, value);
// 更新时创建 v2，客户端自动用新版本

// 4. 订阅模式（Phase 3+ 可选）
// Redis Pub/Sub 通知所有 App 节点清缓存
redis.publish('cache:invalidate', JSON.stringify({
  key: `farm:${userId}`,
  type: 'farm_update'
}));
```

---

## 8. Docker 部署方案

### 8.1 Dockerfile 模板

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && \
    npm run build && \
    npm cache clean --force

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# 安装健康检查工具
RUN apk add --no-cache curl

# 复制生产依赖和构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${APP_PORT:-3000}/health || exit 1

CMD ["node", "dist/index.js"]
```

### 8.2 CI/CD：GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/aiggs:latest
            ${{ secrets.DOCKER_USERNAME }}/aiggs:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to production
        run: |
          ssh -i ${{ secrets.SSH_KEY }} ec2-user@${{ secrets.PROD_HOST }} \
            "cd /opt/aiggs && \
             docker-compose pull && \
             docker-compose up -d && \
             docker-compose exec -T app npm run migrate"
```

### 8.3 数据库迁移与备份

```bash
#!/bin/bash
# backup.sh - 每天 2:00 AM 执行

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 全量备份
docker-compose exec -T postgres-master pg_dump \
  -U aiggs aiggs_db \
  --format=custom \
  > $BACKUP_DIR/aiggs_$TIMESTAMP.dump

# 保留最近 7 天
find $BACKUP_DIR -name "aiggs_*.dump" -mtime +7 -delete

# 上传到 S3
aws s3 cp $BACKUP_DIR/aiggs_$TIMESTAMP.dump \
  s3://aiggs-backups/postgres/

echo "Backup completed: aiggs_$TIMESTAMP.dump"
```

---

## 9. AWS 基础设施推荐

### 9.1 Phase 1 实例配置

```
区域：us-east-1（Virginia，最便宜）
可用区：分布式（a, b 各部署）

┌─────────────────────────────────────┐
│        Availability Zone A           │
├─────────────────────────────────────┤
│  App 1 (t3.2xlarge)                 │
│  PostgreSQL Master (r6i.4xlarge)    │
│  Redis Master (r6i.2xlarge)         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│        Availability Zone B           │
├─────────────────────────────────────┤
│  App 2 (t3.2xlarge)                 │
│  PostgreSQL Replica (r6i.4xlarge)   │
│  Redis Replica (r6i.2xlarge)        │
│  Monitor + MQ (t3.xlarge)           │
└─────────────────────────────────────┘
```

### 9.2 网络架构

```yaml
# VPC 配置
VPC CIDR: 10.0.0.0/16

Subnets:
  Public-1a:    10.0.1.0/24    (Nat, Nginx)
  Private-1a:   10.0.11.0/24   (App, DB)
  Public-1b:    10.0.2.0/24    (NAT, Monitor)
  Private-1b:   10.0.12.0/24   (App, Cache)

Security Groups:
  - ALB-SG:        允许 80, 443 from 0.0.0.0/0
  - App-SG:        允许 3000 from ALB-SG
  - DB-SG:         允许 5432 from App-SG
  - Cache-SG:      允许 6379 from App-SG
```

### 9.3 成本明细表

| Phase | 计算 | 存储 | 网络 | 月度 USD |
|-------|------|------|------|----------|
| 1 (0-10万) | 2000 | 250 | 18 | ~2,100 |
| 2 (10-50万) | 3000 | 500 | 50 | ~4,900 |
| 3 (50-100万) | 5000 | 1000 | 150 | ~11,800 |
| 4 (100万+) | 12000 | 3000 | 500 | ~20,000+ |

---

## 10. 监控与告警（精简版）

### 10.1 AWS CloudWatch 配置

```python
# CloudWatch Metrics（自定义）
import boto3

cloudwatch = boto3.client('cloudwatch')

def put_metric(metric_name: str, value: float, unit: str = 'Count'):
  cloudwatch.put_metric_data(
    Namespace='AIggs',
    MetricData=[{
      'MetricName': metric_name,
      'Value': value,
      'Unit': unit,
      'Timestamp': datetime.utcnow()
    }]
  )

# 在应用中埋点
put_metric('EggProduced', 1000)  # 一批产蛋
put_metric('StealAttempts', 50)
put_metric('DbLatency', 120, 'Milliseconds')
```

### 10.2 关键监控指标

```
应用层：
  - API 响应时间（P50, P95, P99）
  - 请求速率（QPS）
  - 错误率（5xx, 4xx）
  - 产蛋/偷蛋/兑换 吞吐量

基础设施：
  - CPU 使用率 (App > 70%, DB > 60%)
  - 内存使用率 (> 80%)
  - 磁盘 I/O (IOPS, 吞吐量)
  - 网络吞吐量

数据库：
  - 连接数 (> 80% 则告警)
  - 慢查询（> 1s）
  - 复制延迟（从库）
  - 事务持续时间

Redis：
  - 命中率（< 70% 则优化）
  - 内存使用（> 85%）
  - 淘汰速率
  - 同步延迟（主从）
```

### 10.3 告警规则示例

```yaml
# Phase 1 告警（Slack + 邮件）
Alarms:
  - Name: "High API Latency"
    Metric: ApiLatencyP95
    Threshold: 500ms
    Duration: 2 minutes
    Action: Slack #alerts

  - Name: "High Error Rate"
    Metric: 5xxErrors
    Threshold: 1% of requests
    Duration: 1 minute
    Action: PagerDuty (critical)

  - Name: "Database Connection Pool Exhausted"
    Metric: DbConnections
    Threshold: 450 (80% of 500)
    Duration: 5 minutes
    Action: Slack + Scale App

  - Name: "Redis Memory Critical"
    Metric: RedisMemoryUsage
    Threshold: 3.5GB (85% of 4GB)
    Duration: 10 minutes
    Action: Slack + Manual review
```

---

## 11. AI 运维能力

### 11.1 问题发现与隔离修复

```typescript
// AI 运维脚本框架
interface AIOpsTask {
  detected: string;  // 问题描述
  impact: string;    // 影响范围
  action: string;    // 建议操作
  rollback: string;  // 回滚方案
}

// 例：API 响应时间突增
const task: AIOpsTask = {
  detected: "API latency P95 jumped from 200ms to 800ms",
  impact: "用户可能出现操作超时，影响范围：全部 API",
  action: "1. 检查慢查询（SELECT * FROM logs WHERE latency > 1000ms）\n2. 若为某张表扫表，添加索引\n3. 若为产蛋 Job 阻塞，可临时暂停或调整批大小",
  rollback: "恢复前版本镜像，docker-compose up -d"
};
```

### 11.2 变更隔离策略

```bash
# 灰度发布（Phase 1 不必须，Phase 2+ 推荐）
docker tag aiggs:v1.0 aiggs:v1.0-stable
docker tag aiggs:v1.1 aiggs:v1.1-canary

# 仅 App 2 运行新版本 1 小时
docker-compose -f docker-compose.canary.yml up -d

# 监控指标（错误率、响应时间）
# 若无异常，再升级 App 1
docker-compose up -d  # 重新拉取新镜像

# 若失败，快速回滚
git revert <commit>
docker-compose build && docker-compose up -d
```

### 11.3 回滚机制

```bash
#!/bin/bash
# rollback.sh

CURRENT_TAG=$(docker-compose ps app-1 | grep aiggs | awk '{print $NF}')
PREVIOUS_TAG=$(git describe --tags --abbrev=0 $(git rev-list --tags --skip=1 -n1))

echo "Rolling back from $CURRENT_TAG to $PREVIOUS_TAG"

# 更新 docker-compose.yml
sed -i "s|image: aiggs:.*|image: aiggs:$PREVIOUS_TAG|g" docker-compose.yml

# 重启
docker-compose pull
docker-compose up -d

# 验证
sleep 10
curl http://localhost/health

echo "Rollback completed"
```

---

## 12. 与 Sprint 6 蓝图的对照表

| Sprint 6 组件 | Phase 1 方案 | Phase 2 方案 | Phase 3 方案 | Phase 4 方案 |
|---|---|---|---|---|
| **WebSocket + Socket.IO** | HTTP 短轮询 + SSE | SSE（保持） | SSE（保持） | 可改 WebSocket（可选） |
| **Kubernetes** | Docker Compose | Docker Compose | Docker Compose | AWS ECS / K8s |
| **3 层缓存** | 2 层（LRU + Redis） | 2 层（保持） | 2 层（保持） | 可加 L4（CDN） |
| **5 微服务** | 单体 Node.js | 单体（保持） | 拆分 3 服务 | 完整 5+ 服务 |
| **100% 自动扩容** | 手动 + 监控告警 | 简单脚本自动 | 成熟自动化 | 完整 Terraform |
| **分片方案** | 不分片 | 不分片 | 可选物理分片 | 多区域分片 |
| **消息队列** | 内存 Priority Queue | 内存 Queue | RabbitMQ / Kafka | Kafka 集群 |
| **可观测性** | CloudWatch + 脚本 | CloudWatch + 脚本 | Prometheus + Grafana | 全套 ELK + Jaeger |
| **成本** | ~2k USD/月 | ~5k USD/月 | ~12k USD/月 | ~20k+ USD/月 |

---

## 总结

这份方案遵循**剃刀原理**，从 7 台机器的简洁架构出发，以**全世界模式**和**渐进式扩展**为核心，确保：

1. **Phase 1 可立即落地**：Docker Compose 一条命令启动
2. **成本可控**：初期 ~2k USD/月，随用户增长线性扩展
3. **技术债低**：不用 K8s 直到必要时刻，避免过度工程
4. **运维简单**：所有操作可写脚本、可 AI 自动化
5. **产蛋/偷蛋核心玩法**有完整实现方案，支撑 1000 万用户

当用户增至 100 万 +，再参考 Sprint 6 蓝图升级到完整微服务 + K8s，此时团队已积累充分经验和资源。

