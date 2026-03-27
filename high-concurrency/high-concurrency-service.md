# AIggs 高并发服务架构设计与实现

**目标**：支撑 100 万用户的高并发访问，实现生产级微服务架构（TypeScript）

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      CDN / 负载均衡                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      API Gateway (网关层)                    │
│  • 请求路由与聚合  • JWT 认证  • 限流熔断  • 追踪 ID        │
└──────────────────────────┬──────────────────────────────────┘
          │                │                │                  │
    ┌─────▼──┐      ┌─────▼──┐      ┌─────▼──┐      ┌─────▼──┐
    │ Game   │      │ Steal  │      │Exchange│      │MCP     │
    │ Core   │      │Service │      │Service │      │Gateway │
    │Service │      │        │      │        │      │Service │
    └────┬───┘      └───┬────┘      └───┬────┘      └────┬───┘
         │              │               │                 │
    ┌────▼───────────────▼───────────────▼─────────────────▼──┐
    │           Notification Service (WebSocket)              │
    │  • Socket.IO 集群  • Redis Adapter  • 推送引擎          │
    └────────────────────┬─────────────────────────────────────┘
                         │
    ┌────────────────────┼──────────────────┬─────────────────┐
    │                    │                  │                 │
┌───▼────┐      ┌────────▼────────┐  ┌─────▼─────┐  ┌────────▼──┐
│ Redis  │      │    RabbitMQ     │  │   MySQL   │  │  Consul   │
│ Cache  │      │   消息队列      │  │  数据库   │  │  注册中心 │
└────────┘      └─────────────────┘  └───────────┘  └───────────┘
```

---

## 目录结构

```
aiggs-high-concurrency/
├── package.json
├── tsconfig.json
├── docker-compose.yml              # 本地开发环境
├── src/
│   ├── index.ts                    # 主入口
│   ├── core/
│   │   ├── apiGateway.ts          # API 网关
│   │   ├── resilienceManager.ts   # 限流熔断降级
│   │   ├── serviceRegistry.ts     # 服务注册发现
│   │   └── traceIdGenerator.ts    # 分布式追踪
│   ├── services/
│   │   ├── gameCoreService.ts     # 游戏核心微服务
│   │   ├── stealService.ts        # 偷蛋微服务
│   │   ├── exchangeService.ts     # 兑换微服务
│   │   ├── mcpGatewayService.ts   # MCP 网关微服务
│   │   └── notificationService.ts # 通知微服务
│   ├── realtime/
│   │   ├── realtimeService.ts     # WebSocket 管理
│   │   ├── socketManager.ts       # Socket.IO 集群
│   │   └── eventBus.ts            # 事件总线
│   ├── mcp/
│   │   ├── mcpOptimizer.ts        # MCP 高并发优化
│   │   └── requestQueue.ts        # AI 工具请求队列
│   ├── middleware/
│   │   ├── jwt.ts                 # JWT 认证
│   │   ├── tracing.ts             # 追踪中间件
│   │   └── errorHandler.ts        # 错误处理
│   ├── types/
│   │   └── index.ts               # TypeScript 类型定义
│   ├── utils/
│   │   ├── logger.ts              # 日志工具
│   │   ├── metrics.ts             # 监控指标
│   │   └── constants.ts           # 常量
│   └── config/
│       └── env.ts                 # 环境配置
├── tests/
│   ├── loadTest.ts                # 压测脚本
│   └── integration.test.ts        # 集成测试
└── docs/
    └── deployment.md              # 部署指南
```

---

## 1. API Gateway（网关层）

### 核心职责
- 统一入口：所有外部请求经过网关
- 路由分发：按路径/版本路由到不同微服务
- 协议转换：HTTP ↔ gRPC ↔ WebSocket
- 请求聚合：一次请求获取多个微服务数据
- JWT 认证集中处理
- 请求 ID 追踪（分布式 Trace ID）

### 实现代码

```typescript
// src/core/apiGateway.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';
import { TraceContext } from '../types';

export interface ServiceEndpoint {
  name: string;
  baseUrl: string;
  timeout: number;
  retries: number;
  healthCheckUrl: string;
}

