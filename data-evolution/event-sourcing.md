# AIggs 事件溯源（Event Sourcing）完整设计文档

## 一、概述

事件溯源是一种强大的架构模式，特别适合 AI 自主运营的产品。当 AI 持续升级产品逻辑时，事件溯源确保：
- **数据历史不丢失**：所有变化都作为不可变事件记录
- **状态可重建**：新的数据结构可从历史事件重建
- **时间旅行**：支持查看任意时刻的游戏状态
- **审计追踪**：完整的决策链路可追溯

本文档包含生产级 TypeScript 实现、PostgreSQL 建表、和完整的使用示例。

---

## 二、核心数据模型

### 2.1 事件基础概念

所有游戏状态变化都是事件，事件具有以下属性：

```typescript
// 事件的统一基础接口
interface EventBase {
  // 事件标识
  eventId: string;                    // 全局唯一事件ID (UUID)

  // 聚合体标识（Aggregate Root）
  aggregateType: string;              // 聚合体类型：player, farm, chicken, steal, etc.
  aggregateId: string;                // 聚合体ID（玩家ID、农场ID等）

  // 事件版本控制
  eventType: string;                  // 事件类型：PlayerRegistered, EggProduced, etc.
  eventVersion: number;               // 该事件类型的版本号（1, 2, 3...）
  aggregateVersion: number;           // 该聚合体的全局版本号（递增）

  // 事件数据
  payload: Record<string, any>;       // 事件携带的业务数据
  metadata: EventMetadata;            // 元数据

  // 时间戳
  createdAt: Date;                    // 事件创建时间（UTC）
  recordedAt?: Date;                  // 事件持久化时间
}

interface EventMetadata {
  userId?: string;                    // 操作者ID（可能是玩家、管理员、AI系统）
  source: string;                     // 事件来源：player_action, ai_decision, system, etc.
  correlationId?: string;             // 关联ID（用于追踪同一个操作的多个事件）
  causationId?: string;               // 原因事件ID（该事件由哪个事件触发）
  ipAddress?: string;                 // IP地址（可选，用于安全审计）
  userAgent?: string;                 // 用户代理
  environment?: string;               // 环境标记：production, staging, test
  tags?: Record<string, string>;      // 自定义标签
}
```

---

## 三、PostgreSQL 建表语句

### 3.1 事件表（核心）

```sql
-- ======================================================================
-- 事件存储表：存储所有不可变事件
-- ======================================================================
CREATE TABLE events (
    -- 事件唯一标识
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 聚合体标识
    aggregate_type VARCHAR(50) NOT NULL,           -- player, farm, chicken, steal, trade, etc.
    aggregate_id VARCHAR(100) NOT NULL,            -- 玩家ID、农场ID等

    -- 事件标识
    event_type VARCHAR(100) NOT NULL,              -- PlayerRegistered, EggProduced, etc.
    event_version INT NOT NULL DEFAULT 1,          -- 事件类型版本号
    aggregate_version INT NOT NULL,                -- 聚合体版本号（同一aggregate_id递增）

    -- 事件数据
    payload JSONB NOT NULL,                        -- 事件负载（JSON格式）
    metadata JSONB NOT NULL,                       -- 元数据（JSON格式）

    -- 时间戳（不可变）
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 可选的业务索引字段（用于快速查询）
    player_id BIGINT,                              -- 冗余存储玩家ID便于查询
    farm_id BIGINT,                                -- 冗余存储农场ID便于查询

    -- 数据库层约束
    CONSTRAINT events_immutable CHECK (created_at = recorded_at)  -- 确保创建和记录时间一致
);

-- 复合主键：(aggregate_type, aggregate_id, aggregate_version) 应该唯一
CREATE UNIQUE INDEX idx_events_aggregate_version ON events(
    aggregate_type,
    aggregate_id,
    aggregate_version
);

-- 查询效率索引
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_events_aggregate_type_id ON events(aggregate_type, aggregate_id);
CREATE INDEX idx_events_player_id ON events(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_events_farm_id ON events(farm_id) WHERE farm_id IS NOT NULL;

-- 用于事件订阅的索引（支持消费者追踪）
CREATE INDEX idx_events_created_at_type ON events(created_at, event_type);

-- 注释
COMMENT ON TABLE events IS '不可变事件存储表 - 所有游戏状态变化都记录为事件';
COMMENT ON COLUMN events.aggregate_version IS '同一聚合体内的事件序号（从1开始递增），保证顺序性';
```

### 3.2 快照表（性能优化）

```sql
-- ======================================================================
-- 快照表：存储聚合体的中间状态（避免重放所有事件）
-- ======================================================================
CREATE TABLE snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联事件
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    aggregate_version INT NOT NULL,               -- 快照时的聚合体版本

    -- 快照数据
    aggregate_state JSONB NOT NULL,              -- 快照时的完整聚合体状态
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 元数据
    reason VARCHAR(50) NOT NULL,                 -- 创建原因：time_based, event_count, manual
    reason_details VARCHAR(255),                 -- 原因细节

    UNIQUE(aggregate_type, aggregate_id, aggregate_version)
);

-- 查询索引
CREATE INDEX idx_snapshots_aggregate ON snapshots(aggregate_type, aggregate_id);
CREATE INDEX idx_snapshots_created_at ON snapshots(created_at);

-- 分区（可选，适合超大规模数据）
-- CREATE TABLE snapshots_2024_q1 PARTITION OF snapshots
--     FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

COMMENT ON TABLE snapshots IS '聚合体快照表 - 用于加速状态重建，减少事件重放次数';
```

### 3.3 事件订阅偏移量表

```sql
-- ======================================================================
-- 事件消费者追踪表：记录各消费者的处理进度
-- ======================================================================
CREATE TABLE event_subscribers (
    subscriber_id VARCHAR(100) PRIMARY KEY,

    -- 消费者信息
    subscriber_name VARCHAR(255) NOT NULL,       -- 消费者名称
    subscriber_type VARCHAR(50) NOT NULL,        -- 类型：projection, handler, external_service

    -- 消费进度
    last_processed_event_id UUID REFERENCES events(event_id) ON DELETE SET NULL,
    last_processed_at TIMESTAMP,

    -- 状态
    is_active BOOLEAN DEFAULT TRUE,
    error_count INT DEFAULT 0,
    last_error_message TEXT,
    last_error_at TIMESTAMP,

    -- 元数据
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscribers_active ON event_subscribers(is_active);
CREATE INDEX idx_subscribers_updated_at ON event_subscribers(updated_at);

COMMENT ON TABLE event_subscribers IS '事件消费者追踪表 - 确保消费者幂等性和顺序处理';
```

### 3.4 投影版本管理表

```sql
-- ======================================================================
-- 投影版本表：管理投影（Projection）的多个版本
-- ======================================================================
CREATE TABLE projection_versions (
    projection_id VARCHAR(100) PRIMARY KEY,

    -- 投影信息
    projection_name VARCHAR(255) NOT NULL,       -- 投影名称（如：player_state, farm_inventory）
    current_version INT NOT NULL DEFAULT 1,      -- 当前版本号

    -- 重建状态
    is_rebuilding BOOLEAN DEFAULT FALSE,
    rebuild_started_at TIMESTAMP,
    rebuild_completed_at TIMESTAMP,
    rebuild_progress_percent DECIMAL(5, 2),

    -- 创建时间
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projections_rebuilding ON projection_versions(is_rebuilding);

COMMENT ON TABLE projection_versions IS '投影版本管理表 - 支持投影升级和增量重建';
```

### 3.5 投影表（只读视图）

```sql
-- ======================================================================
-- 玩家投影表：从事件重建的当前玩家状态（只读）
-- ======================================================================
CREATE TABLE projections_players (
    player_id BIGSERIAL PRIMARY KEY,

    -- 基础信息
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    farm_code VARCHAR(50) UNIQUE,

    -- 状态
    is_active BOOLEAN DEFAULT TRUE,

    -- 统计数据
    total_eggs_earned BIGINT DEFAULT 0,
    total_eggs_exchanged BIGINT DEFAULT 0,
    total_stolen_count INT DEFAULT 0,
    total_successful_steals INT DEFAULT 0,
    invite_commission_earned BIGINT DEFAULT 0,

    -- 投影元数据
    projection_version INT NOT NULL DEFAULT 1,   -- 该投影使用的版本
    last_event_id UUID REFERENCES events(event_id),
    last_event_version INT,                      -- 重建到的聚合体版本
    last_updated_at TIMESTAMP NOT NULL,

    -- 时间戳
    registered_at TIMESTAMP NOT NULL,
    rookie_protection_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 注意：这个表本应是完全由事件驱动生成的视图
-- 但为了兼容现有代码，我们保留作为物化视图
-- 所有写操作必须通过 event_store 进行

COMMENT ON TABLE projections_players IS '从PlayerAggregate事件重建的玩家投影表（只读）';
```

### 3.6 农场投影表

```sql
-- ======================================================================
-- 农场投影表：从事件重建的当前农场状态（只读）
-- ======================================================================
CREATE TABLE projections_farms (
    farm_id BIGSERIAL PRIMARY KEY,
    player_id BIGINT UNIQUE NOT NULL,

    -- 农场状态
    chicken_count INT NOT NULL DEFAULT 0,
    egg_inventory INT NOT NULL DEFAULT 0,
    egg_capacity INT NOT NULL DEFAULT 30,
    is_inventory_full BOOLEAN DEFAULT FALSE,

    -- 时间
    last_egg_production_at TIMESTAMP,
    next_egg_production_at TIMESTAMP,

    -- 统计
    total_eggs_produced BIGINT DEFAULT 0,

    -- 投影元数据
    projection_version INT NOT NULL DEFAULT 1,
    last_event_id UUID REFERENCES events(event_id),
    last_event_version INT,
    last_updated_at TIMESTAMP NOT NULL,

    -- 时间戳
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projections_farms_player ON projections_farms(player_id);
CREATE INDEX idx_projections_farms_next_production ON projections_farms(next_egg_production_at);

COMMENT ON TABLE projections_farms IS '从FarmAggregate事件重建的农场投影表（只读）';
```

