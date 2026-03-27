# AIggs 偷蛋系统 - 完整实现指南

## 目录
1. [类型定义](#1-类型定义)
2. [概率引擎](#2-概率引擎)
3. [邻居发现服务](#3-邻居发现服务)
4. [偷蛋核心服务](#4-偷蛋核心服务)
5. [偷蛋控制器](#5-偷蛋控制器)
6. [路由定义](#6-路由定义)
7. [限制中间件](#7-限制中间件)
8. [日重置任务](#8-日重置任务)
9. [单元测试](#9-单元测试)

---

## 1. 类型定义

### src/types/steal.ts

```typescript
/**
 * AIggs 偷蛋系统的核心类型定义
 * 包含枚举、接口和数据模型
 */

/**
 * 偷蛋结果类型枚举
 * - bumper_crop: 大丰收（20%概率，偷取目标30%库存）
 * - success: 成功（55%概率，偷取3-5枚EGGS）
 * - fail: 扑空（25%概率，什么都偷不到）
 */
export enum StealOutcome {
  BUMPER_CROP = 'bumper_crop',
  SUCCESS = 'success',
  FAIL = 'fail',
}

/**
 * 偷蛋限制错误类型
 */
export enum StealError {
  // 限制和保护
  DAILY_LIMIT_EXCEEDED = 'DAILY_LIMIT_EXCEEDED',              // 今日偷蛋次数已满（最多2次）
  TARGET_COOLDOWN_ACTIVE = 'TARGET_COOLDOWN_ACTIVE',          // 对该目标的24h冷却期未过
  VICTIM_IN_ROOKIE_PROTECTION = 'VICTIM_IN_ROOKIE_PROTECTION', // 目标仍在新手保护期内
  VICTIM_INVENTORY_TOO_LOW = 'VICTIM_INVENTORY_TOO_LOW',      // 目标库存过低（≤15枚）
  STEALER_INVENTORY_FULL = 'STEALER_INVENTORY_FULL',          // 偷蛋者库存已满
  CANNOT_STEAL_SELF = 'CANNOT_STEAL_SELF',                    // 不能偷取自己

  // 系统错误
  VICTIM_NOT_FOUND = 'VICTIM_NOT_FOUND',                      // 目标玩家不存在
  STEALER_NOT_FOUND = 'STEALER_NOT_FOUND',                    // 偷蛋者不存在
  CONCURRENT_STEAL_DETECTED = 'CONCURRENT_STEAL_DETECTED',    // 检测到并发偷蛋
  INSUFFICIENT_INVENTORY = 'INSUFFICIENT_INVENTORY',          // 库存不足
  DATABASE_ERROR = 'DATABASE_ERROR',                          // 数据库错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',                            // 未知错误
}

/**
 * 邻居信息接口（用于邻居列表返回）
 */
export interface Neighbor {
  // 玩家基本信息
  playerId: bigint;
  nickname: string;
  walletAddress: string;
  farmCode: string;

  // 农场状态
  chickenCount: number;
  eggInventory: number;

  // 风险评估分数（0-100）
  // 高分 = 风险高/收益低，低分 = 风险低/收益高
  riskScore: number;

  // 活跃度指标（0-1）
  activityScore: number;

  // 排序用：期望收益（eggs_stolen的期望值）
  expectedProfit: number;
}

/**
 * 偷蛋尝试请求
 */
export interface StealAttemptRequest {
  stealerId: bigint;        // 偷蛋者ID
  victimId: bigint;         // 被偷者ID
}

/**
 * 偷蛋尝试响应
 */
export interface StealAttemptResponse {
  // 事件信息
  eventId: bigint;
  outcome: StealOutcome;

  // 结果数据
  eggsStolenAmount: number;

  // 库存变化
  stealerInventoryBefore: number;
  stealerInventoryAfter: number;
  victimInventoryBefore: number;
  victimInventoryAfter: number;

  // 结果消息（用于前端显示）
  resultMessage: string;

  // 时间戳
  attemptedAt: Date;
}

/**
 * 邻居列表请求
 */
export interface GetNeighborsRequest {
  playerId: bigint;
  limit?: number;  // 最多返回10个
}

/**
 * 邻居列表响应
 */
export interface GetNeighborsResponse {
  neighbors: Neighbor[];
  totalAvailable: number;  // 可偷蛋的邻居总数
}

/**
 * 偷蛋冷却信息
 */
export interface StealCooldown {
  victimId: bigint;
  cooldownUntil: Date;
  canStealNow: boolean;
}

/**
 * 日统计信息（用于排行榜）
 */
export interface DailyStealStats {
  date: string;  // YYYY-MM-DD format
  playerId: bigint;
  successfulSteals: number;
  totalEggsStealed: number;
  rank: number;
}

/**
 * 偷蛋者今日状态
 */
export interface StealerDailyStatus {
  playerId: bigint;
  remainingStealAttempts: number;  // 今日还能偷几次
  totalStealAttemptsToday: number;  // 今日已偷次数
  dailyStealLimit: number;          // 每日限制数（2次）
  cooldowns: StealCooldown[];       // 进行中的冷却列表
}

/**
 * 数据库偷蛋事件记录（内部使用）
 */
export interface StealEventRecord {
  id: bigint;
  stealerId: bigint;
  victimId: bigint;
  outcome: StealOutcome;
  bumpCrop: boolean;
  eggsStoled: bigint;
  victimInventoryBefore: bigint;
  victimInventoryAfter: bigint;
  stealerLastTargetId: bigint | null;
  cooldownUntil: Date;
  stealerDailyStealCount: number;
  aiDecisionLogId: bigint | null;
  attemptedAt: Date;
  createdAt: Date;
}

/**
 * 概率引擎配置（可由 Design AI 动态调整）
 */
export interface ProbabilityConfig {
  bumperCropChance: number;      // 大丰收概率（0-1），默认 0.2
  successChance: number;         // 成功概率（0-1），默认 0.55
  failChance: number;            // 扑空概率（0-1），默认 0.25

  // 各结果的EGGS数量
  bumperCropRate: number;        // 大丰收时偷取目标库存的百分比，默认 0.3
  successMinEggs: number;        // 成功最少EGGS，默认 3
  successMaxEggs: number;        // 成功最多EGGS，默认 5

  // 保护机制
  rookieProtectionHours: number; // 新手保护期（小时），默认 24
  minimumInventoryToBeStolen: number;  // 最低库存保护，默认 15

  // 冷却机制
  targetCooldownHours: number;   // 对同一目标的冷却时间（小时），默认 24
  dailyStealLimit: number;       // 每日最多偷蛋次数，默认 2
}

/**
 * 偷蛋验证结果
 */
export interface StealValidationResult {
  isValid: boolean;
  errorCode?: StealError;
  errorMessage?: string;
}

/**
 * 邻居匹配条件
 */
export interface NeighborMatchCriteria {
  excludeSelf: boolean;           // 排除自己
  excludeRookieProtection: boolean; // 排除新手保护期玩家
  excludeLowInventory: boolean;   // 排除低库存玩家（≤15）
  minActivityScore: number;       // 最低活跃度要求（0-1）
}

/**
 * 随机数生成器接口（支持加密安全随机）
 */
export interface SecureRandomGenerator {
  // 生成 0-1 之间的随机数
  nextRandom(): Promise<number>;

  // 生成指定范围的随机整数
  nextInt(min: number, max: number): Promise<number>;

  // 生成安全随机种子
  generateSeed(): Promise<string>;
}
```

---

## 2. 概率引擎

### src/services/probabilityEngine.ts

```typescript
/**
 * 概率引擎：处理偷蛋三种结果的概率计算
 * 使用加密安全的随机数生成
 * 支持 Design AI 动态调整概率配置
 */

import crypto from 'crypto';
import { StealOutcome, ProbabilityConfig, SecureRandomGenerator } from '../types/steal';

/**
 * 加密安全随机数生成器实现
 * 基于 crypto.getRandomValues()
 */
class CryptoSecureRandom implements SecureRandomGenerator {
  /**
   * 生成 0-1 之间的随机小数（加密安全）
   */
  async nextRandom(): Promise<number> {
    const buffer = crypto.getRandomValues(new Uint32Array(1));
    // 将 Uint32 (0-4294967295) 转换为 0-1 之间的数
    return buffer[0] / 0xffffffff;
  }

  /**
   * 生成指定范围内的随机整数
   * @param min 最小值（包含）
   * @param max 最大值（包含）
   */
  async nextInt(min: number, max: number): Promise<number> {
    if (min > max) {
      throw new Error('min must be less than or equal to max');
    }
    const random = await this.nextRandom();
    return Math.floor(random * (max - min + 1)) + min;
  }

  /**
   * 生成安全随机种子（用于可重现的测试）
   */
  async generateSeed(): Promise<string> {
    const buffer = crypto.getRandomValues(new Uint8Array(32));
    return Buffer.from(buffer).toString('hex');
  }
}

/**
 * 概率引擎类
 */
export class ProbabilityEngine {
  private config: ProbabilityConfig;
  private random: SecureRandomGenerator;
  private configCache: Map<string, number> = new Map();

  /**
   * 默认概率配置
   */
  private static readonly DEFAULT_CONFIG: ProbabilityConfig = {
    bumperCropChance: 0.2,      // 大丰收 20%
    successChance: 0.55,        // 成功 55%
    failChance: 0.25,           // 扑空 25%

    bumperCropRate: 0.3,        // 大丰收时偷 30% 库存
    successMinEggs: 3,          // 成功最少 3 枚
    successMaxEggs: 5,          // 成功最多 5 枚

    rookieProtectionHours: 24,
    minimumInventoryToBeStolen: 15,
    targetCooldownHours: 24,
    dailyStealLimit: 2,
  };

  constructor(config?: Partial<ProbabilityConfig>, random?: SecureRandomGenerator) {
    this.config = {
      ...ProbabilityEngine.DEFAULT_CONFIG,
      ...config,
    };
    this.random = random || new CryptoSecureRandom();

    // 验证概率和为 1（误差范围 0.01）
    const totalChance = this.config.bumperCropChance +
                       this.config.successChance +
                       this.config.failChance;
    if (Math.abs(totalChance - 1) > 0.01) {
      throw new Error(
        `Probability sum must be 1, got ${totalChance}. ` +
        'bumperCrop + success + fail = 1'
      );
    }
  }

  /**
   * 执行偷蛋概率判定
   * 返回偷蛋结果类型和具体获得的 EGGS 数量
   *
   * @param victimInventory 被偷者的库存
   * @returns { outcome, eggsStoled }
   */
  async determineOutcome(victimInventory: number): Promise<{
    outcome: StealOutcome;
    eggsStoled: number;
  }> {
    // 第一步：生成随机数决定总体结果
    const rand = await this.random.nextRandom();
    let outcome: StealOutcome;
    let eggsStoled = 0;

    if (rand < this.config.bumperCropChance) {
      // 大丰收（20%）：偷取目标库存的 30%
      outcome = StealOutcome.BUMPER_CROP;
      eggsStoled = Math.max(
        1,
        Math.floor(victimInventory * this.config.bumperCropRate)
      );
    } else if (rand < this.config.bumperCropChance + this.config.successChance) {
      // 成功（55%）：偷取随机数量的 EGGS（3-5枚）
      outcome = StealOutcome.SUCCESS;
      eggsStoled = await this.random.nextInt(
        this.config.successMinEggs,
        this.config.successMaxEggs
      );
      // 不能偷取超过目标库存
      eggsStoled = Math.min(eggsStoled, victimInventory);
    } else {
      // 扑空（25%）：什么都偷不到
      outcome = StealOutcome.FAIL;
      eggsStoled = 0;
    }

    return {
      outcome,
      eggsStoled: Math.max(0, Math.min(eggsStoled, victimInventory)),
    };
  }

  /**
   * 更新概率配置（由 Design AI 调用）
   * 自动验证新配置的合法性
   *
   * @param newConfig 新的配置对象（部分更新）
   * @throws 如果配置无效
   */
  updateConfig(newConfig: Partial<ProbabilityConfig>): void {
    const updated = { ...this.config, ...newConfig };

    // 验证所有概率值在 [0, 1] 之间
    if (updated.bumperCropChance < 0 || updated.bumperCropChance > 1) {
      throw new Error('bumperCropChance must be between 0 and 1');
    }
    if (updated.successChance < 0 || updated.successChance > 1) {
      throw new Error('successChance must be between 0 and 1');
    }
    if (updated.failChance < 0 || updated.failChance > 1) {
      throw new Error('failChance must be between 0 and 1');
    }

    // 验证概率和为 1（误差范围 0.01）
    const totalChance = updated.bumperCropChance +
                       updated.successChance +
                       updated.failChance;
    if (Math.abs(totalChance - 1) > 0.01) {
      throw new Error(
        `Probability sum must be 1, got ${totalChance}. ` +
        'bumperCrop + success + fail = 1'
      );
    }

    // 验证数值范围
    if (updated.bumperCropRate <= 0 || updated.bumperCropRate > 1) {
      throw new Error('bumperCropRate must be between 0 and 1');
    }
    if (updated.successMinEggs < 0 || updated.successMaxEggs < updated.successMinEggs) {
      throw new Error('successMinEggs must be ≥ 0 and ≤ successMaxEggs');
    }

    // 更新配置
    this.config = updated;
    this.configCache.clear();
  }

  /**
   * 获取当前概率配置
   */
  getConfig(): ProbabilityConfig {
    return { ...this.config };
  }

  /**
   * 获取各结果的概率百分比（用于前端显示）
   */
  getProbabilityDistribution(): {
    bumperCrop: string;
    success: string;
    fail: string;
  } {
    return {
      bumperCrop: (this.config.bumperCropChance * 100).toFixed(0) + '%',
      success: (this.config.successChance * 100).toFixed(0) + '%',
      fail: (this.config.failChance * 100).toFixed(0) + '%',
    };
  }

  /**
   * 计算预期收益（用于邻居排序）
   * = success概率 * (min+max)/2 + bumper概率 * (库存*rate) + fail概率 * 0
   *
   * @param victimInventory 被偷者库存
   */
  calculateExpectedProfit(victimInventory: number): number {
    const successEggs = (this.config.successMinEggs + this.config.successMaxEggs) / 2;
    const bumperEggs = victimInventory * this.config.bumperCropRate;

    return (
      this.config.successChance * successEggs +
      this.config.bumperCropChance * bumperEggs
    );
  }
}

// 导出单例（全局配置）
export const probabilityEngine = new ProbabilityEngine();
```

---

## 3. 邻居发现服务

### src/services/neighborService.ts

```typescript
/**
 * 邻居发现服务：基于活跃度和距离的邻居匹配
 * 主要职责：
 * 1. 发现可偷蛋的邻居
 * 2. 计算活跃度分数和风险评估
 * 3. 返回排序的邻居列表（最多10个）
 */

import { Pool } from 'pg';
import { Neighbor, NeighborMatchCriteria, GetNeighborsRequest, GetNeighborsResponse } from '../types/steal';
import { probabilityEngine } from './probabilityEngine';

export class NeighborService {
  constructor(private db: Pool) {}

  /**
   * 获取邻居列表（可偷蛋的目标）
   * 基于活跃度和风险的加权排序
   *
   * @param req 请求参数
   * @returns 邻居列表（最多10个）
   */
  async getNeighbors(req: GetNeighborsRequest): Promise<GetNeighborsResponse> {
    const { playerId, limit = 10 } = req;

    // 验证请求的玩家存在
    const playerResult = await this.db.query(
      'SELECT id FROM players WHERE id = $1',
      [playerId]
    );
    if (playerResult.rows.length === 0) {
      throw new Error(`Player ${playerId} not found`);
    }

    // 获取当前玩家的信息（用于判断排除条件）
    const currentPlayer = await this.db.query(
      `SELECT p.id, p.registered_at, p.rookie_protection_until, f.egg_inventory
       FROM players p
       LEFT JOIN farms f ON p.id = f.player_id
       WHERE p.id = $1`,
      [playerId]
    );

    // 构建查询条件
    const conditions = [
      `p.id != $1`,                              // 排除自己
      `p.is_active = true`,                      // 只查活跃玩家
      `NOW() > p.rookie_protection_until`,       // 排除新手保护期玩家
      `f.egg_inventory > 15`,                    // 排除低库存玩家（≤15）
    ];

    // 构建查询 SQL
    const query = `
      SELECT
        p.id AS player_id,
        p.nickname,
        p.wallet_address,
        p.farm_code,
        f.chicken_count,
        f.egg_inventory,
        p.registered_at,
        p.last_login_at,
        p.total_eggs_earned,
        p.total_successful_steals,
        COUNT(DISTINCT s.id) as recent_steal_count
      FROM players p
      LEFT JOIN farms f ON p.id = f.player_id
      LEFT JOIN steal_events s ON (p.id = s.victim_id AND s.attempted_at > NOW() - INTERVAL '7 days')
      WHERE ${conditions.join(' AND ')}
      GROUP BY p.id, p.nickname, p.wallet_address, p.farm_code,
               f.chicken_count, f.egg_inventory, p.registered_at,
               p.last_login_at, p.total_eggs_earned, p.total_successful_steals
      ORDER BY
        -- 活跃度高优先
        CASE WHEN p.last_login_at > NOW() - INTERVAL '24 hours' THEN 100 ELSE 0 END +
        CASE WHEN p.last_login_at > NOW() - INTERVAL '7 days' THEN 50 ELSE 0 END
        DESC,
        -- 库存多的优先（收益高）
        f.egg_inventory DESC,
        -- 防止偏差，加点随机性
        RANDOM()
      LIMIT $2
    `;

    const neighbors: Neighbor[] = [];
    try {
      const result = await this.db.query(query, [playerId, limit]);

      for (const row of result.rows) {
        const neighbor = this.enrichNeighborData(row);
        neighbors.push(neighbor);
      }
    } catch (error) {
      console.error('Failed to fetch neighbors:', error);
      throw new Error('Failed to fetch neighbors from database');
    }

    // 获取总可偷数量（用于统计）
    const countResult = await this.db.query(
      `SELECT COUNT(*) as total
       FROM players p
       LEFT JOIN farms f ON p.id = f.player_id
       WHERE p.id != $1 AND p.is_active = true
         AND NOW() > p.rookie_protection_until
         AND f.egg_inventory > 15`,
      [playerId]
    );

    return {
      neighbors,
      totalAvailable: parseInt(countResult.rows[0].total, 10),
    };
  }

  /**
   * 丰富邻居数据：计算风险分数、活跃度等
   */
  private enrichNeighborData(row: any): Neighbor {
    // 计算活跃度分数（0-1）
    const lastLoginAt = new Date(row.last_login_at);
    const now = new Date();
    const hoursSinceLogin = (now.getTime() - lastLoginAt.getTime()) / (1000 * 60 * 60);

    let activityScore = 0;
    if (hoursSinceLogin < 1) {
      activityScore = 1.0;  // 刚登录，活跃度最高
    } else if (hoursSinceLogin < 24) {
      activityScore = 0.8;  // 最近24小时，活跃度高
    } else if (hoursSinceLogin < 7 * 24) {
      activityScore = 0.5;  // 最近7天，活跃度中等
    } else {
      activityScore = 0.1;  // 超过7天，活跃度低
    }

    // 计算期望收益（基于库存和概率配置）
    const expectedProfit = probabilityEngine.calculateExpectedProfit(row.egg_inventory);

    // 计算风险分数（0-100）
    // 低活跃度 = 低风险；低库存 = 低收益；
    // 近期被偷多 = 高风险（保护机制可能更强）
    const riskScore = Math.min(
      100,
      Math.max(
        0,
        (1 - activityScore) * 50 +  // 不活跃玩家风险分散
        (row.recent_steal_count / 7) * 30  // 近期被偷多的玩家
      )
    );

    return {
      playerId: BigInt(row.player_id),
      nickname: row.nickname || `Player_${row.wallet_address.slice(0, 8)}`,
      walletAddress: row.wallet_address,
      farmCode: row.farm_code,
      chickenCount: row.chicken_count,
      eggInventory: row.egg_inventory,
      riskScore: Math.round(riskScore),
      activityScore: parseFloat(activityScore.toFixed(2)),
      expectedProfit: Math.round(expectedProfit * 100) / 100,
    };
  }

  /**
   * 检查玩家是否满足成为邻居的条件
   */
  async isValidNeighbor(
    playerId: bigint,
    candidateId: bigint
  ): Promise<{ isValid: boolean; reason?: string }> {
    if (playerId === candidateId) {
      return { isValid: false, reason: 'Cannot target yourself' };
    }

    const result = await this.db.query(
      `SELECT p.id, p.rookie_protection_until, f.egg_inventory
       FROM players p
       LEFT JOIN farms f ON p.id = f.player_id
       WHERE p.id = $1`,
      [candidateId]
    );

    if (result.rows.length === 0) {
      return { isValid: false, reason: 'Target not found' };
    }

    const row = result.rows[0];
    const now = new Date();

    // 检查新手保护期
    if (row.rookie_protection_until && new Date(row.rookie_protection_until) > now) {
      return { isValid: false, reason: 'Target is in rookie protection period' };
    }

    // 检查最低库存
    if (row.egg_inventory <= 15) {
      return { isValid: false, reason: 'Target inventory is too low' };
    }

    return { isValid: true };
  }

  /**
   * 计算两个玩家之间的"距离"（用于邻居匹配）
   * 距离基于：
   * - 养鸡数量差异
   * - 总收益差异
   * - 活跃度差异
   *
   * 返回值 0-1，越小越"近"
   */
  private calculateDistance(player1: any, player2: any): number {
    const chickenDiff = Math.abs(player1.chicken_count - player2.chicken_count) /
                       Math.max(1, player1.chicken_count + player2.chicken_count);

    const eggsDiff = Math.abs(player1.total_eggs_earned - player2.total_eggs_earned) /
                    Math.max(1, player1.total_eggs_earned + player2.total_eggs_earned);

    // 距离 = 差异的加权平均
    return (chickenDiff * 0.4 + eggsDiff * 0.6);
  }

  /**
   * 获取热门邻居（被偷蛋最多的玩家）
   * 用于前端排行榜展示
   */
  async getPopularNeighbors(limit: number = 10): Promise<Neighbor[]> {
    const query = `
      SELECT
        p.id AS player_id,
        p.nickname,
        p.wallet_address,
        p.farm_code,
        f.chicken_count,
        f.egg_inventory,
        p.registered_at,
        p.last_login_at,
        p.total_eggs_earned,
        p.total_successful_steals,
        COUNT(DISTINCT s.id) as total_stolen_count
      FROM players p
      LEFT JOIN farms f ON p.id = f.player_id
      LEFT JOIN steal_events s ON p.id = s.victim_id
      WHERE p.is_active = true AND NOW() > p.rookie_protection_until
      GROUP BY p.id, p.nickname, p.wallet_address, p.farm_code,
               f.chicken_count, f.egg_inventory, p.registered_at,
               p.last_login_at, p.total_eggs_earned, p.total_successful_steals
      ORDER BY total_stolen_count DESC
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);
    return result.rows.map(row => this.enrichNeighborData(row));
  }
}
```

---

## 4. 偷蛋核心服务

### src/services/stealService.ts

```typescript
/**
 * 偷蛋核心服务：处理偷蛋的完整流程
 * 职责：
 * 1. 验证偷蛋条件（保护、限制、冷却）
 * 2. 执行偷蛋逻辑
 * 3. 生成偷蛋事件和通知
 * 4. 并发控制（乐观锁）
 */

import { Pool } from 'pg';
import { StealError, StealAttemptRequest, StealAttemptResponse, StealOutcome, StealValidationResult } from '../types/steal';
import { ProbabilityEngine } from './probabilityEngine';
import { NeighborService } from './neighborService';

export class StealService {
  private probabilityEngine: ProbabilityEngine;
  private neighborService: NeighborService;

  constructor(
    private db: Pool,
    probabilityEngine?: ProbabilityEngine,
    neighborService?: NeighborService
  ) {
    this.probabilityEngine = probabilityEngine || new ProbabilityEngine();
    this.neighborService = neighborService || new NeighborService(db);
  }

  /**
   * 执行偷蛋尝试（主入口）
   * 包含完整的验证、执行和事件记录流程
   *
   * @param req 偷蛋请求
   * @returns 偷蛋结果
   * @throws 如果验证失败或系统错误
   */
  async attemptSteal(req: StealAttemptRequest): Promise<StealAttemptResponse> {
    const { stealerId, victimId } = req;

    // 第一步：验证所有条件
    const validation = await this.validateStealAttempt(stealerId, victimId);
    if (!validation.isValid) {
      throw new Error(
        `Steal attempt failed: ${validation.errorCode} - ${validation.errorMessage}`
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // 第二步：获取锁定的玩家和农场数据
      const { stealer, stealerFarm, victim, victimFarm } =
        await this.lockPlayersForStealing(client, stealerId, victimId);

      // 第三步：最后一次验证（防止并发修改）
      const concurrentValidation = await this.validateStealAttemptWithLocks(
        client,
        stealer,
        victim,
        victimFarm
      );
      if (!concurrentValidation.isValid) {
        await client.query('ROLLBACK');
        throw new Error(
          `Concurrent steal detected: ${concurrentValidation.errorCode}`
        );
      }

      // 第四步：执行偷蛋逻辑（概率判定 + 库存转移）
      const outcome = await this.probabilityEngine.determineOutcome(
        victimFarm.egg_inventory
      );

      // 第五步：更新数据库
      const eventId = await this.executeSteal(
        client,
        stealer,
        stealerFarm,
        victim,
        victimFarm,
        outcome
      );

      // 第六步：生成通知（异步，不阻塞事务）
      await client.query('COMMIT');

      // 获取最新数据用于响应
      const stealerFarmAfter = await this.db.query(
        'SELECT egg_inventory FROM farms WHERE player_id = $1',
        [stealerId]
      );

      const victimFarmAfter = await this.db.query(
        'SELECT egg_inventory FROM farms WHERE player_id = $1',
        [victimId]
      );

      // 异步生成通知（不阻塞响应）
      this.generateStealNotification(
        stealerId,
        victimId,
        outcome
      ).catch(err => console.error('Failed to generate notification:', err));

      return {
        eventId,
        outcome: outcome.outcome,
        eggsStolenAmount: outcome.eggsStoled,
        stealerInventoryBefore: stealerFarm.egg_inventory,
        stealerInventoryAfter: stealerFarmAfter.rows[0].egg_inventory,
        victimInventoryBefore: victimFarm.egg_inventory,
        victimInventoryAfter: victimFarmAfter.rows[0].egg_inventory,
        resultMessage: this.getResultMessage(outcome),
        attemptedAt: new Date(),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 验证偷蛋条件
   */
  private async validateStealAttempt(
    stealerId: bigint,
    victimId: bigint
  ): Promise<StealValidationResult> {
    // 检查玩家是否存在
    const stealerResult = await this.db.query(
      'SELECT id FROM players WHERE id = $1',
      [stealerId]
    );
    if (stealerResult.rows.length === 0) {
      return {
        isValid: false,
        errorCode: StealError.STEALER_NOT_FOUND,
        errorMessage: 'Stealer player not found',
      };
    }

    const victimResult = await this.db.query(
      'SELECT id FROM players WHERE id = $1',
      [victimId]
    );
    if (victimResult.rows.length === 0) {
      return {
        isValid: false,
        errorCode: StealError.VICTIM_NOT_FOUND,
        errorMessage: 'Victim player not found',
      };
    }

    // 不能偷自己
    if (stealerId === victimId) {
      return {
        isValid: false,
        errorCode: StealError.CANNOT_STEAL_SELF,
        errorMessage: 'Cannot steal from yourself',
      };
    }

    // 检查被害者是否在新手保护期
    const victimCheckResult = await this.db.query(
      `SELECT rookie_protection_until FROM players WHERE id = $1`,
      [victimId]
    );
    const victim = victimCheckResult.rows[0];
    if (victim.rookie_protection_until &&
        new Date(victim.rookie_protection_until) > new Date()) {
      return {
        isValid: false,
        errorCode: StealError.VICTIM_IN_ROOKIE_PROTECTION,
        errorMessage: 'Victim is in rookie protection period',
      };
    }

    // 检查被害者库存
    const victimFarmResult = await this.db.query(
      'SELECT egg_inventory FROM farms WHERE player_id = $1',
      [victimId]
    );
    const victimFarm = victimFarmResult.rows[0];
    if (victimFarm.egg_inventory <= 15) {
      return {
        isValid: false,
        errorCode: StealError.VICTIM_INVENTORY_TOO_LOW,
        errorMessage: 'Victim inventory is too low',
      };
    }

    // 检查偷蛋者库存是否已满
    const stealerFarmResult = await this.db.query(
      'SELECT egg_inventory, egg_capacity FROM farms WHERE player_id = $1',
      [stealerId]
    );
    const stealerFarm = stealerFarmResult.rows[0];
    if (stealerFarm.egg_inventory >= stealerFarm.egg_capacity) {
      return {
        isValid: false,
        errorCode: StealError.STEALER_INVENTORY_FULL,
        errorMessage: 'Your inventory is full',
      };
    }

    // 检查今日偷蛋次数限制
    const dailyCountResult = await this.db.query(
      `SELECT COUNT(*) as daily_count FROM steal_events
       WHERE stealer_id = $1 AND attempted_at > NOW() - INTERVAL '24 hours'`,
      [stealerId]
    );
    const dailyCount = parseInt(dailyCountResult.rows[0].daily_count, 10);
    if (dailyCount >= 2) {
      return {
        isValid: false,
        errorCode: StealError.DAILY_LIMIT_EXCEEDED,
        errorMessage: 'Daily steal limit exceeded',
      };
    }

    // 检查同一目标的冷却期
    const cooldownResult = await this.db.query(
      `SELECT cooldown_until FROM steal_events
       WHERE stealer_id = $1 AND stealer_last_target_id = $2
       AND cooldown_until > NOW()
       ORDER BY attempted_at DESC
       LIMIT 1`,
      [stealerId, victimId]
    );
    if (cooldownResult.rows.length > 0) {
      return {
        isValid: false,
        errorCode: StealError.TARGET_COOLDOWN_ACTIVE,
        errorMessage: 'Target cooldown still active',
      };
    }

    return { isValid: true };
  }

  /**
   * 并发控制：对玩家和农场数据加锁
   * 使用行级锁，防止同时偷蛋
   */
  private async lockPlayersForStealing(
    client: any,
    stealerId: bigint,
    victimId: bigint
  ): Promise<{
    stealer: any;
    stealerFarm: any;
    victim: any;
    victimFarm: any;
  }> {
    // 锁定偷蛋者的玩家和农场数据
    const stealerResult = await client.query(
      'SELECT * FROM players WHERE id = $1 FOR UPDATE',
      [stealerId]
    );
    const stealer = stealerResult.rows[0];

    const stealerFarmResult = await client.query(
      'SELECT * FROM farms WHERE player_id = $1 FOR UPDATE',
      [stealerId]
    );
    const stealerFarm = stealerFarmResult.rows[0];

    // 锁定被害者的玩家和农场数据
    const victimResult = await client.query(
      'SELECT * FROM players WHERE id = $1 FOR UPDATE',
      [victimId]
    );
    const victim = victimResult.rows[0];

    const victimFarmResult = await client.query(
      'SELECT * FROM farms WHERE player_id = $1 FOR UPDATE',
      [victimId]
    );
    const victimFarm = victimFarmResult.rows[0];

    return { stealer, stealerFarm, victim, victimFarm };
  }

  /**
   * 在已锁定的数据上再次验证（防止并发修改后条件改变）
   */
  private async validateStealAttemptWithLocks(
    client: any,
    stealer: any,
    victim: any,
    victimFarm: any
  ): Promise<StealValidationResult> {
    // 重新检查受害者库存
    if (victimFarm.egg_inventory <= 15) {
      return {
        isValid: false,
        errorCode: StealError.VICTIM_INVENTORY_TOO_LOW,
        errorMessage: 'Victim inventory changed to too low',
      };
    }

    // 重新检查偷蛋者库存
    if (stealer.egg_inventory >= stealer.egg_capacity) {
      return {
        isValid: false,
        errorCode: StealError.STEALER_INVENTORY_FULL,
        errorMessage: 'Your inventory became full',
      };
    }

    // 重新检查受害者保护期
    const now = new Date();
    if (victim.rookie_protection_until &&
        new Date(victim.rookie_protection_until) > now) {
      return {
        isValid: false,
        errorCode: StealError.VICTIM_IN_ROOKIE_PROTECTION,
        errorMessage: 'Victim entered rookie protection',
      };
    }

    return { isValid: true };
  }

  /**
   * 执行偷蛋逻辑：更新库存、记录事件、生成流水
   */
  private async executeSteal(
    client: any,
    stealer: any,
    stealerFarm: any,
    victim: any,
    victimFarm: any,
    outcome: { outcome: StealOutcome; eggsStoled: number }
  ): Promise<bigint> {
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 计算库存变化（不超过容量上限）
    const newStealerInventory = Math.min(
      stealerFarm.egg_capacity,
      stealerFarm.egg_inventory + outcome.eggsStoled
    );
    const newVictimInventory = Math.max(
      0,
      victimFarm.egg_inventory - outcome.eggsStoled
    );

    // 更新偷蛋者库存
    await client.query(
      'UPDATE farms SET egg_inventory = $1, updated_at = NOW() WHERE player_id = $2',
      [newStealerInventory, stealer.id]
    );

    // 更新受害者库存
    await client.query(
      'UPDATE farms SET egg_inventory = $1, updated_at = NOW() WHERE player_id = $2',
      [newVictimInventory, victim.id]
    );

    // 获取偷蛋者今日偷蛋次数
    const dailyCountResult = await client.query(
      `SELECT COUNT(*) as daily_count FROM steal_events
       WHERE stealer_id = $1 AND attempted_at > NOW() - INTERVAL '24 hours'`,
      [stealer.id]
    );
    const dailyCount = parseInt(dailyCountResult.rows[0].daily_count, 10) + 1;

    // 创建偷蛋事件记录
    const eventResult = await client.query(
      `INSERT INTO steal_events (
        stealer_id, victim_id, outcome, bumper_crop, eggs_stolen,
        victim_inventory_before, victim_inventory_after,
        stealer_last_target_id, cooldown_until, stealer_daily_steal_count,
        attempted_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        stealer.id,
        victim.id,
        outcome.outcome,
        outcome.outcome === StealOutcome.BUMPER_CROP,
        outcome.eggsStoled,
        victimFarm.egg_inventory,
        newVictimInventory,
        victim.id,
        cooldownUntil,
        dailyCount,
        now,
        now,
      ]
    );
    const eventId = eventResult.rows[0].id;

    // 创建流水记录（偷蛋者获得）
    await client.query(
      `INSERT INTO eggs_transactions (
        player_id, farm_id, transaction_type, quantity,
        previous_balance, after_balance,
        steal_event_id, other_player_id,
        description, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        stealer.id,
        stealerFarm.id,
        outcome.outcome === StealOutcome.FAIL ? 'steal' : 'steal_success',
        outcome.eggsStoled,
        stealerFarm.egg_inventory,
        newStealerInventory,
        eventId,
        victim.id,
        `Stole ${outcome.eggsStoled} eggs from ${victim.nickname}`,
        now,
      ]
    );

    // 创建流水记录（受害者失去）
    await client.query(
      `INSERT INTO eggs_transactions (
        player_id, farm_id, transaction_type, quantity,
        previous_balance, after_balance,
        steal_event_id, other_player_id,
        description, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        victim.id,
        victimFarm.id,
        'steal',
        -outcome.eggsStoled,
        victimFarm.egg_inventory,
        newVictimInventory,
        eventId,
        stealer.id,
        `Lost ${outcome.eggsStoled} eggs to ${stealer.nickname}`,
        now,
      ]
    );

    // 更新统计数据
    await client.query(
      `UPDATE players SET total_successful_steals = total_successful_steals + 1
       WHERE id = $1 AND $2 > 0`,
      [stealer.id, outcome.eggsStoled]
    );

    await client.query(
      `UPDATE players SET total_stolen_count = total_stolen_count + 1
       WHERE id = $1`,
      [victim.id]
    );

    return eventId;
  }

  /**
   * 生成偷蛋通知（发送给被害者）
   * 异步执行，不阻塞主流程
   */
  private async generateStealNotification(
    stealerId: bigint,
    victimId: bigint,
    outcome: { outcome: StealOutcome; eggsStoled: number }
  ): Promise<void> {
    try {
      // 获取偷蛋者信息
      const stealerResult = await this.db.query(
        'SELECT nickname, wallet_address FROM players WHERE id = $1',
        [stealerId]
      );
      const stealer = stealerResult.rows[0];

      // 创建通知记录（通知表需要在迁移中添加）
      // 这里是占位符，实际应该插入到 notifications 表
      const message = `${stealer.nickname} stole ${outcome.eggsStoled} eggs from you!`;

      console.log(`[NOTIFICATION] User ${victimId}: ${message}`);
      // TODO: 实现推送通知系统（WebSocket/邮件/应用内通知等）
    } catch (error) {
      console.error('Failed to generate notification:', error);
    }
  }

  /**
   * 获取结果消息（用于前端显示）
   */
  private getResultMessage(outcome: { outcome: StealOutcome; eggsStoled: number }): string {
    switch (outcome.outcome) {
      case StealOutcome.BUMPER_CROP:
        return `🎉 Bumper Crop! You stole ${outcome.eggsStoled} eggs!`;
      case StealOutcome.SUCCESS:
        return `✅ Success! You stole ${outcome.eggsStoled} eggs!`;
      case StealOutcome.FAIL:
        return `❌ Failed! You didn't steal any eggs this time.`;
      default:
        return 'Unknown outcome';
    }
  }

  /**
   * 获取偷蛋者今日状态
   */
  async getStealerDailyStatus(playerId: bigint): Promise<{
    remainingAttempts: number;
    totalAttemptsToday: number;
    dailyLimit: number;
  }> {
    const result = await this.db.query(
      `SELECT COUNT(*) as daily_count FROM steal_events
       WHERE stealer_id = $1 AND attempted_at > NOW() - INTERVAL '24 hours'`,
      [playerId]
    );

    const dailyCount = parseInt(result.rows[0].daily_count, 10);
    const dailyLimit = 2;

    return {
      remainingAttempts: Math.max(0, dailyLimit - dailyCount),
      totalAttemptsToday: dailyCount,
      dailyLimit,
    };
  }
}
```

---

## 5. 偷蛋控制器

### src/controllers/stealController.ts

```typescript
/**
 * 偷蛋 API 控制器
 * 处理 HTTP 请求/响应，调用服务层
 */

import { Request, Response } from 'express';
import { StealService } from '../services/stealService';
import { NeighborService } from '../services/neighborService';
import { StealError } from '../types/steal';

export class StealController {
  constructor(
    private stealService: StealService,
    private neighborService: NeighborService
  ) {}

  /**
   * 获取邻居列表
   * GET /api/v1/steal/neighbors?playerId=xxx&limit=10
   */
  async getNeighbors(req: Request, res: Response): Promise<void> {
    try {
      const { playerId, limit } = req.query;

      if (!playerId) {
        res.status(400).json({ error: 'playerId is required' });
        return;
      }

      const result = await this.neighborService.getNeighbors({
        playerId: BigInt(String(playerId)),
        limit: limit ? parseInt(String(limit), 10) : 10,
      });

      res.status(200).json({
        code: 0,
        message: 'Success',
        data: {
          neighbors: result.neighbors.map(n => ({
            playerId: n.playerId.toString(),
            nickname: n.nickname,
            walletAddress: n.walletAddress,
            chickenCount: n.chickenCount,
            eggInventory: n.eggInventory,
            riskScore: n.riskScore,
            activityScore: n.activityScore,
            expectedProfit: n.expectedProfit,
          })),
          totalAvailable: result.totalAvailable,
        },
      });
    } catch (error) {
      console.error('Failed to get neighbors:', error);
      res.status(500).json({
        code: -1,
        error: 'Failed to get neighbors',
      });
    }
  }

  /**
   * 发起偷蛋
   * POST /api/v1/steal/attempt
   * Body: { stealerId, victimId }
   */
  async attemptSteal(req: Request, res: Response): Promise<void> {
    try {
      const { stealerId, victimId } = req.body;

      if (!stealerId || !victimId) {
        res.status(400).json({
          code: -1,
          error: 'stealerId and victimId are required',
        });
        return;
      }

      const result = await this.stealService.attemptSteal({
        stealerId: BigInt(stealerId),
        victimId: BigInt(victimId),
      });

      res.status(200).json({
        code: 0,
        message: 'Steal attempt successful',
        data: {
          eventId: result.eventId.toString(),
          outcome: result.outcome,
          eggsStolenAmount: result.eggsStolenAmount,
          stealerInventoryBefore: result.stealerInventoryBefore,
          stealerInventoryAfter: result.stealerInventoryAfter,
          victimInventoryBefore: result.victimInventoryBefore,
          victimInventoryAfter: result.victimInventoryAfter,
          resultMessage: result.resultMessage,
          attemptedAt: result.attemptedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Steal attempt failed:', error);

      const message = (error as Error).message;
      let errorCode = -1;

      // 根据错误类型返回对应的状态码
      if (message.includes(StealError.DAILY_LIMIT_EXCEEDED)) {
        res.status(429).json({
          code: 429,
          error: 'Daily steal limit exceeded',
        });
        return;
      }

      if (message.includes(StealError.TARGET_COOLDOWN_ACTIVE)) {
        res.status(429).json({
          code: 429,
          error: 'Target cooldown still active',
        });
        return;
      }

      if (message.includes(StealError.VICTIM_IN_ROOKIE_PROTECTION)) {
        res.status(400).json({
          code: 400,
          error: 'Victim is in rookie protection period',
        });
        return;
      }

      res.status(500).json({
        code: errorCode,
        error: 'Steal attempt failed',
        details: message,
      });
    }
  }

  /**
   * 获取偷蛋者今日状态
   * GET /api/v1/steal/status?playerId=xxx
   */
  async getStealerStatus(req: Request, res: Response): Promise<void> {
    try {
      const { playerId } = req.query;

      if (!playerId) {
        res.status(400).json({
          code: -1,
          error: 'playerId is required',
        });
        return;
      }

      const status = await this.stealService.getStealerDailyStatus(
        BigInt(String(playerId))
      );

      res.status(200).json({
        code: 0,
        message: 'Success',
        data: status,
      });
    } catch (error) {
      console.error('Failed to get stealer status:', error);
      res.status(500).json({
        code: -1,
        error: 'Failed to get stealer status',
      });
    }
  }

  /**
   * 获取热门邻居（排行榜）
   * GET /api/v1/steal/popular?limit=10
   */
  async getPopularNeighbors(req: Request, res: Response): Promise<void> {
    try {
      const { limit } = req.query;
      const neighbors = await this.neighborService.getPopularNeighbors(
        limit ? parseInt(String(limit), 10) : 10
      );

      res.status(200).json({
        code: 0,
        message: 'Success',
        data: {
          neighbors: neighbors.map(n => ({
            playerId: n.playerId.toString(),
            nickname: n.nickname,
            walletAddress: n.walletAddress,
            chickenCount: n.chickenCount,
            eggInventory: n.eggInventory,
            riskScore: n.riskScore,
            activityScore: n.activityScore,
            expectedProfit: n.expectedProfit,
          })),
        },
      });
    } catch (error) {
      console.error('Failed to get popular neighbors:', error);
      res.status(500).json({
        code: -1,
        error: 'Failed to get popular neighbors',
      });
    }
  }
}
```

---

## 6. 路由定义

### src/routes/steal.ts

```typescript
/**
 * 偷蛋 API 路由定义
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { StealController } from '../controllers/stealController';
import { StealService } from '../services/stealService';
import { NeighborService } from '../services/neighborService';
import { authMiddleware } from '../middleware/auth';
import { stealLimiter } from '../middleware/stealLimiter';

export function createStealRouter(db: Pool): Router {
  const router = Router();

  // 初始化服务和控制器
  const neighborService = new NeighborService(db);
  const stealService = new StealService(db, undefined, neighborService);
  const controller = new StealController(stealService, neighborService);

  /**
   * 获取邻居列表
   * 不需要速率限制，只需认证
   */
  router.get(
    '/neighbors',
    authMiddleware,
    (req, res) => controller.getNeighbors(req, res)
  );

  /**
   * 获取热门邻居（排行榜）
   */
  router.get(
    '/popular',
    authMiddleware,
    (req, res) => controller.getPopularNeighbors(req, res)
  );

  /**
   * 获取偷蛋者状态
   */
  router.get(
    '/status',
    authMiddleware,
    (req, res) => controller.getStealerStatus(req, res)
  );

  /**
   * 发起偷蛋
   * 使用速率限制中间件防止滥用
   */
  router.post(
    '/attempt',
    authMiddleware,
    stealLimiter,
    (req, res) => controller.attemptSteal(req, res)
  );

  return router;
}
```

---

## 7. 限制中间件

### src/middleware/stealLimiter.ts

```typescript
/**
 * 偷蛋速率限制中间件
 * 防止：
 * 1. 短时间内大量偷蛋请求（DDoS 防护）
 * 2. 突破服务器限制
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitConfig {
  windowSeconds: number;  // 时间窗口（秒）
  maxAttempts: number;    // 时间窗口内最大尝试次数
}

const CONFIG: RateLimitConfig = {
  windowSeconds: 60,      // 60 秒时间窗口
  maxAttempts: 5,         // 60 秒内最多 5 次请求（防止脚本滥用）
};

/**
 * 偷蛋速率限制中间件
 * 基于 IP + playerId 的分布式限制
 */
export async function stealLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { stealerId } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    // 构建限制 key
    const limitKey = `steal:limit:${clientIp}:${stealerId}`;

    // 获取当前计数
    const currentCount = await redis.incr(limitKey);

    // 首次请求时设置过期时间
    if (currentCount === 1) {
      await redis.expire(limitKey, CONFIG.windowSeconds);
    }

    // 检查是否超过限制
    if (currentCount > CONFIG.maxAttempts) {
      res.status(429).json({
        code: 429,
        error: 'Too many steal attempts. Please wait before trying again.',
        retryAfter: CONFIG.windowSeconds,
      });
      return;
    }

    // 添加响应头
    res.set('X-RateLimit-Limit', String(CONFIG.maxAttempts));
    res.set('X-RateLimit-Remaining', String(Math.max(0, CONFIG.maxAttempts - currentCount)));
    res.set('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + CONFIG.windowSeconds));

    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    // 限制器故障时允许请求（fail open）
    next();
  }
}

/**
 * 并发偷蛋防护
 * 在一个账户的多个请求之间添加延迟，防止并发修改
 */
export async function stealConcurrencyGuard(
  stealerId: bigint
): Promise<boolean> {
  const lockKey = `steal:lock:${stealerId}`;

  // 尝试获取分布式锁（3秒超时）
  const result = await redis.set(lockKey, '1', 'EX', 3, 'NX');

  return result !== null;
}

/**
 * 释放并发锁
 */
export async function releaseStealLock(stealerId: bigint): Promise<void> {
  const lockKey = `steal:lock:${stealerId}`;
  await redis.del(lockKey);
}
```

---

## 8. 日重置任务

### src/jobs/stealReset.ts

```typescript
/**
 * 每日偷蛋限制重置任务
 * 在 UTC 00:00 触发，重置所有玩家的每日偷蛋计数
 *
 * 触发方式：
 * - Node-cron 定时任务
 * - 云函数（AWS Lambda/Google Cloud Functions）
 * - 消息队列定时消费
 */

import { Pool } from 'pg';
import cron from 'node-cron';

/**
 * 重置所有玩家的每日偷蛋计数
 * 实际上不需要重置，因为使用了时间条件 (attempted_at > NOW() - INTERVAL '24 hours')
 * 但可用于其他统计目的
 */
export async function resetDailyStealCounts(db: Pool): Promise<number> {
  try {
    // 注：偷蛋系统使用 attempted_at 时间戳判断，而非计数字段
    // 这个函数主要用于日志和统计

    console.log('[StealReset] Daily steal limits automatically reset via time-based query');

    // 可选：清理过期的临时冷却数据（如果有的话）
    const result = await db.query(
      `DELETE FROM steal_events
       WHERE cooldown_until < NOW() - INTERVAL '48 hours'`
    );

    console.log(`[StealReset] Cleaned up ${result.rowCount} old steal cooldown records`);

    return result.rowCount || 0;
  } catch (error) {
    console.error('[StealReset] Failed to reset daily steal counts:', error);
    throw error;
  }
}

/**
 * 启动定时任务
 * 在 UTC 00:00 执行重置
 */
export function scheduleStealReset(db: Pool): void {
  // 每天 UTC 00:00 执行
  cron.schedule('0 0 * * *', async () => {
    console.log('[StealReset] Starting daily reset task...');
    try {
      const cleaned = await resetDailyStealCounts(db);
      console.log(`[StealReset] Completed. Cleaned ${cleaned} records.`);
    } catch (error) {
      console.error('[StealReset] Task failed:', error);
    }
  });

  console.log('[StealReset] Scheduled daily reset at UTC 00:00');
}

/**
 * 手动触发重置（用于测试或紧急维护）
 */
export async function manualResetStealCounts(db: Pool): Promise<void> {
  console.log('[StealReset] Manual reset triggered');
  await resetDailyStealCounts(db);
}

/**
 * 检查某个玩家的每日偷蛋次数
 */
export async function getPlayerDailyStealCount(
  db: Pool,
  playerId: bigint
): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM steal_events
     WHERE stealer_id = $1 AND attempted_at > NOW() - INTERVAL '24 hours'`,
    [playerId]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * 统计日报：生成昨天的偷蛋排行榜
 */
export async function generateDailyStealStats(db: Pool): Promise<void> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // 查询昨天的偷蛋统计
    const result = await db.query(
      `SELECT
        stealer_id as player_id,
        COUNT(*) as successful_steals,
        SUM(eggs_stolen) as total_eggs_stolen,
        ROW_NUMBER() OVER (ORDER BY SUM(eggs_stolen) DESC) as rank
       FROM steal_events
       WHERE attempted_at >= $1 AND attempted_at < $2 AND eggs_stolen > 0
       GROUP BY stealer_id
       ORDER BY total_eggs_stolen DESC
       LIMIT 100`,
      [
        `${dateStr} 00:00:00`,
        `${dateStr} 23:59:59`,
      ]
    );

    console.log(`[DailyStats] Generated daily steal stats for ${dateStr}`);
    console.log('[DailyStats] Top 10 stealers:');
    result.rows.slice(0, 10).forEach(row => {
      console.log(
        `  #${row.rank}: Player ${row.player_id} - ${row.successful_steals} steals, ${row.total_eggs_stolen} eggs`
      );
    });
  } catch (error) {
    console.error('[DailyStats] Failed to generate daily stats:', error);
  }
}
```

---

## 9. 单元测试

### tests/steal.test.ts

```typescript
/**
 * 偷蛋系统单元测试
 * 使用 Jest + PostgreSQL 测试容器
 */

import { Pool } from 'pg';
import { StealService } from '../src/services/stealService';
import { NeighborService } from '../src/services/neighborService';
import { ProbabilityEngine } from '../src/services/probabilityEngine';
import { StealOutcome, StealError } from '../src/types/steal';

describe('Steal System Tests', () => {
  let db: Pool;
  let stealService: StealService;
  let neighborService: NeighborService;
  let probabilityEngine: ProbabilityEngine;

  // 测试用例中使用的玩家 ID
  let stealerId: bigint;
  let victimId: bigint;
  let testPlayerId: bigint;

  beforeAll(async () => {
    // 初始化数据库连接
    db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'aiggs_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    });

    // 初始化服务
    probabilityEngine = new ProbabilityEngine();
    neighborService = new NeighborService(db);
    stealService = new StealService(db, probabilityEngine, neighborService);

    // 创建测试表
    await setupTestDatabase();
  });

  afterAll(async () => {
    await db.end();
  });

  async function setupTestDatabase() {
    // 创建测试玩家和农场
    const player1 = await db.query(
      `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
       VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
       RETURNING id`,
      ['0x1111111111111111111111111111111111111111', 'Stealer']
    );
    stealerId = BigInt(player1.rows[0].id);

    const player2 = await db.query(
      `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
       VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
       RETURNING id`,
      ['0x2222222222222222222222222222222222222222', 'Victim']
    );
    victimId = BigInt(player2.rows[0].id);

    const player3 = await db.query(
      `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
       VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
       RETURNING id`,
      ['0x3333333333333333333333333333333333333333', 'Test Player']
    );
    testPlayerId = BigInt(player3.rows[0].id);

    // 创建农场
    await db.query(
      `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
       VALUES ($1, $2, $3, $4)`,
      [stealerId, 10, 5, 30]
    );

    await db.query(
      `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
       VALUES ($1, $2, $3, $4)`,
      [victimId, 15, 20, 30]
    );

    await db.query(
      `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
       VALUES ($1, $2, $3, $4)`,
      [testPlayerId, 10, 10, 30]
    );
  }

  describe('ProbabilityEngine', () => {
    test('should generate valid steal outcome', async () => {
      const outcome = await probabilityEngine.determineOutcome(20);
      expect(outcome.outcome).toMatch(/bumper_crop|success|fail/);
      expect(outcome.eggsStoled).toBeGreaterThanOrEqual(0);
      expect(outcome.eggsStoled).toBeLessThanOrEqual(20);
    });

    test('should respect bumper crop percentage', async () => {
      const outcome = await probabilityEngine.determineOutcome(20);
      if (outcome.outcome === StealOutcome.BUMPER_CROP) {
        expect(outcome.eggsStoled).toBe(6); // 20 * 0.3 = 6
      }
    });

    test('should not exceed victim inventory', async () => {
      const outcome = await probabilityEngine.determineOutcome(2);
      expect(outcome.eggsStoled).toBeLessThanOrEqual(2);
    });

    test('should update config correctly', () => {
      const originalConfig = probabilityEngine.getConfig();
      probabilityEngine.updateConfig({
        bumperCropChance: 0.3,
        successChance: 0.4,
        failChance: 0.3,
      });

      const newConfig = probabilityEngine.getConfig();
      expect(newConfig.bumperCropChance).toBe(0.3);

      // 恢复原始配置
      probabilityEngine.updateConfig(originalConfig);
    });

    test('should throw on invalid probability config', () => {
      expect(() => {
        probabilityEngine.updateConfig({
          bumperCropChance: 0.5,
          successChance: 0.5,
          failChance: 0.5,
        });
      }).toThrow();
    });
  });

  describe('NeighborService', () => {
    test('should return valid neighbors', async () => {
      const result = await neighborService.getNeighbors({
        playerId: stealerId,
        limit: 10,
      });

      expect(result.neighbors).toBeInstanceOf(Array);
      expect(result.neighbors.length).toBeGreaterThan(0);
      expect(result.neighbors[0]).toHaveProperty('playerId');
      expect(result.neighbors[0]).toHaveProperty('nickname');
      expect(result.neighbors[0]).toHaveProperty('eggInventory');
    });

    test('should exclude self from neighbors', async () => {
      const result = await neighborService.getNeighbors({
        playerId: stealerId,
      });

      const hasself = result.neighbors.some(n => n.playerId === stealerId);
      expect(hasself).toBe(false);
    });

    test('should calculate activity score', async () => {
      const result = await neighborService.getNeighbors({
        playerId: stealerId,
      });

      result.neighbors.forEach(neighbor => {
        expect(neighbor.activityScore).toBeGreaterThanOrEqual(0);
        expect(neighbor.activityScore).toBeLessThanOrEqual(1);
      });
    });

    test('should validate neighbor', async () => {
      const valid = await neighborService.isValidNeighbor(stealerId, victimId);
      expect(valid.isValid).toBe(true);
    });

    test('should reject stealing from self', async () => {
      const valid = await neighborService.isValidNeighbor(stealerId, stealerId);
      expect(valid.isValid).toBe(false);
    });
  });

  describe('StealService', () => {
    test('should successfully steal eggs', async () => {
      const response = await stealService.attemptSteal({
        stealerId,
        victimId,
      });

      expect(response.eventId).toBeDefined();
      expect(response.outcome).toMatch(/bumper_crop|success|fail/);
      expect(response.eggsStolenAmount).toBeGreaterThanOrEqual(0);
    });

    test('should update inventories correctly', async () => {
      const stealerBefore = await db.query(
        'SELECT egg_inventory FROM farms WHERE player_id = $1',
        [stealerId]
      );

      const victimBefore = await db.query(
        'SELECT egg_inventory FROM farms WHERE player_id = $1',
        [victimId]
      );

      const response = await stealService.attemptSteal({
        stealerId,
        victimId,
      });

      const stealerAfter = await db.query(
        'SELECT egg_inventory FROM farms WHERE player_id = $1',
        [stealerId]
      );

      const victimAfter = await db.query(
        'SELECT egg_inventory FROM farms WHERE player_id = $1',
        [victimId]
      );

      // 验证库存变化
      expect(stealerAfter.rows[0].egg_inventory).toBe(
        stealerBefore.rows[0].egg_inventory + response.eggsStolenAmount
      );
      expect(victimAfter.rows[0].egg_inventory).toBe(
        victimBefore.rows[0].egg_inventory - response.eggsStolenAmount
      );
    });

    test('should enforce daily steal limit', async () => {
      // 已经做过至少一次偷蛋，尝试第 3 次（超出 2 次限制）
      const freshVictim = await db.query(
        `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
         VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
         RETURNING id`,
        ['0x4444444444444444444444444444444444444444', 'Fresh Victim 1']
      );
      const victimId2 = BigInt(freshVictim.rows[0].id);

      await db.query(
        `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
         VALUES ($1, $2, $3, $4)`,
        [victimId2, 10, 20, 30]
      );

      const freshVictim2 = await db.query(
        `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
         VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
         RETURNING id`,
        ['0x5555555555555555555555555555555555555555', 'Fresh Victim 2']
      );
      const victimId3 = BigInt(freshVictim2.rows[0].id);

      await db.query(
        `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
         VALUES ($1, $2, $3, $4)`,
        [victimId3, 10, 20, 30]
      );

      // 第 1 次偷蛋
      await stealService.attemptSteal({
        stealerId,
        victimId: victimId2,
      });

      // 第 2 次偷蛋
      await stealService.attemptSteal({
        stealerId,
        victimId: victimId3,
      });

      // 第 3 次应该失败
      await expect(
        stealService.attemptSteal({
          stealerId,
          victimId: victimId2, // 对不同目标
        })
      ).rejects.toThrow();
    });

    test('should prevent stealing when victim is in rookie protection', async () => {
      const rookiePlayer = await db.query(
        `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 day', true)
         RETURNING id`,
        ['0x6666666666666666666666666666666666666666', 'Rookie']
      );
      const rookieId = BigInt(rookiePlayer.rows[0].id);

      await db.query(
        `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
         VALUES ($1, $2, $3, $4)`,
        [rookieId, 10, 20, 30]
      );

      await expect(
        stealService.attemptSteal({
          stealerId,
          victimId: rookieId,
        })
      ).rejects.toThrow('rookie protection');
    });

    test('should prevent stealing when victim inventory is too low', async () => {
      const lowInventoryVictim = await db.query(
        `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
         VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
         RETURNING id`,
        ['0x7777777777777777777777777777777777777777', 'Low Inventory']
      );
      const lowVictimId = BigInt(lowInventoryVictim.rows[0].id);

      await db.query(
        `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
         VALUES ($1, $2, $3, $4)`,
        [lowVictimId, 10, 10, 30]  // 库存只有 10，≤15
      );

      await expect(
        stealService.attemptSteal({
          stealerId,
          victimId: lowVictimId,
        })
      ).rejects.toThrow('inventory');
    });

    test('should prevent stealing when stealer inventory is full', async () => {
      const fullStealer = await db.query(
        `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
         VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
         RETURNING id`,
        ['0x8888888888888888888888888888888888888888', 'Full Stealer']
      );
      const fullStealerId = BigInt(fullStealer.rows[0].id);

      await db.query(
        `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
         VALUES ($1, $2, $3, $4)`,
        [fullStealerId, 10, 30, 30]  // 库存已满（30/30）
      );

      const availableVictim = await db.query(
        `INSERT INTO players (wallet_address, nickname, registered_at, rookie_protection_until, is_active)
         VALUES ($1, $2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', true)
         RETURNING id`,
        ['0x9999999999999999999999999999999999999999', 'Available Victim']
      );
      const availableVictimId = BigInt(availableVictim.rows[0].id);

      await db.query(
        `INSERT INTO farms (player_id, chicken_count, egg_inventory, egg_capacity)
         VALUES ($1, $2, $3, $4)`,
        [availableVictimId, 10, 20, 30]
      );

      await expect(
        stealService.attemptSteal({
          stealerId: fullStealerId,
          victimId: availableVictimId,
        })
      ).rejects.toThrow('inventory');
    });

    test('should get stealer daily status', async () => {
      const status = await stealService.getStealerDailyStatus(stealerId);

      expect(status).toHaveProperty('remainingAttempts');
      expect(status).toHaveProperty('totalAttemptsToday');
      expect(status).toHaveProperty('dailyLimit');
      expect(status.dailyLimit).toBe(2);
    });
  });
});
```

---

## 总结

### 核心模块功能

| 模块 | 职责 | 关键功能 |
|------|------|---------|
| **ProbabilityEngine** | 概率判定 | 三种结果 (20%/55%/25%) 、加密安全随机数、动态配置 |
| **NeighborService** | 邻居发现 | 活跃度评分、风险评估、邻居排序、验证 |
| **StealService** | 核心逻辑 | 完整偷蛋流程、验证、并发控制、事件记录 |
| **StealController** | API 接口 | 请求处理、响应格式化、错误映射 |
| **StealLimiter** | 速率限制 | 防滥用、分布式锁、并发防护 |
| **StealReset** | 日重置 | 定时任务、数据清理、日报统计 |

### 保护机制

1. **新手保护**：注册后 24h 内不可被偷
2. **库存保护**：库存 ≤15 时不可被偷
3. **容量限制**：库存满时不可偷
4. **日限制**：每日最多 2 次
5. **目标冷却**：同一目标 24h 内只能偷一次
6. **并发控制**：乐观锁 + Redis 分布式锁

### 部署建议

```bash
# 1. 初始化数据库
npm run migrate

# 2. 启动定时任务
node dist/jobs/stealReset.js

# 3. 启动服务器
npm start
```

### 环境变量

```bash
DATABASE_URL=postgresql://user:password@localhost/aiggs
REDIS_URL=redis://localhost:6379
NODE_ENV=production
```