export class APIGateway {
  private app: Express;
  private logger: Logger;
  private metrics: MetricsCollector;
  private serviceClients: Map<string, AxiosInstance> = new Map();
  private serviceRegistry: Map<string, ServiceEndpoint> = new Map();
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.app = express();
    this.logger = new Logger('APIGateway');
    this.metrics = new MetricsCollector();
    this.jwtSecret = jwtSecret;
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * 初始化中间件
   */
  private setupMiddleware(): void {
    // 请求日志与追踪 ID
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const traceId = req.headers['x-trace-id'] as string || uuidv4();
      const startTime = Date.now();

      // 存储到 res.locals 以便后续中间件使用
      res.locals.traceId = traceId;
      res.locals.startTime = startTime;

      // 设置响应头中的追踪 ID
      res.setHeader('x-trace-id', traceId);

      // 日志记录
      this.logger.info(`[${traceId}] ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      next();
    });

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trace-ID');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // 请求体解析
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ limit: '10mb', extended: true }));

    // JWT 认证（排除公开路由）
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const publicRoutes = ['/health', '/metrics', '/auth/login', '/auth/register'];
      if (publicRoutes.some(route => req.path.startsWith(route))) {
        return next();
      }

      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({
          code: 'UNAUTHORIZED',
          message: '缺少认证令牌',
          traceId: res.locals.traceId,
        });
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret) as { userId: string; role: string };
        req.user = decoded;
        next();
      } catch (err) {
        this.logger.error(`[${res.locals.traceId}] JWT 验证失败`, err);
        return res.status(401).json({
          code: 'INVALID_TOKEN',
          message: '无效的认证令牌',
          traceId: res.locals.traceId,
        });
      }
    });
  }

  /**
   * 设置路由与代理规则
   */
  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: Array.from(this.serviceRegistry.values()).map(s => ({
          name: s.name,
          baseUrl: s.baseUrl,
        })),
      });
    });

    // 指标接口
    this.app.get('/metrics', (req: Request, res: Response) => {
      res.json(this.metrics.getMetrics());
    });

    // 游戏核心服务路由
    this.app.all('/api/v1/game/*', this.createProxyHandler('game-core-service'));
    this.app.all('/api/v1/farm/*', this.createProxyHandler('game-core-service'));

    // 偷蛋服务路由
    this.app.all('/api/v1/steal/*', this.createProxyHandler('steal-service'));

    // 兑换服务路由
    this.app.all('/api/v1/exchange/*', this.createProxyHandler('exchange-service'));

    // MCP 网关路由
    this.app.all('/api/v1/mcp/*', this.createProxyHandler('mcp-gateway-service'));
    this.app.all('/api/v1/ai/*', this.createProxyHandler('mcp-gateway-service'));

    // 请求聚合端点（一次调用获取多个微服务数据）
    this.app.post('/api/v1/aggregate', this.handleAggregateRequest.bind(this));

    // 404 处理
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: '请求路径不存在',
        traceId: res.locals.traceId,
      });
    });

    // 错误处理
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      const traceId = res.locals?.traceId || 'unknown';
      this.logger.error(`[${traceId}] 网关错误`, err);

      res.status(err.status || 500).json({
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || '内部服务器错误',
        traceId,
      });
    });
  }

  /**
   * 创建代理处理器
   */
  private createProxyHandler(serviceName: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const traceId = res.locals.traceId;
      const startTime = res.locals.startTime;

      try {
        const endpoint = this.serviceRegistry.get(serviceName);
        if (!endpoint) {
          return res.status(503).json({
            code: 'SERVICE_UNAVAILABLE',
            message: `服务 ${serviceName} 不可用`,
            traceId,
          });
        }

        const client = this.getOrCreateClient(serviceName, endpoint);

        // 转发请求
        const response = await client({
          method: req.method.toLowerCase(),
          url: req.path.replace('/api/v1', ''),
          data: req.body,
          params: req.query,
          headers: {
            'x-trace-id': traceId,
            'x-user-id': req.user?.userId || 'anonymous',
            'x-forwarded-for': req.ip,
          },
          timeout: endpoint.timeout,
        });

        // 记录指标
        const duration = Date.now() - startTime;
        this.metrics.recordRequest({
          service: serviceName,
          method: req.method,
          path: req.path,
          status: response.status,
          duration,
        });

        res.status(response.status).json(response.data);
      } catch (err: any) {
        const duration = Date.now() - startTime;
        this.metrics.recordRequest({
          service: serviceName,
          method: req.method,
          path: req.path,
          status: err.response?.status || 500,
          duration,
        });

        this.logger.error(`[${traceId}] 代理请求失败: ${serviceName}`, err);

        res.status(err.response?.status || 500).json({
          code: err.response?.data?.code || 'PROXY_ERROR',
          message: err.message || '代理请求失败',
          traceId,
        });
      }
    };
  }

  /**
   * 获取或创建服务客户端
   */
  private getOrCreateClient(serviceName: string, endpoint: ServiceEndpoint): AxiosInstance {
    if (!this.serviceClients.has(serviceName)) {
      const client = axios.create({
        baseURL: endpoint.baseUrl,
        timeout: endpoint.timeout,
      });

      // 请求重试逻辑
      client.interceptors.response.use(
        response => response,
        async error => {
          const config = error.config;
          config.retryCount = config.retryCount || 0;

          if (
            config.retryCount < endpoint.retries &&
            (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED')
          ) {
            config.retryCount++;
            await new Promise(resolve => setTimeout(resolve, 100 * config.retryCount));
            return client(config);
          }

          return Promise.reject(error);
        }
      );

      this.serviceClients.set(serviceName, client);
    }

    return this.serviceClients.get(serviceName)!;
  }

  /**
   * 处理请求聚合（一次调用获取多个微服务数据）
   *
   * 请求示例:
   * POST /api/v1/aggregate
   * {
   *   "requests": [
   *     { "service": "game-core", "path": "/farm/123", "method": "GET" },
   *     { "service": "steal-service", "path": "/stolen-list/123", "method": "GET" }
   *   ]
   * }
   */
  private async handleAggregateRequest(req: Request, res: Response): Promise<void> {
    const traceId = res.locals.traceId;
    const startTime = res.locals.startTime;
    const { requests } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: '请求数组不能为空',
        traceId,
      });
    }

    // 限制单次聚合请求数
    if (requests.length > 10) {
      return res.status(400).json({
        code: 'TOO_MANY_REQUESTS',
        message: '单次最多聚合 10 个请求',
        traceId,
      });
    }

    try {
      // 并行发送所有请求
      const results = await Promise.allSettled(
        requests.map(async (req: any) => {
          const endpoint = this.serviceRegistry.get(req.service);
          if (!endpoint) {
            throw new Error(`服务 ${req.service} 不可用`);
          }

          const client = this.getOrCreateClient(req.service, endpoint);
          const response = await client({
            method: req.method || 'GET',
            url: req.path,
            data: req.body,
            headers: {
              'x-trace-id': traceId,
              'x-user-id': req.user?.userId,
            },
          });

          return {
            service: req.service,
            status: response.status,
            data: response.data,
          };
        })
      );

      // 记录指标
      const duration = Date.now() - startTime;
      this.metrics.recordRequest({
        service: 'aggregator',
        method: 'POST',
        path: '/api/v1/aggregate',
        status: 200,
        duration,
        itemCount: requests.length,
      });

      // 返回结果
      res.json({
        traceId,
        results: results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              service: requests[index].service,
              status: 500,
              error: result.reason.message,
            };
          }
        }),
      });
    } catch (err: any) {
      this.logger.error(`[${traceId}] 聚合请求失败`, err);
      res.status(500).json({
        code: 'AGGREGATION_ERROR',
        message: '聚合请求失败',
        traceId,
      });
    }
  }

  /**
   * 注册服务
   */
  public registerService(endpoint: ServiceEndpoint): void {
    this.serviceRegistry.set(endpoint.name, endpoint);
    this.logger.info(`服务已注册: ${endpoint.name} -> ${endpoint.baseUrl}`);
  }

  /**
   * 启动网关
   */
  public start(port: number = 3000): void {
    this.app.listen(port, () => {
      this.logger.info(`API Gateway 启动在端口 ${port}`);
    });
  }
}

// 使用示例
const gateway = new APIGateway(process.env.JWT_SECRET || 'your-secret-key');

gateway.registerService({
  name: 'game-core-service',
  baseUrl: 'http://localhost:3001',
  timeout: 5000,
  retries: 2,
  healthCheckUrl: '/health',
});

gateway.registerService({
  name: 'steal-service',
  baseUrl: 'http://localhost:3002',
  timeout: 8000,
  retries: 3,
  healthCheckUrl: '/health',
});

gateway.start(3000);
```

---

## 2. ResilienceManager（限流、熔断、降级）

### 限流策略
- **全局限流**：10,000 QPS
- **用户限流**：每用户 60 次/分钟
- **接口限流**：偷蛋 2000 QPS、兑换 1000 QPS、状态查询 8000 QPS
- **MCP 限流**：每个 AI 工具 100 次/分钟

### 熔断策略
- 错误率 > 50% → 熔断 30 秒
- 半开状态：放 10% 流量试探
- 恢复后逐步放量

### 降级策略
- 排行榜降级：返回缓存数据
- 早报降级：返回通用模板
- 偷蛋降级：返回"系统繁忙"

```typescript
// src/core/resilienceManager.ts
import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';

export interface RateLimitConfig {
  global: { qps: number };
  user: { rpm: number }; // 每分钟请求数
  endpoint: {
    [key: string]: number;
  };
  mcp: { rpm: number }; // 每个 MCP 工具的限制
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export class ResilienceManager {
  private redis: Redis;
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: RateLimitConfig;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(redisUrl: string, config: RateLimitConfig) {
    this.redis = new Redis(redisUrl);
    this.logger = new Logger('ResilienceManager');
    this.metrics = new MetricsCollector();
    this.config = config;
  }

  /**
   * 令牌桶限流
   * 使用 Redis 实现分布式令牌桶
   */
  public async checkRateLimit(
    limitKey: string,
    qps: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const key = `rate-limit:${limitKey}`;
    const refillKey = `${key}:refill`;

    // 获取桶内当前令牌数
    const pipe = this.redis.pipeline();
    pipe.get(key);
    pipe.get(refillKey);
    const results = await pipe.exec();

    let tokens = parseInt(results?.[0]?.[1] as string) || qps;
    let lastRefillTime = parseInt(results?.[1]?.[1] as string) || now;

    // 计算应该补充的令牌数（每毫秒补充 qps/1000 个令牌）
    const timeDiff = now - lastRefillTime;
    const tokensToAdd = Math.floor((timeDiff / 1000) * qps);
    tokens = Math.min(qps, tokens + tokensToAdd);

    const allowed = tokens >= 1;

    if (allowed) {
      tokens--;
    }

    // 更新 Redis
    const expireTime = 60; // 1 分钟过期
    await this.redis.setex(key, expireTime, tokens.toString());
    await this.redis.setex(refillKey, expireTime, now.toString());

    // 记录指标
    this.metrics.recordRateLimit({
      limitKey,
      allowed,
      remaining: Math.max(0, tokens),
    });

    return {
      allowed,
      remaining: Math.max(0, tokens),
      resetAt: now + 1000, // 1 秒后重试
    };
  }

  /**
   * 滑动窗口限流（用于每分钟计数）
   */
  public async checkSlidingWindow(
    windowKey: string,
    limit: number,
    windowSize: number = 60 // 秒
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const key = `window:${windowKey}`;
    const currentWindow = Math.floor(now / (windowSize * 1000));
    const previousWindow = currentWindow - 1;

    // 获取当前和前一个窗口的计数
    const pipe = this.redis.pipeline();
    pipe.get(`${key}:${currentWindow}`);
    pipe.get(`${key}:${previousWindow}`);
    const results = await pipe.exec();

    const currentCount = parseInt(results?.[0]?.[1] as string) || 0;
    const previousCount = parseInt(results?.[1]?.[1] as string) || 0;

    // 计算加权值
    const windowProgress = (now % (windowSize * 1000)) / (windowSize * 1000);
    const weightedPreviousCount = Math.floor(previousCount * (1 - windowProgress));
    const totalCount = currentCount + weightedPreviousCount;

    const allowed = totalCount < limit;

    if (allowed) {
      await this.redis.incr(`${key}:${currentWindow}`);
      await this.redis.expire(`${key}:${currentWindow}`, windowSize);
    }

    return {
      allowed,
      remaining: Math.max(0, limit - totalCount),
    };
  }

  /**
   * 熔断器模式
   */
  public async executeWithCircuitBreaker<T>(
    serviceName: string,
    fn: () => Promise<T>,
    options: {
      failureThreshold?: number; // 故障次数阈值
      successThreshold?: number; // 恢复成功次数阈值
      timeout?: number; // 熔断持续时间（毫秒）
    } = {}
  ): Promise<T> {
    const {
      failureThreshold = 5,
      successThreshold = 2,
      timeout = 30000,
    } = options;

    // 获取或初始化熔断器状态
    let state = this.circuitBreakers.get(serviceName) || {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };

    const now = Date.now();

    // 根据当前状态决策
    if (state.state === 'OPEN') {
      // 如果处于开路状态，检查是否应该转为半开
      if (now >= state.nextAttemptTime) {
        state.state = 'HALF_OPEN';
        state.successCount = 0;
        this.logger.info(`[${serviceName}] 熔断器转为半开状态`);
      } else {
        // 仍在开路中，拒绝请求
        const remainingTime = state.nextAttemptTime - now;
        throw new Error(
          `[${serviceName}] 熔断器打开，请在 ${remainingTime}ms 后重试`
        );
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('执行超时')), timeout)
        ),
      ]);

      // 执行成功
      if (state.state === 'HALF_OPEN') {
        state.successCount++;
        if (state.successCount >= successThreshold) {
          state.state = 'CLOSED';
          state.failureCount = 0;
          this.logger.info(`[${serviceName}] 熔断器恢复关闭`);
        }
      } else if (state.state === 'CLOSED') {
        state.failureCount = 0;
      }

      return result;
    } catch (err) {
      state.failureCount++;
      state.lastFailureTime = now;

      // 如果故障数达到阈值，打开熔断器
      if (state.failureCount >= failureThreshold) {
        state.state = 'OPEN';
        state.nextAttemptTime = now + timeout;
        this.logger.warn(
          `[${serviceName}] 熔断器打开，将在 ${timeout}ms 后尝试半开`
        );
      }

      // 记录指标
      this.metrics.recordCircuitBreaker({
        service: serviceName,
        state: state.state,
        failureCount: state.failureCount,
      });

      throw err;
    } finally {
      this.circuitBreakers.set(serviceName, state);
    }
  }

  /**
   * 降级处理：排行榜降级返回缓存数据
   */
  public async getLeaderboardWithFallback(): Promise<any> {
    try {
      return await this.executeWithCircuitBreaker(
        'leaderboard-service',
        async () => {
          // 调用实际的排行榜服务
          const response = await fetch('http://leaderboard-service/api/top100');
          if (!response.ok) throw new Error('服务故障');
          return response.json();
        }
      );
    } catch (err) {
      this.logger.warn('排行榜服务故障，使用缓存数据');
      // 返回缓存的旧数据
      const cached = await this.redis.get('leaderboard:cached');
      return cached ? JSON.parse(cached) : { items: [], message: '排行榜暂不可用' };
    }
  }

  /**
   * 降级处理：早报降级返回通用模板
   */
  public async generateMorningReportWithFallback(userId: string): Promise<string> {
    try {
      return await this.executeWithCircuitBreaker(
        'morning-report-service',
        async () => {
          const response = await fetch(`http://morning-report-service/api/report/${userId}`);
          if (!response.ok) throw new Error('服务故障');
          return response.json();
        }
      );
    } catch (err) {
      this.logger.warn('早报生成失败，使用通用模板');
      return `早上好！系统正在维护中，敬请稍候。您的农场情况已保存，稍后将为您生成详细报告。`;
    }
  }

  /**
   * 降级处理：偷蛋降级返回系统繁忙
   */
  public async stealWithFallback(userId: string, targetId: string): Promise<any> {
    try {
      return await this.executeWithCircuitBreaker(
        'steal-service',
        async () => {
          const response = await fetch('http://steal-service/api/steal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, targetId }),
          });
          if (!response.ok) throw new Error('服务故障');
          return response.json();
        },
        { failureThreshold: 3, timeout: 15000 }
      );
    } catch (err) {
      this.logger.warn('偷蛋服务故障');
      return {
        code: 'SYSTEM_BUSY',
        message: '系统繁忙，请稍后重试',
        canRetry: true,
      };
    }
  }
}