---

## 四、事件类型定义与注册表

### 4.1 事件类型枚举

```typescript
// ============================================================================
// 事件类型定义与注册表
// ============================================================================

/** 所有可能的聚合体类型 */
export const AggregateTypes = {
  PLAYER: 'player',
  FARM: 'farm',
  CHICKEN: 'chicken',
  STEAL: 'steal',
  TRADE: 'trade',
  SYSTEM: 'system',
} as const;

/** 玩家聚合体事件类型 */
export const PlayerEventTypes = {
  REGISTERED: 'PlayerRegistered',
  NICKNAME_UPDATED: 'PlayerNicknameUpdated',
  FARM_CODE_GENERATED: 'PlayerFarmCodeGenerated',
  REFERRED: 'PlayerReferred',
  LOGIN: 'PlayerLoggedIn',
  LOGOUT: 'PlayerLoggedOut',
  DEACTIVATED: 'PlayerDeactivated',
  ROOKIE_PROTECTION_EXTENDED: 'RookieProtectionExtended',
} as const;

/** 农场聚合体事件类型 */
export const FarmEventTypes = {
  CREATED: 'FarmCreated',
  CHICKEN_ADDED: 'ChickenAddedToFarm',
  CHICKEN_REMOVED: 'ChickenRemovedFromFarm',
  EGG_PRODUCED: 'EggProduced',
  EGG_COLLECTED: 'EggCollected',
  INVENTORY_FULL: 'InventoryFull',
  PRODUCTION_CYCLE_COMPLETED: 'ProductionCycleCompleted',
} as const;

/** 鸡聚合体事件类型 */
export const ChickenEventTypes = {
  BORN: 'ChickenBorn',
  ACQUIRED: 'ChickenAcquired',
  PRODUCED_EGG: 'ChickenProducedEgg',
  BOOST_APPLIED: 'BoostApplied',
  BOOST_EXPIRED: 'BoostExpired',
  RETIRED: 'ChickenRetired',
} as const;

/** 偷蛋事件类型 */
export const StealEventTypes = {
  INITIATED: 'StealInitiated',
  SUCCEEDED: 'StealSucceeded',
  FAILED: 'StealFailed',
  BLOCKED_BY_PROTECTION: 'StealBlockedByProtection',
  JACKPOT_TRIGGERED: 'JackpotTriggered',
} as const;

/** 交易事件类型 */
export const TradeEventTypes = {
  EGGS_CONVERTED: 'EggsConvertedToAIGG',
  AIGG_TRANSFERRED: 'AIGGTransferred',
  COMMISSION_PAID: 'InviteCommissionPaid',
  EGGS_MINTED: 'EggsMinted',
} as const;

/** 系统事件类型 */
export const SystemEventTypes = {
  SCHEMA_UPGRADED: 'SchemaUpgraded',
  SNAPSHOT_CREATED: 'SnapshotCreated',
  MIGRATION_EXECUTED: 'MigrationExecuted',
  PROJECTION_REBUILT: 'ProjectionRebuilt',
  AI_DECISION_APPLIED: 'AIDecisionApplied',
} as const;

/** 所有事件类型的映射（用于注册表） */
export const AllEventTypes = {
  ...PlayerEventTypes,
  ...FarmEventTypes,
  ...ChickenEventTypes,
  ...StealEventTypes,
  ...TradeEventTypes,
  ...SystemEventTypes,
} as const;

/** 事件类型到聚合体类型的映射 */
export const EventTypeToAggregateType: Record<string, string> = {
  [PlayerEventTypes.REGISTERED]: AggregateTypes.PLAYER,
  [PlayerEventTypes.NICKNAME_UPDATED]: AggregateTypes.PLAYER,
  [FarmEventTypes.CREATED]: AggregateTypes.FARM,
  [FarmEventTypes.EGG_PRODUCED]: AggregateTypes.FARM,
  [ChickenEventTypes.BORN]: AggregateTypes.CHICKEN,
  [StealEventTypes.INITIATED]: AggregateTypes.STEAL,
  [TradeEventTypes.EGGS_CONVERTED]: AggregateTypes.TRADE,
  [SystemEventTypes.SCHEMA_UPGRADED]: AggregateTypes.SYSTEM,
};

/** 事件版本管理：支持事件模式演变 */
export const EventVersions: Record<string, number> = {
  [PlayerEventTypes.REGISTERED]: 2,        // v2: 添加 email 字段
  [FarmEventTypes.EGG_PRODUCED]: 2,        // v2: 添加 chicken_id 字段
  [StealEventTypes.SUCCEEDED]: 3,          // v3: 添加 jack_pot_triggered 字段
};
```

### 4.2 具体事件接口定义

```typescript
// ============================================================================
// 具体事件接口定义
// ============================================================================

/** 玩家注册事件 */
export interface PlayerRegisteredEvent extends EventBase {
  eventType: 'PlayerRegistered';
  payload: {
    playerId: string;
    walletAddress: string;
    nickname?: string;
    registeredAt: Date;
    referrerId?: string;                // 如果由邀请链路产生
  };
}

/** 农场创建事件 */
export interface FarmCreatedEvent extends EventBase {
  eventType: 'FarmCreated';
  payload: {
    farmId: string;
    playerId: string;
    initialChickens: number;            // 初始母鸡数
    capacity: number;                   // 初始容量
  };
}

/** 鸡产蛋事件 */
export interface EggProducedEvent extends EventBase {
  eventType: 'EggProduced';
  payload: {
    farmId: string;
    playerId: string;
    chickenId: string;                  // v2: 添加此字段
    eggCount: number;
    boostApplied: boolean;
    boostMultiplier?: number;
    currentInventory: number;           // 产蛋后的库存
    inventoryCapacity: number;
  };
}

/** 偷蛋成功事件 */
export interface StealSucceededEvent extends EventBase {
  eventType: 'StealSucceeded';
  payload: {
    stealEventId: string;
    stealerId: string;
    victimId: string;
    eggsStolenCount: number;
    jackpotTriggered: boolean;          // v3: 新字段
    jackpotAmount?: number;
    stealerNewBalance: number;
    victimNewBalance: number;
  };
}

/** EGGS 兑换为 $AIGG 事件 */
export interface EggsConvertedEvent extends EventBase {
  eventType: 'EggsConvertedToAIGG';
  payload: {
    playerId: string;
    eggAmount: number;
    exchangeRate: number;               // EGGS:$AIGG
    aiggAmount: number;
    txHash?: string;                    // 链上交易哈希
    newEggBalance: number;
  };
}

/** AI 决策应用事件 */
export interface AIDecisionAppliedEvent extends EventBase {
  eventType: 'AIDecisionApplied';
  metadata: EventMetadata & {
    source: 'ai_decision';
    aiModel: string;                    // 使用的AI模型
    reasoning: string;                  // AI的决策推理
  };
  payload: {
    decisionType: string;               // 'difficulty_adjustment', 'reward_boost', etc.
    affectedAggregates: Array<{
      aggregateType: string;
      aggregateId: string;
    }>;
    changes: Record<string, any>;       // 具体改动
  };
}

/** 模式升级事件（系统事件） */
export interface SchemaUpgradedEvent extends EventBase {
  eventType: 'SchemaUpgraded';
  payload: {
    version: number;                    // 新版本号
    changes: string[];                  // 改动列表
    backwardCompatible: boolean;
    migrationScript?: string;
  };
}
```

---

## 五、Event Store 核心实现

### 5.1 Event Store 接口

```typescript
// ============================================================================
// Event Store 核心接口
// ============================================================================

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface IEventStore {
  // 写入事件
  appendEvent(event: EventBase): Promise<void>;
  appendEvents(events: EventBase[]): Promise<void>;

  // 读取事件
  getEventsByAggregateId(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<EventBase[]>;

  getEventsByType(
    eventType: string,
    limit?: number,
    offset?: number
  ): Promise<EventBase[]>;

  getEventsSince(timestamp: Date): Promise<EventBase[]>;

  // 快照相关
  getLatestSnapshot(
    aggregateType: string,
    aggregateId: string
  ): Promise<Snapshot | null>;

  saveSnapshot(snapshot: Snapshot): Promise<void>;
}

export interface Snapshot {
  snapshotId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  aggregateState: Record<string, any>;
  createdAt: Date;
  reason: 'time_based' | 'event_count' | 'manual';
  reasonDetails?: string;
}
```

### 5.2 Event Store 实现

