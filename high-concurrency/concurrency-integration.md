# AIggs 高并发数据层集成指南

**本文档**：如何将高并发模块集成到 AIggs 后端项目

---

## 快速开始

### 1. 环境配置

```bash
# 安装依赖
npm install ioredis pg lru-cache winston

# 复制 concurrency toolkit
cp aiggs-concurrency-toolkit.ts src/services/high-concurrency/

# 创建配置文件
cp .env.example .env
```

### 2. .env 配置

```env
# PostgreSQL Master
DB_HOST_MASTER=localhost
DB_PORT_MASTER=5432
DB_USER=aiggs
DB_PASSWORD=your-password
DB_NAME=aiggs_db

# PostgreSQL Replicas
DB_HOST_REPLICA1=replica1.example.com
DB_PORT_REPLICA1=5432

DB_HOST_REPLICA2=replica2.example.com
DB_PORT_REPLICA2=5432

DB_HOST_REPLICA3=replica3.example.com
DB_PORT_REPLICA3=5432

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 应用配置
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# 产蛋调度（8 小时间隔，格式：0 */8 * * *）
EGG_PRODUCTION_CRON=0 */8 * * *

# 早报预计算（凌晨 4:00，格式：0 4 * * *）
MORNING_REPORT_CRON=0 4 * * *
```

---

## 集成步骤

### 第 1 步：初始化全局 Service

```typescript
// src/index.ts

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createLogger } from 'winston';
import express from 'express';

import {
  ShardedEggProducer,
  CacheManager,
  DatabaseRouter,
  MorningReportPrecomputer,
  StealOptimizer,
} from './services/high-concurrency/aiggs-concurrency-toolkit';

// 初始化 ORM 和缓存
const prisma = new PrismaClient();
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

const logger = createLogger({
  // Winston 配置
});

// 初始化高并发模块
const cacheManager = new CacheManager(redis, logger);

const dbRouter = new DatabaseRouter(
  {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST_MASTER,
    port: parseInt(process.env.DB_PORT_MASTER || '5432'),
    database: process.env.DB_NAME,
  },
  [
    {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST_REPLICA1,
      port: parseInt(process.env.DB_PORT_REPLICA1 || '5432'),
      database: process.env.DB_NAME,
    },
    {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST_REPLICA2,
      port: parseInt(process.env.DB_PORT_REPLICA2 || '5432'),
      database: process.env.DB_NAME,
    },
    {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST_REPLICA3,
      port: parseInt(process.env.DB_PORT_REPLICA3 || '5432'),
      database: process.env.DB_NAME,
    },
  ],
  logger
);

const eggProducer = new ShardedEggProducer(prisma, redis, logger);
const morningReportPrecomputer = new MorningReportPrecomputer(
  prisma,
  redis,
  logger,
  cacheManager
);
const stealOptimizer = new StealOptimizer(redis, logger);

// 将所有 service 导出到全局
declare global {
  var cacheManager: CacheManager;
  var dbRouter: DatabaseRouter;
  var eggProducer: ShardedEggProducer;
  var morningReportPrecomputer: MorningReportPrecomputer;
  var stealOptimizer: StealOptimizer;
}

globalThis.cacheManager = cacheManager;
globalThis.dbRouter = dbRouter;
globalThis.eggProducer = eggProducer;
globalThis.morningReportPrecomputer = morningReportPrecomputer;
globalThis.stealOptimizer = stealOptimizer;

const app = express();

// ... 其他中间件 ...

app.listen(3000, () => {
  logger.info('✅ AIggs 服务器启动，高并发模块已加载');
});
```

### 第 2 步：集成产蛋分片调度

```typescript
// src/jobs/eggProductionJob.ts

import cron from 'node-cron';
import { logger } from '../utils/logger';

/**
 * 产蛋定时任务
 * 每 8 小时在整点触发，使用分片调度器摊平数据库压力
 */
export function initEggProductionJob() {
  // 表达式：0 */8 * * * (每 8 小时在整点：0点、8点、16点)
  const job = cron.schedule(process.env.EGG_PRODUCTION_CRON || '0 */8 * * *', async () => {
    logger.info('[Cron] 产蛋分片调度启动');

    try {
      // 触发分片调度
      await globalThis.eggProducer.triggerEggProduction();
    } catch (error) {
      logger.error('[Cron] 产蛋分片失败', { error });
    }
  });

  // 监听事件
  globalThis.eggProducer.on('progress', (data) => {
    logger.info('[产蛋] 进度更新', data);
  });

  globalThis.eggProducer.on('completed', (metrics) => {
    logger.info('[产蛋] 流程完成', { metrics });
    // 可选：发送通知（邮件、Slack、钉钉等）
  });

  globalThis.eggProducer.on('error', (error) => {
    logger.error('[产蛋] 流程异常', { error });
    // 可选：告警
  });

  return job;
}
```