export default ResilienceManager;
```

---

## 3. 微服务拆分与实现

### 3.1 游戏核心微服务（GameCoreService）

```typescript
// src/services/gameCoreService.ts
import express, { Express, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { ServiceRegistry } from '../core/serviceRegistry';

export class GameCoreService {
  private app: Express;
  private prisma: PrismaClient;
  private logger: Logger;
  private registry: ServiceRegistry;

  constructor() {
    this.app = express();
    this.prisma = new PrismaClient();
    this.logger = new Logger('GameCoreService');
    this.registry = new ServiceRegistry(process.env.CONSUL_URL || '');
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', service: 'game-core-service' });
    });

    // 查询农场信息
    this.app.get('/farm/:farmId', async (req: Request, res: Response) => {
      try {
        const { farmId } = req.params;
        const traceId = req.headers['x-trace-id'];

        this.logger.info(`[${traceId}] 查询农场: ${farmId}`);

        const farm = await this.prisma.farm.findUnique({
          where: { id: farmId },
          include: {
            owner: { select: { id: true, name: true, avatar: true } },
            chickens: { select: { id: true, level: true, lastEggTime: true } },
          },
        });

        if (!farm) {
          return res.status(404).json({ code: 'FARM_NOT_FOUND' });
        }

        // 计算产蛋数
        const eggsProduced = farm.chickens.reduce((sum, chicken) => {
          const hoursSinceLastEgg = (Date.now() - chicken.lastEggTime.getTime()) / 3600000;
          return sum + Math.floor(hoursSinceLastEgg / 8) * (chicken.level + 1);
        }, 0);

        res.json({
          id: farm.id,
          owner: farm.owner,
          totalChickens: farm.chickens.length,
          eggs: farm.eggs + eggsProduced,
          coins: farm.coins,
          level: farm.level,
          createdAt: farm.createdAt,
        });
      } catch (err) {
        this.logger.error(`查询农场失败`, err);
        res.status(500).json({ code: 'INTERNAL_ERROR' });
      }
    });

    // 购买鸡
    this.app.post('/farm/:farmId/buy-chicken', async (req: Request, res: Response) => {
      const { farmId } = req.params;
      const { type } = req.body;
      const traceId = req.headers['x-trace-id'];

      try {
        this.logger.info(`[${traceId}] 购买鸡: ${farmId}, 类型: ${type}`);

        const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
        if (!farm) {
          return res.status(404).json({ code: 'FARM_NOT_FOUND' });
        }

        const cost = type === 'normal' ? 100 : 500;
        if (farm.coins < cost) {
          return res.status(400).json({
            code: 'INSUFFICIENT_COINS',
            required: cost,
            current: farm.coins,
          });
        }

        // 创建新鸡
        const chicken = await this.prisma.chicken.create({
          data: {
            farmId,
            type,
            level: 1,
            lastEggTime: new Date(),
          },
        });

        // 扣除费用
        await this.prisma.farm.update({
          where: { id: farmId },
          data: { coins: farm.coins - cost },
        });

        res.json({
          code: 'SUCCESS',
          chicken,
          remainingCoins: farm.coins - cost,
        });
      } catch (err) {
        this.logger.error(`购买鸡失败`, err);
        res.status(500).json({ code: 'INTERNAL_ERROR' });
      }
    });

    // 查询用户的所有农场
    this.app.get('/farms', async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;
      const traceId = req.headers['x-trace-id'];

      try {
        this.logger.info(`[${traceId}] 查询用户农场: ${userId}`);

        const farms = await this.prisma.farm.findMany({
          where: { ownerId: userId },
          select: {
            id: true,
            name: true,
            level: true,
            eggs: true,
            coins: true,
          },
          take: 100, // 分页
        });

        res.json({ farms });
      } catch (err) {
        this.logger.error(`查询农场失表`, err);
        res.status(500).json({ code: 'INTERNAL_ERROR' });
      }
    });
  }

  public start(port: number = 3001): void {
    this.app.listen(port, () => {
      this.logger.info(`GameCoreService 启动在端口 ${port}`);
      // 注册到 Consul
      this.registry.register({
        name: 'game-core-service',
        port,
        healthCheckUrl: '/health',
      });
    });
  }
}