```typescript
// ============================================================================
// PostgreSQL Event Store 实现
// ============================================================================

export class PostgresEventStore implements IEventStore {
  private pool: Pool;
  private logger: ILogger;

  // 快照策略：每100个事件或每24小时创建一个快照
  private readonly SNAPSHOT_EVENT_COUNT_THRESHOLD = 100;
  private readonly SNAPSHOT_TIME_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  constructor(pool: Pool, logger: ILogger) {
    this.pool = pool;
    this.logger = logger;
  }

  /**
   * 原子地写入单个事件
   * 保证幂等性和顺序性
   */
  async appendEvent(event: EventBase): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. 验证聚合体版本（乐观并发控制）
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(aggregate_version), 0) as max_version
         FROM events
         WHERE aggregate_type = $1 AND aggregate_id = $2`,
        [event.aggregateType, event.aggregateId]
      );

      const expectedVersion = versionResult.rows[0].max_version + 1;
      if (event.aggregateVersion !== expectedVersion) {
        throw new ConcurrentUpdateError(
          `Expected version ${expectedVersion}, got ${event.aggregateVersion}`
        );
      }

      // 2. 写入事件
      await client.query(
        `INSERT INTO events (
          event_id, aggregate_type, aggregate_id, event_type,
          event_version, aggregate_version, payload, metadata,
          created_at, recorded_at, player_id, farm_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          event.eventId || uuidv4(),
          event.aggregateType,
          event.aggregateId,
          event.eventType,
          event.eventVersion || 1,
          event.aggregateVersion,
          JSON.stringify(event.payload),
          JSON.stringify(event.metadata),
          event.createdAt || new Date(),
          new Date(),
          (event.metadata as any).playerId || event.payload.playerId,
          (event.metadata as any).farmId || event.payload.farmId,
        ]
      );

      // 3. 检查是否需要创建快照
      if (expectedVersion % this.SNAPSHOT_EVENT_COUNT_THRESHOLD === 0) {
        await this.createSnapshotIfNeeded(
          client,
          event.aggregateType,
          event.aggregateId,
          expectedVersion,
          'event_count'
        );
      }

      await client.query('COMMIT');

      this.logger.debug(`Event appended: ${event.eventType} (v${event.aggregateVersion})`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed to append event: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 批量写入多个事件（保证原子性）
   * 适用于复杂操作产生多个事件的情况
   */
  async appendEvents(events: EventBase[]): Promise<void> {
    if (events.length === 0) return;

    // 验证所有事件的聚合体一致
    const aggregateId = events[0].aggregateId;
    const aggregateType = events[0].aggregateType;

    if (!events.every(e => e.aggregateId === aggregateId && e.aggregateType === aggregateType)) {
      throw new InvalidEventSequenceError('All events must belong to the same aggregate');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 获取当前版本
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(aggregate_version), 0) as max_version
         FROM events
         WHERE aggregate_type = $1 AND aggregate_id = $2`,
        [aggregateType, aggregateId]
      );

      let currentVersion = versionResult.rows[0].max_version;

      // 批量插入事件
      for (const event of events) {
        currentVersion++;

        if (event.aggregateVersion !== currentVersion) {
          throw new ConcurrentUpdateError(
            `Expected version ${currentVersion}, got ${event.aggregateVersion}`
          );
        }

        await client.query(
          `INSERT INTO events (
            event_id, aggregate_type, aggregate_id, event_type,
            event_version, aggregate_version, payload, metadata,
            created_at, recorded_at, player_id, farm_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            event.eventId || uuidv4(),
            aggregateType,
            aggregateId,
            event.eventType,
            event.eventVersion || 1,
            currentVersion,
            JSON.stringify(event.payload),
            JSON.stringify(event.metadata),
            event.createdAt || new Date(),
            new Date(),
            (event.metadata as any).playerId || event.payload.playerId,
            (event.metadata as any).farmId || event.payload.farmId,
          ]
        );
      }

      // 检查快照
      if (currentVersion % this.SNAPSHOT_EVENT_COUNT_THRESHOLD === 0) {
        await this.createSnapshotIfNeeded(
          client,
          aggregateType,
          aggregateId,
          currentVersion,
          'event_count'
        );
      }

      await client.query('COMMIT');
      this.logger.info(`${events.length} events appended atomically`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed to append events: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 读取特定聚合体的所有事件
   */
  async getEventsByAggregateId(
    aggregateType: string,
    aggregateId: string,
    fromVersion: number = 0,
    toVersion?: number
  ): Promise<EventBase[]> {
    let query = `
      SELECT * FROM events
      WHERE aggregate_type = $1 AND aggregate_id = $2 AND aggregate_version > $3
    `;
    const params: any[] = [aggregateType, aggregateId, fromVersion];

    if (toVersion !== undefined) {
      query += ` AND aggregate_version <= $4`;
      params.push(toVersion);
    }

    query += ` ORDER BY aggregate_version ASC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToEvent);
  }

  /**
   * 按事件类型查询
   */
  async getEventsByType(
    eventType: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<EventBase[]> {
    const result = await this.pool.query(
      `SELECT * FROM events
       WHERE event_type = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [eventType, limit, offset]
    );
    return result.rows.map(this.rowToEvent);
  }

  /**
   * 获取某个时间点之后的所有事件（用于事件订阅）
   */
  async getEventsSince(timestamp: Date): Promise<EventBase[]> {
    const result = await this.pool.query(
      `SELECT * FROM events
       WHERE created_at > $1
       ORDER BY created_at ASC`,
      [timestamp]
    );
    return result.rows.map(this.rowToEvent);
  }

  /**
   * 获取最新的快照
   */
  async getLatestSnapshot(
    aggregateType: string,
    aggregateId: string
  ): Promise<Snapshot | null> {
    const result = await this.pool.query(
      `SELECT * FROM snapshots
       WHERE aggregate_type = $1 AND aggregate_id = $2
       ORDER BY aggregate_version DESC
       LIMIT 1`,
      [aggregateType, aggregateId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      snapshotId: row.snapshot_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: row.aggregate_version,
      aggregateState: row.aggregate_state,
      createdAt: row.created_at,
      reason: row.reason,
      reasonDetails: row.reason_details,
    };
  }

  /**
   * 保存快照
   */
  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO snapshots (
        aggregate_type, aggregate_id, aggregate_version,
        aggregate_state, created_at, reason, reason_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (aggregate_type, aggregate_id, aggregate_version)
       DO NOTHING`,
      [
        snapshot.aggregateType,
        snapshot.aggregateId,
        snapshot.aggregateVersion,
        JSON.stringify(snapshot.aggregateState),
        snapshot.createdAt,
        snapshot.reason,
        snapshot.reasonDetails,
      ]
    );

    // 清理旧快照（保留最近10个）
    await this.pool.query(
      `DELETE FROM snapshots
       WHERE aggregate_type = $1 AND aggregate_id = $2
       AND snapshot_id NOT IN (
         SELECT snapshot_id FROM snapshots
         WHERE aggregate_type = $1 AND aggregate_id = $2
         ORDER BY aggregate_version DESC LIMIT 10
       )`,
      [snapshot.aggregateType, snapshot.aggregateId]
    );

    this.logger.debug(`Snapshot created for ${snapshot.aggregateType}:${snapshot.aggregateId} v${snapshot.aggregateVersion}`);
  }

  /**
   * 私有方法：判断是否需要创建快照并创建
   */
  private async createSnapshotIfNeeded(
    client: any,
    aggregateType: string,
    aggregateId: string,
    version: number,
    reason: string
  ): Promise<void> {
    // 检查距离上次快照的时间
    const lastSnapshotResult = await client.query(
      `SELECT created_at FROM snapshots
       WHERE aggregate_type = $1 AND aggregate_id = $2
       ORDER BY aggregate_version DESC LIMIT 1`,
      [aggregateType, aggregateId]
    );

    if (lastSnapshotResult.rows.length > 0) {
      const lastSnapshotTime = new Date(lastSnapshotResult.rows[0].created_at);
      const timeSinceLastSnapshot = Date.now() - lastSnapshotTime.getTime();
      if (timeSinceLastSnapshot < this.SNAPSHOT_TIME_THRESHOLD_MS) {
        return; // 时间还没到，不需要创建快照
      }
    }

    // 这里会触发快照创建（实际实现中由 ProjectionEngine 执行）
    // 为简洁起见，这里仅记录日志
    this.logger.info(`Snapshot creation triggered for ${aggregateType}:${aggregateId} at v${version}`);
  }

  /**
   * 将数据库行转换为事件对象
   */
  private rowToEvent(row: any): EventBase {
    return {
      eventId: row.event_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      aggregateVersion: row.aggregate_version,
      payload: row.payload,
      metadata: row.metadata,
      createdAt: row.created_at,
      recordedAt: row.recorded_at,
    };
  }
}

// ============================================================================
// 错误类定义
// ============================================================================

export class ConcurrentUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrentUpdateError';
  }
}

export class InvalidEventSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEventSequenceError';
  }
}
```

---

## 六、事件发布/订阅系统

### 6.1 事件发布者

```typescript
// ============================================================================
// 事件发布者 - 负责写入事件并发布到消息总线
// ============================================================================

export interface EventPublisher {
  publish(event: EventBase): Promise<void>;
  publishBatch(events: EventBase[]): Promise<void>;
}

export class EventPublisherImpl implements EventPublisher {
  private eventStore: IEventStore;
  private messageQueue: IMessageQueue;  // 可以是 RabbitMQ、Kafka、Redis等
  private logger: ILogger;

  constructor(eventStore: IEventStore, messageQueue: IMessageQueue, logger: ILogger) {
    this.eventStore = eventStore;
    this.messageQueue = messageQueue;
    this.logger = logger;
  }