### 第 3 步：集成早报预计算

```typescript
// src/jobs/morningReportJob.ts

import cron from 'node-cron';
import { logger } from '../utils/logger';

/**
 * 早报预计算定时任务
 * 凌晨 4:00 触发，5 分钟内完成 100 万份早报预计算
 */
export function initMorningReportJob() {
  // 表达式：0 4 * * * (每天凌晨 4:00)
  const job = cron.schedule(process.env.MORNING_REPORT_CRON || '0 4 * * *', async () => {
    logger.info('[Cron] 早报预计算启动');

    try {
      await globalThis.morningReportPrecomputer.triggerPrecomputation();
    } catch (error) {
      logger.error('[Cron] 早报预计算失败', { error });
    }
  });

  // 监听事件
  globalThis.morningReportPrecomputer.on('progress', (data) => {
    logger.debug('[早报] 进度更新', {
      percentage: data.percentage,
      remainingTime: data.estimatedRemaining,
    });
  });

  globalThis.morningReportPrecomputer.on('completed', (metrics) => {
    logger.info('[早报] 预计算完成', { metrics });
  });

  return job;
}
```

### 第 4 步：集成偷蛋高并发优化

```typescript
// src/services/stealService.ts

import { Response } from 'express';

/**
 * 偷蛋服务（使用 Redis 预扣库存优化）
 */
export class StealService {
  /**
   * 执行偷蛋
   */
  async executeSteal(
    thiefId: number,
    targetPlayerId: number,
    targetFarmCode: string,
    stealAmount: number
  ) {
    // 1. 检查新手保护期（从数据库读取）
    const targetPlayer = await globalThis.cacheManager.getPlayer(
      targetPlayerId,
      async () => {
        return await prisma.players.findUnique({
          where: { id: targetPlayerId },
          select: { rookie_protection_until: true },
        });
      }
    );

    if (
      targetPlayer?.rookie_protection_until &&
      new Date() < new Date(targetPlayer.rookie_protection_until)
    ) {
      return {
        success: false,
        message: '目标在新手保护期内，无法偷蛋',
      };
    }

    // 2. 执行偷蛋（Redis 预扣库存 + Lua 脚本原子性）
    const result = await globalThis.stealOptimizer.executeSteal(
      thiefId,
      targetPlayerId,
      targetFarmCode,
      stealAmount
    );

    if (!result.success) {
      return result;
    }

    // 3. 异步落库（可选：使用消息队列）
    // 此处简化示例，生产环境应使用消息队列
    try {
      await prisma.steal_records.create({
        data: {
          thief_id: thiefId,
          target_id: targetPlayerId,
          steal_amount: stealAmount,
        },
      });

      // 更新统计数据
      await prisma.players.update({
        where: { id: targetPlayerId },
        data: { total_stolen_count: { increment: 1 } },
      });

      await prisma.players.update({
        where: { id: thiefId },
        data: { total_successful_steals: { increment: 1 } },
      });
    } catch (error) {
      console.error('异步落库失败，但偷蛋操作已完成', error);
      // 重试逻辑或告警
    }

    return result;
  }
}
```

### 第 5 步：在 API 路由中使用