const service = new GameCoreService();
service.start();
```

### 3.2 偷蛋微服务（StealService）

```typescript
// src/services/stealService.ts
import express, { Express, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { ServiceRegistry } from '../core/serviceRegistry';
import amqp from 'amqplib';

export class StealService {
  private app: Express;
  private prisma: PrismaClient;
  private logger: Logger;
  private registry: ServiceRegistry;
  private amqpConnection: any;

  constructor() {
    this.app = express();
    this.prisma = new PrismaClient();
    this.logger = new Logger('StealService');
    this.registry = new ServiceRegistry(process.env.CONSUL_URL || '');
    this.setupRoutes();
  }

  private async connectRabbitMQ(): Promise<void> {
    try {
      this.amqpConnection = await amqp.connect(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost'
      );
      this.logger.info('RabbitMQ 连接成功');
    } catch (err) {
      this.logger.error('RabbitMQ 连接失败', err);
      setTimeout(() => this.connectRabbitMQ(), 5000);
    }
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', service: 'steal-service' });
    });

    /**
     * 偷蛋接口
     * 独立的数据库连接池，支持高并发
     */
    this.app.post('/steal', async (req: Request, res: Response) => {
      const { targetFarmId, count } = req.body;
      const userId = req.headers['x-user-id'] as string;
      const traceId = req.headers['x-trace-id'];

      try {
        this.logger.info(
          `[${traceId}] 偷蛋: ${userId} -> ${targetFarmId}, 数量: ${count}`
        );

        // 检查目标农场是否存在
        const targetFarm = await this.prisma.farm.findUnique({
          where: { id: targetFarmId },
        });

        if (!targetFarm) {
          return res.status(404).json({ code: 'FARM_NOT_FOUND' });
        }

        // 检查蛋是否足够
        if (targetFarm.eggs < count) {
          return res.status(400).json({
            code: 'INSUFFICIENT_EGGS',
            available: targetFarm.eggs,
            required: count,
          });
        }

        // 数据库事务处理
        const result = await this.prisma.$transaction(async (tx) => {
          // 从目标农场减少蛋数
          await tx.farm.update({
            where: { id: targetFarmId },
            data: { eggs: targetFarm.eggs - count },
          });

          // 给当前用户增加蛋数
          const userFarm = await tx.farm.findFirst({
            where: { ownerId: userId },
          });

          if (!userFarm) {
            throw new Error('用户农场不存在');
          }

          await tx.farm.update({
            where: { id: userFarm.id },
            data: { eggs: userFarm.eggs + count },
          });

          // 记录偷蛋事件
          const stealRecord = await tx.stealRecord.create({
            data: {
              stealerId: userId,
              targetFarmId,
              eggsCount: count,
              timestamp: new Date(),
            },
          });

          return {
            stealerId: userId,
            targetFarmId,
            eggsCount: count,
            stealRecordId: stealRecord.id,
          };
        });

        // 发送事件到消息队列（异步通知）
        if (this.amqpConnection) {
          const channel = await this.amqpConnection.createChannel();
          await channel.assertExchange('aiggs.events', 'topic', { durable: true });
          await channel.publish(
            'aiggs.events',
            'steal.completed',
            Buffer.from(
              JSON.stringify({
                ...result,
                traceId,
                timestamp: new Date(),
              })
            )
          );
        }

        res.json({
          code: 'SUCCESS',
          message: '偷蛋成功',
          data: result,
        });
      } catch (err) {
        this.logger.error(`[${traceId}] 偷蛋失败`, err);
        res.status(500).json({ code: 'STEAL_FAILED' });
      }
    });

    /**
     * 查询被偷蛋的列表
     */
    this.app.get('/stolen-list/:farmId', async (req: Request, res: Response) => {
      const { farmId } = req.params;
      const traceId = req.headers['x-trace-id'];

      try {
        const stolenRecords = await this.prisma.stealRecord.findMany({
          where: { targetFarmId: farmId },
          orderBy: { timestamp: 'desc' },
          take: 50,
          select: {
            id: true,
            stealerId: true,
            eggsCount: true,
            timestamp: true,
          },
        });

        res.json({
          farmId,
          totalStolenCount: stolenRecords.reduce(
            (sum, r) => sum + r.eggsCount,
            0
          ),
          records: stolenRecords,
        });
      } catch (err) {
        this.logger.error(`[${traceId}] 查询被偷蛋列表失败`, err);
        res.status(500).json({ code: 'INTERNAL_ERROR' });
      }
    });
  }

  public async start(port: number = 3002): Promise<void> {
    await this.connectRabbitMQ();

    this.app.listen(port, () => {
      this.logger.info(`StealService 启动在端口 ${port}`);
      this.registry.register({
        name: 'steal-service',
        port,
        healthCheckUrl: '/health',
      });
    });
  }
}