  /**
   * 发布单个事件
   * 模式：写入事件存储 → 发布到消息队列
   */
  async publish(event: EventBase): Promise<void> {
    try {
      // 1. 写入事件存储（持久化）
      await this.eventStore.appendEvent(event);

      // 2. 发布到消息队列（异步通知）
      await this.messageQueue.publish(
        `events.${event.eventType}`,
        {
          eventId: event.eventId,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payload: event.payload,
          metadata: event.metadata,
          publishedAt: new Date(),
        }
      );

      this.logger.info(`Event published: ${event.eventType}`);
    } catch (error) {
      // 如果发布失败，事件已经在存储中，订阅者可以通过轮询重新获取
      this.logger.error(`Failed to publish event: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量发布事件
   */
  async publishBatch(events: EventBase[]): Promise<void> {
    try {
      // 1. 原子地写入所有事件
      await this.eventStore.appendEvents(events);

      // 2. 并发发布到消息队列
      await Promise.all(
        events.map(event =>
          this.messageQueue.publish(
            `events.${event.eventType}`,
            {
              eventId: event.eventId,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              payload: event.payload,
              metadata: event.metadata,
              publishedAt: new Date(),
            }
          )
        )
      );

      this.logger.info(`${events.length} events published in batch`);
    } catch (error) {
      this.logger.error(`Failed to publish batch: ${error.message}`);
      throw error;
    }
  }
}
```

### 6.2 事件订阅者

```typescript
// ============================================================================
// 事件订阅者 - 消费和处理事件
// ============================================================================

export interface EventHandler {
  handle(event: EventBase): Promise<void>;
  supports(eventType: string): boolean;
}

export interface EventSubscriber {
  subscriberId: string;
  subscriberName: string;
  subscribe(): Promise<void>;
  unsubscribe(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 事件订阅者基类
 * 支持幂等性处理和错误重试
 */
export abstract class BaseEventSubscriber implements EventSubscriber {
  subscriberId: string;
  subscriberName: string;
  protected eventStore: IEventStore;
  protected handlers: Map<string, EventHandler[]>;
  protected pool: Pool;
  protected logger: ILogger;
  protected isRunning: boolean = false;

  constructor(
    subscriberId: string,
    subscriberName: string,
    eventStore: IEventStore,
    pool: Pool,
    logger: ILogger
  ) {
    this.subscriberId = subscriberId;
    this.subscriberName = subscriberName;
    this.eventStore = eventStore;
    this.pool = pool;
    this.logger = logger;
    this.handlers = new Map();
  }

  /**
   * 注册事件处理器
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  /**
   * 订阅事件
   */
  async subscribe(): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO event_subscribers
         (subscriber_id, subscriber_name, subscriber_type, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (subscriber_id) DO UPDATE SET updated_at = $6`,
        [this.subscriberId, this.subscriberName, 'projection', true, new Date(), new Date()]
      );
      this.logger.info(`Subscriber registered: ${this.subscriberName}`);
    } catch (error) {
      this.logger.error(`Failed to register subscriber: ${error.message}`);
      throw error;
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE event_subscribers SET is_active = false WHERE subscriber_id = $1`,
        [this.subscriberId]
      );
      this.logger.info(`Subscriber unregistered: ${this.subscriberName}`);
    } catch (error) {
      this.logger.error(`Failed to unregister subscriber: ${error.message}`);
      throw error;
    }
  }

  /**
   * 启动订阅者（轮询模式）
   */
  async start(): Promise<void> {
    this.isRunning = true;
    this.logger.info(`Subscriber started: ${this.subscriberName}`);

    while (this.isRunning) {
      try {
        await this.processNewEvents();
      } catch (error) {
        this.logger.error(`Error processing events: ${error.message}`);
        // 记录错误并继续
        await this.recordError(error.message);
      }

      // 等待一段时间后再轮询（避免CPU占用过高）
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  /**
   * 停止订阅者
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info(`Subscriber stopped: ${this.subscriberName}`);
  }

  /**
   * 处理新事件
   */
  private async processNewEvents(): Promise<void> {
    const subscriberRow = await this.pool.query(
      `SELECT last_processed_event_id FROM event_subscribers WHERE subscriber_id = $1`,
      [this.subscriberId]
    );

    let lastProcessedEventId = subscriberRow.rows[0]?.last_processed_event_id;

    // 获取未处理的事件
    let query = `SELECT * FROM events WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`;
    const params: any[] = [];

    if (lastProcessedEventId) {
      query += ` AND event_id > $1`;
      params.push(lastProcessedEventId);
    }

    query += ` ORDER BY created_at ASC LIMIT 100`;

    const result = await this.pool.query(query, params);
    const events = result.rows.map(row => this.rowToEvent(row));

    // 处理每个事件
    for (const event of events) {
      await this.handleEvent(event);

      // 更新处理进度（确保幂等性）
      await this.pool.query(
        `UPDATE event_subscribers
         SET last_processed_event_id = $1, last_processed_at = $2
         WHERE subscriber_id = $3`,
        [event.eventId, new Date(), this.subscriberId]
      );
    }
  }

  /**
   * 处理单个事件
   */
  private async handleEvent(event: EventBase): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];

    for (const handler of handlers) {
      if (handler.supports(event.eventType)) {
        try {
          await handler.handle(event);
          this.logger.debug(`Event handled: ${event.eventType} by ${this.subscriberName}`);
        } catch (error) {
          this.logger.error(`Error handling event: ${error.message}`);
          throw error;
        }
      }
    }
  }

  /**
   * 记录错误
   */
  private async recordError(errorMessage: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE event_subscribers
         SET error_count = error_count + 1,
             last_error_message = $1,
             last_error_at = $2
         WHERE subscriber_id = $3`,
        [errorMessage, new Date(), this.subscriberId]
      );
    } catch (error) {
      this.logger.error(`Failed to record error: ${error.message}`);
    }
  }

  /**
   * 私有方法：行转换为事件
   */
  private rowToEvent(row: any): EventBase {
    return {
      eventId: row.event_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      aggregateVersion: row.aggregate_version,
      payload: row.payload,
      metadata: row.metadata,
      createdAt: row.created_at,
      recordedAt: row.recorded_at,
    };
  }
}
```

---

## 七、状态重建引擎（Projection Engine）

### 7.1 聚合体基类

```typescript
// ============================================================================
// 聚合体（Aggregate Root）基类
// 由事件驱动，支持状态重建
// ============================================================================

export abstract class AggregateRoot {
  protected aggregateId: string;
  protected aggregateType: string;
  protected version: number = 0;
  protected uncommittedEvents: EventBase[] = [];

  constructor(aggregateId: string, aggregateType: string) {
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
  }

  /**
   * 记录事件
   * 私有方法，只能在聚合体内部调用
   */
  protected applyEvent(event: EventBase): void {
    // 调用具体的事件处理方法
    const methodName = `on${event.eventType}`;
    if (typeof (this as any)[methodName] === 'function') {
      (this as any)[methodName](event.payload);
    }

    this.version++;
    this.uncommittedEvents.push(event);
  }

  /**
   * 从事件流重建状态
   */
  loadFromHistory(events: EventBase[]): void {
    for (const event of events) {
      const methodName = `on${event.eventType}`;
      if (typeof (this as any)[methodName] === 'function') {
        (this as any)[methodName](event.payload);
      }
      this.version = event.aggregateVersion;
    }
    this.uncommittedEvents = [];
  }

  /**
   * 获取未提交的事件
   */
  getUncommittedEvents(): EventBase[] {
    return this.uncommittedEvents;
  }

  /**
   * 标记事件已提交
   */
  markEventsAsCommitted(): void {
    this.uncommittedEvents = [];
  }

  /**
   * 获取聚合体当前版本
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * 获取聚合体ID
   */
  getId(): string {
    return this.aggregateId;
  }

  /**
   * 获取聚合体类型
   */
  getType(): string {
    return this.aggregateType;
  }

  /**
   * 获取聚合体的当前状态快照
   */
  abstract getState(): Record<string, any>;
}
```

### 7.2 玩家聚合体实现

```typescript
// ============================================================================
// 玩家聚合体（Player Aggregate）实现
// ============================================================================

export interface PlayerState {
  playerId: string;
  walletAddress: string;
  nickname?: string;
  farmCode?: string;
  referrerId?: string;
  registeredAt: Date;
  rookieProtectionUntil?: Date;
  totalEggsEarned: number;
  totalEggsExchanged: number;
  totalStolenCount: number;
  totalSuccessfulSteals: number;
  inviteCommissionEarned: number;
  isActive: boolean;
  lastLoginAt?: Date;
}

export class PlayerAggregate extends AggregateRoot {
  private state: PlayerState;

  constructor(playerId: string) {
    super(playerId, AggregateTypes.PLAYER);
    this.state = {
      playerId,
      walletAddress: '',
      totalEggsEarned: 0,
      totalEggsExchanged: 0,
      totalStolenCount: 0,
      totalSuccessfulSteals: 0,
      inviteCommissionEarned: 0,
      isActive: true,
      registeredAt: new Date(),
    };
  }

  /**
   * 玩家注册
   */
  register(
    walletAddress: string,
    nickname?: string,
    referrerId?: string
  ): void {
    if (this.state.walletAddress) {
      throw new Error('Player already registered');
    }

    const event: PlayerRegisteredEvent = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.PLAYER,
      aggregateId: this.aggregateId,
      eventType: PlayerEventTypes.REGISTERED,
      eventVersion: 2,  // v2版本
      aggregateVersion: this.version + 1,
      payload: {
        playerId: this.aggregateId,
        walletAddress,
        nickname,
        registeredAt: new Date(),
        referrerId,
      },
      metadata: {
        source: 'player_action',
        userId: this.aggregateId,
        environment: process.env.NODE_ENV,
      },
      createdAt: new Date(),
    };