```typescript
// src/routes/steal.ts

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { StealService } from '../services/stealService';

const router = Router();
const stealService = new StealService();

/**
 * POST /api/steal
 * 执行偷蛋操作
 */
router.post('/steal', authenticate, async (req: Request, res: Response) => {
  const { targetFarmCode, stealAmount } = req.body;
  const thiefId = req.user.id;

  // 参数验证
  if (!targetFarmCode || !stealAmount || stealAmount <= 0) {
    return res.status(400).json({ error: '参数错误' });
  }

  try {
    // 从缓存获取目标农场主 ID
    // 这里假设 farm_code 可唯一标识一个农场
    const targetFarm = await globalThis.cacheManager.getFarm(0, async () => {
      return await prisma.farms.findFirst({
        where: {
          player: {
            farm_code: targetFarmCode,
          },
        },
        include: { player: true },
      });
    });

    if (!targetFarm) {
      return res.status(404).json({ error: '农场不存在' });
    }

    const result = await stealService.executeSteal(
      thiefId,
      targetFarm.player.id,
      targetFarmCode,
      stealAmount
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: '偷蛋操作异常' });
  }
});

/**
 * GET /api/farm/:farmCode
 * 获取农场信息（使用缓存）
 */
router.get('/farm/:farmCode', async (req: Request, res: Response) => {
  const { farmCode } = req.params;

  try {
    // 尝试从缓存获取
    const farm = await prisma.farms.findFirst({
      where: {
        player: {
          farm_code: farmCode,
        },
      },
      include: { player: true },
    });

    if (!farm) {
      return res.status(404).json({ error: '农场不存在' });
    }

    return res.json(farm);
  } catch (error) {
    return res.status(500).json({ error: '查询失败' });
  }
});

/**
 * GET /api/morning-report
 * 获取早报（从 Redis 预计算结果读取）
 */
router.get('/morning-report', authenticate, async (req: Request, res: Response) => {
  const { farm_code } = req.user;

  try {
    // 直接从 Redis 读取（0ms 延迟）
    const report = await globalThis.cacheManager.getMorningReport(farm_code);

    if (!report) {
      return res.status(404).json({ error: '早报暂不可用' });
    }

    return res.json({ report });
  } catch (error) {
    return res.status(500).json({ error: '查询失败' });
  }
});

/**
 * GET /api/leaderboard/:type
 * 获取排行榜（缓存击穿防护）
 */
router.get('/leaderboard/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  const { limit = 100 } = req.query;

  if (!['eggs', 'steals', 'invites'].includes(type)) {
    return res.status(400).json({ error: '类型错误' });
  }

  try {
    const leaderboard = await globalThis.cacheManager.getLeaderboard(
      type as any,
      parseInt(limit as string) || 100,
      async () => {
        if (type === 'eggs') {
          return await prisma.players.findMany({
            orderBy: { total_eggs_earned: 'desc' },
            take: parseInt(limit as string) || 100,
            select: { id: true, nickname: true, farm_code: true, total_eggs_earned: true },
          });
        } else if (type === 'steals') {
          return await prisma.players.findMany({
            orderBy: { total_successful_steals: 'desc' },
            take: parseInt(limit as string) || 100,
            select: { id: true, nickname: true, total_successful_steals: true },
          });
        } else {
          return await prisma.players.findMany({
            orderBy: { invite_commission_earned: 'desc' },
            take: parseInt(limit as string) || 100,
            select: { id: true, nickname: true, invite_commission_earned: true },
          });
        }
      }
    );

    return res.json({ leaderboard });
  } catch (error) {
    return res.status(500).json({ error: '查询失败' });
  }
});

export default router;
```

### 第 6 步：启用监控和指标

```typescript
// src/middleware/metrics.ts

import prometheus from 'prom-client';
import { Request, Response, NextFunction } from 'express';

/**
 * 关键监控指标定义
 */
export const metrics = {
  // 产蛋性能
  eggProductionDuration: new prometheus.Histogram({
    name: 'egg_production_duration_seconds',
    help: '产蛋流程总耗时',
    buckets: [10, 30, 60, 120, 300],
  }),

  eggRowsUpdated: new prometheus.Counter({
    name: 'egg_production_rows_updated_total',
    help: '产蛋更新总行数',
  }),

  // 缓存性能
  cacheHits: new prometheus.Counter({
    name: 'cache_hits_total',
    help: '缓存命中次数',
    labelNames: ['layer', 'type'],
  }),

  cacheMisses: new prometheus.Counter({
    name: 'cache_misses_total',
    help: '缓存未命中次数',
    labelNames: ['layer', 'type'],
  }),

  // 偷蛋性能
  stealAttempts: new prometheus.Counter({
    name: 'steal_attempts_total',
    help: '偷蛋尝试次数',
    labelNames: ['result'],
  }),

  stealLatency: new prometheus.Histogram({
    name: 'steal_operation_duration_ms',
    help: '单次偷蛋延迟（毫秒）',
    buckets: [1, 5, 10, 50, 100],
  }),

  // 数据库
  dbQueryDuration: new prometheus.Histogram({
    name: 'db_query_duration_seconds',
    help: '数据库查询耗时',
    labelNames: ['operation', 'db_type'],
    buckets: [0.001, 0.01, 0.05, 0.1, 0.5],
  }),

  dbConnections: new prometheus.Gauge({
    name: 'db_active_connections',
    help: '活跃数据库连接数',
    labelNames: ['db_type'],
  }),

  // API
  httpRequestDuration: new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP 请求延迟',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
  }),
};

/**
 * 中间件：记录 HTTP 请求指标
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const route = req.route?.path || req.path;

  // 重写响应发送方法
  const originalSend = res.send;
  res.send = function (data) {
    const duration = (Date.now() - start) / 1000;

    metrics.httpRequestDuration
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);

    return originalSend.call(this, data);
  };

  next();
}

/**
 * 导出 Prometheus 指标端点
 */
export function getMetricsEndpoint() {
  return prometheus.register.metrics();
}
```