const service = new StealService();
service.start();
```

### 3.3 兑换微服务（ExchangeService）

```typescript
// src/services/exchangeService.ts
import express, { Express, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { ServiceRegistry } from '../core/serviceRegistry';
import axios from 'axios';

export class ExchangeService {
  private app: Express;
  private prisma: PrismaClient;
  private logger: Logger;
  private registry: ServiceRegistry;

  constructor() {
    this.app = express();
    this.prisma = new PrismaClient();
    this.logger = new Logger('ExchangeService');
    this.registry = new ServiceRegistry(process.env.CONSUL_URL || '');
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', service: 'exchange-service' });
    });

    /**
     * 查询当前的 EGGS -> $AIGG 兑换率
     */
    this.app.get('/rate', async (req: Request, res: Response) => {
      try {
        // 从区块链或预言机获取实时兑换率
        const rate = await this.getExchangeRate();
        res.json({
          rate,
          timestamp: new Date(),
          pair: 'EGGS/AIGG',
        });
      } catch (err) {
        this.logger.error('获取兑换率失败', err);
        res.status(500).json({ code: 'FAILED_TO_GET_RATE' });
      }
    });

    /**
     * 执行 EGGS -> $AIGG 兑换
     */
    this.app.post('/exchange', async (req: Request, res: Response) => {
      const { farmId, eggsCount } = req.body;
      const userId = req.headers['x-user-id'] as string;
      const traceId = req.headers['x-trace-id'];

      try {
        this.logger.info(
          `[${traceId}] 兑换: 农场 ${farmId}, 蛋数 ${eggsCount}`
        );

        // 验证农场所有者
        const farm = await this.prisma.farm.findUnique({
          where: { id: farmId },
        });

        if (!farm || farm.ownerId !== userId) {
          return res.status(403).json({ code: 'UNAUTHORIZED' });
        }

        if (farm.eggs < eggsCount) {
          return res.status(400).json({
            code: 'INSUFFICIENT_EGGS',
            available: farm.eggs,
            required: eggsCount,
          });
        }

        // 获取兑换率
        const rate = await this.getExchangeRate();
        const aiggAmount = Math.floor(eggsCount * rate);

        // 交易处理
        const exchangeRecord = await this.prisma.exchangeRecord.create({
          data: {
            farmId,
            userId,
            eggsCount,
            aiggAmount,
            rate,
            status: 'PENDING',
            txHash: null,
          },
        });

        // 减少蛋数
        await this.prisma.farm.update({
          where: { id: farmId },
          data: { eggs: farm.eggs - eggsCount },
        });

        // 异步执行链上交易
        this.executeBlockchainExchange(exchangeRecord.id, farmId, eggsCount, aiggAmount)
          .catch((err) =>
            this.logger.error(`链上交易失败: ${exchangeRecord.id}`, err)
          );

        res.json({
          code: 'SUCCESS',
          message: '兑换请求已提交',
          exchangeRecord: {
            id: exchangeRecord.id,
            eggsCount,
            aiggAmount,
            status: 'PENDING',
          },
        });
      } catch (err) {
        this.logger.error(`[${traceId}] 兑换失败`, err);
        res.status(500).json({ code: 'EXCHANGE_FAILED' });
      }
    });

    /**
     * 查询兑换历史
     */
    this.app.get('/history/:farmId', async (req: Request, res: Response) => {
      const { farmId } = req.params;
      const traceId = req.headers['x-trace-id'];

      try {
        const records = await this.prisma.exchangeRecord.findMany({
          where: { farmId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        res.json({ farmId, records });
      } catch (err) {
        this.logger.error(`[${traceId}] 查询兑换历史失败`, err);
        res.status(500).json({ code: 'INTERNAL_ERROR' });
      }
    });
  }

  /**
   * 获取实时兑换率（从预言机或 DEX）
   */
  private async getExchangeRate(): Promise<number> {
    try {
      // 调用 Uniswap V3 或其他 DEX 的 API
      const response = await axios.get(
        'https://api.uniswap.org/v1/quote',
        {
          params: {
            tokenIn: 'EGGS',
            tokenOut: 'AIGG',
            amount: 100, // 标准化查询 100 EGGS = ? AIGG
          },
          timeout: 5000,
        }
      );
      return response.data.amountOut / 100;
    } catch (err) {
      this.logger.error('获取兑换率失败', err);
      // 返回缓存或默认值
      return 0.95;
    }
  }

  /**
   * 异步执行链上交易
   */
  private async executeBlockchainExchange(
    recordId: string,
    farmId: string,
    eggsCount: number,
    aiggAmount: number
  ): Promise<void> {
    try {
      // 调用智能合约进行 EGGS -> $AIGG 兑换
      const txResponse = await axios.post(
        `${process.env.BLOCKCHAIN_GATEWAY_URL}/exchange`,
        {
          recordId,
          farmId,
          eggsCount,
          aiggAmount,
        },
        { timeout: 30000 }
      );

      const txHash = txResponse.data.txHash;

      // 更新记录状态
      await this.prisma.exchangeRecord.update({
        where: { id: recordId },
        data: {
          status: 'CONFIRMED',
          txHash,
          completedAt: new Date(),
        },
      });

      this.logger.info(`兑换完成: ${recordId}, TxHash: ${txHash}`);
    } catch (err) {
      this.logger.error(`链上交易执行失败: ${recordId}`, err);

      // 标记为失败
      await this.prisma.exchangeRecord.update({
        where: { id: recordId },
        data: { status: 'FAILED' },
      });
    }
  }

  public start(port: number = 3003): void {
    this.app.listen(port, () => {
      this.logger.info(`ExchangeService 启动在端口 ${port}`);
      this.registry.register({
        name: 'exchange-service',
        port,
        healthCheckUrl: '/health',
      });
    });
  }
}

const service = new ExchangeService();
service.start();
```

### 3.4 MCP 网关微服务（MCPGatewayService）

```typescript
// src/services/mcpGatewayService.ts
import express, { Express, Request, Response } from 'express';
import { Logger } from '../utils/logger';
import { ServiceRegistry } from '../core/serviceRegistry';
import { MCPOptimizer } from '../mcp/mcpOptimizer';

export class MCPGatewayService {
  private app: Express;
  private logger: Logger;
  private registry: ServiceRegistry;
  private mcpOptimizer: MCPOptimizer;

  constructor() {
    this.app = express();
    this.logger = new Logger('MCPGatewayService');
    this.registry = new ServiceRegistry(process.env.CONSUL_URL || '');
    this.mcpOptimizer = new MCPOptimizer();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', service: 'mcp-gateway-service' });
    });

    /**
     * AI 工具通用接口
     * 支持 Claude 等 AI 工具通过 MCP 协议调用
     */
    this.app.post('/tool/:toolName', async (req: Request, res: Response) => {
      const { toolName } = req.params;
      const { input } = req.body;
      const traceId = req.headers['x-trace-id'];

      try {
        this.logger.info(`[${traceId}] MCP 工具调用: ${toolName}`);

        // 执行 MCP 工具（通过优化器处理）
        const result = await this.mcpOptimizer.execute(toolName, input, {
          traceId,
          userId: req.headers['x-user-id'] as string,
        });

        res.json({
          code: 'SUCCESS',
          tool: toolName,
          result,
        });
      } catch (err: any) {
        this.logger.error(`[${traceId}] MCP 工具失败`, err);
        res.status(500).json({
          code: 'MCP_EXECUTION_FAILED',
          message: err.message,
        });
      }
    });

    /**
     * 批量查询接口（一次 MCP 调用可查询多个农场）
     */
    this.app.post('/batch/status', async (req: Request, res: Response) => {
      const { farmIds } = req.body;
      const traceId = req.headers['x-trace-id'];

      try {
        if (!Array.isArray(farmIds) || farmIds.length === 0) {
          return res.status(400).json({
            code: 'INVALID_REQUEST',
            message: 'farmIds 必须是非空数组',
          });
        }

        // 限制批量大小
        if (farmIds.length > 100) {
          return res.status(400).json({
            code: 'TOO_MANY_REQUESTS',
            message: '单次最多查询 100 个农场',
          });
        }

        // 并行查询多个农场状态
        const results = await Promise.all(
          farmIds.map((farmId) =>
            this.mcpOptimizer.execute('getFarmStatus', { farmId }, { traceId })
          )
        );

        res.json({
          code: 'SUCCESS',
          farmIds,
          results,
        });
      } catch (err) {
        this.logger.error(`[${traceId}] 批量查询失败`, err);
        res.status(500).json({ code: 'BATCH_QUERY_FAILED' });
      }
    });

    /**
     * 长轮询订阅（AI 工具订阅事件，有变化时才推送）
     */
    this.app.post('/subscribe', async (req: Request, res: Response) => {
      const { eventTypes, userId } = req.body;
      const traceId = req.headers['x-trace-id'];

      try {
        // 长轮询，最多等待 30 秒
        const timeout = setTimeout(() => {
          res.status(204).send();
        }, 30000);

        // 监听事件
        const eventListener = async (event: any) => {
          clearTimeout(timeout);
          res.json({
            code: 'SUCCESS',
            event,
            traceId,
          });
        };

        // 注册事件监听
        for (const eventType of eventTypes) {
          this.mcpOptimizer.subscribeEvent(eventType, userId, eventListener);
        }
      } catch (err) {
        this.logger.error(`[${traceId}] 订阅失败`, err);
        res.status(500).json({ code: 'SUBSCRIPTION_FAILED' });
      }
    });
  }

  public start(port: number = 3004): void {
    this.app.listen(port, () => {
      this.logger.info(`MCPGatewayService 启动在端口 ${port}`);
      this.registry.register({
        name: 'mcp-gateway-service',
        port,
        healthCheckUrl: '/health',
      });
    });
  }
}

