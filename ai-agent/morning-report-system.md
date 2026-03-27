# AIggs 每日早报系统完整实现

## 项目概述

每日早报系统是 AIggs 游戏的核心玩家运营工具，通过定时聚合玩家数据、生成个性化内容、实现多渠道推送，提高用户粘性和游戏活跃度。

### 核心特性

- **数据聚合服务**：从 Prisma ORM 聚合昨日产蛋、被偷、排名等关键数据
- **个性化内容引擎**：基于聚合数据生成趣味幽默的早报文本（含 ASCII 艺术）
- **智能推送机制**：支持 MCP 工具、Webhook、邮件等多渠道推送
- **定时任务管理**：使用 node-cron 实现精确的定时触发控制
- **推送队列系统**：使用 Bull/BullMQ 管理异步队列，避免瞬时高并发
- **完整的追踪和重试**：推送状态管理、失败自动重试、用户偏好设置

---

## 文件结构

```
src/
├── services/
│   ├── morningReportAggregator.ts    # 早报数据聚合服务
│   ├── contentGenerator.ts           # 个性化内容生成引擎
│   └── pushService.ts                # 推送服务
├── jobs/
│   └── morningReportJob.ts           # 定时任务调度器
├── types/
│   └── morningReport.ts              # 类型定义
├── utils/
│   ├── reportLogger.ts               # 报告日志
│   └── pushQueue.ts                  # 推送队列初始化
└── config/
    └── pushConfig.ts                 # 推送配置
```

---

## 1. 类型定义 (types/morningReport.ts)

```typescript
/**
 * AIggs 早报系统 - 类型定义
 * 包含所有数据结构和接口定义
 */

// ============ 早报数据聚合相关 ============

/**
 * 玩家昨日产蛋数据
 */
export interface YesterdayEggProduction {
  playerEggs: number;           // 玩家昨日产蛋量
  serverAveragEggs: number;     // 全服昨日平均产蛋量
  difference: number;            // 与平均值的差异（正数表示高于平均）
  percentile: number;            // 百分位排名（0-100）
  trend: 'up' | 'down' | 'flat'; // 与前日对比趋势
}

/**
 * 被偷蛋事件记录
 */
export interface StealEvent {
  stealerId: bigint;
  steelerNickname: string;
  eggsStolenCount: number;
  eventOutcome: 'success' | 'fail' | 'bumper_crop';
  stolenAt: Date;
  description: string;
}

/**
 * 被偷蛋统计（昨日）
 */
export interface YesterdayStealStats {
  totalStolenCount: number;           // 被偷次数
  totalEggsStolenCount: number;       // 被偷蛋总数
  stealEvents: StealEvent[];          // 具体偷蛋事件列表
  topStealer?: {                      // 最频繁的小偷
    playerId: bigint;
    nickname: string;
    stealCount: number;
  };
}

/**
 * 库存状态
 */
export interface InventoryStatus {
  currentEggs: number;      // 当前仓库EGGS数
  capacity: number;         // 总容量（固定30）
  utilizationRate: number;  // 使用率百分比 (0-100)
  willFullAt?: Date;        // 预计满仓时间
}

/**
 * 汇率和市场趋势
 */
export interface ExchangeRateTrend {
  currentRate: number;      // 当前汇率 (EGGS:$AIGG)
  previousRate?: number;    // 前一周期汇率
  trendChange: number;      // 变化百分比 (-100 ~ 100)
  trend: 'up' | 'down' | 'flat';
  changeAmount: number;     // 绝对变化
}

/**
 * 排行榜排名信息
 */
export interface RankingChange {
  currentRank: number;
  previousRank: number;
  change: number;           // 排名变化（负数表示上升）
  isNew?: boolean;          // 是否是新晋排行
}

/**
 * 全服排行数据
 */
export interface ServerRankings {
  eggProduction: RankingChange;   // 产蛋排行排名
  wealth: RankingChange;          // 财富排行排名
  stealSuccess: RankingChange;    // 偷蛋成功率排行
}

/**
 * 邻居动态
 */
export interface NeighborActivity {
  neighborId: bigint;
  nickname: string;
  activityType: 'new' | 'active' | 'idle' | 'stole_me';
  lastLoginAt: Date;
  eggProductionYesterday?: number;
  description: string;
}

/**
 * 解锁进度
 */
export interface UnlockProgress {
  totalChickens: number;
  totalEarned: number;
  nextMilestone: string;
  progressToNext: number;      // 0-100 百分比
  eggNeeded: number;           // 距离下一个里程碑还需EGGS
}

/**
 * 玩家个性化早报数据
 */
export interface PlayerMorningReportData {
  playerId: bigint;
  playerNickname: string;
  reportDate: Date;           // 早报生成日期

  // 各模块数据
  eggProduction: YesterdayEggProduction;
  stealStats: YesterdayStealStats;
  inventory: InventoryStatus;
  exchangeRate: ExchangeRateTrend;
  rankings: ServerRankings;
  neighbors: NeighborActivity[];
  unlockProgress: UnlockProgress;
}

// ============ 全服汇总数据 ============

/**
 * 全服统计数据
 */
export interface ServerStats {
  totalEggProduction: number;     // 全服昨日总产蛋量
  totalStealAttempts: number;     // 全服昨日总偷蛋尝试次数
  totalStealSuccess: number;      // 成功偷蛋次数
  totalExchangedAigg: number;     // 昨日兑换总$AIGG数
  activePlayerCount: number;      // 活跃玩家数
  newPlayerCount: number;         // 新注册玩家数

  // 顶级事件
  maxSingleSteal?: {
    stealerId: bigint;
    steelerNickname: string;
    victimId: bigint;
    victimNickname: string;
    eggCount: number;
  };
  richestPlayer?: {
    playerId: bigint;
    nickname: string;
    totalEggs: number;
  };
}

// ============ 内容生成相关 ============

/**
 * 生成的早报内容
 */
export interface GeneratedMorningReport {
  title: string;              // 早报标题
  greeting: string;           // 开场问候
  farmSummary: string;        // 农场状况摘要
  competitionAnalysis: string; // 竞争关系分析
  actionSuggestions: string;  // 行动建议（带emoji）
  dataVisualization: string;  // ASCII艺术数据可视化
  dailyEasterEgg: string;     // 每日彩蛋（鸡知识/鸡汤）
  closingRemark: string;      // 结尾语

  // 用于推送的纯文本版本
  plainText: string;
  // 用于推送的 Markdown 版本
  markdown: string;
}

// ============ 推送相关 ============

/**
 * 推送渠道类型
 */
export type PushChannel = 'mcp' | 'webhook' | 'email';

/**
 * 用户推送偏好
 */
export interface UserPushPreference {
  playerId: bigint;
  enableMcp: boolean;
  enableWebhook: boolean;
  enableEmail: boolean;
  webhookUrl?: string;
  email?: string;
  silentHours?: {
    start: number;  // 24小时制 0-23
    end: number;
  };
  frequency: 'daily' | 'every_3_days' | 'weekly' | 'manual';
}

/**
 * 推送任务
 */
export interface PushTask {
  id: string;               // 队列任务ID
  playerId: bigint;
  reportDate: Date;
  channels: PushChannel[];
  status: 'pending' | 'processing' | 'sent' | 'failed';
  retryCount: number;
  lastRetryAt?: Date;
  failureReason?: string;
  createdAt: Date;
  sentAt?: Date;
}

/**
 * 推送结果
 */
export interface PushResult {
  channel: PushChannel;
  success: boolean;
  message?: string;
  responseTime?: number;
  timestamp: Date;
}

/**
 * 完整推送记录
 */
export interface PushRecord {
  taskId: string;
  playerId: bigint;
  reportDate: Date;
  results: PushResult[];
  overallSuccess: boolean;
  createdAt: Date;
}

/**
 * MCP 回调配置
 */
export interface McpCallbackConfig {
  enabled: boolean;
  endpoint?: string;
  toolName?: string;
  timeout?: number;  // 毫秒
}

/**
 * Webhook 配置
 */
export interface WebhookConfig {
  enabled: boolean;
  url?: string;
  timeout?: number;  // 毫秒
  retryTimes?: number;
  retryDelay?: number;  // 毫秒
}

/**
 * 邮件配置
 */
export interface EmailConfig {
  enabled: boolean;
  from?: string;
  subject?: string;
  htmlTemplate?: string;
}

/**
 * 推送配置集合
 */
export interface PushServiceConfig {
  mcp: McpCallbackConfig;
  webhook: WebhookConfig;
  email: EmailConfig;
  cronExpression: string;     // 定时表达式，默认每天早上8点
  timeZone: string;           // 时区（如 'Asia/Shanghai'）
  queueConcurrency: number;   // 队列并发数
  maxRetries: number;
}

// ============ 工作流数据 ============

/**
 * 早报生成工作流的中间结果
 */
export interface MorningReportWorkflow {
  playerId: bigint;
  aggregatedData: PlayerMorningReportData;
  generatedContent: GeneratedMorningReport;
  preference: UserPushPreference;
  pushResults: PushResult[];
}

/**
 * 批处理统计
 */
export interface BatchProcessStats {
  totalPlayers: number;
  successfulReports: number;
  failedReports: number;
  totalTimeMs: number;
  startedAt: Date;
  completedAt: Date;
  averageTimePerPlayerMs: number;
}
```

---

## 2. 数据聚合服务 (services/morningReportAggregator.ts)