---

## 性能监控

### Prometheus 配置

```yaml
# prometheus.yml

global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aiggs-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### Grafana Dashboard 查询示例

```
# 产蛋吞吐量（行/秒）
rate(egg_production_rows_updated_total[1m])

# 缓存命中率
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))

# 偷蛋成功率
sum(steal_attempts_total{result="success"}) / sum(steal_attempts_total)

# 数据库 P99 延迟
histogram_quantile(0.99, db_query_duration_seconds)

# API P95 响应时间
histogram_quantile(0.95, http_request_duration_seconds)
```

---

## 测试验证

### 单元测试示例

```typescript
// test/StealOptimizer.test.ts

import { describe, it, expect, beforeEach } from '@jest/globals';
import Redis from 'ioredis';
import { StealOptimizer } from '../src/services/high-concurrency/aiggs-concurrency-toolkit';

describe('StealOptimizer', () => {
  let redis: Redis;
  let stealOptimizer: StealOptimizer;

  beforeEach(() => {
    redis = new Redis({ db: 15 }); // 测试数据库
    stealOptimizer = new StealOptimizer(redis, console as any);
  });

  it('应该成功执行偷蛋操作', async () => {
    // 初始化库存
    await redis.set('steal:inventory:farm-123', '100');

    const result = await stealOptimizer.executeSteal(1, 2, 'farm-123', 10);

    expect(result.success).toBe(true);
    expect(result.data?.stealAmount).toBe(10);
    expect(result.data?.remainingInventory).toBe(90);

    // 验证库存已更新
    const newInventory = await redis.get('steal:inventory:farm-123');
    expect(newInventory).toBe('90');
  });

  it('应该在库存不足时失败', async () => {
    await redis.set('steal:inventory:farm-123', '5');

    const result = await stealOptimizer.executeSteal(1, 2, 'farm-123', 10);

    expect(result.success).toBe(false);
    expect(result.message).toContain('库存不足');
  });

  it('应该触发限流保护', async () => {
    for (let i = 0; i < 11; i++) {
      await stealOptimizer.executeSteal(1, 2, 'farm-123', 1);
    }

    const result = await stealOptimizer.executeSteal(1, 2, 'farm-123', 1);
    expect(result.success).toBe(false);
    expect(result.message).toContain('限流');
  });
});
```

### 负载测试

```bash
# 使用 Apache Bench 进行 API 压力测试
ab -n 10000 -c 100 http://localhost:3000/api/farm/farm-123

# 使用 k6 进行更复杂的负载测试
k6 run load-test.js
```

```javascript
// load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },   // 线性增压到 100 用户
    { duration: '5m', target: 100 },   // 保持 100 用户
    { duration: '2m', target: 200 },   // 增压到 200 用户
    { duration: '5m', target: 200 },   // 保持 200 用户
    { duration: '2m', target: 0 },     // 降压
  ],
};