const service = new MCPGatewayService();
service.start();
```

### 3.5 通知微服务（NotificationService）

```typescript
// src/services/notificationService.ts
import express, { Express, Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { ServiceRegistry } from '../core/serviceRegistry';

export class NotificationService {
  private app: Express;
  private httpServer: http.Server;
  private io: SocketIOServer;
  private logger: Logger;
  private registry: ServiceRegistry;
  private redisClient: Redis;

  constructor() {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.logger = new Logger('NotificationService');
    this.registry = new ServiceRegistry(process.env.CONSUL_URL || '');
    this.redisClient = new Redis(process.env.REDIS_URL || '');

    // Socket.IO 配置
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
      },
      adapter: createAdapter(this.redisClient, new Redis(process.env.REDIS_URL || '')),
      transports: ['websocket', 'polling'],
      pingInterval: 30000,
      pingTimeout: 60000,
      maxHttpBufferSize: 1e6, // 1MB
    });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', service: 'notification-service' });
    });

    // 获取在线用户数
    this.app.get('/stats', async (req: Request, res: Response) => {
      const clients = await this.io.fetchSockets();
      res.json({
        connectedUsers: clients.length,
        timestamp: new Date(),
      });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.handshake.auth.userId;
      const traceId = socket.handshake.headers['x-trace-id'];

      this.logger.info(`[${traceId}] 用户连接: ${userId}, SocketID: ${socket.id}`);

      // 用户加入其专属房间
      if (userId) {
        socket.join(`user:${userId}`);

        // 发送欢迎消息
        socket.emit('connected', {
          userId,
          socketId: socket.id,
          timestamp: new Date(),
        });
      }

      // 监听心跳
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // 断开连接处理
      socket.on('disconnect', () => {
        this.logger.info(`[${traceId}] 用户断开连接: ${userId}`);
      });

      // 错误处理
      socket.on('error', (err) => {
        this.logger.error(`[${traceId}] Socket 错误`, err);
      });
    });
  }

  /**
   * 推送产蛋通知给特定用户
   */
  public notifyEggProduced(userId: string, data: any): void {
    this.io.to(`user:${userId}`).emit('egg_produced', {
      type: 'egg_produced',
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 推送被偷蛋警报
   */
  public notifyEggStolen(userId: string, data: any): void {
    this.io.to(`user:${userId}`).emit('stolen_alert', {
      type: 'stolen_alert',
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 推送早报
   */
  public notifyMorningReport(userId: string, data: any): void {
    this.io.to(`user:${userId}`).emit('morning_report', {
      type: 'morning_report',
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 推送排行榜更新
   */
  public notifyLeaderboardUpdate(data: any): void {
    // 广播给所有连接的用户
    this.io.emit('leaderboard_update', {
      type: 'leaderboard_update',
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 推送兑换完成
   */
  public notifyExchangeCompleted(userId: string, data: any): void {
    this.io.to(`user:${userId}`).emit('exchange_completed', {
      type: 'exchange_completed',
      data,
      timestamp: new Date(),
    });
  }

  /**
   * 批量推送（通过 HTTP 接口）
   */
  public setupBatchNotificationEndpoint(): void {
    this.app.post('/notify/batch', (req: Request, res: Response) => {
      const { userIds, event, data } = req.body;

      if (!Array.isArray(userIds) || !event) {
        return res.status(400).json({
          code: 'INVALID_REQUEST',
          message: 'userIds 和 event 必需',
        });
      }

      // 并行推送给所有用户
      userIds.forEach((userId: string) => {
        this.io.to(`user:${userId}`).emit(event, {
          type: event,
          data,
          timestamp: new Date(),
        });
      });

      res.json({
        code: 'SUCCESS',
        message: `已推送给 ${userIds.length} 个用户`,
      });
    });
  }

  public start(port: number = 3005): void {
    this.setupBatchNotificationEndpoint();

    this.httpServer.listen(port, () => {
      this.logger.info(`NotificationService 启动在端口 ${port}`);
      this.registry.register({
        name: 'notification-service',
        port,
        healthCheckUrl: '/health',
      });
    });
  }
}

const service = new NotificationService();
service.start();
```

---

## 4. WebSocket 实时通知（RealtimeService）

```typescript
// src/realtime/realtimeService.ts
import { Socket as ClientSocket } from 'socket.io-client';
import Redis from 'ioredis';
import { Logger } from '../utils/logger';

export interface RealtimeEvent {
  type:
    | 'egg_produced'
    | 'stolen_alert'
    | 'morning_report'
    | 'leaderboard_update'
    | 'exchange_completed';
  userId: string;
  data: any;
  timestamp: Date;
}

export class RealtimeService {
  private redis: Redis;
  private pubClient: Redis;
  private logger: Logger;
  private connectionPool: Map<string, ClientSocket> = new Map();

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
    this.pubClient = new Redis(redisUrl);
    this.logger = new Logger('RealtimeService');
  }

  /**
   * 发布实时事件（供微服务调用）
   */
  public async publishEvent(event: RealtimeEvent): Promise<void> {
    try {
      // 发布到 Redis，通知所有订阅者
      await this.pubClient.publish(
        `event:${event.type}`,
        JSON.stringify(event)
      );

      // 同时存储到缓存（用于新连接用户的补偿）
      const cacheKey = `events:${event.userId}`;
      await this.redis.lpush(cacheKey, JSON.stringify(event));
      await this.redis.ltrim(cacheKey, 0, 999); // 保留最近 1000 条
      await this.redis.expire(cacheKey, 86400); // 24 小时过期

      this.logger.info(
        `事件发布: ${event.type} for ${event.userId}`
      );
    } catch (err) {
      this.logger.error('事件发布失败', err);
    }
  }

  /**
   * 处理断线重连补偿
   */
  public async getCompensationEvents(userId: string): Promise<RealtimeEvent[]> {
    try {
      const cacheKey = `events:${userId}`;
      const events = await this.redis.lrange(cacheKey, 0, -1);

      return events
        .map((e) => {
          try {
            return JSON.parse(e);
          } catch {
            return null;
          }
        })
        .filter((e) => e !== null);
    } catch (err) {
      this.logger.error('获取补偿事件失败', err);
      return [];
    }
  }

  /**
   * 清理用户的事件缓存
   */
  public async clearUserEvents(userId: string): Promise<void> {
    const cacheKey = `events:${userId}`;
    await this.redis.del(cacheKey);
  }

  /**
   * 背压控制：消息堆积超过 1000 条自动丢弃旧消息
   */
  public async enforceBackpressure(userId: string, maxMessages: number = 1000): Promise<void> {
    const cacheKey = `events:${userId}`;
    const count = await this.redis.llen(cacheKey);

    if (count > maxMessages) {
      // 删除最旧的消息
      await this.redis.ltrim(
        cacheKey,
        0,
        maxMessages - 1
      );
      this.logger.warn(
        `消息背压处理: ${userId} 删除了 ${count - maxMessages} 条旧消息`
      );
    }
  }
}
```

---

## 5. MCP 高并发优化（MCPOptimizer）

```typescript
// src/mcp/mcpOptimizer.ts
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { RequestQueue } from './requestQueue';

export interface MCPRequest {
  id: string;
  toolName: string;
  input: any;
  priority: 'high' | 'normal' | 'low';
  context: {
    traceId: string;
    userId: string;
  };
  createdAt: Date;
  executedAt?: Date;
}

export interface MCPResponse {
  id: string;
  result: any;
  error?: string;
  executionTime: number;
}

export class MCPOptimizer extends EventEmitter {
  private redis: Redis;
  private logger: Logger;
  private requestQueue: RequestQueue;
  private responseCache: Map<string, any> = new Map();
  private cacheTTL: number = 30000; // 30 秒缓存

  constructor(redisUrl: string = '') {
    super();
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || '');
    this.logger = new Logger('MCPOptimizer');
    this.requestQueue = new RequestQueue(redisUrl);
  }

  /**
   * 执行 MCP 工具（带缓存和队列）
   */
  public async execute(
    toolName: string,
    input: any,
    context: { traceId: string; userId: string }
  ): Promise<any> {
    const cacheKey = this.generateCacheKey(toolName, input);

    // 检查缓存
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.info(
        `[${context.traceId}] 缓存命中: ${toolName}`
      );
      return cached;
    }

    // 检查速率限制
    const rateLimited = await this.checkRateLimit(
      context.userId,
      toolName
    );
    if (rateLimited) {
      throw new Error(
        `[${toolName}] 请求过于频繁，请稍后再试`
      );
    }

    // 入队请求
    const request: MCPRequest = {
      id: `${Date.now()}-${Math.random()}`,
      toolName,
      input,
      priority: this.determinePriority(toolName),
      context,
      createdAt: new Date(),
    };

    await this.requestQueue.enqueue(request);

    // 处理请求队列
    const result = await this.processQueue();

    // 缓存结果
    await this.setCache(cacheKey, result);

    return result;
  }

  /**
   * 生成缓存 key
   */
  private generateCacheKey(toolName: string, input: any): string {
    const inputHash = JSON.stringify(input);
    return `mcp-cache:${toolName}:${this.hash(inputHash)}`;
  }

  /**
   * 简单哈希函数
   */
  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 从缓存获取
   */
  private async getFromCache(key: string): Promise<any> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      this.logger.error('缓存读取失败', err);
      return null;
    }
  }

  /**
   * 写入缓存
   */
  private async setCache(key: string, value: any): Promise<void> {
    try {
      await this.redis.setex(
        key,
        this.cacheTTL / 1000, // 转换为秒
        JSON.stringify(value)
      );
    } catch (err) {
      this.logger.error('缓存写入失败', err);
    }
  }

  /**
   * 检查速率限制（每个 AI 工具 100 次/分钟）
   */
  private async checkRateLimit(
    userId: string,
    toolName: string
  ): Promise<boolean> {
    const key = `mcp-rate-limit:${userId}:${toolName}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      // 第一次请求，设置 1 分钟过期
      await this.redis.expire(key, 60);
    }

    return current > 100;
  }

  /**
   * 确定请求优先级
   */
  private determinePriority(
    toolName: string
  ): 'high' | 'normal' | 'low' {
    // 高优先级：状态查询
    if (toolName.includes('status') || toolName.includes('query')) {
      return 'high';
    }

    // 低优先级：报告生成
    if (toolName.includes('report')) {
      return 'low';
    }

    return 'normal';
  }

  /**
   * 处理请求队列
   */
  private async processQueue(): Promise<any> {
    const request = await this.requestQueue.dequeue();

    if (!request) {
      throw new Error('队列处理失败');
    }

    const startTime = Date.now();

    try {
      // 执行实际的 MCP 工具逻辑
      const result = await this.executeTool(request.toolName, request.input);

      const executionTime = Date.now() - startTime;

      // 发出成功事件
      this.emit('toolSuccess', {
        requestId: request.id,
        toolName: request.toolName,
        executionTime,
      });

      return result;
    } catch (err: any) {
      // 发出失败事件
      this.emit('toolFailure', {
        requestId: request.id,
        toolName: request.toolName,
        error: err.message,
      });

      throw err;
    }
  }

  /**
   * 执行实际的 MCP 工具
   */
  private async executeTool(toolName: string, input: any): Promise<any> {
    // 这里调用实际的游戏逻辑
    // 示例实现
    switch (toolName) {
      case 'getFarmStatus':
        return this.getFarmStatus(input.farmId);
      case 'stealEggs':
        return this.stealEggs(input.targetFarmId, input.count);
      case 'exchangeEggs':
        return this.exchangeEggs(input.farmId, input.count);
      default:
        throw new Error(`未知的工具: ${toolName}`);
    }
  }

  /**
   * 获取农场状态（示例）
   */
  private async getFarmStatus(farmId: string): Promise<any> {
    // 调用 game-core-service
    const cacheKey = `farm-status:${farmId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // 实际调用服务
    const response = await fetch(`http://game-core-service:3001/farm/${farmId}`);
    const data = await response.json();

    // 缓存 10 秒
    await this.redis.setex(cacheKey, 10, JSON.stringify(data));

    return data;
  }

  /**
   * 偷蛋（示例）
   */
  private async stealEggs(targetFarmId: string, count: number): Promise<any> {
    const response = await fetch('http://steal-service:3002/steal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetFarmId, count }),
    });
    return response.json();
  }

  /**
   * 兑换蛋（示例）
   */
  private async exchangeEggs(farmId: string, count: number): Promise<any> {
    const response = await fetch('http://exchange-service:3003/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmId, eggsCount: count }),
    });
    return response.json();
  }

  /**
   * 订阅事件（长轮询）
   */
  public subscribeEvent(
    eventType: string,
    userId: string,
    callback: (event: any) => void
  ): void {
    const channel = `event:${eventType}:${userId}`;
    const subscriber = new Redis(process.env.REDIS_URL || '');

    subscriber.subscribe(channel, (err) => {
      if (err) {
        this.logger.error(`订阅失败: ${channel}`, err);
      }
    });

    subscriber.on('message', (ch, msg) => {
      try {
        callback(JSON.parse(msg));
      } catch (err) {
        this.logger.error('事件处理失败', err);
      }
    });
  }
}

export default MCPOptimizer;
```

---

## 6. 请求队列（RequestQueue）

```typescript
// src/mcp/requestQueue.ts
import Redis from 'ioredis';
import { Logger } from '../utils/logger';

export interface QueuedRequest {
  id: string;
  toolName: string;
  input: any;
  priority: 'high' | 'normal' | 'low';
  context: any;
  createdAt: Date;
}

export class RequestQueue {
  private redis: Redis;
  private logger: Logger;
  private queueName: string = 'mcp:request-queue';
  private maxQueueSize: number = 100000;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || '');
    this.logger = new Logger('RequestQueue');
  }

  /**
   * 入队请求
   */
  public async enqueue(request: QueuedRequest): Promise<void> {
    const queueSize = await this.redis.zcard(this.queueName);

    if (queueSize >= this.maxQueueSize) {
      throw new Error('请求队列满，请稍后重试');
    }

    // 使用 score（优先级 + 时间戳）来实现优先级队列
    const priorityScore = this.calculatePriorityScore(
      request.priority,
      request.createdAt
    );

    await this.redis.zadd(
      this.queueName,
      priorityScore,
      JSON.stringify(request)
    );

    this.logger.info(
      `请求入队: ${request.id}, 优先级: ${request.priority}, 队列大小: ${queueSize + 1}`
    );
  }

  /**
   * 出队请求
   */
  public async dequeue(): Promise<QueuedRequest | null> {
    // 获取优先级最高的请求（score 最小）
    const items = await this.redis.zrange(this.queueName, 0, 0);

    if (items.length === 0) {
      return null;
    }

    const item = items[0];
    await this.redis.zrem(this.queueName, item);

    return JSON.parse(item);
  }

  /**
   * 计算优先级分数
   * 优先级：high (0) > normal (1) > low (2)
   * 时间戳：越早的请求分数越小（先进先出）
   */
  private calculatePriorityScore(
    priority: 'high' | 'normal' | 'low',
    createdAt: Date
  ): number {
    const priorityValue =
      priority === 'high' ? 0 : priority === 'normal' ? 1 : 2;
    const timeValue = createdAt.getTime() / 1000000; // 归一化时间

    return priorityValue * 1000000 + timeValue;
  }

  /**
   * 获取队列状态
   */
  public async getStats(): Promise<{
    size: number;
    oldestRequest?: Date;
  }> {
    const size = await this.redis.zcard(this.queueName);

    // 获取最旧请求
    const oldest = await this.redis.zrange(this.queueName, 0, 0);
    let oldestRequest: Date | undefined;

    if (oldest.length > 0) {
      const request = JSON.parse(oldest[0]);
      oldestRequest = new Date(request.createdAt);
    }

    return { size, oldestRequest };
  }
}

export default RequestQueue;
```

---

## 7. 完整的 Main 入口

```typescript
// src/index.ts
import dotenv from 'dotenv';
import { APIGateway } from './core/apiGateway';
import { GameCoreService } from './services/gameCoreService';
import { StealService } from './services/stealService';
import { ExchangeService } from './services/exchangeService';
import { MCPGatewayService } from './services/mcpGatewayService';
import { NotificationService } from './services/notificationService';
import { Logger } from './utils/logger';

dotenv.config();

const logger = new Logger('Main');

/**
 * 启动完整的微服务架构
 */
async function startServices(): Promise<void> {
  try {
    // 1. 启动 API Gateway
    const gateway = new APIGateway(process.env.JWT_SECRET || 'your-secret-key');

    gateway.registerService({
      name: 'game-core-service',
      baseUrl: process.env.GAME_CORE_URL || 'http://localhost:3001',
      timeout: 5000,
      retries: 2,
      healthCheckUrl: '/health',
    });

    gateway.registerService({
      name: 'steal-service',
      baseUrl: process.env.STEAL_SERVICE_URL || 'http://localhost:3002',
      timeout: 8000,
      retries: 3,
      healthCheckUrl: '/health',
    });

    gateway.registerService({
      name: 'exchange-service',
      baseUrl: process.env.EXCHANGE_SERVICE_URL || 'http://localhost:3003',
      timeout: 5000,
      retries: 2,
      healthCheckUrl: '/health',
    });

    gateway.registerService({
      name: 'mcp-gateway-service',
      baseUrl: process.env.MCP_GATEWAY_URL || 'http://localhost:3004',
      timeout: 10000,
      retries: 1,
      healthCheckUrl: '/health',
    });

    gateway.start(parseInt(process.env.GATEWAY_PORT || '3000'));

    // 2. 启动各微服务
    const gameCore = new GameCoreService();
    gameCore.start(3001);

    const steal = new StealService();
    await steal.start(3002);

    const exchange = new ExchangeService();
    exchange.start(3003);

    const mcpGateway = new MCPGatewayService();
    mcpGateway.start(3004);

    const notification = new NotificationService();
    notification.start(3005);

    logger.info('所有微服务已启动');
  } catch (err) {
    logger.error('启动微服务失败', err);
    process.exit(1);
  }
}

// 启动服务
startServices();

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，开始优雅关闭');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，开始优雅关闭');
  process.exit(0);
});
```

---

## 8. 辅助工具类

### 8.1 日志工具

```typescript
// src/utils/logger.ts
export class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  public info(message: string, data?: any): void {
    console.log(
      `[${new Date().toISOString()}] [INFO] [${this.prefix}] ${message}`,
      data ? JSON.stringify(data) : ''
    );
  }

  public warn(message: string, data?: any): void {
    console.warn(
      `[${new Date().toISOString()}] [WARN] [${this.prefix}] ${message}`,
      data ? JSON.stringify(data) : ''
    );
  }

  public error(message: string, error?: any): void {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [${this.prefix}] ${message}`,
      error instanceof Error ? error.message : error
    );
  }
}
```

### 8.2 监控指标收集

```typescript
// src/utils/metrics.ts
export interface RequestMetrics {
  service: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  itemCount?: number;
}

export class MetricsCollector {
  private metrics: RequestMetrics[] = [];
  private maxMetrics: number = 10000;

  public recordRequest(metric: RequestMetrics): void {
    this.metrics.push({
      ...metric,
      timestamp: Date.now(),
    });

    // 限制内存使用
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  public recordRateLimit(data: any): void {
    // 记录限流指标
  }

  public recordCircuitBreaker(data: any): void {
    // 记录熔断器指标
  }

  public getMetrics(): any {
    // 计算聚合指标
    const groupedByService: { [key: string]: RequestMetrics[] } = {};

    for (const metric of this.metrics) {
      if (!groupedByService[metric.service]) {
        groupedByService[metric.service] = [];
      }
      groupedByService[metric.service].push(metric);
    }

    return Object.entries(groupedByService).map(([service, metrics]) => {
      const avgDuration =
        metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const successCount = metrics.filter((m) => m.status < 400).length;
      const successRate = (successCount / metrics.length) * 100;

      return {
        service,
        requestCount: metrics.length,
        avgDuration: avgDuration.toFixed(2),
        successRate: successRate.toFixed(2) + '%',
        lastUpdate: new Date(),
      };
    });
  }
}
```

### 8.3 服务注册与发现

```typescript
// src/core/serviceRegistry.ts
import axios from 'axios';
import { Logger } from '../utils/logger';

export interface ServiceEndpoint {
  name: string;
  port: number;
  healthCheckUrl: string;
}

export class ServiceRegistry {
  private consulUrl: string;
  private logger: Logger;

  constructor(consulUrl: string) {
    this.consulUrl = consulUrl || process.env.CONSUL_URL || 'http://localhost:8500';
    this.logger = new Logger('ServiceRegistry');
  }

  /**
   * 注册服务到 Consul
   */
  public async register(endpoint: ServiceEndpoint): Promise<void> {
    try {
      const host = process.env.SERVICE_HOST || 'localhost';
      const serviceId = `${endpoint.name}-${Date.now()}`;

      await axios.put(`${this.consulUrl}/v1/agent/service/register`, {
        ID: serviceId,
        Name: endpoint.name,
        Address: host,
        Port: endpoint.port,
        Check: {
          HTTP: `http://${host}:${endpoint.port}${endpoint.healthCheckUrl}`,
          Interval: '10s',
          Timeout: '5s',
        },
      });

      this.logger.info(
        `服务已注册: ${endpoint.name} (${host}:${endpoint.port})`
      );
    } catch (err) {
      this.logger.error(`服务注册失败: ${endpoint.name}`, err);
    }
  }

  /**
   * 从 Consul 查询服务
   */
  public async discover(serviceName: string): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.consulUrl}/v1/catalog/service/${serviceName}`
      );
      return response.data || [];
    } catch (err) {
      this.logger.error(`服务发现失败: ${serviceName}`, err);
      return [];
    }
  }
}
```