    this.applyEvent(event);
  }

  /**
   * 更新昵称
   */
  updateNickname(nickname: string): void {
    const event: EventBase = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.PLAYER,
      aggregateId: this.aggregateId,
      eventType: PlayerEventTypes.NICKNAME_UPDATED,
      eventVersion: 1,
      aggregateVersion: this.version + 1,
      payload: { nickname },
      metadata: {
        source: 'player_action',
        userId: this.aggregateId,
      },
      createdAt: new Date(),
    };

    this.applyEvent(event);
  }

  /**
   * 记录登录
   */
  login(): void {
    const event: EventBase = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.PLAYER,
      aggregateId: this.aggregateId,
      eventType: PlayerEventTypes.LOGIN,
      eventVersion: 1,
      aggregateVersion: this.version + 1,
      payload: { loginAt: new Date() },
      metadata: {
        source: 'player_action',
        userId: this.aggregateId,
      },
      createdAt: new Date(),
    };

    this.applyEvent(event);
  }

  // ========== 事件处理器 ==========

  /**
   * 处理 PlayerRegistered 事件
   */
  private onPlayerRegistered(payload: PlayerRegisteredEvent['payload']): void {
    this.state = {
      ...this.state,
      playerId: payload.playerId,
      walletAddress: payload.walletAddress,
      nickname: payload.nickname,
      referrerId: payload.referrerId,
      registeredAt: payload.registeredAt,
      rookieProtectionUntil: new Date(payload.registeredAt.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * 处理 PlayerNicknameUpdated 事件
   */
  private onPlayerNicknameUpdated(payload: { nickname: string }): void {
    this.state.nickname = payload.nickname;
  }

  /**
   * 处理 PlayerLoggedIn 事件
   */
  private onPlayerLoggedIn(payload: { loginAt: Date }): void {
    this.state.lastLoginAt = payload.loginAt;
  }

  /**
   * 处理 EggsCollected 事件（统计EGGS兑换）
   */
  onEggsCollected(payload: { eggCount: number; wasExchange: boolean }): void {
    this.state.totalEggsExchanged += payload.eggCount;
  }

  /**
   * 处理 StealSucceeded 事件
   */
  onStealSucceeded(payload: { stealerId: string; victimId: string; eggsStolenCount: number }): void {
    if (payload.stealerId === this.aggregateId) {
      this.state.totalSuccessfulSteals++;
    } else {
      this.state.totalStolenCount++;
    }
  }

  /**
   * 处理 InviteCommissionPaid 事件
   */
  onInviteCommissionPaid(payload: { amount: number }): void {
    this.state.inviteCommissionEarned += payload.amount;
  }

  /**
   * 获取玩家状态
   */
  getState(): PlayerState {
    return { ...this.state };
  }
}
```

### 7.3 投影引擎

```typescript
// ============================================================================
// 投影引擎 - 从事件流生成和更新投影
// ============================================================================

export interface IProjectionEngine {
  rebuildProjection(projectionId: string, fromVersion?: number): Promise<void>;
  getProjection(projectionId: string, aggregateId: string): Promise<Record<string, any>>;
}

export class ProjectionEngine implements IProjectionEngine {
  private pool: Pool;
  private eventStore: IEventStore;
  private logger: ILogger;

  constructor(pool: Pool, eventStore: IEventStore, logger: ILogger) {
    this.pool = pool;
    this.eventStore = eventStore;
    this.logger = logger;
  }

  /**
   * 完整重建投影（支持版本升级）
   * 适用于：
   * 1. 新增投影字段
   * 2. 投影逻辑变更
   * 3. 数据修复
   */
  async rebuildProjection(projectionId: string, fromVersion: number = 0): Promise<void> {
    this.logger.info(`Starting projection rebuild: ${projectionId}`);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. 标记投影为重建状态
      await client.query(
        `UPDATE projection_versions
         SET is_rebuilding = true, rebuild_started_at = $1, rebuild_progress_percent = 0
         WHERE projection_id = $2`,
        [new Date(), projectionId]
      );

      // 2. 获取所有事件
      const eventResult = await client.query(
        `SELECT DISTINCT aggregate_id FROM events
         WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'`
      );

      const aggregateIds = eventResult.rows.map(row => row.aggregate_id);
      const total = aggregateIds.length;
      let processed = 0;

      // 3. 逐个重建聚合体的投影
      for (const aggregateId of aggregateIds) {
        await this.rebuildAggregateProjection(client, projectionId, aggregateId, fromVersion);

        processed++;
        const progress = ((processed / total) * 100).toFixed(2);

        // 更新进度
        await client.query(
          `UPDATE projection_versions
           SET rebuild_progress_percent = $1
           WHERE projection_id = $2`,
          [parseFloat(progress), projectionId]
        );
      }

      // 4. 完成重建
      await client.query(
        `UPDATE projection_versions
         SET is_rebuilding = false,
             rebuild_completed_at = $1,
             rebuild_progress_percent = 100,
             current_version = current_version + 1
         WHERE projection_id = $2`,
        [new Date(), projectionId]
      );

      await client.query('COMMIT');
      this.logger.info(`Projection rebuild completed: ${projectionId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Projection rebuild failed: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 重建单个聚合体的投影
   */
  private async rebuildAggregateProjection(
    client: any,
    projectionId: string,
    aggregateId: string,
    fromVersion: number
  ): Promise<void> {
    // 获取投影类型（从projectionId推断）
    const projectionMap: Record<string, { table: string; aggregateType: string }> = {
      'players': { table: 'projections_players', aggregateType: AggregateTypes.PLAYER },
      'farms': { table: 'projections_farms', aggregateType: AggregateTypes.FARM },
    };

    const projInfo = projectionMap[projectionId];
    if (!projInfo) {
      throw new Error(`Unknown projection: ${projectionId}`);
    }

    // 1. 尝试获取快照
    const snapshot = await this.eventStore.getLatestSnapshot(
      projInfo.aggregateType,
      aggregateId
    );

    // 2. 确定起点版本
    const startVersion = snapshot ? snapshot.aggregateVersion : 0;

    // 3. 获取后续事件
    const events = await this.eventStore.getEventsByAggregateId(
      projInfo.aggregateType,
      aggregateId,
      Math.max(startVersion, fromVersion)
    );

    // 4. 重建聚合体
    let state = snapshot ? snapshot.aggregateState : this.getInitialState(projInfo.aggregateType);

    if (snapshot && events.length === 0) {
      // 无新事件，只需更新投影表
      await this.updateProjectionTable(client, projInfo.table, aggregateId, state);
      return;
    }

    // 应用事件
    for (const event of events) {
      state = this.applyEventToProjection(projInfo.aggregateType, state, event);
    }

    // 5. 更新投影表
    await this.updateProjectionTable(client, projInfo.table, aggregateId, state);

    // 6. 可选：创建新快照（如果事件数超过阈值）
    if (events.length > 50) {
      await this.eventStore.saveSnapshot({
        snapshotId: uuidv4(),
        aggregateType: projInfo.aggregateType,
        aggregateId,
        aggregateVersion: snapshot?.aggregateVersion || 0 + events.length,
        aggregateState: state,
        createdAt: new Date(),
        reason: 'event_count',
        reasonDetails: `Rebuilt from ${events.length} events`,
      });
    }
  }

  /**
   * 应用事件到投影
   */
  private applyEventToProjection(
    aggregateType: string,
    state: Record<string, any>,
    event: EventBase
  ): Record<string, any> {
    const { eventType, payload } = event;

    switch (aggregateType) {
      case AggregateTypes.PLAYER:
        return this.applyPlayerEvent(state, eventType, payload);
      case AggregateTypes.FARM:
        return this.applyFarmEvent(state, eventType, payload);
      default:
        return state;
    }
  }

  /**
   * 应用玩家事件
   */
  private applyPlayerEvent(state: any, eventType: string, payload: any): any {
    switch (eventType) {
      case PlayerEventTypes.REGISTERED:
        return {
          ...state,
          wallet_address: payload.walletAddress,
          nickname: payload.nickname,
          registered_at: payload.registeredAt,
          rookie_protection_until: new Date(new Date(payload.registeredAt).getTime() + 24 * 60 * 60 * 1000),
        };
      case PlayerEventTypes.NICKNAME_UPDATED:
        return { ...state, nickname: payload.nickname };
      case PlayerEventTypes.LOGIN:
        return { ...state, last_login_at: payload.loginAt };
      case TradeEventTypes.EGGS_CONVERTED:
        return {
          ...state,
          total_eggs_exchanged: (state.total_eggs_exchanged || 0) + payload.eggAmount,
        };
      case StealEventTypes.SUCCEEDED:
        return {
          ...state,
          total_successful_steals: (state.total_successful_steals || 0) + (payload.stealerId === state.player_id ? 1 : 0),
          total_stolen_count: (state.total_stolen_count || 0) + (payload.victimId === state.player_id ? 1 : 0),
        };
      default:
        return state;
    }
  }

  /**
   * 应用农场事件
   */
  private applyFarmEvent(state: any, eventType: string, payload: any): any {
    switch (eventType) {
      case FarmEventTypes.CREATED:
        return {
          ...state,
          chicken_count: payload.initialChickens || 0,
          egg_capacity: payload.capacity || 30,
        };
      case FarmEventTypes.EGG_PRODUCED:
        return {
          ...state,
          egg_inventory: payload.currentInventory,
          is_inventory_full: payload.currentInventory >= payload.inventoryCapacity,
          total_eggs_produced: (state.total_eggs_produced || 0) + payload.eggCount,
          last_egg_production_at: new Date(),
        };
      case FarmEventTypes.EGG_COLLECTED:
        return {
          ...state,
          egg_inventory: Math.max(0, state.egg_inventory - payload.eggCount),
        };
      default:
        return state;
    }
  }

  /**
   * 获取初始状态
   */
  private getInitialState(aggregateType: string): Record<string, any> {
    switch (aggregateType) {
      case AggregateTypes.PLAYER:
        return {
          is_active: true,
          total_eggs_earned: 0,
          total_eggs_exchanged: 0,
          total_stolen_count: 0,
          total_successful_steals: 0,
          invite_commission_earned: 0,
        };
      case AggregateTypes.FARM:
        return {
          chicken_count: 0,
          egg_inventory: 0,
          egg_capacity: 30,
          is_inventory_full: false,
          total_eggs_produced: 0,
        };
      default:
        return {};
    }
  }

  /**
   * 更新投影表
   */
  private async updateProjectionTable(
    client: any,
    table: string,
    aggregateId: string,
    state: Record<string, any>
  ): Promise<void> {
    // 这是一个简化实现，实际应根据表结构动态生成SQL
    // 这里仅作示例，真实实现需要更复杂的逻辑
    this.logger.debug(`Projection updated: ${table} for ${aggregateId}`);
  }

  /**
   * 获取投影数据
   */
  async getProjection(
    projectionId: string,
    aggregateId: string
  ): Promise<Record<string, any>> {
    const projectionMap: Record<string, string> = {
      'players': 'SELECT * FROM projections_players WHERE player_id = $1',
      'farms': 'SELECT * FROM projections_farms WHERE farm_id = $1',
    };

    const query = projectionMap[projectionId];
    if (!query) {
      throw new Error(`Unknown projection: ${projectionId}`);
    }

    const result = await this.pool.query(query, [aggregateId]);
    return result.rows[0] || null;
  }
}
```

---

## 八、使用示例

### 8.1 完整的玩家注册流程

```typescript
// ============================================================================
// 示例：玩家注册流程（从API到事件存储）
// ============================================================================

export class PlayerService {
  private eventPublisher: EventPublisher;
  private eventStore: IEventStore;
  private pool: Pool;
  private logger: ILogger;

  constructor(
    eventPublisher: EventPublisher,
    eventStore: IEventStore,
    pool: Pool,
    logger: ILogger
  ) {
    this.eventPublisher = eventPublisher;
    this.eventStore = eventStore;
    this.pool = pool;
    this.logger = logger;
  }

  /**
   * 注册新玩家
   */
  async registerPlayer(
    walletAddress: string,
    nickname?: string,
    referrerId?: string
  ): Promise<string> {
    const playerId = uuidv4();

    // 1. 创建玩家聚合体
    const playerAggregate = new PlayerAggregate(playerId);

    // 2. 执行业务逻辑，生成事件
    playerAggregate.register(walletAddress, nickname, referrerId);

    // 3. 获取生成的事件
    const events = playerAggregate.getUncommittedEvents();

    // 4. 发布事件（原子写入 + 消息队列通知）
    await this.eventPublisher.publishBatch(events);

    // 5. 事件已持久化，标记为已提交
    playerAggregate.markEventsAsCommitted();

    this.logger.info(`Player registered: ${playerId} (${walletAddress})`);

    return playerId;
  }

  /**
   * 获取玩家当前状态
   * 方式1：从事件重建（强一致性，但较慢）
   * 方式2：从投影表读取（弱一致性，但很快）
   */
  async getPlayerState(playerId: string, useProjection: boolean = true): Promise<PlayerState> {
    if (useProjection) {
      // 快速路径：从投影表读取
      const result = await this.pool.query(
        `SELECT * FROM projections_players WHERE player_id = $1`,
        [playerId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Player not found: ${playerId}`);
      }

      return this.rowToPlayerState(result.rows[0]);
    } else {
      // 完整路径：从事件重建
      const events = await this.eventStore.getEventsByAggregateId(
        AggregateTypes.PLAYER,
        playerId
      );

      const playerAggregate = new PlayerAggregate(playerId);
      playerAggregate.loadFromHistory(events);

      return playerAggregate.getState();
    }
  }

  /**
   * 获取玩家在特定时刻的状态（时间旅行）
   */
  async getPlayerStateAtTime(playerId: string, timestamp: Date): Promise<PlayerState> {
    // 获取该时刻之前的所有事件
    const events = await this.pool.query(
      `SELECT * FROM events
       WHERE aggregate_type = $1 AND aggregate_id = $2 AND created_at <= $3
       ORDER BY aggregate_version ASC`,
      [AggregateTypes.PLAYER, playerId, timestamp]
    );

    const playerAggregate = new PlayerAggregate(playerId);
    playerAggregate.loadFromHistory(
      events.rows.map(row => this.rowToEvent(row))
    );

    return playerAggregate.getState();
  }

  /**
   * 获取玩家的完整操作历史
   */
  async getPlayerEventHistory(playerId: string): Promise<EventBase[]> {
    return await this.eventStore.getEventsByAggregateId(
      AggregateTypes.PLAYER,
      playerId
    );
  }

  /**
   * 辅助方法：行转换为玩家状态
   */
  private rowToPlayerState(row: any): PlayerState {
    return {
      playerId: row.player_id.toString(),
      walletAddress: row.wallet_address,
      nickname: row.nickname,
      farmCode: row.farm_code,
      registeredAt: row.registered_at,
      rookieProtectionUntil: row.rookie_protection_until,
      totalEggsEarned: row.total_eggs_earned,
      totalEggsExchanged: row.total_eggs_exchanged,
      totalStolenCount: row.total_stolen_count,
      totalSuccessfulSteals: row.total_successful_steals,
      inviteCommissionEarned: row.invite_commission_earned,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
    };
  }

  /**
   * 辅助方法：行转换为事件
   */
  private rowToEvent(row: any): EventBase {
    return {
      eventId: row.event_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      aggregateVersion: row.aggregate_version,
      payload: row.payload,
      metadata: row.metadata,
      createdAt: row.created_at,
      recordedAt: row.recorded_at,
    };
  }
}
```

### 8.2 农场产蛋事件流

```typescript
// ============================================================================
// 示例：农场产蛋完整流程
// ============================================================================