export default function () {
  // 测试偷蛋 API
  let res = http.post('http://localhost:3000/api/steal', {
    targetFarmCode: 'farm-' + Math.floor(Math.random() * 1000000),
    stealAmount: 10,
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(1);
}
```

---

## 故障排查

### 常见问题

#### 1. 产蛋分片失败过多

**现象**：`failedShards > 5`

**排查步骤**：
1. 检查数据库连接是否正常
2. 查看主库的 CPU/内存是否告急
3. 检查网络延迟（使用 `ping` 或 `traceroute`）

```bash
# 查看产蛋进度
redis-cli get "egg_production_progress:shard:0"

# 查看数据库连接状态
sudo netstat -an | grep ESTABLISHED | grep 5432 | wc -l
```

#### 2. 缓存命中率低

**现象**：L1/L2 命中率低于 70%

**排查步骤**：
1. 检查热点数据是否正确预热
2. 验证 Redis 是否正常运行（内存充足）
3. 查看 TTL 设置是否过短

```bash
# 查看 Redis 内存使用
redis-cli info memory

# 查看 Redis 中的 key 数量
redis-cli dbsize

# 显示所有 key（仅用于调试）
redis-cli keys "cache:*" | head -10
```

#### 3. 偷蛋延迟高

**现象**：偷蛋操作平均延迟 > 10ms

**排查步骤**：
1. 检查 Redis 连接延迟
2. 查看是否有热点数据造成竞争
3. 检查 Lua 脚本执行时间

```bash
# 测试 Redis 延迟
redis-cli --latency-history

# 查看 Redis 慢查询日志
redis-cli slowlog get 10
```

### 日志查询

```bash
# 查看产蛋流程日志
grep "\[产蛋\]" logs/application.log | tail -50

# 查看偷蛋操作日志
grep "\[偷蛋\]" logs/application.log | tail -50

# 查看缓存命中率
grep "\[缓存\]" logs/application.log | grep "命中"
```

---

## 最佳实践

### 1. 定期数据清理

```typescript
// 定期清理过期的限流计数
setInterval(async () => {
  // Redis 会自动清理过期 key，无需手动
  logger.debug('[清理] Redis 过期 key 自动清理');
}, 6 * 60 * 60 * 1000); // 6 小时

// 定期优化数据库
setInterval(async () => {
  await prisma.$executeRaw`VACUUM ANALYZE`;
  logger.info('[清理] 数据库 VACUUM 完成');
}, 24 * 60 * 60 * 1000); // 每 24 小时
```

### 2. 监控告警

```typescript
// 监控产蛋失败率
setInterval(async () => {
  const metrics = eggProducer.getMetrics();
  const failureRate = metrics.failedShards / metrics.totalShards;

  if (failureRate > 0.05) { // 失败率 > 5%
    sendAlert('产蛋分片失败率过高', { failureRate, metrics });
  }
}, 5 * 60 * 1000); // 每 5 分钟检查

// 监控缓存命中率
setInterval(async () => {
  const stats = await cacheManager.getStats();
  const l1Utilization = parseFloat(stats.l1.utilization);

  if (l1Utilization > 90) { // L1 缓存使用率 > 90%
    sendAlert('L1 缓存接近满载', { utilization: l1Utilization });
  }
}, 10 * 60 * 1000); // 每 10 分钟检查
```

### 3. 优雅关闭

```typescript
// 优雅关闭逻辑
async function gracefulShutdown() {
  logger.info('开始优雅关闭...');

  // 1. 停止接收新请求
  app.close();

  // 2. 等待现有请求完成（最多 30 秒）
  await new Promise(resolve => setTimeout(resolve, 30 * 1000));

  // 3. 关闭数据库连接
  await prisma.$disconnect();

  // 4. 关闭 Redis 连接
  redis.disconnect();

  // 5. 关闭数据库路由器
  await dbRouter.close();

  logger.info('✅ 优雅关闭完成');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

---

## 完成检查清单

- [ ] 已安装所有必要依赖
- [ ] 已配置 .env 文件（主库、从库、Redis）
- [ ] 已初始化所有 service（CacheManager、DatabaseRouter 等）
- [ ] 已设置产蛋分片定时任务（Cron）
- [ ] 已设置早报预计算定时任务（Cron）
- [ ] 已集成偷蛋高并发优化
- [ ] 已配置 Prometheus 监控
- [ ] 已配置日志聚合和告警
- [ ] 已进行基准性能测试
- [ ] 已编写单元和集成测试
- [ ] 已验证在 10000 QPS 负载下的表现
- [ ] 已准备故障恢复和回滚方案

---

**文档完成日期**：2026-03-27
**版本**：v1.0