---

## 9. 压测方案

### 压测脚本

```typescript
// tests/loadTest.ts
import axios from 'axios';
import { performance } from 'perf_hooks';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const CONCURRENT_USERS = 1000;
const REQUESTS_PER_USER = 100;
const DURATION_SECONDS = 60;

interface TestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

/**
 * 压测主函数
 */
async function runLoadTest(): Promise<void> {
  console.log(`开始压测: ${CONCURRENT_USERS} 并发用户, ${REQUESTS_PER_USER} 请求/用户`);

  const results = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimes: [] as number[],
  };

  const startTime = performance.now();

  // 创建并发用户
  const userPromises = Array.from({ length: CONCURRENT_USERS }).map((_, userId) =>
    simulateUser(userId, REQUESTS_PER_USER, results)
  );

  await Promise.all(userPromises);

  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;

  // 计算统计数据
  const avgResponseTime =
    results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
  const maxResponseTime = Math.max(...results.responseTimes);
  const minResponseTime = Math.min(...results.responseTimes);
  const requestsPerSecond = results.totalRequests / duration;
  const errorRate =
    (results.failedRequests / results.totalRequests) * 100;

  const report: TestResult = {
    totalRequests: results.totalRequests,
    successfulRequests: results.successfulRequests,
    failedRequests: results.failedRequests,
    avgResponseTime: avgResponseTime.toFixed(2) as any,
    maxResponseTime,
    minResponseTime,
    requestsPerSecond: requestsPerSecond.toFixed(2) as any,
    errorRate: errorRate.toFixed(2) as any,
  };

  console.log('\n========== 压测报告 ==========');
  console.log(`总请求数: ${report.totalRequests}`);
  console.log(`成功请求: ${report.successfulRequests}`);
  console.log(`失败请求: ${report.failedRequests}`);
  console.log(`错误率: ${report.errorRate}%`);
  console.log(`平均响应时间: ${report.avgResponseTime}ms`);
  console.log(`最大响应时间: ${report.maxResponseTime}ms`);
  console.log(`最小响应时间: ${report.minResponseTime}ms`);
  console.log(`吞吐量: ${report.requestsPerSecond} QPS`);
  console.log(`总耗时: ${duration.toFixed(2)}s`);
  console.log('==============================\n');
}

/**
 * 模拟单个用户的请求
 */
async function simulateUser(
  userId: number,
  requestCount: number,
  results: any
): Promise<void> {
  const token = generateMockToken(userId);

  for (let i = 0; i < requestCount; i++) {
    try {
      const startTime = performance.now();

      // 随机选择测试接口
      const endpoint = selectRandomEndpoint();
      const response = await axios.get(
        `${GATEWAY_URL}${endpoint}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      results.responseTimes.push(responseTime);
      results.totalRequests++;

      if (response.status < 400) {
        results.successfulRequests++;
      } else {
        results.failedRequests++;
      }
    } catch (err) {
      results.failedRequests++;
      results.totalRequests++;
    }
  }
}