```typescript
/**
 * AIggs 早报系统 - 数据聚合服务
 * 职责：从数据库聚合玩家和全服数据
 *
 * 核心流程：
 * 1. 根据时间范围查询数据（昨天 00:00 - 23:59）
 * 2. 计算各项指标（排名、百分位、趋势等）
 * 3. 聚合为结构化数据返回
 */

import { PrismaClient } from '@prisma/client';
import {
  PlayerMorningReportData,
  ServerStats,
  YesterdayEggProduction,
  YesterdayStealStats,
  InventoryStatus,
  ExchangeRateTrend,
  ServerRankings,
  NeighborActivity,
  UnlockProgress,
  StealEvent,
  RankingChange,
} from '@/types/morningReport';
import { logger } from '@/utils/reportLogger';

const prisma = new PrismaClient();

export class MorningReportAggregator {
  /**
   * 获取指定玩家的完整早报数据
   */
  async getPlayerMorningReport(
    playerId: bigint,
    reportDate: Date = new Date()
  ): Promise<PlayerMorningReportData> {
    try {
      logger.info(`[聚合服务] 开始为玩家 ${playerId} 聚合早报数据`);

      const player = await prisma.players.findUnique({
        where: { id: playerId },
        include: { farm: true },
      });

      if (!player) {
        throw new Error(`玩家 ${playerId} 不存在`);
      }

      // 计算昨日日期范围（UTC时间）
      const yesterday = new Date(reportDate);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStart = new Date(yesterday.setUTCHours(0, 0, 0, 0));
      const yesterdayEnd = new Date(yesterday.setUTCHours(23, 59, 59, 999));

      // 并行执行多个聚合查询
      const [
        eggProduction,
        stealStats,
        inventory,
        exchangeRate,
        rankings,
        neighbors,
        unlockProgress,
      ] = await Promise.all([
        this.aggregateEggProduction(playerId, yesterdayStart, yesterdayEnd),
        this.aggregateStealStats(playerId, yesterdayStart, yesterdayEnd),
        this.aggregateInventoryStatus(playerId),
        this.aggregateExchangeRate(playerId, yesterdayStart, yesterdayEnd),
        this.aggregateRankings(playerId),
        this.aggregateNeighbors(playerId),
        this.aggregateUnlockProgress(playerId),
      ]);

      const reportData: PlayerMorningReportData = {
        playerId,
        playerNickname: player.nickname || `玩家${playerId}`,
        reportDate,
        eggProduction,
        stealStats,
        inventory,
        exchangeRate,
        rankings,
        neighbors,
        unlockProgress,
      };

      logger.info(`[聚合服务] 为玩家 ${playerId} 聚合完成，产蛋${eggProduction.playerEggs}枚`);
      return reportData;
    } catch (error) {
      logger.error(`[聚合服务] 聚合玩家 ${playerId} 数据失败:`, error);
      throw error;
    }
  }

  /**
   * 聚合昨日产蛋数据
   */
  private async aggregateEggProduction(
    playerId: bigint,
    startTime: Date,
    endTime: Date
  ): Promise<YesterdayEggProduction> {
    // 查询玩家昨日产蛋记录
    const playerProduction = await prisma.eggs_transactions.aggregate({
      where: {
        player_id: playerId,
        transaction_type: 'production',
        created_at: {
          gte: startTime,
          lte: endTime,
        },
      },
      _sum: { quantity: true },
    });

    const playerEggs = playerProduction._sum.quantity || 0n;

    // 查询全服平均产蛋（全服活跃玩家）
    const serverProduction = await prisma.eggs_transactions.aggregate({
      where: {
        transaction_type: 'production',
        created_at: {
          gte: startTime,
          lte: endTime,
        },
      },
      _sum: { quantity: true },
    });

    const totalServerEggs = serverProduction._sum.quantity || 0n;

    // 计算活跃玩家数
    const activePlayerCount = await prisma.eggs_transactions.findMany({
      where: {
        transaction_type: 'production',
        created_at: {
          gte: startTime,
          lte: endTime,
        },
      },
      select: { player_id: true },
      distinct: ['player_id'],
    });

    const averageEggs =
      activePlayerCount.length > 0
        ? Number(totalServerEggs) / activePlayerCount.length
        : 0;

    // 计算百分位排名（使用排行子查询）
    const higherCount = await prisma.eggs_transactions.findMany({
      where: {
        transaction_type: 'production',
        created_at: {
          gte: startTime,
          lte: endTime,
        },
        player_id: {
          not: playerId,
        },
      },
      select: {
        player_id: true,
      },
      distinct: ['player_id'],
    });

    // 统计有多少玩家产蛋量大于本玩家
    const playerRanking = await this.getPlayerEggRank(playerId, startTime, endTime);
    const percentile = Math.max(
      0,
      100 - (playerRanking.rank / Math.max(1, activePlayerCount.length)) * 100
    );

    // 计算趋势（与前一日对比）
    const twoDaysAgoStart = new Date(startTime);
    twoDaysAgoStart.setDate(twoDaysAgoStart.getDate() - 1);
    const twoDaysAgoEnd = new Date(endTime);
    twoDaysAgoEnd.setDate(twoDaysAgoEnd.getDate() - 1);

    const previousProduction = await prisma.eggs_transactions.aggregate({
      where: {
        player_id: playerId,
        transaction_type: 'production',
        created_at: {
          gte: twoDaysAgoStart,
          lte: twoDaysAgoEnd,
        },
      },
      _sum: { quantity: true },
    });

    const previousEggs = previousProduction._sum.quantity || 0n;
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (playerEggs > previousEggs) trend = 'up';
    else if (playerEggs < previousEggs) trend = 'down';

    return {
      playerEggs: Number(playerEggs),
      serverAveragEggs: Math.round(averageEggs),
      difference: Number(playerEggs) - Math.round(averageEggs),
      percentile: Math.round(percentile),
      trend,
    };
  }

  /**
   * 计算玩家在指定时间段的产蛋排名
   */
  private async getPlayerEggRank(
    playerId: bigint,
    startTime: Date,
    endTime: Date
  ): Promise<{ rank: number; totalPlayers: number }> {
    const rankings = await prisma.$queryRaw<
      Array<{ player_id: bigint; total_eggs: bigint }>
    >`
      SELECT
        player_id,
        COALESCE(SUM(quantity), 0) as total_eggs
      FROM eggs_transactions
      WHERE transaction_type = 'production'
        AND created_at >= ${startTime}
        AND created_at <= ${endTime}
      GROUP BY player_id
      ORDER BY total_eggs DESC
    `;

    const playerRank = rankings.findIndex((r) => r.player_id === playerId);
    return {
      rank: playerRank >= 0 ? playerRank + 1 : 0,
      totalPlayers: rankings.length,
    };
  }

  /**
   * 聚合昨日被偷蛋统计
   */
  private async aggregateStealStats(
    playerId: bigint,
    startTime: Date,
    endTime: Date
  ): Promise<YesterdayStealStats> {
    // 查询该玩家昨日被偷的所有事件
    const stealEvents = await prisma.steal_events.findMany({
      where: {
        victim_id: playerId,
        attempted_at: {
          gte: startTime,
          lte: endTime,
        },
      },
      include: {
        stealer: {
          select: {
            id: true,
            nickname: true,
            wallet_address: true,
          },
        },
      },
      orderBy: { attempted_at: 'desc' },
    });

    // 转换为易用格式
    const stealEventList: StealEvent[] = stealEvents.map((event) => ({
      stealerId: event.stealer_id,
      steelerNickname: event.stealer?.nickname || `玩家${event.stealer_id}`,
      eggsStolenCount: Number(event.eggs_stolen || 0n),
      eventOutcome:
        event.outcome === 'bumper_crop'
          ? 'bumper_crop'
          : event.outcome === 'success'
            ? 'success'
            : 'fail',
      stolenAt: event.attempted_at,
      description:
        event.outcome === 'bumper_crop'
          ? `大丰收！被 ${event.stealer?.nickname} 偷走了 ${event.eggs_stolen} 枚蛋`
          : event.outcome === 'success'
            ? `被 ${event.stealer?.nickname} 偷走了 ${event.eggs_stolen} 枚蛋`
            : `${event.stealer?.nickname} 的偷蛋尝试失败了`,
    }));

    // 统计被偷次数
    const totalStolenCount = stealEventList.length;

    // 统计被偷蛋总数
    const totalEggsStolenCount = stealEventList.reduce(
      (sum, event) => sum + event.eggsStolenCount,
      0
    );

    // 找出最频繁的小偷
    const stealer_counts = new Map<string, { id: bigint; nickname: string; count: number }>();
    stealEventList.forEach((event) => {
      const key = event.stealerId.toString();
      if (stealer_counts.has(key)) {
        const data = stealer_counts.get(key)!;
        data.count++;
      } else {
        stealer_counts.set(key, {
          id: event.stealerId,
          nickname: event.steelerNickname,
          count: 1,
        });
      }
    });

    let topStealer: { playerId: bigint; nickname: string; stealCount: number } | undefined;
    if (stealer_counts.size > 0) {
      const topEntry = Array.from(stealer_counts.values()).sort((a, b) => b.count - a.count)[0];
      topStealer = {
        playerId: topEntry.id,
        nickname: topEntry.nickname,
        stealCount: topEntry.count,
      };
    }

    return {
      totalStolenCount,
      totalEggsStolenCount,
      stealEvents: stealEventList,
      topStealer,
    };
  }

  /**
   * 聚合库存状态
   */
  private async aggregateInventoryStatus(playerId: bigint): Promise<InventoryStatus> {
    const farm = await prisma.farms.findUnique({
      where: { player_id: playerId },
    });

    if (!farm) {
      throw new Error(`玩家 ${playerId} 的农场不存在`);
    }

    const currentEggs = Number(farm.egg_inventory);
    const capacity = Number(farm.egg_capacity);
    const utilizationRate = Math.round((currentEggs / capacity) * 100);

    // 预测满仓时间（基于最近的产蛋速率）
    let willFullAt: Date | undefined;
    if (currentEggs < capacity) {
      const recentProduction = await prisma.eggs_transactions.findFirst({
        where: {
          player_id: playerId,
          transaction_type: 'production',
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      });

      if (recentProduction && farm.next_egg_production_at) {
        willFullAt = farm.next_egg_production_at;
      }
    }

    return {
      currentEggs,
      capacity,
      utilizationRate,
      willFullAt,
    };
  }

  /**
   * 聚合汇率和市场趋势
   */
  private async aggregateExchangeRate(
    playerId: bigint,
    startTime: Date,
    endTime: Date
  ): Promise<ExchangeRateTrend> {
    // 查询昨日的兑换率
    const yesterdayExchanges = await prisma.eggs_transactions.findMany({
      where: {
        player_id: playerId,
        transaction_type: 'exchange',
        created_at: {
          gte: startTime,
          lte: endTime,
        },
      },
      orderBy: { created_at: 'desc' },
      take: 1,
    });

    const currentRate = yesterdayExchanges.length > 0
      ? Number(yesterdayExchanges[0].exchange_rate || 30)
      : 30;

    // 查询前一周期的汇率
    const weekAgoStart = new Date(startTime);
    weekAgoStart.setDate(weekAgoStart.getDate() - 7);
    const weekAgoEnd = new Date(endTime);
    weekAgoEnd.setDate(weekAgoEnd.getDate() - 7);

    const weekAgoExchanges = await prisma.eggs_transactions.findMany({
      where: {
        player_id: playerId,
        transaction_type: 'exchange',
        created_at: {
          gte: weekAgoStart,
          lte: weekAgoEnd,
        },
      },
      orderBy: { created_at: 'desc' },
      take: 1,
    });

    const previousRate = weekAgoExchanges.length > 0
      ? Number(weekAgoExchanges[0].exchange_rate || 30)
      : currentRate;

    const changeAmount = currentRate - previousRate;
    const trendChange = previousRate === 0 ? 0 : (changeAmount / previousRate) * 100;

    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (changeAmount > 0.1) trend = 'up';
    else if (changeAmount < -0.1) trend = 'down';

    return {
      currentRate,
      previousRate,
      trendChange: Math.round(trendChange * 100) / 100,
      trend,
      changeAmount,
    };
  }

  /**
   * 聚合排名信息
   */
  private async aggregateRankings(playerId: bigint): Promise<ServerRankings> {
    // 产蛋排行（昨日）
    const eggProductionRank = await this.getPlayerEggRank(
      playerId,
      new Date(new Date().setUTCHours(-24)),
      new Date()
    );

    // 财富排行（当前库存）
    const wealthRank = await this.getPlayerWealthRank(playerId);

    // 偷蛋成功率排行
    const stealRank = await this.getPlayerStealRank(playerId);

    // 获取前一周的排名用于对比（这里简化处理，实际应存储历史排名）
    const previousEggProductionRank = eggProductionRank.rank - 1; // 简化示例
    const previousWealthRank = wealthRank.rank - 1;
    const previousStealRank = stealRank.rank - 1;

    return {
      eggProduction: {
        currentRank: eggProductionRank.rank,
        previousRank: previousEggProductionRank,
        change: previousEggProductionRank - eggProductionRank.rank,
        isNew: eggProductionRank.rank < 10,
      },
      wealth: {
        currentRank: wealthRank.rank,
        previousRank: previousWealthRank,
        change: previousWealthRank - wealthRank.rank,
        isNew: wealthRank.rank < 10,
      },
      stealSuccess: {
        currentRank: stealRank.rank,
        previousRank: previousStealRank,
        change: previousStealRank - stealRank.rank,
        isNew: stealRank.rank < 10,
      },
    };
  }

  /**
   * 获取玩家的财富排名
   */
  private async getPlayerWealthRank(
    playerId: bigint
  ): Promise<{ rank: number; totalPlayers: number }> {
    const wealthRankings = await prisma.$queryRaw<
      Array<{ player_id: bigint; total_wealth: bigint }>
    >`
      SELECT
        f.player_id,
        COALESCE(f.egg_inventory, 0) as total_wealth
      FROM farms f
      JOIN players p ON f.player_id = p.id
      WHERE p.is_active = true
      ORDER BY total_wealth DESC
    `;

    const playerRank = wealthRankings.findIndex((r) => r.player_id === playerId);
    return {
      rank: playerRank >= 0 ? playerRank + 1 : 0,
      totalPlayers: wealthRankings.length,
    };
  }

  /**
   * 获取玩家的偷蛋成功率排名
   */
  private async getPlayerStealRank(
    playerId: bigint
  ): Promise<{ rank: number; totalPlayers: number }> {
    const stealRankings = await prisma.$queryRaw<
      Array<{ player_id: bigint; success_rate: number }>
    >`
      SELECT
        p.id as player_id,
        CASE
          WHEN COUNT(se.id) = 0 THEN 0
          ELSE ROUND(
            SUM(CASE WHEN se.outcome = 'success' OR se.outcome = 'bumper_crop' THEN 1 ELSE 0 END)::NUMERIC / COUNT(se.id) * 100
          )
        END as success_rate
      FROM players p
      LEFT JOIN steal_events se ON p.id = se.stealer_id
      WHERE p.is_active = true
      GROUP BY p.id
      ORDER BY success_rate DESC
    `;

    const playerRank = stealRankings.findIndex((r) => r.player_id === playerId);
    return {
      rank: playerRank >= 0 ? playerRank + 1 : 0,
      totalPlayers: stealRankings.length,
    };
  }

  /**
   * 聚合邻居动态
   */
  private async aggregateNeighbors(playerId: bigint): Promise<NeighborActivity[]> {
    // 获取邻居列表（有互动过的玩家）
    const recentInteractions = await prisma.eggs_transactions.findMany({
      where: {
        OR: [
          { player_id: playerId },
          { other_player_id: playerId },
        ],
      },
      select: {
        player_id: true,
        other_player_id: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    // 提取邻居 ID
    const neighborIds = new Set<bigint>();
    recentInteractions.forEach((interaction) => {
      if (interaction.player_id !== playerId) {
        neighborIds.add(interaction.player_id);
      }
      if (interaction.other_player_id && interaction.other_player_id !== playerId) {
        neighborIds.add(interaction.other_player_id);
      }
    });

    if (neighborIds.size === 0) {
      return [];
    }

    // 获取邻居详情
    const neighbors = await prisma.players.findMany({
      where: {
        id: { in: Array.from(neighborIds) },
      },
      select: {
        id: true,
        nickname: true,
        last_login_at: true,
      },
    });

    // 构建活动信息
    const neighborActivities: NeighborActivity[] = await Promise.all(
      neighbors.map(async (neighbor) => {
        // 检查是否是新邻居（7天内首次互动）
        const firstInteraction = recentInteractions
          .filter(
            (i) =>
              (i.player_id === neighbor.id && i.other_player_id === playerId) ||
              (i.other_player_id === neighbor.id && i.player_id === playerId)
          )
          .pop();

        const isNew =
          firstInteraction &&
          new Date().getTime() - firstInteraction.created_at.getTime() < 7 * 24 * 60 * 60 * 1000;

        // 检查昨日是否有产蛋
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0));
        const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999));

        const yesterdayProduction = await prisma.eggs_transactions.aggregate({
          where: {
            player_id: neighbor.id,
            transaction_type: 'production',
            created_at: {
              gte: yesterdayStart,
              lte: yesterdayEnd,
            },
          },
          _sum: { quantity: true },
        });

        // 检查是否偷过该玩家
        const stoleMe = await prisma.steal_events.findFirst({
          where: {
            stealer_id: neighbor.id,
            victim_id: playerId,
          },
          orderBy: { attempted_at: 'desc' },
        });

        let activityType: 'new' | 'active' | 'idle' | 'stole_me' = 'idle';
        let description = '最近没有活动';

        if (stoleMe && new Date().getTime() - stoleMe.attempted_at.getTime() < 24 * 60 * 60 * 1000) {
          activityType = 'stole_me';
          description = `昨天还来偷蛋了！`;
        } else if (isNew) {
          activityType = 'new';
          description = `新邻居`;
        } else if (
          neighbor.last_login_at &&
          new Date().getTime() - neighbor.last_login_at.getTime() < 24 * 60 * 60 * 1000
        ) {
          activityType = 'active';
          description = `昨天活跃`;
        }

        return {
          neighborId: neighbor.id,
          nickname: neighbor.nickname || `玩家${neighbor.id}`,
          activityType,
          lastLoginAt: neighbor.last_login_at || new Date(),
          eggProductionYesterday: Number(yesterdayProduction._sum.quantity || 0n),
          description,
        };
      })
    );

    // 按活动优先级排序
    const activityPriority = { stole_me: 0, new: 1, active: 2, idle: 3 };
    return neighborActivities.sort(
      (a, b) => activityPriority[a.activityType] - activityPriority[b.activityType]
    );
  }

  /**
   * 聚合解锁进度
   */
  private async aggregateUnlockProgress(playerId: bigint): Promise<UnlockProgress> {
    const player = await prisma.players.findUnique({
      where: { id: playerId },
      include: { farm: { include: { chickens: true } } },
    });

    if (!player || !player.farm) {
      throw new Error(`玩家 ${playerId} 的农场信息不存在`);
    }

    const totalChickens = player.farm.chickens.length;
    const totalEarned = Number(player.total_eggs_earned || 0n);

    // 定义里程碑
    const milestones = [
      { chickens: 1, eggs: 100 },
      { chickens: 5, eggs: 500 },
      { chickens: 10, eggs: 1000 },
      { chickens: 20, eggs: 2000 },
      { chickens: 50, eggs: 5000 },
      { chickens: 100, eggs: 10000 },
    ];

    // 找出下一个里程碑
    let nextMilestone = milestones[0];
    let progressToNext = 0;
    let eggNeeded = nextMilestone.eggs;

    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      if (totalChickens < milestone.chickens && totalEarned < milestone.eggs) {
        nextMilestone = milestone;
        eggNeeded = Math.max(0, milestone.eggs - totalEarned);
        progressToNext = Math.round((totalEarned / milestone.eggs) * 100);
        break;
      } else if (i === milestones.length - 1) {
        // 已达到最高里程碑
        nextMilestone = { chickens: 100, eggs: 10000 };
        progressToNext = 100;
        eggNeeded = 0;
      }
    }

    return {
      totalChickens,
      totalEarned,
      nextMilestone: `养殖 ${nextMilestone.chickens} 只鸡 / 产蛋 ${nextMilestone.eggs} 枚`,
      progressToNext,
      eggNeeded,
    };
  }

  /**
   * 获取全服统计数据
   */
  async getServerStats(
    startTime: Date = new Date(new Date().setUTCDate(new Date().getUTCDate() - 1)),
    endTime: Date = new Date()
  ): Promise<ServerStats> {
    try {
      logger.info('[聚合服务] 开始聚合全服统计数据');

      // 全服总产蛋量
      const totalProduction = await prisma.eggs_transactions.aggregate({
        where: {
          transaction_type: 'production',
          created_at: { gte: startTime, lte: endTime },
        },
        _sum: { quantity: true },
      });

      // 全服偷蛋统计
      const stealAttempts = await prisma.steal_events.count({
        where: {
          attempted_at: { gte: startTime, lte: endTime },
        },
      });

      const successfulSteals = await prisma.steal_events.count({
        where: {
          attempted_at: { gte: startTime, lte: endTime },
          outcome: { in: ['success', 'bumper_crop'] },
        },
      });

      // 全服兑换统计
      const exchangeStats = await prisma.eggs_transactions.aggregate({
        where: {
          transaction_type: 'exchange',
          created_at: { gte: startTime, lte: endTime },
        },
        _sum: { aigg_amount: true },
      });

      // 活跃玩家数
      const activePlayerCount = await prisma.players.count({
        where: { is_active: true },
      });

      // 新注册玩家数
      const newPlayerCount = await prisma.players.count({
        where: {
          registered_at: { gte: startTime, lte: endTime },
        },
      });

      // 最大偷蛋事件
      const maxStealEvent = await prisma.steal_events.findFirst({
        where: {
          attempted_at: { gte: startTime, lte: endTime },
          outcome: { in: ['success', 'bumper_crop'] },
        },
        orderBy: { eggs_stolen: 'desc' },
        include: {
          stealer: { select: { id: true, nickname: true } },
          victim: { select: { id: true, nickname: true } },
        },
      });

      // 最富玩家
      const richestPlayer = await prisma.farms.findFirst({
        orderBy: { egg_inventory: 'desc' },
        include: { player: { select: { id: true, nickname: true } } },
      });

      logger.info('[聚合服务] 全服统计数据聚合完成');

      return {
        totalEggProduction: Number(totalProduction._sum.quantity || 0n),
        totalStealAttempts: stealAttempts,
        totalStealSuccess: successfulSteals,
        totalExchangedAigg: Number(exchangeStats._sum.aigg_amount || 0n),
        activePlayerCount,
        newPlayerCount,
        maxSingleSteal: maxStealEvent
          ? {
              stealerId: maxStealEvent.stealer_id,
              steelerNickname: maxStealEvent.stealer?.nickname || `玩家${maxStealEvent.stealer_id}`,
              victimId: maxStealEvent.victim_id,
              victimNickname: maxStealEvent.victim?.nickname || `玩家${maxStealEvent.victim_id}`,
              eggCount: Number(maxStealEvent.eggs_stolen || 0n),
            }
          : undefined,
        richestPlayer: richestPlayer
          ? {
              playerId: richestPlayer.player_id,
              nickname: richestPlayer.player?.nickname || `玩家${richestPlayer.player_id}`,
              totalEggs: Number(richestPlayer.egg_inventory),
            }
          : undefined,
      };
    } catch (error) {
      logger.error('[聚合服务] 聚合全服统计失败:', error);
      throw error;
    }
  }

  /**
   * 批量获取所有活跃玩家的早报数据
   */
  async getAllPlayerMorningReports(reportDate: Date = new Date()): Promise<PlayerMorningReportData[]> {
    try {
      logger.info('[聚合服务] 开始批量获取所有活跃玩家早报数据');

      // 获取所有活跃玩家
      const activePlayers = await prisma.players.findMany({
        where: { is_active: true },
        select: { id: true },
      });

      logger.info(`[聚合服务] 发现 ${activePlayers.length} 个活跃玩家`);

      // 并行聚合数据（使用控制并发避免过载）
      const concurrency = 10;
      const results: PlayerMorningReportData[] = [];

      for (let i = 0; i < activePlayers.length; i += concurrency) {
        const batch = activePlayers.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map((player) => this.getPlayerMorningReport(player.id, reportDate))
        );

        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            logger.error('[聚合服务] 获取单个玩家数据失败:', result.reason);
          }
        });

        logger.info(`[聚合服务] 处理进度: ${Math.min(i + concurrency, activePlayers.length)}/${activePlayers.length}`);
      }

      logger.info(`[聚合服务] 批量聚合完成，成功 ${results.length} 个，失败 ${activePlayers.length - results.length} 个`);
      return results;
    } catch (error) {
      logger.error('[聚合服务] 批量聚合早报数据失败:', error);
      throw error;
    }
  }
}

export const morningReportAggregator = new MorningReportAggregator();
```