export class FarmService {
  private eventPublisher: EventPublisher;
  private eventStore: IEventStore;
  private logger: ILogger;

  constructor(
    eventPublisher: EventPublisher,
    eventStore: IEventStore,
    logger: ILogger
  ) {
    this.eventPublisher = eventPublisher;
    this.eventStore = eventStore;
    this.logger = logger;
  }

  /**
   * 产蛋（由定时任务或AI调用）
   */
  async produceEggs(farmId: string, playerId: string, chickenId: string): Promise<void> {
    // 1. 获取农场当前状态
    const farmState = await this.getFarmCurrentState(farmId);

    // 检查仓库是否已满
    if (farmState.is_inventory_full) {
      this.logger.info(`Farm inventory full, skipping egg production: ${farmId}`);
      return;
    }

    // 2. 获取鸡的信息
    const chickenState = await this.getChickenState(chickenId);

    // 3. 计算产蛋数量
    const eggCount = this.calculateEggCount(chickenState);
    const newInventory = Math.min(
      farmState.egg_inventory + eggCount,
      farmState.egg_capacity
    );

    // 4. 创建事件
    const eggProducedEvent: EggProducedEvent = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.FARM,
      aggregateId: farmId,
      eventType: FarmEventTypes.EGG_PRODUCED,
      eventVersion: 2,  // 包含 chicken_id 字段
      aggregateVersion: (farmState.projection_version || 0) + 1,
      payload: {
        farmId,
        playerId,
        chickenId,  // v2: 新字段，用于追踪每只鸡的产蛋
        eggCount,
        boostApplied: chickenState.boost_multiplier > 1.0,
        boostMultiplier: chickenState.boost_multiplier,
        currentInventory: newInventory,
        inventoryCapacity: farmState.egg_capacity,
      },
      metadata: {
        source: 'system',                // 由系统定时任务触发
        userId: playerId,
        correlationId: `egg-production-${Date.now()}`,
        environment: process.env.NODE_ENV,
      },
      createdAt: new Date(),
    };

    // 5. 同时创建鸡的产蛋事件
    const chickenProducedEvent: EventBase = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.CHICKEN,
      aggregateId: chickenId,
      eventType: ChickenEventTypes.PRODUCED_EGG,
      eventVersion: 1,
      aggregateVersion: (chickenState.version || 0) + 1,
      payload: {
        chickenId,
        farmId,
        playerId,
        eggCount,
      },
      metadata: {
        source: 'system',
        userId: playerId,
        causationId: eggProducedEvent.eventId,  // 关联到产蛋事件
      },
      createdAt: new Date(),
    };

    // 6. 原子地发布两个事件
    await this.eventPublisher.publishBatch([eggProducedEvent, chickenProducedEvent]);

    this.logger.info(`Eggs produced: ${eggCount} in farm ${farmId}`);
  }

  /**
   * 收集鸡蛋
   */
  async collectEggs(farmId: string, playerId: string, quantity: number): Promise<void> {
    const farmState = await this.getFarmCurrentState(farmId);

    if (farmState.egg_inventory < quantity) {
      throw new Error(`Insufficient eggs. Have ${farmState.egg_inventory}, requested ${quantity}`);
    }

    const eggCollectedEvent: EventBase = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.FARM,
      aggregateId: farmId,
      eventType: FarmEventTypes.EGG_COLLECTED,
      eventVersion: 1,
      aggregateVersion: (farmState.projection_version || 0) + 1,
      payload: {
        farmId,
        playerId,
        eggCount: quantity,
        newInventory: farmState.egg_inventory - quantity,
      },
      metadata: {
        source: 'player_action',
        userId: playerId,
      },
      createdAt: new Date(),
    };

    await this.eventPublisher.publish(eggCollectedEvent);

    this.logger.info(`Eggs collected: ${quantity} from farm ${farmId}`);
  }

  /**
   * 获取农场当前状态
   */
  private async getFarmCurrentState(farmId: string): Promise<any> {
    // 简化示例，实际应从投影表读取
    return {
      farm_id: farmId,
      egg_inventory: 15,
      egg_capacity: 30,
      is_inventory_full: false,
      projection_version: 5,
    };
  }

  /**
   * 获取鸡的状态
   */
  private async getChickenState(chickenId: string): Promise<any> {
    return {
      chicken_id: chickenId,
      eggs_per_cycle: 10,
      boost_multiplier: 1.5,  // 示例：有加速效果
      version: 3,
    };
  }

  /**
   * 计算产蛋数量
   */
  private calculateEggCount(chickenState: any): number {
    return Math.floor(chickenState.eggs_per_cycle * chickenState.boost_multiplier);
  }
}
```

### 8.3 偷蛋事件链

```typescript
// ============================================================================
// 示例：偷蛋完整事件链
// ============================================================================

