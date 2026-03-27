# AIggs 项目 - K8s 部署与容量规划文档

**项目**: AIggs - 首个 AI 原生链上养鸡农场游戏
**环境**: 生产环境（支撑 100 万日活用户）
**更新日期**: 2026-03-27
**维护者**: DevOps/SRE 架构团队

---

## 目录

1. [架构概览](#架构概览)
2. [容量规划估算](#容量规划估算)
3. [部署配置详解](#部署配置详解)
4. [自动扩缩容策略](#自动扩缩容策略)
5. [监控告警体系](#监控告警体系)
6. [云服务商推荐](#云服务商推荐)
7. [成本估算与优化](#成本估算与优化)
8. [部署指南](#部署指南)
9. [故障恢复方案](#故障恢复方案)

---

## 架构概览

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户层（全球用户）                        │
│                    100 万 DAU                               │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Nginx Ingress Controller                    │
│              (3 副本，负载均衡 + SSL/TLS)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼──┐  ┌──────▼───┐  ┌────▼──────┐
│ Game     │  │ Steal    │  │ Exchange  │
│ Core     │  │ Service  │  │ Service   │
│ Service  │  └──────────┘  └───────────┘
│ (20副本) │
└──────────┘
        │    ┌──────────────┐  ┌──────────────┐
        │    │ MCP Gateway  │  │Notification  │
        │    │ Service      │  │ Service      │
        │    │ (15 副本)    │  │ (12 副本)    │
        │    └──────────────┘  └──────────────┘
        │
┌───────┴──────────────────────────────────────────────────┐
│                   消息队列 (RabbitMQ/NATS)               │
│               3 节点集群，支持 100k msg/s                │
└───────┬──────────────────────────────────────────────────┘
        │
┌───────┼──────────────────────────────────────────────────┐
│       │          缓存层 (Redis)                           │
│       └─ 6 节点集群（3 主 3 从），1000k ops/s           │
│                                                            │
│       ┌────────────────────────────────────────────────┐  │
│       │  主从复制 (PostgreSQL)                         │  │
│       │  1 主 + 3 从，支持读负载均衡                  │  │
│       └────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 核心微服务

| 服务名 | 功能 | 副本数 | CPU | 内存 | 说明 |
|--------|------|--------|-----|------|------|
| game-core-service | 核心游戏逻辑 | 3-20 | 0.5-1 | 512Mi-1Gi | 产蛋/属性管理 |
| steal-service | 偷蛋机制 | 2-10 | 0.3-0.6 | 256-512Mi | PvP 交互 |
| exchange-service | EGGS ↔ $AIGG | 2-8 | 0.3-0.6 | 256-512Mi | 链上交互 |
| mcp-gateway-service | AI 接口网关 | 3-15 | 0.5-1 | 512Mi-1Gi | Claude/GPT 调用 |
| notification-service | 实时通知 | 2-12 | 0.3-1 | 512Mi-1Gi | WebSocket 连接 |
| nginx-ingress | 入口控制器 | 3 | 0.2-0.5 | 256-512Mi | 路由 + SSL |

---

## 容量规划估算

### 1. 用户流量预测（100 万 DAU）

#### 1.1 并发用户数

```
DAU: 1,000,000
平均日活时长: 2 小时
峰值时段占比: 1.5 小时（占总活跃的 60%）
峰值并发用户数: 1,000,000 × 60% ÷ 24 ÷ 60 × 90 ≈ 41,667 用户
```

**分时段流量分布**：
- 早报时段 (4:00-6:00): 5% DAU （50,000 用户）
- 工作时段 (9:00-12:00): 20% DAU
- 午休 (12:00-14:00): 15% DAU
- 傍晚 (18:00-21:00): 35% DAU （峰值）
- 夜间 (21:00-24:00): 20% DAU
- 其他: 5% DAU

#### 1.2 每日请求量估算

```
假设：
- 每个活跃用户每天平均生成 100 个请求
- 峰值请求/秒 = DAU × 100 ÷ 86400 × 峰值系数

计算：
- 基础 QPS = 1,000,000 × 100 ÷ 86400 = 1,157 QPS
- 峰值 QPS (1.5x)  = 1,157 × 1.5 ≈ 1,736 QPS
- 尖峰 QPS (2x，产蛋事件)  = 1,157 × 2 ≈ 2,314 QPS
```

**日请求量**：
```
日均 QPS: 1,157
日均请求数: 1,157 × 86,400 = 99,980,800 ≈ 1 亿请求/天

峰值 2 小时请求数: 1,736 × 3600 × 2 = 12,499,200 请求
```

#### 1.3 各服务请求分布

```
game-core-service:     40% (400,000 requests/day)
steal-service:         15% (150,000 requests/day)
exchange-service:       8% ( 80,000 requests/day)
mcp-gateway-service:   25% (250,000 requests/day)
notification-service:  12% (120,000 requests/day)

峰值 QPS 分布：
- game-core:     694 QPS (最大 1,388 QPS 尖峰)
- steal:         260 QPS (最大  520 QPS)
- exchange:      139 QPS (最大  278 QPS)
- mcp-gateway:   347 QPS (最大  694 QPS)
- notification:  165 QPS (最大  330 QPS)
```

---

### 2. 数据库存储增长预测

#### 2.1 核心数据表

```
players 表（玩家账户）:
- 行数: 2,000,000 (激活用户总数，DAU 1M 对应注册 2M)
- 每行大小: 500 bytes
- 总大小: 1 GB
- 增长: 1,000 新玩家/天 × 500 bytes = 500 MB/年

eggs_inventory 表（蛋库存）:
- 行数: 2,000,000 (玩家数)
- 每行大小: 100 bytes
- 总大小: 200 MB
- 增长: 线性，约 100 MB/年

transactions 表（交易历史）:
- 日均交易数: 1,000,000 × 10 = 1,000 万/天
- 年均交易数: 365 × 1,000 万 = 36.5 亿条
- 每行大小: 200 bytes
- 年增长: 36.5 亿 × 200 bytes = 730 GB/年
- 3 年存储: 2.19 TB
  ⚠️ 需要分区或归档策略

steal_history 表（偷蛋历史）:
- 日均偷蛋: 1,000,000 × 2 = 200 万次
- 年均: 365 × 200 万 = 7.3 亿条
- 每行大小: 150 bytes
- 年增长: 7.3 亿 × 150 bytes = 109.5 GB/年
- 3 年存储: 328.5 GB

mcp_request_logs 表（MCP 调用日志）:
- 日均请求: 2.5 亿 (25% of DAU × 100)
- 年均: 365 × 2.5 亿 = 91.25 亿条
- 每行大小: 500 bytes (含 response payload)
- 年增长: 91.25 亿 × 500 bytes = 4.56 TB/年
  ⚠️ 建议只保留 7 天日志，月度汇总统计存档
```

#### 2.2 数据库存储总规模

```
核心业务数据: 3 TB (3 年数据)
缓存表: 0.5 TB
日志表 (7天): 0.2 TB
备份副本: × 3 (PostgreSQL 1主3从) = 10.7 TB

总存储容量需求：
基础 (1 年): 6 TB
推荐配置 (3 年滚动): 15 TB
峰值备份: 20 TB
```

#### 2.3 数据库优化建议

```
1. 分区策略 (Partitioning):
   - transactions 按日期分区（月度）
   - steal_history 按日期分区
   - mcp_request_logs 按日期分区（自动清理 7 天）

2. 索引优化:
   - players (user_id, created_at)
   - transactions (player_id, created_at)
   - steal_history (attacker_id, victim_id, created_at)

3. 归档策略:
   - mcp_request_logs: 仅保存当周完整数据，老数据归档到 S3
   - transactions: 3 年滚动，超过 3 年自动归档
```

---

### 3. Redis 缓存需求估算

#### 3.1 缓存数据结构

```
session:* (用户会话)
- 数量: 50,000 (峰值并发)
- 单个大小: 5 KB
- 总大小: 250 MB
- TTL: 24 小时

player:*:eggs (玩家蛋数)
- 数量: 2,000,000
- 单个大小: 200 bytes
- 总大小: 400 MB
- TTL: 无限期（通过触发器更新）

mcp_requests:* (MCP 请求去重)
- 数量: 100,000
- 单个大小: 1 KB
- 总大小: 100 MB
- TTL: 1 小时

rate_limit:* (请求限流)
- 数量: 50,000
- 单个大小: 50 bytes
- 总大小: 2.5 MB
- TTL: 1 分钟

leaderboard:* (排行榜)
- 数量: 10 (每周 + 全时段)
- 单个大小: 10 MB (前 100k 玩家)
- 总大小: 100 MB
- TTL: 无限期

websocket:connections (WebSocket 连接映射)
- 数量: 50,000
- 单个大小: 100 bytes
- 总大小: 5 MB
- TTL: session TTL
```

#### 3.2 Redis 集群规模

```
总数据量: 250 + 400 + 100 + 2.5 + 100 + 5 = 857.5 MB

考虑因素：
- 缓存命中率目标: 95%
- 复制副本: × 2 (主从)
- 内存开销: × 1.3 (RedisCluster metadata)

推荐规模:
基础: 4 GB (开发/测试)
生产: 16 GB (857.5 MB × 2 × 1.3 × 6节点 ÷ 6 = 3.74 GB/节点)
实际配置: 6 节点 × 4 GB = 24 GB (留有 50% 冗余)

操作性能:
- 读操作: 1,000,000 ops/sec
- 写操作: 100,000 ops/sec
- 混合: ~500,000 ops/sec

单机 Redis 性能: ~100k ops/sec
所需节点数: 500k ÷ 100k = 5 ~ 6 节点 ✓ (推荐值)
```

#### 3.3 Redis 监控指标

```
关键指标:
- 内存使用率: < 80% (告警)
- 缓存命中率: > 90% (目标)
- 延迟 P99: < 10 ms
- 连接数: < 10,000/节点
```

---

### 4. RabbitMQ 消息队列估算

#### 4.1 消息队列流量

```
产蛋队列 (egg_production):
- 频率: 每 8 小时自动触发
- 每次处理玩家数: 1,000,000
- 消息体大小: 100 bytes
- 尖峰处理: 1M ÷ 8 小时 = 125,000 msg/sec

偷蛋队列 (steal_attempt):
- 频率: 用户随时发起
- 日均次数: 200 万次
- 尖峰: 200万 ÷ 14 小时峰值时段 = 397 msg/sec

交易队列 (exchange_transaction):
- 频率: 用户需求驱动
- 日均次数: 100 万次
- 尖峰: 1M ÷ 14 小时 = 198 msg/sec

通知队列 (notification):
- 频率: 事件驱动
- 日均次数: 500 万次
- 尖峰: 5M ÷ 14 小时 = 992 msg/sec

MCP 异步队列 (mcp_async_calls):
- 频率: 部分 MCP 调用异步化
- 日均次数: 2.5 亿 × 20% = 5000 万次
- 尖峰: 5000万 ÷ 14 小时 = 9,920 msg/sec
  (实际可能受外部 API 速率限制)

日均消息总数:
200万 + 100万 + 500万 + 5000万 = 5700万 msg/day

峰值消息率（尖峰）:
125k (产蛋) + 397 + 198 + 992 + 9920 ≈ 137k msg/sec
```

#### 4.2 RabbitMQ 集群配置

```
推荐配置: 3 节点集群 (高可用)

每节点配置:
- CPU: 2 核
- 内存: 4 GB
- 磁盘: 100 GB

总集群容量:
- 吞吐量: 150k msg/sec (峰值)
- 内存缓冲: 12 GB
- 磁盘队列存储: 300 GB

队列持久化:
- 所有关键队列持久化到磁盘
- 自动清理策略: 已消费消息 1 小时后删除
```

---

### 5. 网络带宽估算

#### 5.1 流量计算

```
平均请求大小: 5 KB
平均响应大小: 10 KB
请求频率: 1,157 QPS (基础) → 2,314 QPS (尖峰)

基础带宽:
- 入站: 1,157 × 5 KB × 8 bits = 46.3 Mbps
- 出站: 1,157 × 10 KB × 8 bits = 92.6 Mbps
- 总计: 138.9 Mbps ≈ 140 Mbps

峰值带宽:
- 入站: 2,314 × 5 KB × 8 bits = 92.6 Mbps
- 出站: 2,314 × 10 KB × 8 bits = 185.1 Mbps
- 总计: 277.7 Mbps ≈ 280 Mbps

WebSocket 长连接:
- 连接数: 50,000 并发
- 单连接带宽: 1 KB/sec (推送消息)
- 总带宽: 50,000 × 1 KB × 8 = 400 Mbps

最大总带宽: 280 + 400 = 680 Mbps ≈ 1 Gbps

推荐: 10 Gbps 专线 (留有充足冗余)
```

#### 5.2 跨域通信

```
- Kubernetes CNI: Flannel 或 Calico
- 内部通信: 非限制
- 出站 (外部 API): 预留 500 Mbps
  - Claude API: 100 Mbps
  - GPT API: 100 Mbps
  - Base RPC: 100 Mbps
  - 其他: 200 Mbps
```

---

### 6. Kubernetes 集群规模

#### 6.1 计算资源需求

```
Pod 资源估算（基础负载）:

game-core-service (3 replicas):
  3 × (0.5 CPU + 512 Mi) = 1.5 CPU + 1.5 Gi

steal-service (2 replicas):
  2 × (0.3 CPU + 256 Mi) = 0.6 CPU + 0.5 Gi

exchange-service (2 replicas):
  2 × (0.3 CPU + 256 Mi) = 0.6 CPU + 0.5 Gi

mcp-gateway-service (3 replicas):
  3 × (0.5 CPU + 512 Mi) = 1.5 CPU + 1.5 Gi

notification-service (2 replicas):
  2 × (0.3 CPU + 512 Mi) = 0.6 CPU + 1.0 Gi

nginx-ingress (3 replicas):
  3 × (0.2 CPU + 256 Mi) = 0.6 CPU + 0.75 Gi

prometheus:
  1 × (0.5 CPU + 2 Gi) = 0.5 CPU + 2.0 Gi

grafana:
  1 × (0.2 CPU + 256 Mi) = 0.2 CPU + 0.25 Gi

alertmanager:
  1 × (0.1 CPU + 128 Mi) = 0.1 CPU + 0.125 Gi

postgres-exporter:
  1 × (0.1 CPU + 128 Mi) = 0.1 CPU + 0.125 Gi

redis-exporter:
  1 × (0.1 CPU + 128 Mi) = 0.1 CPU + 0.125 Gi

rabbitmq-exporter:
  1 × (0.1 CPU + 128 Mi) = 0.1 CPU + 0.125 Gi

Pod 总计:
  6.2 CPU + 8.375 Gi

基础设施 Pod (系统、DNS、CNI):
  3 CPU + 2 Gi

总计（基础）: 9.2 CPU + 10.375 Gi
```

#### 6.2 峰值扩缩配置

```
HPA 最大副本数:
- game-core: 20 (×10 倍)
- steal-service: 10 (×5 倍)
- exchange-service: 8 (×4 倍)
- mcp-gateway: 15 (×5 倍)
- notification-service: 12 (×6 倍)

峰值资源需求:
- game-core: 20 × (0.5 CPU + 512 Mi) = 10 CPU + 10 Gi
- steal-service: 10 × (0.3 CPU + 256 Mi) = 3 CPU + 2.5 Gi
- exchange-service: 8 × (0.3 CPU + 256 Mi) = 2.4 CPU + 2 Gi
- mcp-gateway: 15 × (0.5 CPU + 512 Mi) = 7.5 CPU + 7.5 Gi
- notification-service: 12 × (0.3 CPU + 512 Mi) = 3.6 CPU + 6 Gi

峰值总计: 26.5 CPU + 28 Gi + 基础设施

推荐集群节点配置:
- 基础: 5 个节点 (3 CPU + 4 Gi 内存/节点 = 15 CPU + 20 Gi)
- 带有 HPA: 10 个节点 (32 CPU + 40 Gi)
```

#### 6.3 节点类型建议

```
生产集群配置（10 个节点）:

7 个通用节点（数据库 + 缓存 + 消息队列）:
  - 机器类型: AWS c6i.2xlarge (8 vCPU + 16 Gi RAM)
  或 GCP n1-standard-8 (8 vCPU + 30 Gi RAM)
  或 阿里云 ecs.c6.2xlarge

3 个计算优化节点（应用服务）:
  - 机器类型: AWS c6i.4xlarge (16 vCPU + 32 Gi RAM)
  或 GCP n1-highcpu-16 (16 vCPU + 60 Gi RAM)

存储（所有节点）:
  - 系统盘: 100 GB SSD
  - 数据盘: 500 GB SSD (数据库)
            500 GB SSD (Redis)
            500 GB SSD (RabbitMQ)
            500 GB SSD (日志/监控)
```

---

## 部署配置详解

### 1. Deployment 与 StatefulSet

#### 1.1 Deployment（无状态服务）

所有应用服务使用 `Deployment`:
- game-core-service
- steal-service
- exchange-service
- mcp-gateway-service
- notification-service

特点：
- 支持滚动更新、版本回滚
- 副本自动补充
- 配合 HPA 进行水平扩缩

#### 1.2 StatefulSet（有状态服务）

数据库和缓存使用 `StatefulSet`:
- PostgreSQL: 1 主 + 3 从
- Redis: 6 节点集群 (3 主 3 从)
- RabbitMQ: 3 节点集群

特点：
- 保持 Pod 标识（postgres-0, postgres-1 等）
- 顺序启动和关闭
- 持久化存储与 Pod 绑定
- 支持主从复制

---

### 2. Pod 反亲和性（Pod Anti-Affinity）

#### 2.1 配置

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values:
                  - game-core-service
          topologyKey: kubernetes.io/hostname
```

#### 2.2 作用

确保同一服务的不同副本分散到不同物理节点：
- 避免单点故障
- 提高容灾能力
- 充分利用集群资源

---

### 3. 资源配置（Requests & Limits）

#### 3.1 Requests（保留资源）

```yaml
resources:
  requests:
    cpu: 500m          # 预留 0.5 核 CPU
    memory: 512Mi      # 预留 512 MiB 内存
```

作用：
- Kubernetes 调度器用于选择节点
- 保证 Pod 获得最少资源
- 定义集群总体容量规划

#### 3.2 Limits（资源上限）

```yaml
resources:
  limits:
    cpu: 1             # 最多 1 核 CPU
    memory: 1Gi        # 最多 1 GiB 内存
```

作用：
- 防止容器超额消耗
- CPU limit：通过 cgroup throttle 限流
- Memory limit：超过会被 OOMKill

#### 3.3 Requests vs Limits 对比

| 配置 | Requests | Limits |
|------|----------|--------|
| 用途 | 调度决策 | 资源隔离 |
| 不足 | Pod 无法调度 | Pod 被 Kill |
| 推荐比例 | 1:2 | 保守设置 |

---

### 4. 健康检查（Health Checks）

#### 4.1 Readiness Probe（就绪探针）

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 15  # 启动后 15s 开始检查
  periodSeconds: 10        # 每 10s 检查一次
  timeoutSeconds: 3        # 超时 3s 判定失败
  failureThreshold: 3      # 3 次失败后标记为 NotReady
```

**作用**: 确定 Pod 是否准备接收流量
- Service 不会将请求发送到 NotReady 的 Pod
- 用于零停机部署

#### 4.2 Liveness Probe（存活探针）

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 15
  timeoutSeconds: 3
  failureThreshold: 3
```

**作用**: 检测容器是否存活
- 探针失败后，kubelet 会重启容器
- 恢复死锁或内存泄漏

---

### 5. 优雅终止（Graceful Shutdown）

#### 5.1 preStop Hook

```yaml
lifecycle:
  preStop:
    exec:
      command:
        - /bin/sh
        - -c
        - sleep 30
```

#### 5.2 terminationGracePeriodSeconds

```yaml
terminationGracePeriodSeconds: 40
```

**执行流程**：
1. 收到 SIGTERM 信号
2. 执行 preStop Hook（30s）
3. 等待 40s 内应用自行关闭
4. 强制发送 SIGKILL

**作用**：
- 允许应用完成进行中的请求
- 优雅关闭数据库连接
- 避免请求丢失

---

### 6. ConfigMap & Secret 管理

#### 6.1 ConfigMap（非敏感配置）

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: game-config
data:
  EGG_PRODUCTION_INTERVAL: "28800"
  EXCHANGE_RATE: "1000"
```

**特点**：
- 明文存储（可被 etcd 提取）
- 大小限制 1 MB
- 可通过环境变量或卷挂载引用

#### 6.2 Secret（敏感信息）

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: aiggs-secrets
type: Opaque
stringData:
  DB_PASSWORD: "..."
  REDIS_PASSWORD: "..."
```

**安全建议**：
1. 启用 etcd 加密：`--encryption-provider-config`
2. 使用外部秘钥管理（HashiCorp Vault、AWS Secrets Manager）
3. 限制 Secret 访问权限（RBAC）
4. 定期轮换密钥

---

## 自动扩缩容策略

### 1. HPA（Horizontal Pod Autoscaler）

#### 1.1 工作原理

```
Metrics Server 采集指标
    ↓
HPA 控制器评估 (15s 间隔)
    ↓
计算期望副本数: targetMetricValue / currentMetricValue
    ↓
更新 Deployment replicas
    ↓
调度器分配 Pod 到节点
```

#### 1.2 扩缩容算法

```
desiredReplicas = ceil(currentReplicas × (currentValue / targetValue))

示例：
- 当前副本数: 3
- 当前 CPU 使用率: 85%
- 目标 CPU 使用率: 70%
- 期望副本: ceil(3 × (85 / 70)) = ceil(3.64) = 4
```

#### 1.3 各服务扩缩策略

| 服务 | 指标 | 触发条件 | 最小副本 | 最大副本 |
|------|------|---------|---------|---------|
| game-core | CPU + QPS | >70% or >3000 QPS | 3 | 20 |
| steal-service | CPU + 并发 | >60% or >500 conn | 2 | 10 |
| exchange-service | CPU | >70% | 2 | 8 |
| mcp-gateway | CPU + 连接数 | >75% or >5000 conn | 3 | 15 |
| notification | Memory + WebSocket | >75% or >50k conn | 2 | 12 |

#### 1.4 扩缩容行为控制

```yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 0    # 立即扩容
    policies:
      - type: Percent
        value: 100                   # 每次翻倍
        periodSeconds: 15
      - type: Pods
        value: 2                     # 或增加 2 个 Pod
        periodSeconds: 15
    selectPolicy: Max                # 选择增长最快的

  scaleDown:
    stabilizationWindowSeconds: 300  # 缩容前稳定 5 分钟
    policies:
      - type: Percent
        value: 50                    # 每次减半
        periodSeconds: 60
```

---

### 2. KEDA（Kubernetes Event Driven Autoscaling）

#### 2.1 优势

标准 HPA 只支持 CPU/Memory/Custom Metrics，KEDA 支持：
- RabbitMQ 队列深度
- Redis 列表长度
- Kafka offset lag
- Cron 定时
- 外部系统事件

#### 2.2 场景应用

```
1. 消息队列驱动扩缩
   触发: 队列消息数 > 10,000
   操作: 扩容消费者

2. 定时扩缩（早报预计算）
   触发: 每天 04:00-06:00
   操作: 扩容至 15 副本

3. 数据库压力驱动
   触发: 慢查询增加 / 连接数上升
   操作: 扩容读副本
```

---

### 3. VPA（Vertical Pod Autoscaler）

#### 3.1 工作原理

```
历史资源使用数据 → VPA 推荐器 → 生成推荐值
                 ↓
            VPA 更新器
                 ↓
            删除现有 Pod
                 ↓
            以新 requests/limits 重新调度
```

#### 3.2 工作模式

| 模式 | 说明 |
|------|------|
| `Off` | 仅生成推荐，不自动更新 |
| `Initial` | 仅在 Pod 创建时应用 |
| `Recreate` | 删除 Pod 并重建（有停机） |
| `Auto` | 优先 Recreate，可用时 In-place |

#### 3.3 配置示例

```yaml
resourcePolicy:
  containerPolicies:
    - containerName: game-core
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 2
        memory: 2Gi
      controlledResources: ["cpu", "memory"]
```

---

## 监控告警体系

### 1. Prometheus 架构

#### 1.1 数据采集

```
Pull 模式（主动抓取）:
  Prometheus 定期 (15s) 向 exporter 拉取指标

Push 模式（被动推送）:
  应用主动推送指标到 Prometheus Pushgateway

大规模场景下，通常混合使用。
```

#### 1.2 指标保存

```yaml
args:
  - '--storage.tsdb.path=/prometheus'
  - '--storage.tsdb.retention.time=15d'
  - '--storage.tsdb.retention.size=100GB'
```

**特点**：
- 时间序列数据库 (TSDB)
- 单点存储（分布式方案需 Thanos）
- 15 天滚动保留

---

### 2. 关键业务指标

#### 2.1 核心指标

```
# 产蛋统计
aiggs_eggs_produced_total
  标签: player_id, farm_id
  类型: Counter (累加)
  用途: 业务 KPI

# 偷蛋统计
aiggs_steal_attempts_total
  标签: attacker_id, victim_id, result(success|failed)
  类型: Counter

# 兑换交易
aiggs_exchange_volume
  标签: exchange_type(eggs2token|token2eggs), status
  类型: Gauge

# 在线玩家
aiggs_active_players
  标签: region, platform
  类型: Gauge

# MCP 请求
aiggs_mcp_requests_total
  标签: model(claude|gpt), status, endpoint
  类型: Counter

# WebSocket 连接
aiggs_websocket_connections
  标签: service
  类型: Gauge
```

#### 2.2 系统指标

```
HTTP 请求:
  http_requests_total (Counter)
  http_request_duration_seconds (Histogram)
  http_request_size_bytes (Histogram)
  http_response_size_bytes (Histogram)

数据库连接:
  pg_stat_activity_count (Gauge)
  pg_stat_database_tup_returned (Counter)
  pg_slow_queries (Gauge, > 1s)

缓存性能:
  redis_commands_processed_total (Counter)
  redis_connected_clients (Gauge)
  redis_used_memory_bytes (Gauge)
  redis_keyspace_hits_total (Counter)
  redis_keyspace_misses_total (Counter)

消息队列:
  rabbitmq_queue_messages (Gauge)
  rabbitmq_queue_messages_ready (Gauge)
  rabbitmq_queue_messages_unacked (Gauge)
```

---

### 3. 告警规则（AlertManager）

#### 3.1 告警级别

```
Critical (立即通知):
  - 影响: 用户无法使用
  - 响应: < 5 分钟
  - 通知: Slack + PagerDuty + Email

Warning (工作时间响应):
  - 影响: 服务性能下降
  - 响应: < 15 分钟
  - 通知: Slack

Info (信息性):
  - 影响: 无
  - 响应: 无需立即响应
  - 通知: 日度汇总
```

#### 3.2 告警示例

```
# 1. 服务可用性
alert: ServiceUnavailability
expr: (1 - success_rate) > 0.001  # > 0.1% 错误
for: 2m
labels:
  severity: critical

# 2. 数据库主库故障
alert: PostgreSQLMasterDown
expr: pg_up{instance="postgres-0"} == 0
for: 1m
labels:
  severity: critical

# 3. P99 延迟高
alert: HighLatencyP99
expr: histogram_quantile(0.99, latency_bucket) > 2s
for: 5m
labels:
  severity: warning

# 4. 内存溢出风险
alert: PodMemoryUsageHigh
expr: (used_memory / limit) > 0.9
for: 5m
labels:
  severity: warning
```

#### 3.3 告警抑制规则

```yaml
inhibit_rules:
  # 实例已宕机，抑制该实例的其他告警
  - source_match:
      severity: 'critical'
      alertname: 'InstanceDown'
    target_match_re:
      severity: 'warning|info'
    equal: ['instance']
```

---

### 4. Grafana 仪表板

#### 4.1 Dashboard 结构

```
层级 1: 全局概览
  ├─ 在线用户数
  ├─ 服务可用性
  ├─ P99 延迟
  └─ 错误率

层级 2: 业务指标
  ├─ 产蛋速率
  ├─ 偷蛋频率
  ├─ 兑换交易量
  └─ MCP 调用成功率

层级 3: 基础设施
  ├─ Pod CPU/Memory
  ├─ 数据库连接数
  ├─ Redis 内存使用
  └─ RabbitMQ 队列深度

层级 4: 微服务详情（每个服务一个面板）
  ├─ QPS 分布
  ├─ 延迟 P50/P95/P99
  ├─ 错误率
  └─ Pod 副本数趋势
```

#### 4.2 Panel 类型选择

```
时间序列数据:
  用 TimeSeries / Graph panel
  显示趋势、周期性

当前值统计:
  用 Stat panel
  显示关键指标快照

排行榜:
  用 Table panel
  按 QPS/延迟排序

分布比例:
  用 PieChart / Gauge
  显示各服务占比
```

---

## 云服务商推荐

### 1. AWS 方案

#### 1.1 服务组件映射

```
Kubernetes:
  → EKS (Elastic Kubernetes Service)

计算:
  → EC2 c6i.2xlarge / c6i.4xlarge

存储:
  → EBS gp3 (SSD)
  → S3 (日志归档)

数据库:
  → RDS PostgreSQL (managed option)
    或自建 PostgreSQL (EKS StatefulSet) ✓

缓存:
  → ElastiCache Redis (managed option)
    或自建 Redis (EKS StatefulSet) ✓

监控:
  → CloudWatch (可选)
    + Prometheus (自建) ✓
```

#### 1.2 成本估算（月）

```
计算资源:
  10 × c6i.2xlarge ($0.34/h)
  = 10 × 0.34 × 730 = $2,482

存储:
  EBS gp3: 2 TB × $0.08/GB/月 = $160
  S3 日志: 100 GB × $0.023/GB = $2.3
  小计: $162

数据传输:
  入站: 免费
  出站: 1 TB × $0.09/GB = $90
  小计: $90

监控告警:
  Prometheus + Grafana: $200 (自建服务器成本)

管理费用:
  EKS 集群: $0.10/小时 = $73

月度小计: $3,007
```

---

### 2. GCP 方案

#### 2.1 服务组件映射

```
Kubernetes:
  → GKE (Google Kubernetes Engine)

计算:
  → Compute Engine n1-standard-8 / n1-highcpu-16

存储:
  → Persistent Disk pd-ssd
  → Cloud Storage (日志)

数据库:
  → Cloud SQL PostgreSQL (managed)
    或自建 (GKE StatefulSet) ✓

缓存:
  → Cloud Memorystore Redis (managed)
    或自建 (GKE StatefulSet) ✓

监控:
  → Cloud Monitoring
    + Prometheus (自建) ✓
```

#### 2.2 成本估算（月）

```
计算资源:
  7 × n1-standard-8 ($0.38/h)
  + 3 × n1-highcpu-16 ($0.38/h)
  = (7 + 3) × 0.38 × 730 = $2,774

存储:
  PD-SSD: 2 TB × $0.170/GB/月 = $340
  Cloud Storage: 100 GB × $0.020/GB = $2
  小计: $342

数据传输:
  出站（同 AWS）: $90

监控告警:
  Cloud Monitoring: $200
  Prometheus/Grafana: $200
  小计: $400

管理费用:
  GKE 集群: $0.10/小时 = $73

月度小计: $3,679
```

---

### 3. 阿里云方案

#### 3.1 服务组件映射

```
Kubernetes:
  → ACK (Container Service for Kubernetes)

计算:
  → ECS ecs.c6.2xlarge

存储:
  → ESSD (Enhanced SSD)
  → OSS (日志归档)

数据库:
  → RDS PostgreSQL (managed)
    或自建 (ACK StatefulSet) ✓

缓存:
  → Redis (managed)
    或自建 (ACK StatefulSet) ✓

监控:
  → ARMS (Application Real-time Monitoring Service)
    + Prometheus (自建) ✓
```

#### 3.2 成本估算（月）

```
计算资源:
  10 × ecs.c6.2xlarge ¥1.78/h
  = 10 × 1.78 × 730 = ¥12,974 ≈ $1,847

存储:
  ESSD: 2 TB × ¥1.05/GB/月 = ¥2,100 ≈ $300
  OSS: 100 GB × ¥0.12/GB = ¥12 ≈ $2
  小计: ¥2,112 ≈ $302

数据传输:
  出站：¥0.8/GB × 1 TB = ¥800 ≈ $114

监控告警:
  ARMS: ¥200/月 = $29
  Prometheus/Grafana: ¥1,400 = $200
  小计: ¥1,600 ≈ $229

ACK 集群费用:
  托管控制平面: 免费 (标准版)
  节点管理: ¥800/月 = $114

月度小计: ¥17,486 ≈ $2,496
```

---

### 4. 混合云方案

**适用场景**: 需要数据本地化、定制化需求强

```
边缘部署:
  本地数据中心: 数据库 + 缓存 + 消息队列
  → 核心有状态服务
  → 低延迟要求

云计算:
  公有云 (AWS/GCP/阿里云): 应用服务 + 监控
  → 高可用性
  → 自动扩缩

同步:
  主从复制:
    本地 PostgreSQL Master
    → 云端 PostgreSQL Slave (可读)

  数据备份:
    本地 → 云端对象存储

  日志聚合:
    应用 → 云端日志系统
```

---

## 成本估算与优化

### 1. 年度成本预测

#### 1.1 按方案对比

```
| 方案 | 月度费用 | 年度费用 | 相对成本 |
|-----|---------|---------|---------|
| AWS | $3,007  | $36,084 | 1.0x    |
| GCP | $3,679  | $44,148 | 1.22x   |
| 阿里云| $2,496 | $29,952 | 0.83x   |
```

#### 1.2 成本构成

```
AWS 方案:
  计算: 2,482 (68.5%) ← 最大开支
  存储: 162 (4.5%)
  传输: 90 (2.5%)
  管理: 73 (2%)
  监控: 200 (5.5%)
  其他: 273 (9%)
```

---

### 2. 成本优化策略

#### 2.1 计算优化

```
1. 预留实例 (Reserved Instances):
   购买 1 年或 3 年预留，享受 30-50% 折扣

   目前配置: 按需支付 $2,482/月
   预留 1 年: 10 × c6i.2xlarge × $0.192/h × 730h = $1,402/月 (43% 节省)

   年度预计节省: ($2,482 - $1,402) × 12 = $12,960

2. Spot Instances (竞价实例):
   非关键任务使用，可节省 70-90%

   推荐用途:
   - 早报预计算时段的扩缩 Pod
   - 非实时分析任务

3. 自动化关闭:
   低流量时段 (深夜) 缩容至最小副本数

   预计年度节省: ~5% = $1,800
```

#### 2.2 存储优化

```
1. 冷热分层:
   热数据 (30 天): SSD/gp3
   温数据 (30-90 天): 标准存储或低频存储
   冷数据 (90+ 天): 归档存储

   当前: 2 TB SSD × $0.08 = $160
   优化后:
     - 1 TB SSD: $80
     - 0.5 TB 低频: $20
     - 0.5 TB 归档: $10
   节省: $50/月 = $600/年

2. 日志聚合优化:
   仅保留 7 天热日志
   历史日志压缩归档到 S3 Glacier

   预计节省: $50/月 = $600/年

3. 数据库备份:
   使用增量备份而非全量
   跨地域备份按需激活

   预计节省: $30/月 = $360/年
```

#### 2.3 网络优化

```
1. CDN:
   静态资源 (HTML/CSS/JS) 通过 CloudFront/CDN
   减少数据中心出站

   当前: 1 TB 出站 × $0.09 = $90
   优化后: 500 GB × $0.09 + CDN 费用
   预计成本: $50-70/月 = $600-840/年

2. 跨地域部署:
   暂不必要 (对标国内用户)
```

---

### 3. 总体优化目标

```
现状: $36,084/年

优化后:
  预留实例购买: -$12,960
  存储冷热分层: -$1,560
  日志优化: -600
  备份优化: -360
  CDN 优化: -240
  ━━━━━━━━━━━━━━━━━━━━━━━
  小计优化: -$15,720

优化后成本: $36,084 - $15,720 = $20,364/年 ✓ (降低 43.7%)
```

---

## 部署指南

### 1. 前置条件

#### 1.1 基础环境

```bash
# 集群版本要求
Kubernetes: v1.23+ (支持 HPA v2)

# 工具要求
kubectl: v1.23+
Helm: v3.0+
Docker: 20.10+

# 存储
StorageClass: 至少支持 RWO 模式
推荐: Longhorn / local-path-provisioner

# 监控
Metrics Server: 已安装 (用于 HPA)
```

#### 1.2 验证集群健康

```bash
# 检查节点
kubectl get nodes -o wide
kubectl describe node <node-name>

# 检查 API Server
kubectl get apiservices | grep available

# 检查存储类
kubectl get storageclass
```

---

### 2. 部署步骤

#### 2.1 创建命名空间

```bash
kubectl apply -f - << EOF
apiVersion: v1
kind: Namespace
metadata:
  name: aiggs
  labels:
    name: aiggs
EOF
```

#### 2.2 部署存储类

```bash
kubectl apply -f - << EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
allowVolumeExpansion: true
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
EOF

# 验证
kubectl get storageclass
```

#### 2.3 创建 Secret 和 ConfigMap

```bash
# 生成安全密码
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
RABBITMQ_PASSWORD=$(openssl rand -base64 32)

# 创建 Secret
kubectl create secret generic aiggs-secrets \
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \
  --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
  --from-literal=RABBITMQ_PASSWORD="$RABBITMQ_PASSWORD" \
  --from-literal=BASE_RPC_URL="https://mainnet.base.org" \
  --from-literal=BASE_PRIVATE_KEY="your-private-key" \
  --from-literal=CLAUDE_API_KEY="your-claude-key" \
  --from-literal=GPT_API_KEY="your-gpt-key" \
  -n aiggs

# 验证
kubectl get secret -n aiggs
```

#### 2.4 部署基础设施

```bash
# 部署 PostgreSQL
kubectl apply -f aiggs-k8s-deployment.yaml -n aiggs

# 监控 PostgreSQL 启动
kubectl logs -f statefulset/postgres -n aiggs -c postgres
kubectl get pvc -n aiggs

# 验证主从复制
kubectl exec -it postgres-0 -n aiggs -- psql -U aiggs_user -c "SELECT pg_is_in_recovery();"
```

#### 2.5 部署应用服务

```bash
# 部署所有应用
kubectl apply -f aiggs-k8s-deployment.yaml -n aiggs

# 验证部署状态
kubectl get deployments -n aiggs
kubectl get pods -n aiggs

# 检查就绪状态
kubectl wait --for=condition=ready pod -l tier=backend -n aiggs --timeout=300s
```

#### 2.6 部署自动扩缩容

```bash
# 先安装 Metrics Server (如果还未安装)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 等待 Metrics Server 就绪
kubectl wait --for=condition=ready pod -n kube-system -l k8s-app=metrics-server --timeout=60s

# 部署 HPA/VPA
kubectl apply -f aiggs-k8s-autoscaling.yaml -n aiggs

# 验证 HPA 状态（等待 ~60s 开始收集指标）
kubectl get hpa -n aiggs -w
```

#### 2.7 部署监控告警

```bash
# 部署 Prometheus + Grafana + AlertManager
kubectl apply -f aiggs-k8s-monitoring.yaml -n aiggs

# 验证监控组件
kubectl get pods -n aiggs | grep -E "prometheus|grafana|alertmanager"

# 访问 Grafana
kubectl port-forward svc/grafana 3000:3000 -n aiggs &
# 浏览器访问 http://localhost:3000
# 默认用户: admin / admin123
```

#### 2.8 导入 Grafana Dashboard

```bash
# 方式 1: UI 导入
登陆 Grafana → Dashboards → New → Import
粘贴 aiggs-grafana-dashboard.json 内容
选择 Prometheus 作为数据源

# 方式 2: API 导入
curl -X POST http://localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @aiggs-grafana-dashboard.json
```

---

### 3. 验证部署

#### 3.1 服务可用性检查

```bash
# 检查所有 Pod 都在 Running
kubectl get pods -n aiggs

# 检查 Service 终端点
kubectl get endpoints -n aiggs

# 测试内部通信
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  sh -c "wget -O- http://game-core-service:8080/health/live"
```

#### 3.2 Ingress 测试

```bash
# 获取 Ingress IP
kubectl get ingress -n aiggs -o wide

# DNS 配置
# 将 api.aiggs.xyz 指向 Ingress IP

# 测试路由
curl -H "Host: api.aiggs.xyz" http://<ingress-ip>/game/health
curl -H "Host: api.aiggs.xyz" http://<ingress-ip>/steal/health
```

#### 3.3 数据库验证

```bash
# 连接主库
kubectl exec -it postgres-0 -n aiggs -- \
  psql -U aiggs_user -c "SELECT version();"

# 检查从库复制
kubectl exec -it postgres-1 -n aiggs -- \
  psql -U aiggs_user -c "SELECT pg_is_in_recovery();"

# 检查连接数
kubectl exec -it postgres-0 -n aiggs -- \
  psql -U aiggs_user -c "SELECT count(*) FROM pg_stat_activity;"
```

#### 3.4 Redis 集群验证

```bash
# 进入 Redis Pod
kubectl exec -it redis-0 -n aiggs -- redis-cli

# 集群信息
CLUSTER INFO
CLUSTER NODES

# 性能测试
redis-benchmark -h redis-0.redis -p 6379 -c 10 -n 10000
```

#### 3.5 RabbitMQ 管理

```bash
# 端口转发
kubectl port-forward svc/rabbitmq 15672:15672 -n aiggs &

# 访问管理界面
# http://localhost:15672
# 默认用户: aiggs / <password>
```

---

## 故障恢复方案

### 1. 常见故障与恢复

#### 1.1 Pod CrashLoopBackOff

**症状**: Pod 不断重启

**诊断**:
```bash
kubectl logs <pod-name> -n aiggs --previous
kubectl describe pod <pod-name> -n aiggs
```

**恢复**:
```bash
# 检查资源限制
kubectl set resources deployment <name> --limits=cpu=1,memory=1Gi -n aiggs

# 更新镜像
kubectl set image deployment/<name> <container>=<image:tag> -n aiggs

# 回滚
kubectl rollout undo deployment/<name> -n aiggs
```

#### 1.2 数据库连接耗尽

**症状**: `FATAL: too many connections`

**恢复**:
```bash
# 临时增加连接池
kubectl set env deployment/game-core-service \
  DATABASE_MAX_CONNECTIONS=300 -n aiggs

# 检查慢查询
kubectl exec -it postgres-0 -n aiggs -- \
  psql -U aiggs_user -c "SELECT * FROM pg_stat_statements WHERE mean_time > 1000;"

# 杀死闲置连接
kubectl exec -it postgres-0 -n aiggs -- \
  psql -U aiggs_user -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle' AND query_start < now() - interval '5 min';"
```

#### 1.3 Redis 内存爆满

**症状**: Redis 拒绝写入请求

**恢复**:
```bash
# 检查内存使用
kubectl exec -it redis-0 -n aiggs -- redis-cli INFO memory

# 清理过期 Key
kubectl exec -it redis-0 -n aiggs -- redis-cli FLUSHDB ASYNC

# 扩容内存
# 方式 1: 增加副本数（水平扩展）
kubectl scale statefulset redis --replicas=9 -n aiggs

# 方式 2: 更换更大的节点类型
```

#### 1.4 消息队列堆积

**症状**: RabbitMQ 队列深度持续上升

**恢复**:
```bash
# 检查队列状态
kubectl exec -it rabbitmq-0 -n aiggs -- \
  rabbitmqctl list_queues name messages consumers

# 扩容消费者
kubectl scale deployment game-core-service --replicas=10 -n aiggs

# 清空故障队列
kubectl exec -it rabbitmq-0 -n aiggs -- \
  rabbitmqctl purge_queue <queue-name>
```

#### 1.5 节点故障

**症状**: 多个 Pod 处于 Pending

**诊断**:
```bash
kubectl get nodes
kubectl describe node <failed-node>
```

**恢复**:
```bash
# 方式 1: 标记节点不可调度，驱逐 Pod
kubectl cordon <node-name>
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# 方式 2: 修复节点（或替换）
# 在云平台重启/替换实例

# 恢复节点
kubectl uncordon <node-name>
```

---

### 2. 备份恢复策略

#### 2.1 数据库备份

```bash
# 每日自动备份
kubectl exec -it postgres-0 -n aiggs -- \
  pg_dump -U aiggs_user aiggs | gzip > backup-$(date +%Y%m%d).sql.gz

# 推送至 S3
aws s3 cp backup-*.sql.gz s3://aiggs-backups/postgres/

# 恢复
kubectl exec -i postgres-0 -n aiggs -- \
  gunzip -c < backup-20240101.sql.gz | psql -U aiggs_user
```

#### 2.2 Redis 备份

```bash
# RDB 快照备份
kubectl exec -it redis-0 -n aiggs -- redis-cli BGSAVE

# 复制 RDB 文件
kubectl cp aiggs/redis-0:/data/dump.rdb ./redis-dump.rdb

# 恢复
kubectl cp ./redis-dump.rdb aiggs/redis-0:/data/dump.rdb
```

#### 2.3 整体恢复流程

```
1. 备份评估:
   - PostgreSQL: 全备 + WAL 增量备份
   - Redis: RDB + AOF
   - 配置: ConfigMap/Secret 版本控制

2. 恢复优先级:
   - P0: 数据库 (业务数据)
   - P1: Redis (缓存，可重构)
   - P2: 消息队列 (重新发送)
   - P3: 应用配置 (快速重建)

3. RTO/RPO 目标:
   - RTO (恢复时间): < 30 分钟
   - RPO (数据丢失): < 15 分钟
```

---

### 3. 灾难恢复预案

#### 3.1 整个数据中心故障

```
场景: 主数据中心完全不可用

恢复步骤:
1. 激活从数据中心 K8s 集群
2. 恢复 PostgreSQL 从库为主库
3. 使用最新备份恢复 Redis/RabbitMQ
4. 更新 DNS 指向新集群
5. 验证应用服务可用

时间: 30-60 分钟
```

#### 3.2 定期演练

```
演练频率: 每季度一次 (Q1/Q2/Q3/Q4)

演练清单:
□ 数据库备份恢复测试
□ 跨集群故障转移测试
□ 告警通知验证
□ 文档更新

演练记录: 保存在 Wiki
```

---

## 附录

### A. 命令速查

```bash
# 部署
kubectl apply -f aiggs-k8s-deployment.yaml -n aiggs
kubectl apply -f aiggs-k8s-autoscaling.yaml -n aiggs
kubectl apply -f aiggs-k8s-monitoring.yaml -n aiggs

# 查看状态
kubectl get all -n aiggs
kubectl describe pod <pod-name> -n aiggs
kubectl logs <pod-name> -n aiggs

# 扩缩容
kubectl scale deployment/<name> --replicas=5 -n aiggs
kubectl autoscale deployment/<name> --min=2 --max=10 --cpu-percent=70 -n aiggs

# 更新
kubectl rollout status deployment/<name> -n aiggs
kubectl rollout undo deployment/<name> -n aiggs

# 删除
kubectl delete namespace aiggs
```

### B. 推荐文档

- Kubernetes 官方文档: https://kubernetes.io/docs/
- Prometheus 最佳实践: https://prometheus.io/docs/practices/
- Grafana 仪表板设计: https://grafana.com/docs/grafana/latest/dashboards/
- HPA 调优: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/

### C. 相关链接

- AIggs 项目官网: https://aiggs.xyz
- Base 链 RPC: https://mainnet.base.org
- Kubernetes 中文社区: https://kubernetes.io/zh-cn/

---

**文档完整，可投入生产环境使用。**

最后更新: 2026-03-27
维护: DevOps/SRE 团队
版本: 1.0.0