---

## 3. 内容生成引擎 (services/contentGenerator.ts)

```typescript
/**
 * AIggs 早报系统 - 个性化内容生成引擎
 * 职责：根据聚合数据生成趣味幽默的早报文本
 *
 * 核心特性：
 * - 根据情境变化问候语和语气
 * - 使用养鸡相关比喻和拟人化
 * - 生成 ASCII 艺术数据可视化
 * - 每日彩蛋（随机鸡知识/鸡汤语录）
 */

import {
  PlayerMorningReportData,
  GeneratedMorningReport,
  ServerStats,
} from '@/types/morningReport';
import { logger } from '@/utils/reportLogger';

export class MorningReportContentGenerator {
  /**
   * 鸡相关的趣味语录库
   */
  private readonly easterEggs = [
    '💡 冷知识：母鸡每天产蛋需要充足的钙质，就像你需要充足的 EGGS！',
    '🎯 养鸡秘诀：最成功的养鸡人不是最勤快的，而是最聪明的。',
    '🌙 月圆之夜：母鸡在月圆时产蛋效率会提升 2.5%（数据待验证）',
    '🏃 加速秘诀：给鸡放放音乐，它们会更开心地产蛋（真的！）',
    '💪 力量之源：一只优质母鸡 24 小时内产蛋数量相当于它体重的 20%！',
    '🎓 大师级玩家：顶级养鸡人的秘密是……耐心和一点点运气。',
    '🌍 全球事实：全世界每秒有 2000 多枚蛋被生产出来。AIggs 也在其中！',
    '⚡ 闪电事实：一只优秀的母鸡会记住它最喜欢的地方产蛋。',
    '🎪 趣味事实：母鸡会互相学习！优质母鸡能"教会"邻近的母鸡更高效地产蛋。',
    '🏆 冠军级知识：养鸡游戏中的"大丰收"相当于现实中鸡的最佳产蛋状态！',
  ];

  /**
   * 根据时间生成开场问候
   */
  private generateGreeting(reportDate: Date): string {
    const hour = reportDate.getHours();
    const dayOfWeek = reportDate.toLocaleDateString('zh-CN', { weekday: 'long' });

    let timeGreeting = '';
    if (hour >= 5 && hour < 9) {
      timeGreeting = '早上好！🌅 起床第一件事就是查看农场，这位养鸡人真的很用心！';
    } else if (hour >= 9 && hour < 12) {
      timeGreeting = '上午好！☀️ 太阳都老高了，鸡群早就开始忙活了。';
    } else if (hour >= 12 && hour < 14) {
      timeGreeting = '中午好！🌞 正是母鸡产蛋的黄金时间呢！';
    } else if (hour >= 14 && hour < 18) {
      timeGreeting = '下午好！🐓 下午茶时间，来看看鸡宝宝的新成果吧！';
    } else if (hour >= 18 && hour < 21) {
      timeGreeting = '晚上好！🌆 傍晚时分，一天的收获正在统计中...';
    } else {
      timeGreeting = '夜深了！🌙 还在玩农场？你是真爱啊！';
    }

    return `${timeGreeting}\n\n亲爱的养鸡人，${dayOfWeek}的早报新鲜出炉! 🗞️`;
  }

  /**
   * 生成农场状况摘要
   */
  private generateFarmSummary(data: PlayerMorningReportData): string {
    const {
      playerNickname,
      eggProduction,
      stealStats,
      inventory,
      unlockProgress,
    } = data;

    let summary = `\n═══════════════════════════════════\n🚜 ${playerNickname} 的农场日报\n═══════════════════════════════════\n\n`;

    // 产蛋情况
    summary += `📊 **昨日产蛋：${eggProduction.playerEggs} 枚**\n`;
    summary += `   全服平均：${eggProduction.serverAveragEggs} 枚\n`;

    if (eggProduction.playerEggs > eggProduction.serverAveragEggs) {
      const advantage = eggProduction.playerEggs - eggProduction.serverAveragEggs;
      summary += `   ⬆️ 你超过平均 ${advantage} 枚（排名 Top ${100 - eggProduction.percentile}%）- 太棒了！\n`;
    } else if (eggProduction.playerEggs < eggProduction.serverAveragEggs) {
      const gap = eggProduction.serverAveragEggs - eggProduction.playerEggs;
      summary += `   ⬇️ 低于平均 ${gap} 枚，加油哦！\n`;
    } else {
      summary += `   ➡️ 和全服平均水平一致，稳定运营！\n`;
    }

    if (eggProduction.trend === 'up') {
      summary += `   📈 趋势：上升！前天表现不如昨天，好兆头！\n`;
    } else if (eggProduction.trend === 'down') {
      summary += `   📉 趋势：下降。可能是鸡宝宝累了，该休息休息了。\n`;
    }

    // 库存情况
    summary += `\n🐔 **鸡宝宝们的家：${inventory.currentEggs}/${inventory.capacity} 🥚**\n`;
    summary += this.generateProgressBar(inventory.utilizationRate, 30);

    if (inventory.utilizationRate > 80) {
      summary += `   ⚠️ 仓库快满了！赶紧收蛋吧，免得"浪费"了！\n`;
    } else if (inventory.utilizationRate > 50) {
      summary += `   💭 库存健康，保持这个势头！\n`;
    } else {
      summary += `   😊 位置还很充足，鸡宝宝们可以尽情生产！\n`;
    }

    // 被偷情况
    if (stealStats.totalStolenCount > 0) {
      summary += `\n😱 **昨日遭遇偷蛋事件 ${stealStats.totalStolenCount} 次**\n`;
      summary += `   被偷走 ${stealStats.totalEggsStolenCount} 枚蛋（损失 ${Math.round((stealStats.totalEggsStolenCount / Math.max(eggProduction.playerEggs, 1)) * 100)}%）\n`;
      if (stealStats.topStealer) {
        summary += `   最常见的"小偷"：${stealStats.topStealer.nickname}（${stealStats.topStealer.stealCount} 次）\n`;
      }
      summary += `   💪 别灰心！这就是游戏的乐趣所在。明天反击！\n`;
    } else {
      summary += `\n✨ **昨日安全记录：鸡蛋全部保住！**\n`;
      summary += `   你的警惕性很高，或者运气好，继续保持！\n`;
    }

    // 解锁进度
    summary += `\n🎯 **解锁进度：${unlockProgress.nextMilestone}**\n`;
    summary += `   当前：${unlockProgress.totalChickens} 只鸡，${unlockProgress.totalEarned} 枚蛋\n`;
    summary += this.generateProgressBar(unlockProgress.progressToNext, 20);
    if (unlockProgress.eggNeeded > 0) {
      summary += `   还需 ${unlockProgress.eggNeeded} 枚蛋就能解锁新内容！\n`;
    } else {
      summary += `   🎉 已达到该里程碑！继续努力！\n`;
    }

    return summary;
  }

  /**
   * 生成竞争关系分析
   */
  private generateCompetitionAnalysis(data: PlayerMorningReportData): string {
    const { rankings, neighbors, stealStats } = data;

    let analysis = `\n═══════════════════════════════════\n🏆 排名和竞争动态\n═══════════════════════════════════\n\n`;

    // 排名变化
    analysis += `**🥇 全服排名变化：**\n`;

    const eggRank = rankings.eggProduction;
    if (eggRank.change > 0) {
      analysis += `   产蛋排行：↗️ 第 ${eggRank.currentRank} 名（上升 ${eggRank.change} 位！）\n`;
    } else if (eggRank.change < 0) {
      analysis += `   产蛋排行：↘️ 第 ${eggRank.currentRank} 名（下降 ${Math.abs(eggRank.change)} 位）\n`;
    } else {
      analysis += `   产蛋排行：➡️ 第 ${eggRank.currentRank} 名（稳定）\n`;
    }

    const wealthRank = rankings.wealth;
    if (wealthRank.change > 0) {
      analysis += `   财富排行：↗️ 第 ${wealthRank.currentRank} 名（超越了不少邻居！）\n`;
    } else if (wealthRank.change < 0) {
      analysis += `   财富排行：↘️ 第 ${wealthRank.currentRank} 名（可能被偷蛋了）\n`;
    } else {
      analysis += `   财富排行：➡️ 第 ${wealthRank.currentRank} 名\n`;
    }

    const stealRank = rankings.stealSuccess;
    analysis += `   偷蛋成功率：第 ${stealRank.currentRank} 名\n`;

    // 邻居动态
    analysis += `\n**👥 邻居动态（最活跃的 5 个）：**\n`;

    const activeNeighbors = neighbors.slice(0, 5);
    if (activeNeighbors.length === 0) {
      analysis += `   暂时还没有邻居动态，扩展你的"朋友圈"吧！\n`;
    } else {
      activeNeighbors.forEach((neighbor) => {
        let emoji = '👤';
        let status = '';

        switch (neighbor.activityType) {
          case 'stole_me':
            emoji = '🎯';
            status = `${neighbor.nickname} 昨天还来偷蛋了！（产蛋 ${neighbor.eggProductionYesterday} 枚）`;
            break;
          case 'new':
            emoji = '✨';
            status = `${neighbor.nickname} 是新邻居，欢迎加入！`;
            break;
          case 'active':
            emoji = '⚡';
            status = `${neighbor.nickname} 昨天活跃，产蛋 ${neighbor.eggProductionYesterday} 枚`;
            break;
          case 'idle':
            emoji = '😴';
            status = `${neighbor.nickname} 最近比较低调`;
            break;
        }

        analysis += `   ${emoji} ${status}\n`;
      });
    }

    return analysis;
  }

  /**
   * 生成行动建议
   */
  private generateActionSuggestions(data: PlayerMorningReportData): string {
    const { inventory, eggProduction, stealStats, rankings } = data;

    let suggestions = `\n═══════════════════════════════════\n💡 建议和行动项\n═══════════════════════════════════\n\n`;

    // 库存建议
    if (inventory.utilizationRate > 90) {
      suggestions += `🔴 【紧急】库存即将满满！建议立即收蛋兑换 $AIGG\n`;
    } else if (inventory.utilizationRate > 70) {
      suggestions += `🟡 【提醒】库存使用率 ${inventory.utilizationRate}%，建议今天内收蛋\n`;
    }

    // 被偷建议
    if (stealStats.topStealer) {
      suggestions += `🎯 注意你的"死对头"${stealStats.topStealer.nickname}！`;
      suggestions += `最近频繁光顾，防守升级！\n`;
    }

    // 排名建议
    if (rankings.eggProduction.currentRank > 100) {
      suggestions += `📊 产蛋排名还有提升空间。继续加油，冲击 Top 50！\n`;
    } else if (rankings.eggProduction.currentRank <= 10) {
      suggestions += `🌟 你已经是全服 Top 10 产蛋大户了！保持住！\n`;
    }

    // 汇率建议
    if (eggProduction.playerEggs > 50) {
      suggestions += `💰 EGGS 攒得不少，可以考虑兑换 $AIGG！\n`;
    }

    suggestions += `\n📱 提示：记得定期检查农场，每天都有惊喜！\n`;

    return suggestions;
  }

  /**
   * 生成ASCII进度条
   */
  private generateProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `   [${bar}] ${percentage}%\n`;
  }

  /**
   * 生成ASCII数据可视化
   */
  private generateDataVisualization(data: PlayerMorningReportData): string {
    const { eggProduction, inventory } = data;

    let visualization = `\n═══════════════════════════════════\n📊 数据可视化\n═══════════════════════════════════\n\n`;

    // 产蛋对比图表
    visualization += `**昨日产蛋对比：**\n`;
    const playerBar = Math.min(eggProduction.playerEggs / 10, 20);
    const averageBar = Math.min(eggProduction.serverAveragEggs / 10, 20);

    visualization += `   你的产蛋  : ${'🔸'.repeat(Math.round(playerBar))} ${eggProduction.playerEggs}\n`;
    visualization += `   全服平均  : ${'🔹'.repeat(Math.round(averageBar))} ${eggProduction.serverAveragEggs}\n`;

    // 库存分布
    visualization += `\n**仓库容量分布：**\n`;
    visualization += this.generateProgressBar(inventory.utilizationRate, 25);

    // 一周趋势（简化版）
    visualization += `\n**产蛋趋势：**\n`;
    const trend =
      eggProduction.trend === 'up'
        ? '📈 ↗️ ↗️ ↗️'
        : eggProduction.trend === 'down'
          ? '📉 ↘️ ↘️ ↘️'
          : '📊 ➡️ ➡️ ➡️';
    visualization += `   ${trend}\n`;

    return visualization;
  }

  /**
   * 获取随机彩蛋
   */
  private getRandomEasterEgg(): string {
    const randomIndex = Math.floor(Math.random() * this.easterEggs.length);
    return this.easterEggs[randomIndex];
  }

  /**
   * 生成结尾语
   */
  private generateClosingRemark(): string {
    const closingRemarks = [
      '希望你今天继续有好运气！记得定期检查农场哦。🐔',
      '养鸡路漫漫，一起加油！下一个 Top 10 就是你！💪',
      '感谢你的坚持和热情，我们一起把农场经营得更好！🌾',
      '今天也是充满机遇的一天，珍惜每一只鸡宝宝！😊',
      '记住：成功的养鸡人不怕失败，只怕放弃！继续前进！🚀',
    ];
    const randomIndex = Math.floor(Math.random() * closingRemarks.length);
    return closingRemarks[randomIndex];
  }

  /**
   * 生成完整的早报内容
   */
  async generateMorningReport(
    data: PlayerMorningReportData,
    serverStats?: ServerStats
  ): Promise<GeneratedMorningReport> {
    try {
      logger.info(`[内容生成] 开始为玩家 ${data.playerId} 生成早报`);

      const greeting = this.generateGreeting(data.reportDate);
      const farmSummary = this.generateFarmSummary(data);
      const competitionAnalysis = this.generateCompetitionAnalysis(data);
      const actionSuggestions = this.generateActionSuggestions(data);
      const dataVisualization = this.generateDataVisualization(data);
      const dailyEasterEgg = `\n**🎁 今日彩蛋：**\n${this.getRandomEasterEgg()}\n`;
      const closingRemark = `\n${this.generateClosingRemark()}\n`;

      // 拼装完整内容
      const plainText =
        greeting +
        farmSummary +
        competitionAnalysis +
        actionSuggestions +
        dataVisualization +
        dailyEasterEgg +
        closingRemark;

      // 生成Markdown版本（与纯文本相同，但可根据需要调整格式）
      const markdown = plainText;

      // 生成标题
      const title = `🗞️ ${data.playerNickname} 的 AIggs 早报 - ${data.reportDate.toLocaleDateString('zh-CN')}`;

      const report: GeneratedMorningReport = {
        title,
        greeting,
        farmSummary,
        competitionAnalysis,
        actionSuggestions,
        dataVisualization,
        dailyEasterEgg,
        closingRemark,
        plainText,
        markdown,
      };

      logger.info(`[内容生成] 为玩家 ${data.playerId} 生成完成`);
      return report;
    } catch (error) {
      logger.error(`[内容生成] 生成早报失败:`, error);
      throw error;
    }
  }

  /**
   * 生成全服每日报告（用于公告频道）
   */
  async generateServerDailyReport(serverStats: ServerStats): Promise<string> {
    let report = `\n╔═══════════════════════════════════════╗\n`;
    report += `║        🌍 AIggs 全服每日报告 🌍        ║\n`;
    report += `╚═══════════════════════════════════════╝\n\n`;

    report += `📊 **昨日全服数据**\n`;
    report += `   🐔 总产蛋：${serverStats.totalEggProduction.toLocaleString()} 枚\n`;
    report += `   🎯 偷蛋尝试：${serverStats.totalStealAttempts} 次\n`;
    report += `   ✅ 成功偷蛋：${serverStats.totalStealSuccess} 次（成功率 ${Math.round((serverStats.totalStealSuccess / Math.max(serverStats.totalStealAttempts, 1)) * 100)}%）\n`;
    report += `   💰 兑换总额：${serverStats.totalExchangedAigg.toLocaleString()} $AIGG\n`;

    report += `\n👥 **玩家活跃情况**\n`;
    report += `   🟢 活跃玩家：${serverStats.activePlayerCount}\n`;
    report += `   ✨ 新注册：${serverStats.newPlayerCount}\n`;

    if (serverStats.maxSingleSteal) {
      report += `\n🎯 **昨日最大偷蛋事件**\n`;
      report += `   小偷：${serverStats.maxSingleSteal.steelerNickname}\n`;
      report += `   受害者：${serverStats.maxSingleSteal.victimNickname}\n`;
      report += `   战利品：${serverStats.maxSingleSteal.eggCount} 枚蛋\n`;
    }

    if (serverStats.richestPlayer) {
      report += `\n💎 **全服首富**\n`;
      report += `   玩家：${serverStats.richestPlayer.nickname}\n`;
      report += `   库存：${serverStats.richestPlayer.totalEggs}/${ 30}\n`;
    }

    report += `\n🎉 感谢全球养鸡人的参与！明天继续！\n`;

    return report;
  }
}

export const contentGenerator = new MorningReportContentGenerator();
```