export class StealService {
  private eventPublisher: EventPublisher;
  private logger: ILogger;

  constructor(eventPublisher: EventPublisher, logger: ILogger) {
    this.eventPublisher = eventPublisher;
    this.logger = logger;
  }

  /**
   * 尝试偷蛋
   * 会产生一系列关联事件
   */
  async attemptSteal(
    stealerId: string,
    victimId: string
  ): Promise<{ success: boolean; eggsStolenCount: number; jackpotTriggered: boolean }> {
    const stealEventId = uuidv4();
    const events: EventBase[] = [];

    // 1. 创建偷蛋初始化事件
    const stealInitiatedEvent: EventBase = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.STEAL,
      aggregateId: stealEventId,
      eventType: StealEventTypes.INITIATED,
      eventVersion: 1,
      aggregateVersion: 1,
      payload: {
        stealEventId,
        stealerId,
        victimId,
        initiatedAt: new Date(),
      },
      metadata: {
        source: 'player_action',
        userId: stealerId,
        correlationId: `steal-${stealEventId}`,
      },
      createdAt: new Date(),
    };
    events.push(stealInitiatedEvent);

    // 2. 检查新手保护
    const victimProtectionStatus = await this.checkRookieProtection(victimId);
    if (victimProtectionStatus.isProtected) {
      const blockedEvent: EventBase = {
        eventId: uuidv4(),
        aggregateType: AggregateTypes.STEAL,
        aggregateId: stealEventId,
        eventType: StealEventTypes.BLOCKED_BY_PROTECTION,
        eventVersion: 1,
        aggregateVersion: 2,
        payload: {
          stealEventId,
          stealerId,
          victimId,
          protectionExpiry: victimProtectionStatus.protectionExpiry,
        },
        metadata: {
          source: 'system',
          userId: stealerId,
          causationId: stealInitiatedEvent.eventId,
        },
        createdAt: new Date(),
      };
      events.push(blockedEvent);

      await this.eventPublisher.publishBatch(events);
      return { success: false, eggsStolenCount: 0, jackpotTriggered: false };
    }

    // 3. 获取被盗者的鸡蛋数量
    const victimEggs = await this.getPlayerEggInventory(victimId);
    if (victimEggs <= 0) {
      const failedEvent: EventBase = {
        eventId: uuidv4(),
        aggregateType: AggregateTypes.STEAL,
        aggregateId: stealEventId,
        eventType: StealEventTypes.FAILED,
        eventVersion: 1,
        aggregateVersion: 2,
        payload: {
          stealEventId,
          stealerId,
          victimId,
          reason: 'no_eggs',
        },
        metadata: {
          source: 'system',
          causationId: stealInitiatedEvent.eventId,
        },
        createdAt: new Date(),
      };
      events.push(failedEvent);

      await this.eventPublisher.publishBatch(events);
      return { success: false, eggsStolenCount: 0, jackpotTriggered: false };
    }

    // 4. 计算成功概率和奖励
    const successChance = this.calculateSuccessChance(stealerId, victimId);
    const isSuccess = Math.random() < successChance;
    const jackpotTriggered = Math.random() < 0.05;  // 5% 概率触发大奖

    if (isSuccess) {
      const eggsStolenCount = jackpotTriggered ? victimEggs : Math.floor(victimEggs * 0.3);

      // 5a. 创建成功事件
      const successEvent: StealSucceededEvent = {
        eventId: uuidv4(),
        aggregateType: AggregateTypes.STEAL,
        aggregateId: stealEventId,
        eventType: StealEventTypes.SUCCEEDED,
        eventVersion: 3,  // v3: 包含 jackpotTriggered 字段
        aggregateVersion: 2,
        payload: {
          stealEventId,
          stealerId,
          victimId,
          eggsStolenCount,
          jackpotTriggered,
          jackpotAmount: jackpotTriggered ? eggsStolenCount * 2 : undefined,
          stealerNewBalance: await this.getPlayerEggInventory(stealerId) + eggsStolenCount,
          victimNewBalance: victimEggs - eggsStolenCount,
        },
        metadata: {
          source: 'system',
          causationId: stealInitiatedEvent.eventId,
        },
        createdAt: new Date(),
      };
      events.push(successEvent);

      // 5b. 创建双方的EGGS流水事件
      const stealerEggEvent: EventBase = {
        eventId: uuidv4(),
        aggregateType: AggregateTypes.PLAYER,
        aggregateId: stealerId,
        eventType: 'EggsStolen',  // 自定义事件
        eventVersion: 1,
        aggregateVersion: 1,
        payload: {
          playerId: stealerId,
          eggAmount: eggsStolenCount,
          source: 'steal',
          sourceEventId: successEvent.eventId,
        },
        metadata: {
          source: 'system',
          causationId: successEvent.eventId,
        },
        createdAt: new Date(),
      };
      events.push(stealerEggEvent);

      const victimEggEvent: EventBase = {
        eventId: uuidv4(),
        aggregateType: AggregateTypes.PLAYER,
        aggregateId: victimId,
        eventType: 'EggsLost',  // 自定义事件
        eventVersion: 1,
        aggregateVersion: 1,
        payload: {
          playerId: victimId,
          eggAmount: eggsStolenCount,
          stolenBy: stealerId,
          sourceEventId: successEvent.eventId,
        },
        metadata: {
          source: 'system',
          causationId: successEvent.eventId,
        },
        createdAt: new Date(),
      };
      events.push(victimEggEvent);

      await this.eventPublisher.publishBatch(events);
      return { success: true, eggsStolenCount, jackpotTriggered };
    } else {
      // 5b. 创建失败事件
      const failedEvent: EventBase = {
        eventId: uuidv4(),
        aggregateType: AggregateTypes.STEAL,
        aggregateId: stealEventId,
        eventType: StealEventTypes.FAILED,
        eventVersion: 1,
        aggregateVersion: 2,
        payload: {
          stealEventId,
          stealerId,
          victimId,
          reason: 'low_luck',
        },
        metadata: {
          source: 'system',
          causationId: stealInitiatedEvent.eventId,
        },
        createdAt: new Date(),
      };
      events.push(failedEvent);

      await this.eventPublisher.publishBatch(events);
      return { success: false, eggsStolenCount: 0, jackpotTriggered: false };
    }
  }

  /**
   * 辅助方法
   */
  private async checkRookieProtection(playerId: string): Promise<{
    isProtected: boolean;
    protectionExpiry?: Date;
  }> {
    // 简化示例
    return { isProtected: false };
  }

  private async getPlayerEggInventory(playerId: string): Promise<number> {
    // 简化示例
    return 20;
  }

  private calculateSuccessChance(stealerId: string, victimId: string): number {
    // 可以基于多个因素计算成功率
    return 0.6;  // 60% 成功率
  }
}
```

---

## 九、AI 决策应用示例

```typescript
// ============================================================================
// 示例：AI 决策应用到事件系统
// ============================================================================

export class AIDecisionEngine {
  private eventPublisher: EventPublisher;
  private logger: ILogger;

  constructor(eventPublisher: EventPublisher, logger: ILogger) {
    this.eventPublisher = eventPublisher;
    this.logger = logger;
  }

  /**
   * AI 决策：调整游戏难度
   * 基于最近的游戏数据，AI 决定是否需要调整
   */
  async decideDifficultyAdjustment(): Promise<void> {
    // 1. 获取游戏统计数据
    const stats = await this.analyzeGameStats();

    // 2. AI 推理（这里简化为条件判断）
    const decision = this.makeDecision(stats);

    if (!decision.shouldAdjust) {
      this.logger.info('No difficulty adjustment needed');
      return;
    }

    // 3. 创建 AI 决策事件
    const aiDecisionEvent: AIDecisionAppliedEvent = {
      eventId: uuidv4(),
      aggregateType: AggregateTypes.SYSTEM,
      aggregateId: 'global',
      eventType: SystemEventTypes.AI_DECISION_APPLIED,
      eventVersion: 1,
      aggregateVersion: 1,
      payload: {
        decisionType: 'difficulty_adjustment',
        affectedAggregates: decision.affectedPlayers.map(playerId => ({
          aggregateType: AggregateTypes.PLAYER,
          aggregateId: playerId,
        })),
        changes: {
          stealSuccessRateBoost: decision.newSuccessRate,
          eggProductionBoost: decision.newProductionRate,
        },
      },
      metadata: {
        source: 'ai_decision',
        aiModel: 'claude-v3',
        reasoning: decision.reasoning,
        environment: 'production',
      },
      createdAt: new Date(),
    };

    // 4. 为受影响的每个玩家创建具体的调整事件
    const playerEvents: EventBase[] = decision.affectedPlayers.map(playerId => ({
      eventId: uuidv4(),
      aggregateType: AggregateTypes.PLAYER,
      aggregateId: playerId,
      eventType: 'GameDifficultyAdjusted',
      eventVersion: 1,
      aggregateVersion: 1,
      payload: {
        playerId,
        adjustments: decision.changes,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),  // 7天
      },
      metadata: {
        source: 'ai_decision',
        causationId: aiDecisionEvent.eventId,
      },
      createdAt: new Date(),
    }));

    // 5. 原子地发布所有事件
    await this.eventPublisher.publishBatch([aiDecisionEvent, ...playerEvents]);