/**
 * 生成模拟 JWT Token
 */
function generateMockToken(userId: number): string {
  // 实际应使用真实 JWT 库
  return Buffer.from(
    JSON.stringify({
      userId: `user-${userId}`,
      role: 'player',
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64');
}

/**
 * 随机选择测试接口
 */
function selectRandomEndpoint(): string {
  const endpoints = [
    '/api/v1/game/farms',
    '/api/v1/farm/123/buy-chicken',
    '/api/v1/steal',
    '/api/v1/exchange/rate',
    '/api/v1/mcp/tool/status',
  ];

  return endpoints[Math.floor(Math.random() * endpoints.length)];
}

// 运行压测
runLoadTest().catch(console.error);
```

---

## 10. Docker Compose 本地开发环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Redis 缓存和消息队列
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  # RabbitMQ 消息队列
  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

  # MySQL 数据库
  mysql:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: aiggs
    volumes:
      - mysql-data:/var/lib/mysql

  # Consul 服务发现
  consul:
    image: consul:latest
    ports:
      - "8500:8500"
      - "8600:8600/udp"
    command: agent -server -ui -bootstrap-expect=1 -client=0.0.0.0

  # API Gateway
  gateway:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      GATEWAY_PORT: 3000
      REDIS_URL: redis://redis:6379
      CONSUL_URL: http://consul:8500
    depends_on:
      - redis
      - consul

volumes:
  redis-data:
  rabbitmq-data:
  mysql-data:
```

---

## 11. 性能优化建议

### 数据库优化
- 使用连接池（PgBouncer 或 Hikari）
- 偷蛋接口独立数据库连接池（300+ 连接）
- 添加适当的索引（farmId, userId, timestamp）
- 使用读写分离（主从复制）

### 缓存策略
- Redis 缓存农场状态（10 秒）
- 排行榜缓存（5 分钟）
- MCP 响应缓存（30 秒）
- 使用缓存预热和同步

### 异步处理
- 消息队列处理事件通知
- 长轮询替代轮询
- 后台任务异步执行

### 监控告警
- Prometheus + Grafana 监控
- 关键指标告警（QPS, 错误率, 响应时间）
- 分布式链路追踪（Jaeger）

---

## 12. 扩展性指标

| 指标 | 目标值 | 实现方案 |
|------|--------|--------|
| **全局 QPS** | 10,000 | API Gateway 负载均衡 |
| **单用户 RPM** | 60 | 令牌桶限流 |
| **偷蛋 QPS** | 2,000 | 独立微服务 + 连接池 |
| **兑换 QPS** | 1,000 | 事务处理 + 缓存 |
| **WebSocket 连接** | 1,000,000 | Socket.IO + Redis Adapter |
| **MCP 工具 RPM** | 100 | 请求队列 + 响应缓存 |
| **平均响应时间** | < 200ms | 缓存 + 异步处理 |
| **可用性** | 99.9% | 熔断降级 + 健康检查 |

---

## 总结

本方案设计了完整的微服务高并发架构，包括：
1. **API Gateway** - 统一入口，支持请求路由、聚合、认证、追踪
2. **ResilienceManager** - 限流、熔断、降级，保障系统稳定性
3. **5 个微服务** - 按业务拆分，独立部署、扩展
4. **WebSocket 实时通知** - 支持 100 万长连接
5. **MCP 优化** - 请求队列、响应缓存、速率限制
6. **完整的压测和监控方案**

生产部署时，根据实际流量进行容量规划和性能调优。