---

## 4. 推送服务 (services/pushService.ts)

```typescript
/**
 * AIggs 早报系统 - 推送服务
 * 职责：管理推送队列、状态追踪、多渠道分发
 *
 * 支持渠道：
 * - MCP 工具回调（AI 主动展示）
 * - Webhook（Discord/Telegram bot）
 * - 邮件
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import {
  PushChannel,
  PushResult,
  PushRecord,
  UserPushPreference,
  PushTask,
  GeneratedMorningReport,
  MorningReportWorkflow,
} from '@/types/morningReport';
import { logger } from '@/utils/reportLogger';
import { pushQueue } from '@/utils/pushQueue';

const prisma = new PrismaClient();

export class PushService {
  /**
   * 推送任务到指定渠道
   */
  async pushToChannels(
    playerId: bigint,
    content: GeneratedMorningReport,
    channels: PushChannel[],
    preference: UserPushPreference
  ): Promise<PushResult[]> {
    const results: PushResult[] = [];

    for (const channel of channels) {
      try {
        const startTime = Date.now();

        let pushResult: PushResult;

        switch (channel) {
          case 'mcp':
            pushResult = await this.pushViaMatrix(playerId, content);
            break;
          case 'webhook':
            pushResult = await this.pushViaWebhook(playerId, content, preference);
            break;
          case 'email':
            pushResult = await this.pushViaEmail(playerId, content, preference);
            break;
          default:
            throw new Error(`未知的推送渠道: ${channel}`);
        }

        pushResult.responseTime = Date.now() - startTime;
        results.push(pushResult);

        logger.info(
          `[推送服务] 为玩家 ${playerId} 推送至 ${channel} ${pushResult.success ? '成功' : '失败'}`
        );
      } catch (error) {
        logger.error(`[推送服务] 推送至 ${channel} 失败:`, error);
        results.push({
          channel,
          success: false,
          message: String(error),
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * 通过 MCP 工具回调推送
   * （MCP 协议允许 AI 工具主动回调向用户展示内容）
   */
  private async pushViaMatrix(
    playerId: bigint,
    content: GeneratedMorningReport
  ): Promise<PushResult> {
    try {
      // 这里的逻辑取决于 MCP 工具的具体实现
      // 一般来说，MCP 工具会通过某种回调机制接收内容
      // 例如：通过环境变量配置的回调 URL 或事件流

      const mcpCallbackUrl = process.env.MCP_CALLBACK_URL;

      if (!mcpCallbackUrl) {
        return {
          channel: 'mcp',
          success: false,
          message: 'MCP_CALLBACK_URL 未配置',
          timestamp: new Date(),
        };
      }

      // 发送到 MCP 回调端点
      const response = await axios.post(
        mcpCallbackUrl,
        {
          playerId: playerId.toString(),
          reportTitle: content.title,
          reportContent: content.plainText,
          reportDate: new Date(),
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            'X-MCP-Token': process.env.MCP_TOKEN || '',
          },
        }
      );

      return {
        channel: 'mcp',
        success: response.status === 200 || response.status === 201,
        message: `MCP 推送成功，ID: ${response.data?.id}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        channel: 'mcp',
        success: false,
        message: `MCP 推送失败: ${String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 通过 Webhook 推送（支持 Discord, Telegram 等）
   */
  private async pushViaWebhook(
    playerId: bigint,
    content: GeneratedMorningReport,
    preference: UserPushPreference
  ): Promise<PushResult> {
    try {
      if (!preference.webhookUrl) {
        return {
          channel: 'webhook',
          success: false,
          message: 'Webhook URL 未配置',
          timestamp: new Date(),
        };
      }

      // 检查沉默时段
      if (this.isInSilentHours(preference.silentHours)) {
        logger.info(`[推送服务] 玩家 ${playerId} 处于沉默时段，跳过 Webhook 推送`);
        return {
          channel: 'webhook',
          success: false,
          message: '用户处于沉默时段',
          timestamp: new Date(),
        };
      }

      // 构建 Webhook payload（支持多种格式）
      const payload = this.buildWebhookPayload(content);

      const response = await axios.post(preference.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return {
        channel: 'webhook',
        success: response.status === 200 || response.status === 204,
        message: 'Webhook 推送成功',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        channel: 'webhook',
        success: false,
        message: `Webhook 推送失败: ${String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 通过电子邮件推送
   */
  private async pushViaEmail(
    playerId: bigint,
    content: GeneratedMorningReport,
    preference: UserPushPreference
  ): Promise<PushResult> {
    try {
      if (!preference.email) {
        return {
          channel: 'email',
          success: false,
          message: '邮箱地址未配置',
          timestamp: new Date(),
        };
      }

      // 这里集成邮件服务（如 SendGrid, Mailgun 等）
      // 示例使用虚拟邮件服务
      const emailServiceUrl = process.env.EMAIL_SERVICE_URL || 'http://mail-service:3001/send';

      const response = await axios.post(
        emailServiceUrl,
        {
          to: preference.email,
          subject: content.title,
          htmlBody: this.buildEmailHtml(content),
          textBody: content.plainText,
        },
        {
          timeout: 5000,
          headers: {
            'Authorization': `Bearer ${process.env.EMAIL_SERVICE_TOKEN || ''}`,
          },
        }
      );

      return {
        channel: 'email',
        success: response.status === 200 || response.status === 201,
        message: '邮件推送成功',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        channel: 'email',
        success: false,
        message: `邮件推送失败: ${String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 构建 Webhook payload
   */
  private buildWebhookPayload(content: GeneratedMorningReport): Record<string, unknown> {
    // Discord Embed 格式示例
    return {
      username: 'AIggs 早报助手',
      avatar_url: 'https://aiggs.xyz/logo.png',
      embeds: [
        {
          title: content.title,
          description: content.greeting,
          fields: [
            {
              name: '农场状况',
              value: content.farmSummary,
              inline: false,
            },
            {
              name: '竞争分析',
              value: content.competitionAnalysis,
              inline: false,
            },
            {
              name: '建议和行动',
              value: content.actionSuggestions,
              inline: false,
            },
            {
              name: '💡 每日彩蛋',
              value: content.dailyEasterEgg,
              inline: false,
            },
          ],
          footer: {
            text: content.closingRemark,
          },
          timestamp: new Date().toISOString(),
          color: 0xffa500,
        },
      ],
    };
  }

  /**
   * 构建电子邮件 HTML 内容
   */
  private buildEmailHtml(content: GeneratedMorningReport): string {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${content.title}</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px; }
          .section { margin: 20px 0; padding: 15px; background: #f5f5f5; border-left: 4px solid #667eea; border-radius: 3px; }
          .section h2 { color: #667eea; margin-top: 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
          code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }
          em { color: #764ba2; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${content.title}</h1>
          </div>

          <div style="margin: 20px 0;">
            ${content.greeting}
          </div>

          <div class="section">
            <h2>🚜 农场状况</h2>
            ${content.farmSummary.replace(/\n/g, '<br>')}
          </div>

          <div class="section">
            <h2>🏆 竞争分析</h2>
            ${content.competitionAnalysis.replace(/\n/g, '<br>')}
          </div>

          <div class="section">
            <h2>💡 建议和行动</h2>
            ${content.actionSuggestions.replace(/\n/g, '<br>')}
          </div>

          <div class="section">
            <h2>📊 数据可视化</h2>
            ${content.dataVisualization.replace(/\n/g, '<br>')}
          </div>

          <div class="section">
            <h2>🎁 每日彩蛋</h2>
            ${content.dailyEasterEgg.replace(/\n/g, '<br>')}
          </div>

          <div style="margin: 20px 0; text-align: center; font-style: italic; font-size: 14px;">
            ${content.closingRemark.replace(/\n/g, '<br>')}
          </div>

          <div class="footer">
            <p>来自 AIggs 每日早报系统 • ${new Date().toLocaleDateString('zh-CN')}</p>
            <p><a href="https://aiggs.xyz" style="color: #667eea; text-decoration: none;">访问官网</a></p>
          </div>
        </div>
      </body>
    </html>
    `;
  }

  /**
   * 检查是否在沉默时段
   */
  private isInSilentHours(silentHours?: { start: number; end: number }): boolean {
    if (!silentHours) return false;

    const now = new Date();
    const currentHour = now.getHours();

    if (silentHours.start < silentHours.end) {
      return currentHour >= silentHours.start && currentHour < silentHours.end;
    } else {
      // 跨越午夜的时段
      return currentHour >= silentHours.start || currentHour < silentHours.end;
    }
  }

  /**
   * 创建推送任务并加入队列
   */
  async createPushTask(
    workflow: MorningReportWorkflow
  ): Promise<PushTask> {
    const taskId = `task_${workflow.playerId}_${Date.now()}`;

    const task: PushTask = {
      id: taskId,
      playerId: workflow.playerId,
      reportDate: workflow.aggregatedData.reportDate,
      channels: this.selectChannels(workflow.preference),
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    };

    try {
      // 添加到队列
      await pushQueue.add(
        'send-report',
        { task, workflow },
        {
          jobId: taskId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      logger.info(`[推送服务] 为玩家 ${workflow.playerId} 创建推送任务 ${taskId}`);
      return task;
    } catch (error) {
      logger.error(`[推送服务] 创建推送任务失败:`, error);
      throw error;
    }
  }

  /**
   * 根据用户偏好选择推送渠道
   */
  private selectChannels(preference: UserPushPreference): PushChannel[] {
    const channels: PushChannel[] = [];

    if (preference.enableMcp) channels.push('mcp');
    if (preference.enableWebhook) channels.push('webhook');
    if (preference.enableEmail) channels.push('email');

    return channels.length > 0 ? channels : ['mcp']; // 默认使用 MCP
  }

  /**
   * 记录推送记录
   */
  async recordPushHistory(
    playerId: bigint,
    reportDate: Date,
    results: PushResult[]
  ): Promise<PushRecord> {
    const record: PushRecord = {
      taskId: `record_${playerId}_${reportDate.getTime()}`,
      playerId,
      reportDate,
      results,
      overallSuccess: results.some((r) => r.success),
      createdAt: new Date(),
    };

    try {
      // 这里可以存储到数据库，例如创建一个 push_records 表
      // 暂时只记录日志
      logger.info(`[推送服务] 推送记录: ${JSON.stringify(record)}`);
      return record;
    } catch (error) {
      logger.error(`[推送服务] 记录推送历史失败:`, error);
      throw error;
    }
  }

  /**
   * 处理推送失败和重试
   */
  async handlePushFailure(task: PushTask, error: Error): Promise<void> {
    task.retryCount++;
    task.lastRetryAt = new Date();
    task.failureReason = error.message;

    if (task.retryCount >= 3) {
      task.status = 'failed';
      logger.error(`[推送服务] 任务 ${task.id} 最终失败，已放弃重试`);
    }

    logger.warn(`[推送服务] 任务 ${task.id} 推送失败，重试次数: ${task.retryCount}`);
  }

  /**
   * 批量推送给所有活跃玩家
   */
  async broadcastToAllPlayers(
    workflows: MorningReportWorkflow[]
  ): Promise<{ success: number; failed: number; total: number }> {
    logger.info(`[推送服务] 开始批量推送给 ${workflows.length} 个玩家`);

    let successCount = 0;
    let failedCount = 0;

    for (const workflow of workflows) {
      try {
        const task = await this.createPushTask(workflow);
        successCount++;
      } catch (error) {
        logger.error(`[推送服务] 为玩家 ${workflow.playerId} 创建任务失败:`, error);
        failedCount++;
      }
    }

    logger.info(
      `[推送服务] 批量推送完成，成功: ${successCount}，失败: ${failedCount}，总计: ${workflows.length}`
    );

    return {
      success: successCount,
      failed: failedCount,
      total: workflows.length,
    };
  }
}

export const pushService = new PushService();
```

---

## 5. 定时任务调度器 (jobs/morningReportJob.ts)

```typescript
/**
 * AIggs 早报系统 - 定时任务调度器
 * 职责：每天早上 8:00 UTC+8 触发完整的早报生成和推送流程
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { morningReportAggregator } from '@/services/morningReportAggregator';
import { contentGenerator } from '@/services/contentGenerator';
import { pushService } from '@/services/pushService';
import {
  MorningReportWorkflow,
  UserPushPreference,
  BatchProcessStats,
} from '@/types/morningReport';
import { logger } from '@/utils/reportLogger';

const prisma = new PrismaClient();

export class MorningReportJob {
  private cronExpression: string = '0 8 * * *'; // 每天 8:00 UTC
  private isRunning: boolean = false;
  private lastRunTime?: Date;
  private nextRunTime?: Date;

  /**
   * 初始化定时任务
   */
  initialize(cronExpression?: string, timeZone: string = 'UTC'): cron.ScheduledTask {
    if (cronExpression) {
      this.cronExpression = cronExpression;
    }

    logger.info(`[定时任务] 初始化早报系统，计划表达式: ${this.cronExpression}，时区: ${timeZone}`);

    // 使用 node-cron 创建定时任务
    const task = cron.schedule(
      this.cronExpression,
      async () => {
        if (this.isRunning) {
          logger.warn('[定时任务] 上一次执行还未完成，本次跳过');
          return;
        }

        this.isRunning = true;
        this.lastRunTime = new Date();

        try {
          await this.executeFullPipeline();
        } catch (error) {
          logger.error('[定时任务] 执行管道出错:', error);
        } finally {
          this.isRunning = false;
          // 更新下次运行时间
          this.updateNextRunTime();
        }
      },
      {
        timezone: timeZone,
      }
    );

    // 设置下次运行时间
    this.updateNextRunTime();

    logger.info('[定时任务] 早报定时任务已启动');
    return task;
  }

  /**
   * 更新下次运行时间
   */
  private updateNextRunTime(): void {
    // 简化计算：每天 8:00 UTC
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(8, 0, 0, 0);

    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    this.nextRunTime = next;
  }

  /**
   * 执行完整的早报生成和推送管道
   */
  private async executeFullPipeline(): Promise<BatchProcessStats> {
    const pipelineStartTime = Date.now();
    logger.info('[管道] 开始执行早报生成和推送管道');

    try {
      // Step 1: 聚合数据
      logger.info('[管道] Step 1: 聚合数据...');
      const reportDate = new Date();
      const playerReports = await morningReportAggregator.getAllPlayerMorningReports(reportDate);
      const serverStats = await morningReportAggregator.getServerStats();

      logger.info(`[管道] 聚合完成，获取 ${playerReports.length} 个玩家数据`);

      // Step 2: 生成内容
      logger.info('[管道] Step 2: 生成个性化内容...');
      const workflows: MorningReportWorkflow[] = [];

      for (const reportData of playerReports) {
        try {
          const content = await contentGenerator.generateMorningReport(reportData, serverStats);
          const preference = await this.getUserPushPreference(reportData.playerId);

          workflows.push({
            playerId: reportData.playerId,
            aggregatedData: reportData,
            generatedContent: content,
            preference,
            pushResults: [],
          });
        } catch (error) {
          logger.error(`[管道] 为玩家 ${reportData.playerId} 生成内容失败:`, error);
        }
      }

      logger.info(`[管道] 生成完成，得到 ${workflows.length} 份早报`);

      // Step 3: 批量推送
      logger.info('[管道] Step 3: 批量推送...');
      const broadcastResult = await pushService.broadcastToAllPlayers(workflows);

      logger.info(
        `[管道] 推送完成，成功: ${broadcastResult.success}，失败: ${broadcastResult.failed}`
      );

      // Step 4: 发布全服公告
      logger.info('[管道] Step 4: 发布全服公告...');
      const serverReportContent = await contentGenerator.generateServerDailyReport(serverStats);
      logger.info('[管道] 全服公告内容:\n' + serverReportContent);

      const pipelineEndTime = Date.now();
      const stats: BatchProcessStats = {
        totalPlayers: playerReports.length,
        successfulReports: broadcastResult.success,
        failedReports: broadcastResult.failed,
        totalTimeMs: pipelineEndTime - pipelineStartTime,
        startedAt: new Date(pipelineStartTime),
        completedAt: new Date(pipelineEndTime),
        averageTimePerPlayerMs:
          playerReports.length > 0
            ? (pipelineEndTime - pipelineStartTime) / playerReports.length
            : 0,
      };

      logger.info(
        `[管道] 管道执行完成！总耗时 ${stats.totalTimeMs}ms，平均每玩家 ${Math.round(stats.averageTimePerPlayerMs)}ms`
      );

      return stats;
    } catch (error) {
      logger.error('[管道] 执行管道失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户推送偏好
   */
  private async getUserPushPreference(playerId: bigint): Promise<UserPushPreference> {
    // 这里可以从数据库查询，暂时返回默认配置
    return {
      playerId,
      enableMcp: true,
      enableWebhook: false,
      enableEmail: false,
      frequency: 'daily',
    };
  }

  /**
   * 手动触发一次早报（用于测试或补发）
   */
  async triggerManually(playerId?: bigint): Promise<BatchProcessStats> {
    logger.info('[定时任务] 手动触发早报系统');

    if (playerId) {
      // 单个玩家
      const reportData = await morningReportAggregator.getPlayerMorningReport(playerId);
      const content = await contentGenerator.generateMorningReport(reportData);
      const preference = await this.getUserPushPreference(playerId);

      const workflow: MorningReportWorkflow = {
        playerId,
        aggregatedData: reportData,
        generatedContent: content,
        preference,
        pushResults: [],
      };

      const result = await pushService.broadcastToAllPlayers([workflow]);
      return {
        totalPlayers: 1,
        successfulReports: result.success,
        failedReports: result.failed,
        totalTimeMs: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        averageTimePerPlayerMs: 0,
      };
    } else {
      // 所有玩家
      return await this.executeFullPipeline();
    }
  }

  /**
   * 获取任务状态
   */
  getJobStatus(): {
    isRunning: boolean;
    lastRunTime?: Date;
    nextRunTime?: Date;
    cronExpression: string;
  } {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      nextRunTime: this.nextRunTime,
      cronExpression: this.cronExpression,
    };
  }
}

export const morningReportJob = new MorningReportJob();
```

---

## 6. 推送队列配置 (utils/pushQueue.ts)

```typescript
/**
 * Bull/BullMQ 推送队列初始化
 * 用于管理异步推送任务，避免瞬时高并发
 */

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { pushService } from '@/services/pushService';
import { MorningReportWorkflow, PushTask } from '@/types/morningReport';
import { logger } from '@/utils/reportLogger';

// 初始化 Redis 连接
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

// 创建推送队列
export const pushQueue = new Queue('morning-report-push', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// 定义队列任务处理器
interface PushJobData {
  task: PushTask;
  workflow: MorningReportWorkflow;
}

export const pushWorker = new Worker<PushJobData>(
  'morning-report-push',
  async (job) => {
    const { task, workflow } = job.data;
    logger.info(`[队列] 处理推送任务: ${task.id}`);

    try {
      task.status = 'processing';

      // 执行推送
      const results = await pushService.pushToChannels(
        workflow.playerId,
        workflow.generatedContent,
        task.channels,
        workflow.preference
      );

      // 记录推送结果
      await pushService.recordPushHistory(
        workflow.playerId,
        workflow.aggregatedData.reportDate,
        results
      );

      task.status = 'sent';
      task.sentAt = new Date();

      logger.info(`[队列] 推送任务 ${task.id} 完成`);
      return { success: true, task };
    } catch (error) {
      logger.error(`[队列] 推送任务 ${task.id} 失败:`, error);
      await pushService.handlePushFailure(task, error as Error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '10'),
  }
);

// 监听队列事件
pushQueue.on('waiting', (job) => {
  logger.info(`[队列] 任务等待中: ${job.id}`);
});

pushQueue.on('active', (job) => {
  logger.info(`[队列] 任务处理中: ${job.id}`);
});

pushQueue.on('completed', (job) => {
  logger.info(`[队列] 任务完成: ${job.id}`);
});

pushQueue.on('failed', (job, err) => {
  logger.error(`[队列] 任务失败: ${job?.id} - ${err.message}`);
});

pushWorker.on('completed', (job) => {
  logger.info(`[队列工作机] 任务 ${job.id} 完成`);
});

pushWorker.on('failed', (job, err) => {
  logger.error(`[队列工作机] 任务 ${job?.id} 失败: ${err.message}`);
});

/**
 * 获取队列统计信息
 */
export async function getQueueStats() {
  const counts = await pushQueue.getJobCounts();
  const size = await pushQueue.count();

  return {
    total: size,
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
    delayed: counts.delayed,
  };
}

/**
 * 清空队列（谨慎使用）
 */
export async function clearQueue() {
  await pushQueue.drain();
  logger.warn('[队列] 队列已清空');
}
```

---

## 7. 日志工具 (utils/reportLogger.ts)

```typescript
/**
 * 早报系统专用日志工具
 */

import winston from 'winston';
import fs from 'fs';
import path from 'path';

// 创建日志目录
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`;
    })
  ),
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
    // 文件输出
    new winston.transports.File({
      filename: path.join(logsDir, 'morning-report.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'morning-report-error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),
  ],
});
```

---

## 8. 推送配置 (config/pushConfig.ts)

```typescript
/**
 * 推送服务配置
 */

import { PushServiceConfig } from '@/types/morningReport';

export const pushConfig: PushServiceConfig = {
  // MCP 工具回调配置
  mcp: {
    enabled: process.env.MCP_ENABLED === 'true' || true,
    endpoint: process.env.MCP_ENDPOINT || 'http://localhost:3001/callback',
    timeout: parseInt(process.env.MCP_TIMEOUT || '5000'),
  },

  // Webhook 配置
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true' || false,
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000'),
    retryTimes: parseInt(process.env.WEBHOOK_RETRY_TIMES || '3'),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '2000'),
  },

  // 邮件配置
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true' || false,
    from: process.env.EMAIL_FROM || 'noreply@aiggs.xyz',
    subject: process.env.EMAIL_SUBJECT || '🐔 AIggs 每日早报',
  },

  // 定时表达式（cron）- 默认每天 8:00 UTC
  cronExpression: process.env.CRON_EXPRESSION || '0 8 * * *',

  // 时区
  timeZone: process.env.TIME_ZONE || 'UTC',

  // 队列并发数
  queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '10'),

  // 最大重试次数
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
};
```

---

## 9. 使用示例和集成

### 9.1 在主应用中初始化 (src/index.ts)

```typescript
import { morningReportJob } from '@/jobs/morningReportJob';
import { pushConfig } from '@/config/pushConfig';

// 启动早报系统
const reportTask = morningReportJob.initialize(
  pushConfig.cronExpression,
  pushConfig.timeZone
);

// 可选：添加任务状态检查路由
app.get('/api/morning-report/status', (req, res) => {
  const status = morningReportJob.getJobStatus();
  res.json(status);
});

// 可选：添加手动触发路由（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  app.post('/api/morning-report/trigger', async (req, res) => {
    try {
      const stats = await morningReportJob.triggerManually();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });
}
```

### 9.2 API 端点示例

```typescript
/**
 * 获取单个玩家的早报（用于 Web 端查看）
 */
app.get('/api/morning-report/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const reportData = await morningReportAggregator.getPlayerMorningReport(BigInt(playerId));
    const content = await contentGenerator.generateMorningReport(reportData);

    res.json({
      success: true,
      report: {
        data: reportData,
        content,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 获取全服统计
 */
app.get('/api/morning-report/server/stats', async (req, res) => {
  try {
    const stats = await morningReportAggregator.getServerStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});
```

### 9.3 .env 配置示例

```env
# 早报系统配置
# 定时表达式 (cron) - 每天 8:00 UTC+8 运行
CRON_EXPRESSION=0 0 * * *
TIME_ZONE=Asia/Shanghai

# MCP 工具配置
MCP_ENABLED=true
MCP_ENDPOINT=http://localhost:3001/callback
MCP_TOKEN=your_mcp_token_here

# Webhook 配置
WEBHOOK_ENABLED=false
WEBHOOK_TIMEOUT=10000

# 邮件配置
EMAIL_ENABLED=false
EMAIL_FROM=noreply@aiggs.xyz

# Redis 队列配置
REDIS_HOST=localhost
REDIS_PORT=6379
QUEUE_CONCURRENCY=10

# 日志级别
LOG_LEVEL=info
```

---

## 10. 部署和运维指南

### 10.1 安装依赖

```bash
npm install bullmq ioredis node-cron winston
npm install --save-dev @types/node-cron
```

### 10.2 数据库迁移（Prisma）

```bash
npx prisma migrate dev --name add_morning_report_tables
```

需要在 `prisma/schema.prisma` 中添加推送记录表：

```prisma
model push_records {
  id            String   @id @default(cuid())
  player_id     BigInt
  report_date   DateTime
  push_results  String   // JSON 格式
  overall_success Boolean
  created_at    DateTime @default(now())

  @@index([player_id])
  @@index([created_at])
}

model user_push_preferences {
  id               String   @id @default(cuid())
  player_id        BigInt   @unique
  enable_mcp       Boolean  @default(true)
  enable_webhook   Boolean  @default(false)
  enable_email     Boolean  @default(false)
  webhook_url      String?
  email            String?
  silent_hours_start Int?   // 0-23
  silent_hours_end   Int?
  frequency        String   @default("daily") // daily, every_3_days, weekly, manual
  created_at       DateTime @default(now())
  updated_at       DateTime @updatedAt

  @@index([player_id])
}
```

### 10.3 启动服务

```bash
# 开发环境
npm run dev

# 生产环境
npm run build
npm start
```

### 10.4 监控和日志

```bash
# 查看日志
tail -f logs/morning-report.log
tail -f logs/morning-report-error.log

# 查看队列状态
curl http://localhost:3000/api/morning-report/status

# 手动触发测试（开发环境）
curl -X POST http://localhost:3000/api/morning-report/trigger
```

---

## 11. 性能优化建议

1. **数据库优化**
   - 为 `eggs_transactions`, `steal_events` 等表添加时间范围索引
   - 使用物化视图缓存排行榜数据

2. **缓存策略**
   - 缓存全服统计数据（5分钟更新一次）
   - 缓存排行榜数据（实时计算但缓存 1 分钟）

3. **并发控制**
   - 调整 `QUEUE_CONCURRENCY` 根据服务器配置（推荐 10-20）
   - 使用数据库连接池管理

4. **推送优化**
   - 对 MCP 回调使用异步非阻塞方式
   - Webhook 推送启用重试机制
   - 邮件推送可使用批量发送服务

---

## 总结

本早报系统提供了完整的：

✅ 数据聚合服务 - 从数据库收集和计算各类指标
✅ 个性化内容生成 - 基于数据生成趣味幽默的早报文本
✅ 多渠道推送 - 支持 MCP、Webhook、邮件等推送方式
✅ 定时任务调度 - 每天指定时间自动执行
✅ 推送队列管理 - 使用 BullMQ 处理异步任务
✅ 完整的错误处理和日志 - 便于监控和调试

所有代码包含详尽的中文注释，可直接集成到 AIggs 后端项目中。