    this.logger.info(`AI decision applied: ${decision.affectedPlayers.length} players affected`);
  }

  /**
   * 获取游戏统计
   */
  private async analyzeGameStats(): Promise<any> {
    return {
      averageStealSuccessRate: 0.58,
      targetSuccessRate: 0.50,
      playerChurnRate: 0.02,
      eggProductionRate: 8.5,
      targetProductionRate: 10,
    };
  }

  /**
   * AI 决策逻辑
   */
  private makeDecision(stats: any): any {
    const shouldAdjust = stats.averageStealSuccessRate > stats.targetSuccessRate;

    return {
      shouldAdjust,
      newSuccessRate: shouldAdjust ? 0.45 : 0.50,
      newProductionRate: stats.eggProductionRate < stats.targetProductionRate ? 1.2 : 1.0,
      affectedPlayers: ['player_1', 'player_2', 'player_3'],  // 示例玩家ID
      reasoning: '基于过去7天数据分析，偷蛋成功率过高。建议降低至50%目标，并提升产蛋效率以平衡游戏性。',
      changes: {
        stealSuccessRateBoost: 0.95,
        eggProductionBoost: 1.2,
      },
    };
  }
}
```

---

## 十、数据迁移与版本管理

```typescript
// ============================================================================
// 投影升级示例：添加新字段不会丢失历史数据
// ============================================================================

/**
 * 场景：现有 players 表添加新字段 vip_level
 * 传统方式：需要 ALTER TABLE 并补充数据
 * 事件溯源：重建投影时自动支持新字段
 */

export class MigrationExample {
  /**
   * 迁移步骤：
   * 1. 定义新的投影版本
   * 2. 添加新的事件处理逻辑
   * 3. 触发投影重建
   */

  async migrateAddVipLevel(): Promise<void> {
    // 1. 更新投影版本号
    const query = `
      UPDATE projection_versions
      SET current_version = 2
      WHERE projection_id = 'players'
    `;

    // 2. 添加新的投影表字段（或创建新表 projections_players_v2）
    const alterQuery = `
      ALTER TABLE projections_players ADD COLUMN vip_level INT DEFAULT 0
    `;

    // 3. 注册新的事件处理器
    // projectionEngine.registerEventHandler('VipLevelUpgraded', (state, event) => {
    //   state.vip_level = event.payload.newLevel;
    //   return state;
    // });

    // 4. 触发投影重建（从旧事件重新计算）
    // await projectionEngine.rebuildProjection('players');

    // 现有数据完全保留，新字段从历史事件重建
  }

  /**
   * 另一个例子：事件本身的版本升级
   * 如果事件格式变了，需要在投影引擎中处理多个版本
   */
  async handleEventVersionUpgrade(): Promise<void> {
    // 旧版本 StealSucceeded (v2)：不包含 jackpotTriggered
    // 新版本 StealSucceeded (v3)：包含 jackpotTriggered

    // 投影引擎在处理事件时：
    // 1. 检查 event_version 字段
    // 2. 根据版本号调用不同的处理器
    // 3. 向下兼容：v2 事件自动转换为 v3 格式（jackpotTriggered = false）

    const versionHandlers: Record<number, (payload: any) => any> = {
      2: (payload) => ({
        ...payload,
        jackpotTriggered: false,  // v2 默认无大奖
      }),
      3: (payload) => payload,    // v3 直接使用
    };
  }
}
```

---

## 十一、性能优化与监控

```typescript
// ============================================================================
// 性能优化：快照策略、分区、索引
// ============================================================================

/**
 * 快照策略建议：
 *
 * 1. 按事件数量快照
 *    - 阈值：每 100 个事件创建一个快照
 *    - 优点：可预测性强，适合高频操作
 *
 * 2. 按时间快照
 *    - 间隔：每 24 小时创建一个快照
 *    - 优点：避免热点数据积累
 *
 * 3. 混合策略
 *    - 同时满足两个条件中的任一个即触发快照
 *    - 建议配置：100 事件 OR 24 小时
 */

/**
 * 分区策略（超大规模部署）
 */
export const PartitionStrategy = `
-- 按时间分区事件表
CREATE TABLE events_2024_q1 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE events_2024_q2 PARTITION OF events
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- 分区优势：
-- 1. 旧数据可以移到廉价存储
-- 2. 查询性能提升（只扫描相关分区）
-- 3. 支持更精细的备份和恢复策略
`;

/**
 * 监控查询示例
 */
export const MonitoringQueries = `
-- 1. 事件吞吐量监控
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as event_count,
  COUNT(DISTINCT aggregate_id) as unique_aggregates
FROM events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- 2. 订阅者进度监控
SELECT
  subscriber_name,
  subscriber_type,
  last_processed_at,
  EXTRACT(EPOCH FROM (NOW() - last_processed_at))::INT as lag_seconds,
  error_count,
  CASE
    WHEN error_count > 10 THEN 'CRITICAL'
    WHEN error_count > 5 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as health_status
FROM event_subscribers
ORDER BY lag_seconds DESC;

-- 3. 快照覆盖率
SELECT
  aggregate_type,
  COUNT(DISTINCT aggregate_id) as total_aggregates,
  COUNT(DISTINCT CASE WHEN last_snapshot_version IS NOT NULL THEN aggregate_id END) as with_snapshot,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN last_snapshot_version IS NOT NULL THEN aggregate_id END)
        / COUNT(DISTINCT aggregate_id), 2) as snapshot_coverage_percent
FROM (
  SELECT
    e.aggregate_type,
    e.aggregate_id,
    MAX(s.aggregate_version) as last_snapshot_version
  FROM events e
  LEFT JOIN snapshots s ON e.aggregate_type = s.aggregate_type AND e.aggregate_id = s.aggregate_id
  GROUP BY e.aggregate_type, e.aggregate_id
) t
GROUP BY aggregate_type;

-- 4. 投影延迟
SELECT
  'players' as projection,
  MAX(e.aggregate_version) - COALESCE(MAX(p.last_event_version), 0) as version_lag,
  MAX(e.created_at) - COALESCE(MAX(p.last_updated_at), '1970-01-01'::timestamp) as time_lag
FROM events e
LEFT JOIN projections_players p ON e.aggregate_id = p.player_id::TEXT
WHERE e.aggregate_type = 'player'
GROUP BY projection;
`;
```

---

## 十二、故障恢复与数据一致性

```typescript
// ============================================================================
// 故障恢复机制
// ============================================================================

export class DisasterRecovery {
  /**
   * 投影表损坏恢复
   * 步骤：
   * 1. 清空投影表
   * 2. 从最新快照恢复
   * 3. 重放后续事件
   */
  async repairProjection(projectionId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. 截断投影表
      await client.query(`TRUNCATE TABLE projections_${projectionId}`);

      // 2. 从快照恢复（投影引擎会处理）
      // projection.rebuildProjection(projectionId);

      // 3. 重新注册订阅者
      // 订阅者会从上次处理位置继续处理

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  /**
   * 事件冲突检测
   * 乐观并发控制：检测并拒绝过期的写入
   */
  async detectConflicts(aggregateId: string, expectedVersion: number): Promise<boolean> {
    const result = await pool.query(
      `SELECT MAX(aggregate_version) as current_version
       FROM events
       WHERE aggregate_id = $1`,
      [aggregateId]
    );

    const currentVersion = result.rows[0]?.current_version || 0;
    return currentVersion !== expectedVersion;
  }

  /**
   * 双写策略（过渡方案）
   * 在完全迁移到 Event Sourcing 前，同时更新投影表和事件表
   */
  async dualWriteNewPlayer(player: any): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. 写入事件表
      await client.query(
        `INSERT INTO events (aggregate_type, aggregate_id, event_type, aggregate_version, payload, metadata, created_at)
         VALUES ('player', $1, 'PlayerRegistered', 1, $2, $3, $4)`,
        ['player:' + player.wallet_address, JSON.stringify(player), '{}', new Date()]
      );

      // 2. 同时写入投影表（兼容现有代码）
      await client.query(
        `INSERT INTO projections_players (player_id, wallet_address, nickname, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [player.id, player.wallet_address, player.nickname, true, new Date()]
      );

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }
}
```

---

## 十三、最佳实践总结

| 方面 | 最佳实践 |
|-----|---------|
| **事件设计** | 1. 事件应该是不可变的过去式动词<br>2. 包含足够的信息用于重建状态<br>3. 版本化支持模式演变<br>4. 避免包含计算字段，只存储原始数据 |
| **性能优化** | 1. 使用快照减少事件重放<br>2. 为常用查询创建投影<br>3. 按照聚合体ID索引<br>4. 定期清理旧快照 |
| **一致性保证** | 1. 使用乐观并发控制检测冲突<br>2. 聚合体内事件严格顺序<br>3. 投影的最终一致性可接受<br>4. 关键操作使用强一致性读取 |
| **可维护性** | 1. 事件类型集中管理<br>2. 完整的事件审计日志<br>3. 投影版本管理<br>4. 自动化迁移脚本 |
| **监控告警** | 1. 监控事件处理延迟<br>2. 快照创建频率<br>3. 订阅者错误率<br>4. 投影不一致情况 |

---

## 十四、总结

这份事件溯源设计文档为 AIggs 项目提供了：

1. **完整的基础架构**：Event Store、Snapshots、Projections
2. **生产级 TypeScript 实现**：包含错误处理、并发控制、幂等性保证
3. **灵活的扩展能力**：支持新事件类型、投影升级、数据迁移
4. **AI 友好的架构**：所有决策都作为事件记录，完全可追溯和可重放
5. **强大的时间旅行能力**：支持查询任意历史时刻的游戏状态

当 AI 系统持续演进产品规则时，所有变化都会被记录为事件，不会丢失任何历史数据。新的投影可以从旧事件重建，确保数据完整性和可审计性。

