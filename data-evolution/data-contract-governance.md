# AIggs 数据契约 + AI升级治理系统完整实现

**文档版本**: 1.0
**日期**: 2026-03-27
**项目**: AIggs - AI原生链上养鸡农场游戏
**目标**: 建立数据完整性保障和AI升级安全机制，防止模块升级时的连锁破坏

---

## 目录

1. [系统架构](#系统架构)
2. [核心概念](#核心概念)
3. [数据契约系统](#数据契约系统)
4. [AI升级安全网](#ai升级安全网)
5. [数据完整性守护者](#数据完整性守护者)
6. [升级编排器](#升级编排器)
7. [配置示例](#配置示例)
8. [使用场景](#使用场景)
9. [完整TypeScript实现](#完整typescript实现)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI升级治理系统架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  AI提出变更 → 契约验证 → 影响分析 → 风险评分 → 分级审批          │
│     ↓            ↓          ↓          ↓          ↓              │
│   Meta-AI    ContractValidator ImpactAnalyzer RiskScorer DecisionGate
│                                                      ↓
│                           迁移生成 → 影子测试 → 备份 → 灰度发布
│                              ↓          ↓         ↓      ↓
│                       MigrationGen  ShadowTest BackupMgr Canary
│                                                      ↓
│                              监控 → 异常检测 → 自动回滚/全量
│                               ↓       ↓           ↓
│                          Monitoring  Anomaly   AutoRollback
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   数据层 - 事件溯源与投影                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Event Store (事件完整记录)                                      │
│         ↓                                                         │
│  Contract Registry (契约注册)  ← 版本化管理                      │
│         ↓                                                         │
│  Projection Tables (投影表)  ← 多版本适配                        │
│         ↓                                                         │
│  Integrity Guardian (完整性检查)  ← 定时一致性校验               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心概念

### 1. 数据契约 (Data Contract)

契约定义了模块对外暴露的数据接口。类似于API版本控制，但作用于数据层。

**三个关键特性**：
- **版本化**: v1, v2, v3... - 每个版本独立维护
- **向后兼容**: v2必须能兼容v1的消费者
- **破坏性变更检测**: 在发布前自动检测不兼容问题

### 2. AI升级分级 (Upgrade Classification)

| 级别 | 类型 | 示例 | 自动化度 | 审批流程 |
|-----|------|------|--------|---------|
| Level 1 | 自动 | 新增字段、新增索引、配置变更 | 100% | 自动执行+日志 |
| Level 2 | 异步审核 | 字段类型扩大、新增表、重命名 | 60% | 异步审核+可自动 |
| Level 3 | 人工审批 | 字段删除、表删除、数据迁移 | 10% | 人工审批+测试 |
| Level 4 | CEO审批 | 经济模型变更、代币分配调整 | 0% | CEO+法务+董事会 |

### 3. 影响分析 (Impact Analysis)

AI升级时自动分析：
- **依赖图谱**: 哪些消费者依赖被改变的数据
- **数据量影响**: 涉及多少玩家、多少数据行
- **风险评分**: 基于多个维度的复合评分

---

## 数据契约系统

### 契约定义规范

AIggs游戏的4个核心契约：

```typescript
// ============ PlayerContract v1 ============
// 玩家账户数据契约
// 消费者: 登录系统、排行榜、邀请系统
interface PlayerContract {
  id: string;                  // 玩家唯一ID
  wallet_address: string;      // 钱包地址
  nickname?: string;           // 昵称（可选）
  farm_code: string;          // 农场码
  registered_at: number;      // 注册时间戳
  eggs_balance: number;       // EGGS余额（缓存字段，从交易表汇总）
}

// ============ FarmContract v1 ============
// 农场数据契约
// 消费者: 产蛋引擎、库存管理、展示界面
interface FarmContract {
  farm_id: string;            // 农场ID
  player_id: string;          // 玩家ID（外键）
  chicken_count: number;      // 母鸡数量
  egg_inventory: number;      // 仓库中的EGGS数
  egg_capacity: number;       // 仓库容量（30）
  next_production_at: number; // 下次产蛋时间戳
}

// ============ StealContract v1 ============
// 偷蛋事件契约
// 消费者: 偷蛋决策、统计分析、对战历史
interface StealContract {
  event_id: string;           // 事件ID
  attacker_id: string;        // 偷蛋者ID
  defender_id: string;        // 被偷者ID
  result: 'success' | 'fail' | 'bumper_crop'; // 结果
  eggs_amount: number;        // 偷取EGGS数
  timestamp: number;          // 事件时间戳
}

// ============ TokenContract v1 ============
// 代币兑换契约
// 消费者: 钱包、交易所、财务报表
interface TokenContract {
  player_id: string;          // 玩家ID
  aigg_balance: number;       // $AIGG代币余额
  total_converted: number;    // 累计转换数量
  conversion_rate: number;    // 当前汇率（EGGS:AIGG，如30:1）
}
```

### 契约版本管理

```typescript
// 契约版本演进示例：

// === Version 1.0 (当前) ===
// 字段: id, wallet_address, nickname, farm_code, registered_at, eggs_balance
// 变更历史: 初始版本

// === Version 2.0 (未来计划) ===
// 新增字段: last_login_at, total_eggs_earned
// 修改: nickname 从可选变为必填
// 向后兼容: 旧消费者仍可获取v1字段，v2字段由适配器填充默认值

// === Version 3.0 (长期规划) ===
// 新增字段: reputation_score, achievement_badges[]
// 重构: 拆分eggs_balance为多个币种
```

---

## AI升级安全网

### 变更影响分析引擎

当AI提出数据变更时，系统自动执行：

1. **依赖图谱构建**
   - 扫描所有消费者（模块、API、报表）
   - 标记哪些依赖被改变的字段

2. **影响范围计算**
   - 受影响玩家数：`SELECT COUNT(*) WHERE affected_field IS NOT NULL`
   - 受影响交易数：`SELECT COUNT(*) FROM eggs_transactions WHERE affects_field`
   - 涉及金额：`SUM(aigg_amount)` 在风险期间内

3. **风险评分矩阵**
   ```
   综合风险分 = (变更严重度 × 0.4) + (影响玩家数 × 0.3) + (金额风险 × 0.2) + (历史失败率 × 0.1)

   变更严重度: 字段删除(10) > 类型变更(7) > 重命名(5) > 新增字段(2) > 新增索引(1)
   影响玩家数: (数量 / 总玩家数) × 10
   金额风险: (风险金额 / 日均代币流入) × 10
   历史失败率: (该AI之前失败升级数 / 总升级数) × 10
   ```

### 升级决策分级

```typescript
// 自动路由到不同审批流程的规则表

interface UpgradeDecision {
  changeType: string;          // 变更类型
  severity: number;            // 严重度 1-10
  riskScore: number;          // 综合风险分 0-100
  confidenceLevel: number;    // 置信度 0-100%
  recommendedLevel: number;   // 推荐审批级别 1-4
  autoApprovable: boolean;    // 能否自动批准
}

// 决策分级规则
const DECISION_RULES = {
  Level1: {
    criteria: (risk) => risk.confidenceLevel > 90 && risk.riskScore < 20,
    action: 'AUTO_EXECUTE',
    timeout: '5 minutes',
    rollback: 'AUTOMATIC',
    notification: 'LOG_ONLY'
  },
  Level2: {
    criteria: (risk) => risk.confidenceLevel >= 60 && risk.riskScore < 50,
    action: 'ASYNC_REVIEW',
    timeout: '24 hours',
    rollback: 'SEMI_AUTOMATIC',
    notification: 'TEAM_ALERT'
  },
  Level3: {
    criteria: (risk) => risk.confidenceLevel < 60 && risk.riskScore < 80,
    action: 'MANUAL_APPROVAL',
    timeout: '72 hours',
    rollback: 'MANUAL_ONLY',
    notification: 'ESCALATE_TO_CTO'
  },
  Level4: {
    criteria: (risk) => risk.riskScore >= 80,
    action: 'CEO_APPROVAL',
    timeout: 'UNLIMITED',
    rollback: 'MANUAL_ONLY',
    notification: 'BOARD_NOTIFICATION'
  }
};
```

### 升级回滚策略

```typescript
// 灰度发布 + 自动回滚的配置

interface CanaryConfig {
  // 灰度阶段配置
  stages: [
    { percentage: 0.01,  duration: '30 minutes' },  // 1% 流量
    { percentage: 0.10,  duration: '1 hour' },      // 10% 流量
    { percentage: 0.50,  duration: '2 hours' },     // 50% 流量
    { percentage: 1.00,  duration: '0' }            // 100% 流量
  ];

  // 自动回滚触发条件 (任一满足即回滚)
  autoRollbackTriggers: {
    errorRate: 0.05,           // 错误率 > 5%
    latencyP99: 2000,          // P99延迟 > 2000ms (相比基线的2倍)
    dataInconsistency: true,   // 数据不一致检测到
    anomalyDetected: true,     // 异常指标检测
    ownerApproval: false       // 所有者明确取消
  };

  // 监控指标
  monitoringMetrics: [
    'error_rate',
    'latency_p50_p95_p99',
    'data_consistency_score',
    'transaction_success_rate',
    'player_activity_change',
    'aigg_token_velocity'
  ];

  // 回滚选项
  rollbackOptions: {
    automatic: true,           // 自动回滚
    keepLogs: true,           // 保留日志供分析
    notifyTeam: true,         // 通知团队
    postMortemDelay: '1 hour' // 延迟1小时发送事后分析
  };
}
```

---

## 数据完整性守护者

### 定期一致性检查任务

```typescript
// 数据完整性检查计划

interface IntegrityCheckTask {
  taskId: string;
  schedule: 'every_hour' | 'every_6_hours' | 'every_24_hours';
  checks: [
    {
      name: 'EventCountVsProjection',
      sql: `
        SELECT
          COALESCE(COUNT(*), 0) as event_count,
          COALESCE((SELECT COUNT(*) FROM players), 0) as projection_count,
          ABS(COUNT(*) - (SELECT COUNT(*) FROM players)) as discrepancy
        FROM events
        WHERE event_type = 'player_created'
        AND discrepancy > 0 THEN ALERT
      `,
      tolerance: 0,
      severity: 'CRITICAL'
    },
    {
      name: 'EggBalanceConsistency',
      sql: `
        SELECT p.id, p.eggs_balance as cached,
               SUM(CASE WHEN et.quantity > 0 THEN et.quantity ELSE 0 END) as actual
        FROM players p
        LEFT JOIN eggs_transactions et ON p.id = et.player_id
        WHERE ABS(p.eggs_balance - COALESCE(actual, 0)) > 1
        THEN ALERT
      `,
      tolerance: 0,
      severity: 'HIGH'
    },
    {
      name: 'ForeignKeyIntegrity',
      sql: `
        SELECT COUNT(*) as orphaned_records
        FROM farms f
        WHERE f.player_id NOT IN (SELECT id FROM players)
        OR COUNT(*) > 0 THEN ALERT
      `,
      tolerance: 0,
      severity: 'CRITICAL'
    },
    {
      name: 'DataAnomalyDetection',
      sql: `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as transaction_count,
          AVG(quantity) as avg_quantity,
          STDDEV(quantity) as std_dev
        FROM eggs_transactions
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY DATE(created_at)
        HAVING COUNT(*) > (historical_avg + 3 * std_dev)
        THEN ALERT -- 异常交易突增
      `,
      tolerance: 3,
      severity: 'MEDIUM'
    }
  ];

  // 自愈机制触发条件
  selfHealingTriggers: {
    orphanedRecords: {
      action: 'DELETE_OR_REPARENT',
      requiresApproval: true,
      maxAutoFix: 10  // 最多自动修复10条，超过则等待人工
    },
    inconsistentBalance: {
      action: 'REBUILD_FROM_EVENT_STORE',
      requiresApproval: false,
      maxAutoFix: Infinity
    },
    staleCaches: {
      action: 'INVALIDATE_AND_REFRESH',
      requiresApproval: false,
      maxAutoFix: Infinity
    }
  };
}
```

### 事件流重建机制

```typescript
// 数据恢复的标准流程

async function rebuildProjectionFromEvents(
  playerId: string,
  targetVersion: string = 'latest'
): Promise<void> {
  // 1. 获取该玩家的所有事件
  const events = await eventStore.query({
    playerId,
    fromVersion: 'v1',
    toVersion: targetVersion,
    orderBy: 'timestamp ASC'
  });

  // 2. 依次应用事件重建状态
  let state = {
    eggs_balance: 0,
    farm: null,
    chickens: [],
    transactions: []
  };

  for (const event of events) {
    switch (event.type) {
      case 'PlayerCreated':
        state = applyPlayerCreated(state, event);
        break;
      case 'FarmInitialized':
        state = applyFarmInitialized(state, event);
        break;
      case 'EggProduced':
        state = applyEggProduced(state, event);
        break;
      case 'StealAttempted':
        state = applyStealAttempted(state, event);
        break;
      // ... 其他事件类型
    }
  }

  // 3. 与数据库一致性检查
  const projection = await db.getPlayerProjection(playerId);
  if (JSON.stringify(state) !== JSON.stringify(projection)) {
    // 4. 如果不一致，更新到数据库
    await db.updatePlayerProjection(playerId, state);
    // 5. 记录修复日志
    await auditLog.record({
      type: 'INTEGRITY_FIX',
      playerId,
      action: 'REBUILD_PROJECTION',
      timestamp: Date.now()
    });
  }
}
```

---

## 升级编排器

完整的升级流程编排：

```
┌─────────────────────────────────────────────────────────────────┐
│                  升级编排器 - 完整流程                           │
└─────────────────────────────────────────────────────────────────┘

Step 1: AI提出变更建议
  ↓ (Meta-AI or Design-AI提出)
  proposal = {
    description: "增加玩家声誉字段",
    changes: [
      { type: 'ADD_COLUMN', target: 'players', field: 'reputation_score' }
    ],
    rationale: "用于排行榜和成就系统"
  }

Step 2: 契约验证
  ↓ (ContractValidator检查)
  validator.validateChange(proposal)
  - 检查新增字段是否违反现有契约
  - 验证字段命名规范
  - 检查类型定义合法性
  ✓ PASS / ✗ FAIL (需修改提案)

Step 3: 影响分析
  ↓ (ImpactAnalyzer评估)
  impact = analyzer.analyze(proposal)
  {
    affectedConsumers: ['排行榜系统', '玩家展示页'],
    affectedPlayerCount: 125000,
    affectedTransactions: 2500000,
    estimatedRisk: {
      migrationComplexity: 'LOW',
      dataLossRisk: 'NONE',
      performanceImpact: 'NEGLIGIBLE'
    }
  }

Step 4: 风险评分
  ↓ (RiskScorer计算)
  riskScore = scorer.calculate(impact)
  {
    severity: 2,            // 新增字段，低严重度
    affectedScope: 1.0,     // 所有玩家可能受影响
    monetaryRisk: 0,        // 无金额风险
    historicalFailRate: 0,  // 此类变更无失败记录
    confidenceLevel: 95,    // 95% 置信度
    recommendedLevel: 1     // 推荐自动执行
  }

Step 5: 分级审批
  ↓ (DecisionGate路由)
  if (riskScore.confidenceLevel > 90 && riskScore.severity < 5) {
    approval = 'AUTO_APPROVE'
    // Level 1: 自动批准，记录日志
  } else if (riskScore.confidenceLevel >= 60) {
    approval = 'ASYNC_REVIEW'
    // Level 2: 发送技术团队审核，24小时内决议
  } else {
    approval = 'MANUAL_APPROVAL'
    // Level 3: 等待CTO或Lead Engineer人工审批
  }

Step 6: 数据迁移生成
  ↓ (MigrationGenerator生成)
  if (approval.requires_migration) {
    migration = generator.generate(proposal)
    {
      sqlMigration: "ALTER TABLE players ADD COLUMN reputation_score INT DEFAULT 0;",
      rollbackSQL: "ALTER TABLE players DROP COLUMN reputation_score;",
      testQueries: [...],
      estimatedDuration: '2 seconds',
      expectedDowntime: 0
    }
  }

Step 7: 影子测试
  ↓ (ShadowTest在测试环境执行)
  if (approval.requires_testing) {
    shadowTest = await shadowTestRunner.run(migration, {
      testDataSize: 'FULL_PRODUCTION_SAMPLE',
      duration: '10 minutes',
      checkpoints: ['before', 'after_25%', 'after_50%', 'after_100%'],
      validations: [
        'data_integrity',
        'performance_baseline',
        'rollback_test'
      ]
    });

    if (!shadowTest.passed) {
      throw new UpgradeFailedError('影子测试失败，中止升级');
    }
  }

Step 8: 备份
  ↓ (BackupManager创建快照)
  backup = await backupManager.createSnapshot({
    tables: ['players', 'farms', 'eggs_transactions', ...],
    compressLevel: 'STANDARD',
    encryption: 'AES256',
    retention: '30 days'
  });

  backupVerified = await backup.verify();

Step 9: 灰度发布
  ↓ (CanaryDeployment逐步推出)
  canary = new CanaryDeployment({
    stages: [
      { percentage: 0.01, duration: '30 minutes' },
      { percentage: 0.10, duration: '1 hour' },
      { percentage: 0.50, duration: '2 hours' },
      { percentage: 1.00, duration: '0' }
    ],
    rollbackTriggers: {
      errorRate > 0.05,
      latencyP99 > baseline * 2,
      dataInconsistency detected
    }
  });

  await canary.startStage(1);

Step 10: 监控
  ↓ (Monitoring系统持续观察)
  monitor.track({
    metrics: [
      'error_rate',
      'query_latency',
      'data_consistency',
      'player_activity',
      'token_velocity'
    ],
    alertThresholds: {
      error_rate: 0.05,
      latency_increase: 2.0,
      consistency_score: 0.99
    },
    evaluationInterval: '5 minutes'
  });

Step 11: 完成或回滚
  ↓ (AutoRollback或FullRollout)
  if (allMetricsNormal) {
    await canary.progressToNextStage();
  } else if (criticialIssueDetected) {
    await canary.rollback({
      fromBackup: true,
      notifyTeam: true,
      triggerPostMortem: true
    });
  }

Step 12: 事后分析
  ↓ (PostMortemAnalysis)
  if (upgrade failed or had issues) {
    postMortem = {
      rootCause: '...',
      preventiveMeasures: [...],
      processImprovements: [...],
      assignedTo: 'Team Lead',
      deadline: 'next sprint'
    }
  }
```

---

## 配置示例

### 场景1: 新增玩家声誉字段

```typescript
const reputationFieldUpgrade = {
  // 变更定义
  change: {
    id: 'add_reputation_field_v1',
    timestamp: Date.now(),
    proposedBy: 'design_ai_agent',
    description: '为玩家表增加声誉评分，支持排行榜和成就系统',

    modifications: [
      {
        type: 'ADD_COLUMN',
        table: 'players',
        column: 'reputation_score',
        dataType: 'INT',
        defaultValue: 0,
        nullable: false,
        indexed: true
      }
    ],

    // 契约更新
    contractUpdates: [
      {
        contractName: 'PlayerContract',
        currentVersion: 'v1',
        newVersion: 'v2',
        changes: [
          {
            action: 'ADD_FIELD',
            field: 'reputation_score',
            type: 'number',
            required: false,        // v1消费者可忽略
            default: 0
          }
        ],
        backwardCompatible: true,
        adaptationRules: [
          'v1消费者: reputation_score默认为0',
          'v2消费者: 获取完整的reputation_score'
        ]
      }
    ]
  },

  // 预期的风险和影响
  expectedImpact: {
    affectedConsumers: ['排行榜系统', '成就系统', '玩家信息展示'],
    affectedPlayerCount: 125000,
    estimatedDuration: '3-5 seconds',
    downtime: 0,
    dataLossRisk: 'NONE'
  },

  // 测试计划
  testPlan: {
    shadowEnvironment: true,
    testDataSize: 'FULL_SAMPLE',
    performanceBaseline: {
      queryLatencyP50: '50ms',
      queryLatencyP99: '200ms',
      insertLatency: '10ms'
    },
    validations: [
      'reputation_score正确初始化为0',
      '索引创建成功',
      '查询性能无退化',
      '旧API兼容性保证'
    ]
  },

  // 回滚计划
  rollbackPlan: {
    trigger: '如果查询延迟增加>2倍或数据异常',
    action: 'ALTER TABLE players DROP COLUMN reputation_score',
    rollbackDuration: '1 second',
    dataRetention: 'FULL (使用备份恢复)'
  }
};
```

### 场景2: 修改鸡的产蛋速率

```typescript
const adjustProductionRateUpgrade = {
  change: {
    id: 'adjust_chicken_production_rate_v2',
    timestamp: Date.now(),
    proposedBy: 'design_ai_agent',
    description: '调整稀有鸡的产蛋倍数，平衡游戏经济',

    modifications: [
      {
        type: 'UPDATE_CONFIG',
        target: 'chicken_production_rates',
        changes: {
          'common': { before: 1.0, after: 1.0 },      // 无变化
          'rare': { before: 1.5, after: 1.3 },        // 下调
          'legendary': { before: 2.5, after: 2.2 }    // 下调
        },
        effectiveAt: Date.now() + 3600000  // 1小时后生效
      }
    ],

    // 合约版本升级
    contractUpdates: [
      {
        contractName: 'FarmContract',
        currentVersion: 'v1',
        newVersion: 'v2',
        changes: [
          {
            action: 'MODIFY_CALCULATION',
            field: 'egg_production_rate',
            oldFormula: 'base_eggs * chicken.rarity_rate',
            newFormula: 'base_eggs * chicken.rarity_rate * adjustment_factor',
            backwardCompatible: true
          }
        ]
      }
    ]
  },

  // 经济模型影响分析
  economicImpact: {
    affectedPlayersCount: 125000,
    estimatedEarningsChange: '-8% to -12%',  // 玩家预期收益下降
    tokenInflationImpact: '-5% per day',     // 日均代币流入减少
    affectedTransactionValue: '约300万$AIGG/天'
  },

  // 升级分级
  riskAssessment: {
    severity: 8,            // 影响经济模型，高严重度
    confidenceLevel: 75,    // 中等置信度
    recommendedLevel: 2,    // Level 2: 异步审核
    requiredApprovals: ['design_ai', 'operations_ai'],
    escalationPath: 'design_lead -> cto'
  },

  // 灰度策略 (重要!)
  canaryStrategy: {
    stages: [
      {
        percentage: 0.05,
        duration: '6 hours',
        monitoring: 'eggs_production_rate, player_engagement, token_velocity'
      },
      {
        percentage: 0.25,
        duration: '12 hours',
        monitoring: 'same + player_churn_rate'
      },
      {
        percentage: 1.0,
        duration: '0',
        monitoring: 'full'
      }
    ],

    rollbackTriggers: [
      'player_churn_rate > 5%',
      'daily_active_players_drop > 10%',
      'data_inconsistency detected',
      'error_rate > 2%'
    ]
  },

  // 沟通计划
  communicationPlan: {
    playerNotification: {
      timing: '24小时前通知',
      channels: ['in_game_announcement', 'email', 'telegram'],
      message: '为了保持游戏长期平衡性，稀有鸡的产蛋效率将有所调整...'
    },
    teamNotification: {
      timing: '立即',
      slack: '#ai-upgrades',
      details: 'full_change_proposal'
    }
  }
};
```

### 场景3: 删除过时的字段 (Level 3 人工审批)

```typescript
const deprecateOldFieldUpgrade = {
  change: {
    id: 'deprecate_legacy_field_v3',
    timestamp: Date.now(),
    proposedBy: 'operations_ai_agent',
    description: '删除已弃用的chicken.boost_until字段，该功能已并入新的buff系统',

    modifications: [
      {
        type: 'DROP_COLUMN',
        table: 'chickens',
        column: 'boost_until',
        reason: '功能已在v2架构中重新设计',
        migratedTo: 'buff_effects表'
      }
    ]
  },

  // 高风险指标
  riskAssessment: {
    severity: 9,            // 字段删除，最高严重度
    confidenceLevel: 40,    // 低置信度 (涉及数据删除)
    recommendedLevel: 3,    // Level 3: 人工审批
    requiredApprovals: ['cto', 'data_engineer'],
    reviewDeadline: '72 hours',
    requiresPostMortem: true
  },

  // 迁移计划 (必须详细)
  migrationPlan: {
    phase1_deprecation: {
      duration: '7 days',
      action: '将boost_until标记为@deprecated，但保留字段',
      monitoringGoal: '确认无代码仍在使用此字段'
    },

    phase2_dataBackup: {
      action: '完整备份chickens表，特别关注boost_until的值分布',
      exportTo: 'boost_until_archive.csv'
    },

    phase3_migration: {
      action: '批量迁移数据到buff_effects表',
      script: `
        INSERT INTO buff_effects (chicken_id, effect_type, expires_at)
        SELECT id, 'boost', boost_until FROM chickens WHERE boost_until IS NOT NULL
      `,
      batchSize: 10000,
      rollback: 'restore from backup'
    },

    phase4_verification: {
      action: '数据完整性检查',
      checks: [
        'SELECT COUNT(*) FROM buff_effects WHERE effect_type=boost GROUP BY chicken_id',
        'SELECT COUNT(*) FROM chickens WHERE boost_until IS NOT NULL',
        '对比两个数量，应该相等'
      ]
    },

    phase5_drop: {
      action: 'ALTER TABLE chickens DROP COLUMN boost_until',
      backup: 'REQUIRED'
    }
  },

  // 深入的影响分析
  detailedImpact: {
    currentUsageAnalysis: {
      boostedChickensCount: 34523,
      boostUntilActiveCount: 2341,  // 当前仍有boost的鸡
      affectedPlayers: 1235,
      avgBoostDuration: '6 hours'
    },

    dependencyAnalysis: {
      queriesUsingField: [
        'getActiveBoosts (boost_until > NOW())',
        'getBoostStats (SELECT COUNT WHERE boost_until IS NOT NULL)',
        '报表中的boost_expiry_histogram'
      ],

      codeDependencies: [
        'ChickenBoostService.getActiveBoosts()',
        'AnalyticsService.calculateBoostMetrics()',
        'API /api/chickens/:id/boosts'
      ],

      mitigationActions: [
        '更新所有查询指向buff_effects表',
        '更新相关API端点',
        '更新分析报表逻辑'
      ]
    }
  },

  // 人工审批检查清单
  approvalChecklist: [
    '[] 所有查询已重写为使用buff_effects表',
    '[] API文档已更新',
    '[] 前端代码已更新',
    '[] 报表系统已更新',
    '[] 迁移脚本已在测试环境验证',
    '[] 回滚计划已详细文档化',
    '[] 数据备份已验证完整性',
    '[] 所有受影响方已通知',
    '[] 监控告警已配置'
  ]
};
```

---

## 使用场景

### 场景A: 日常升级流程 (Level 1)

```typescript
// 场景: Design AI 发现了新增玩家排行榜字段的需求
async function dailyUpgradeScenario() {
  // 1. Design AI提出变更
  const proposal = {
    type: 'ADD_COLUMN',
    target: 'players',
    field: 'daily_eggs_produced',
    reason: '支持日度排行榜'
  };

  // 2. 自动验证和风险评分
  const validator = new ContractValidator();
  await validator.validate(proposal);  // ✓ 通过

  const analyzer = new ImpactAnalyzer();
  const impact = await analyzer.analyze(proposal);

  const scorer = new RiskScorer();
  const riskScore = await scorer.calculate(impact);
  // 结果: confidenceLevel=95%, severity=1 -> Level 1

  // 3. 自动执行
  const gate = new DecisionGate();
  const decision = await gate.route(riskScore);
  // 决策: AUTO_EXECUTE

  // 4. 执行迁移
  const executor = new UpgradeExecutor();
  await executor.execute({
    migration: 'ALTER TABLE players ADD COLUMN daily_eggs_produced BIGINT DEFAULT 0',
    backup: true,
    monitor: true
  });

  // 5. 记录
  await auditLog.record({
    type: 'UPGRADE_COMPLETED',
    level: 1,
    duration: '2 seconds',
    status: 'SUCCESS'
  });
}
```

### 场景B: 经济模型调整 (Level 2)

```typescript
// 场景: Design AI 提议调整代币兑换汇率
async function economicAdjustmentScenario() {
  // 1. 提出变更
  const proposal = {
    type: 'UPDATE_CONFIG',
    target: 'token_exchange_rate',
    from: 30,  // 30 EGGS = 1 AIGG
    to: 25,    // 25 EGGS = 1 AIGG (提高了兑换价值)
    reason: '奖励活跃玩家，鼓励代币兑换'
  };

  // 2. 分析影响
  const impact = await analyzer.analyze(proposal);
  // 影响:
  // - 日均兑换量可能增加20-30%
  // - 代币流入减少15%
  // - 影响所有有兑换意愿的玩家

  // 3. 风险评分
  const risk = await scorer.calculate(impact);
  // confidenceLevel=72%, severity=6 -> Level 2 (异步审核)

  // 4. 触发异步审核流程
  const review = await reviewSystem.createReview({
    proposal,
    deadline: Date.now() + 24 * 3600 * 1000,  // 24小时内决议
    requiredApprovers: ['design_lead', 'operations_lead'],
    contextData: {
      historicalExchangeRates: [...],
      playerBehaviorPrediction: {...},
      tokenomicsImpact: {...}
    }
  });

  // 5. Operations AI检查经济模型
  const economicsCheck = await operations_ai.analyzeTokenomics({
    currentExchangeRate: 30,
    proposedRate: 25,
    historicalData: '6 months',
    projections: '3 months forward'
  });

  if (economicsCheck.riskLevel === 'ACCEPTABLE') {
    // 6. 可自动执行，但需要人工复审
    await review.autoApproveWithCaveats({
      condition: 'only_if_manual_review_approved',
      caveats: [
        '监控日均兑换量',
        '如果增长超过35%，立即回滚',
        '第一周内不允许进一步调整'
      ]
    });
  }
}
```

### 场景C: 紧急修复 (加急Level 3)

```typescript
// 场景: 发现EGGS余额计算错误，需要紧急修复
async function emergencyFixScenario() {
  // 1. 检测到数据不一致
  const integrityCheck = new IntegrityGuardian();
  const issues = await integrityCheck.check();
  // 发现: 部分玩家的eggs_balance与事务记录不符，差异共计50万EGGS

  // 2. 立即触发告警
  const alert = {
    severity: 'CRITICAL',
    message: '检测到系统性数据不一致',
    affectedPlayersCount: 2341,
    affectedAmount: 500000,
    potentialCause: '昨日灰度升级异常'
  };

  await alertSystem.send(alert, {
    channels: ['slack', 'pagerduty', 'sms'],
    recipients: ['on_call_engineer', 'cto', 'operations_lead']
  });

  // 3. 立即启动故障排查
  const diagnosis = await diagnosticEngine.run({
    targetIssue: 'egg_balance_inconsistency',
    timeline: 'last_24_hours',
    includeLogs: true,
    includeEventStore: true
  });

  // 4. 生成修复方案
  const fixProposal = {
    type: 'DATA_REPAIR',
    action: 'REBUILD_FROM_EVENT_STORE',
    affectedPlayers: diagnosis.affectedPlayers,
    estimatedDuration: '5 minutes',
    rollback: 'FULL_BACKUP_RESTORE'
  };

  // 5. CEO级别快速审批 (紧急流程)
  const emergencyApproval = await ceoApprovalFlow.requestImmediate({
    proposal: fixProposal,
    urgency: 'CRITICAL',
    affectedAmount: alert.affectedAmount,
    businessImpact: '阻止玩家游戏，可能导致严重流失'
  });

  if (emergencyApproval.approved) {
    // 6. 执行修复 (未进行灰度)
    const repair = new DataRepairEngine();
    const result = await repair.execute({
      playersToRepair: diagnosis.affectedPlayers,
      strategy: 'REBUILD_FROM_EVENT_STORE',
      parallel: true,
      maxConcurrency: 100,
      monitor: true
    });

    // 7. 持续监控
    const monitor = setInterval(async () => {
      const status = await repair.getProgress();
      console.log(`修复进度: ${status.completed}/${status.total}`);

      if (status.completed === status.total) {
        clearInterval(monitor);
        await alertSystem.send({
          severity: 'INFO',
          message: '数据修复完成，系统恢复正常'
        });
      }
    }, 10000);
  } else {
    // 如果CEO拒绝，则执行回滚和恢复步骤
    await emergencyRollback.execute();
  }
}
```

---

## 完整TypeScript实现

以下是生产级的完整实现代码，包含所有核心模块。

### 1. 基础类型定义

```typescript
// file: types/contracts.ts

/**
 * 数据契约的核心类型定义
 * 所有数据接口必须遵循此规范，确保向后兼容性
 */

// ============ 契约版本信息 ============
export interface ContractVersion {
  name: string;              // 契约名称，如 'PlayerContract'
  version: string;           // 版本号，如 'v1', 'v2'
  description: string;       // 契约描述
  fields: FieldDefinition[]; // 字段定义
  indexes: IndexDefinition[]; // 索引定义
  publishedAt: number;       // 发布时间戳
  deprecatedAt?: number;     // 弃用时间戳 (如果已弃用)
  changelog: ChangeLog[];    // 变更日志
}

export interface FieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'bigint' | 'timestamp' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: unknown[];
  };
  // 向后兼容性标记
  addedInVersion?: string;   // 该字段首次出现的版本
  deprecatedInVersion?: string; // 弃用版本
}

export interface IndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
  sparse?: boolean;
}

export interface ChangeLog {
  version: string;
  timestamp: number;
  changes: string[];
  author: string;
  breakingChanges?: boolean;
}

// ============ 四大核心契约 ============

/**
 * PlayerContract v1 - 玩家账户数据契约
 * 消费者: 登录系统、排行榜、邀请系统、玩家信息展示
 */
export interface PlayerContractV1 {
  id: string;                    // 玩家唯一ID
  wallet_address: string;        // 钱包地址（不可变）
  nickname?: string;             // 昵称（可选）
  farm_code: string;            // 农场邀请码
  registered_at: number;        // 注册时间戳
  eggs_balance: number;         // EGGS余额（缓存字段）
}

/**
 * FarmContract v1 - 农场数据契约
 * 消费者: 产蛋引擎、库存管理、农场展示界面
 */
export interface FarmContractV1 {
  farm_id: string;              // 农场ID
  player_id: string;            // 玩家ID（外键）
  chicken_count: number;        // 母鸡数量
  egg_inventory: number;        // 仓库中的EGGS数量
  egg_capacity: number;         // 仓库容量（固定30）
  next_production_at: number;   // 下次产蛋时间戳
}

/**
 * StealContract v1 - 偷蛋事件契约
 * 消费者: 偷蛋决策、统计分析、对战历史、排行榜
 */
export interface StealContractV1 {
  event_id: string;             // 事件ID
  attacker_id: string;          // 偷蛋者ID
  defender_id: string;          // 被偷者ID
  result: 'success' | 'fail' | 'bumper_crop'; // 结果
  eggs_amount: number;          // 偷取EGGS数量
  timestamp: number;            // 事件时间戳
}

/**
 * TokenContract v1 - 代币兑换契约
 * 消费者: 钱包系统、交易所、财务报表、用户财资展示
 */
export interface TokenContractV1 {
  player_id: string;            // 玩家ID
  aigg_balance: number;         // $AIGG代币余额
  total_converted: number;      // 累计转换数量
  conversion_rate: number;      // 当前汇率（如30:1）
}

// ============ 向后兼容适配器 ============

/**
 * PlayerContract v2 - 扩展版本
 * 新增字段: last_login_at, total_eggs_earned
 * 保持与v1兼容: 旧消费者可继续使用v1字段
 */
export interface PlayerContractV2 extends PlayerContractV1 {
  last_login_at?: number;       // 新增: 最后登录时间
  total_eggs_earned?: number;   // 新增: 累计产蛋数
}

// ============ 契约变更提案 ============

export interface ContractChangeProposal {
  id: string;
  contractName: string;
  currentVersion: string;
  proposedVersion: string;
  changes: ContractChange[];
  rationale: string;
  proposedBy: string;
  proposedAt: number;
}

export interface ContractChange {
  type: 'ADD_FIELD' | 'REMOVE_FIELD' | 'MODIFY_FIELD' | 'RENAME_FIELD' | 'ADD_INDEX' | 'REMOVE_INDEX';
  field?: string;
  newField?: string;
  oldType?: string;
  newType?: string;
  required?: boolean;
  default?: unknown;
  breaking?: boolean;
}

// ============ 兼容性检查结果 ============

export interface CompatibilityCheckResult {
  compatible: boolean;
  breakingChanges: string[];
  warnings: string[];
  affectedConsumers: string[];
  mitigationStrategies: string[];
  score: number; // 0-100, 100表示完全兼容
}
```

### 2. 契约验证器

```typescript
// file: services/contract-validator.ts

import { ContractVersion, ContractChangeProposal, CompatibilityCheckResult } from '../types/contracts';

/**
 * 契约验证器 - 确保所有契约变更向后兼容
 * 职责:
 * 1. 验证新契约遵循命名和类型规范
 * 2. 检测破坏性变更
 * 3. 生成兼容性报告
 * 4. 为适配器提供指导信息
 */
export class ContractValidator {
  private contractRegistry: Map<string, ContractVersion[]> = new Map();

  /**
   * 注册已发布的契约
   */
  registerContract(contract: ContractVersion): void {
    const key = contract.name;
    if (!this.contractRegistry.has(key)) {
      this.contractRegistry.set(key, []);
    }
    this.contractRegistry.get(key)!.push(contract);
  }

   /**
   * 验证新的契约变更提案
   * 返回: 兼容性检查结果及详细报告
   */
  async validateProposal(proposal: ContractChangeProposal): Promise<CompatibilityCheckResult> {
    const previousVersions = this.contractRegistry.get(proposal.contractName) || [];

    if (previousVersions.length === 0) {
      throw new Error(`契约 ${proposal.contractName} 未注册`);
    }

    const latestVersion = previousVersions[previousVersions.length - 1];
    const breakingChanges: string[] = [];
    const warnings: string[] = [];
    let compatibilityScore = 100;

    // 检查每个变更
    for (const change of proposal.changes) {
      switch (change.type) {
        case 'REMOVE_FIELD':
          // 字段删除总是破坏性的
          breakingChanges.push(
            `字段删除: ${change.field} - v1消费者无法访问此字段`
          );
          compatibilityScore -= 30;
          break;

        case 'MODIFY_FIELD':
          // 检查字段类型是否兼容
          if (!this.isTypeCompatible(change.oldType!, change.newType!)) {
            breakingChanges.push(
              `字段类型不兼容: ${change.field} (${change.oldType} -> ${change.newType})`
            );
            compatibilityScore -= 25;
          } else if (this.isShrinkingType(change.oldType!, change.newType!)) {
            // 类型范围缩小也是危险的
            warnings.push(
              `字段类型范围缩小: ${change.field} (${change.oldType} -> ${change.newType})`
            );
            compatibilityScore -= 10;
          }
          break;

        case 'RENAME_FIELD':
          // 字段重命名会导致旧代码无法访问
          warnings.push(
            `字段重命名: ${change.field} -> ${change.newField}`
          );
          compatibilityScore -= 15;
          break;

        case 'ADD_FIELD':
          // 新增字段通常是安全的，但如果设为required会有风险
          if (change.required && !change.default) {
            warnings.push(
              `新增必填字段: ${change.field} - 旧消费者可能无法填充`
            );
            compatibilityScore -= 5;
          }
          break;

        case 'ADD_INDEX':
        case 'REMOVE_INDEX':
          // 索引变更通常不影响兼容性，但可能影响性能
          if (change.type === 'REMOVE_INDEX') {
            warnings.push(
              `索引移除可能影响查询性能`
            );
            compatibilityScore -= 3;
          }
          break;
      }
    }

    // 最终兼容性评分
    compatibilityScore = Math.max(0, compatibilityScore);

    return {
      compatible: breakingChanges.length === 0 && compatibilityScore >= 70,
      breakingChanges,
      warnings,
      affectedConsumers: this.identifyAffectedConsumers(proposal),
      mitigationStrategies: this.generateMitigationStrategies(proposal, breakingChanges),
      score: compatibilityScore
    };
  }

  /**
   * 检查类型是否兼容
   * 兼容规则:
   * - string -> string: ✓
   * - number -> bigint: ✓ (可容纳更大的值)
   * - number -> string: ✗ (客户端代码会破坏)
   */
  private isTypeCompatible(oldType: string, newType: string): boolean {
    const compatibilityMap: Record<string, string[]> = {
      'number': ['number', 'bigint', 'string'],
      'bigint': ['bigint', 'string'],
      'string': ['string'],
      'boolean': ['boolean'],
      'timestamp': ['timestamp', 'number'],
      'object': ['object'],
      'array': ['array']
    };

    return (compatibilityMap[oldType] || []).includes(newType);
  }

  /**
   * 检查类型范围是否缩小
   * 如: bigint -> number (数值范围缩小)
   */
  private isShrinkingType(oldType: string, newType: string): boolean {
    const shrinkingPairs = [
      ['bigint', 'number'],
      ['string', 'number'],
      ['object', 'string']
    ];

    return shrinkingPairs.some(([from, to]) => oldType === from && newType === to);
  }

  /**
   * 识别受影响的消费者
   * 在实际系统中，应该从依赖图谱中查询
   */
  private identifyAffectedConsumers(proposal: ContractChangeProposal): string[] {
    // 这是示例实现，真实系统应该维护一个依赖关系数据库
    const consumerMap: Record<string, string[]> = {
      'PlayerContract': ['排行榜系统', '登录系统', '邀请系统'],
      'FarmContract': ['产蛋引擎', '库存管理', '农场展示'],
      'StealContract': ['偷蛋AI', '统计分析', '对战历史'],
      'TokenContract': ['钱包系统', '交易所', '财务报表']
    };

    return consumerMap[proposal.contractName] || [];
  }

  /**
   * 生成缓解策略
   */
  private generateMitigationStrategies(
    proposal: ContractChangeProposal,
    breakingChanges: string[]
  ): string[] {
    const strategies: string[] = [];

    for (const change of proposal.changes) {
      if (change.type === 'REMOVE_FIELD') {
        strategies.push(
          `实现${proposal.contractName}适配器，为v1消费者提供dummy值`
        );
        strategies.push(
          `在v1 API中保留该字段，返回默认值`
        );
        strategies.push(
          `发布迁移指南，指导消费者升级到v2`
        );
      } else if (change.type === 'RENAME_FIELD') {
        strategies.push(
          `在新版本中同时保留旧字段名（deprecated标记）`
        );
        strategies.push(
          `提供字段别名映射`
        );
      }
    }

    return strategies;
  }

  /**
   * 生成契约演进报告
   */
  generateEvolutionReport(contractName: string): string {
    const versions = this.contractRegistry.get(contractName) || [];

    let report = `# ${contractName} 演进报告\n\n`;
    report += `总版本数: ${versions.length}\n\n`;

    for (const version of versions) {
      report += `## ${version.version}\n`;
      report += `发布时间: ${new Date(version.publishedAt).toISOString()}\n`;
      report += `字段数: ${version.fields.length}\n`;
      report += `\n**变更日志:**\n`;

      for (const log of version.changelog) {
        report += `- ${log.version}: ${log.changes.join(', ')}\n`;
      }

      report += '\n';
    }

    return report;
  }
}
```

### 3. 影响分析引擎

```typescript
// file: services/impact-analyzer.ts

/**
 * 影响分析引擎
 * 职责:
 * 1. 构建数据依赖图谱
 * 2. 计算受影响的消费者、玩家、交易
 * 3. 评估数据量、金额、风险范围
 * 4. 生成影响报告
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  type: 'contract' | 'consumer' | 'table' | 'api';
  name: string;
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'reads' | 'writes' | 'depends_on';
  usage: string[];  // 详细的使用方式
}

export interface ImpactAnalysis {
  affectedConsumers: string[];
  affectedTables: string[];
  affectedPlayerCount: number;
  affectedTransactionCount: number;
  estimatedRiskAmount: number;  // 涉及的$AIGG金额
  migrationComplexity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dataLossRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  performanceImpact: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedDowntime: number;  // 秒
  details: Record<string, unknown>;
}

export class ImpactAnalyzer {
  private dependencyGraph: DependencyGraph;
  private contractRegistry: Map<string, unknown>;
  private database: any;  // 数据库连接

  constructor(database: any, contractRegistry: Map<string, unknown>) {
    this.database = database;
    this.contractRegistry = contractRegistry;
    this.dependencyGraph = this.buildDependencyGraph();
  }

  /**
   * 构建完整的依赖图谱
   */
  private buildDependencyGraph(): DependencyGraph {
    // 这是示例实现，真实系统应该动态构建
    return {
      nodes: [
        {
          id: 'PlayerContract',
          type: 'contract',
          name: 'Player Contract',
          criticality: 'CRITICAL'
        },
        {
          id: 'leaderboard_system',
          type: 'consumer',
          name: '排行榜系统',
          criticality: 'HIGH'
        },
        {
          id: 'login_system',
          type: 'consumer',
          name: '登录系统',
          criticality: 'CRITICAL'
        },
        {
          id: 'players_table',
          type: 'table',
          name: 'players表',
          criticality: 'CRITICAL'
        },
        // ... 更多节点
      ],
      edges: [
        {
          from: 'PlayerContract',
          to: 'leaderboard_system',
          type: 'depends_on',
          usage: ['读取id, wallet_address, eggs_balance']
        },
        {
          from: 'PlayerContract',
          to: 'login_system',
          type: 'depends_on',
          usage: ['读取wallet_address, farm_code, registered_at']
        },
        {
          from: 'players_table',
          to: 'PlayerContract',
          type: 'reads',
          usage: ['提供数据源']
        },
        // ... 更多边
      ]
    };
  }

  /**
   * 分析变更的影响范围
   */
  async analyze(change: any): Promise<ImpactAnalysis> {
    const affectedConsumers = this.findAffectedConsumers(change);
    const affectedTables = this.findAffectedTables(change);

    // 查询数据库统计
    const playerCount = await this.database.count('players');
    const affectedPlayers = await this.estimateAffectedPlayers(change, playerCount);
    const affectedTransactions = await this.countAffectedTransactions(change);
    const estimatedRiskAmount = await this.estimateRiskAmount(change);

    // 评估复杂度
    const migrationComplexity = this.assessMigrationComplexity(change);
    const dataLossRisk = this.assessDataLossRisk(change);
    const performanceImpact = this.assessPerformanceImpact(change);
    const estimatedDowntime = this.estimateDowntime(change);

    return {
      affectedConsumers,
      affectedTables,
      affectedPlayerCount: affectedPlayers,
      affectedTransactionCount: affectedTransactions,
      estimatedRiskAmount,
      migrationComplexity,
      dataLossRisk,
      performanceImpact,
      estimatedDowntime,
      details: {
        dependencyChain: this.findDependencyChain(change),
        relatedQueries: this.findRelatedQueries(change),
        potentialIssues: this.identifyPotentialIssues(change)
      }
    };
  }

  /**
   * 查找受影响的消费者
   */
  private findAffectedConsumers(change: any): string[] {
    const affectedNode = this.dependencyGraph.nodes.find(
      n => n.id === change.target || n.name === change.targetName
    );

    if (!affectedNode) return [];

    // 找到所有依赖此节点的消费者
    const consumers: string[] = [];
    const queue = [affectedNode.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const outgoing = this.dependencyGraph.edges.filter(e => e.from === nodeId);
      for (const edge of outgoing) {
        const targetNode = this.dependencyGraph.nodes.find(n => n.id === edge.to);
        if (targetNode?.type === 'consumer') {
          consumers.push(targetNode.name);
        }
        queue.push(edge.to);
      }
    }

    return consumers;
  }

  /**
   * 估算受影响的玩家数
   */
  private async estimateAffectedPlayers(change: any, totalCount: number): Promise<number> {
    // 根据变更类型估算
    if (change.type === 'ADD_COLUMN') {
      // 新增字段影响所有玩家（会被初始化）
      return totalCount;
    }

    if (change.type === 'DROP_COLUMN') {
      // 查询该字段非NULL的记录数
      const query = `SELECT COUNT(*) FROM ${change.table} WHERE ${change.column} IS NOT NULL`;
      const result = await this.database.query(query);
      return result[0]?.count || 0;
    }

    if (change.type === 'UPDATE_CONFIG') {
      // 配置变更影响所有活跃玩家
      return totalCount;
    }

    return totalCount;
  }

  /**
   * 计算受影响的交易数
   */
  private async countAffectedTransactions(change: any): Promise<number> {
    if (change.affectedTable === 'eggs_transactions') {
      // 过去30天的相关交易
      const query = `
        SELECT COUNT(*) as count FROM eggs_transactions
        WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      `;
      const result = await this.database.query(query);
      return result[0]?.count || 0;
    }

    return 0;
  }

  /**
   * 估算风险金额（涉及的$AIGG金额）
   */
  private async estimateRiskAmount(change: any): Promise<number> {
    // 查询过去7天的代币交易总额
    const query = `
      SELECT SUM(aigg_amount) as total FROM eggs_transactions
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      AND transaction_type = 'exchange'
    `;
    const result = await this.database.query(query);
    const weeklyTotal = result[0]?.total || 0;

    // 风险金额 = 周均 × 受影响比例
    const affectedRatio = (await this.estimateAffectedPlayers(change, 1)) / 1;
    return weeklyTotal * (affectedRatio / 7);
  }

  /**
   * 评估迁移复杂度
   */
  private assessMigrationComplexity(change: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (change.type === 'ADD_COLUMN') return 'LOW';
    if (change.type === 'ADD_INDEX') return 'LOW';
    if (change.type === 'UPDATE_CONFIG') return 'LOW';
    if (change.type === 'RENAME_FIELD') return 'MEDIUM';
    if (change.type === 'MODIFY_FIELD') return 'MEDIUM';
    if (change.type === 'DROP_COLUMN') return 'HIGH';
    if (change.type === 'CREATE_TABLE') return 'MEDIUM';
    return 'CRITICAL';
  }

  /**
   * 评估数据丢失风险
   */
  private assessDataLossRisk(change: any): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' {
    if (['ADD_COLUMN', 'ADD_INDEX', 'UPDATE_CONFIG'].includes(change.type)) return 'NONE';
    if (['RENAME_FIELD', 'MODIFY_FIELD'].includes(change.type)) return 'LOW';
    if (['DROP_COLUMN', 'DROP_TABLE'].includes(change.type)) return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * 评估性能影响
   */
  private assessPerformanceImpact(change: any): 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH' {
    if (change.type === 'ADD_INDEX') return 'NEGLIGIBLE';  // 会加速查询
    if (change.type === 'ADD_COLUMN') return 'LOW';        // 轻微增加表大小
    if (change.type === 'DROP_INDEX') return 'MEDIUM';     // 查询变慢
    if (change.type === 'DROP_COLUMN') return 'LOW';       // 减少表大小
    return 'LOW';
  }

  /**
   * 估算停机时间（秒）
   */
  private estimateDowntime(change: any): number {
    // 大表上的DDL操作需要时间
    if (change.type === 'ADD_COLUMN') return 2;   // 2秒
    if (change.type === 'DROP_COLUMN') return 5;  // 5秒
    if (change.type === 'ADD_INDEX') return 10;   // 10秒（取决于表大小）
    if (change.type === 'UPDATE_CONFIG') return 0; // 0秒（配置变更无停机）
    return 1;
  }

  private findDependencyChain(change: any): string[] {
    // 返回影响链: A -> B -> C
    return ['players表', 'PlayerContract', '排行榜系统', 'API'];
  }

  private findRelatedQueries(change: any): string[] {
    return [
      'SELECT * FROM players WHERE eggs_balance > 1000',
      'SELECT id, eggs_balance FROM players ORDER BY eggs_balance DESC',
      'SELECT COUNT(*) FROM players GROUP BY farm_code'
    ];
  }

  private findAffectedTables(change: any): string[] {
    return change.affectedTable ? [change.affectedTable] : [];
  }

  private identifyPotentialIssues(change: any): string[] {
    const issues: string[] = [];

    if (change.type === 'DROP_COLUMN') {
      issues.push('数据丢失风险 - 无法恢复删除的列');
      issues.push('依赖该列的查询会失败');
    }

    if (change.type === 'RENAME_FIELD') {
      issues.push('旧字段名的引用会失败');
      issues.push('需要同时更新所有消费者代码');
    }

    return issues;
  }
}
```

### 4. 风险评分器

```typescript
// file: services/risk-scorer.ts

/**
 * 风险评分器
 * 职责:
 * 1. 基于多个维度计算综合风险分
 * 2. 确定推荐的审批级别
 * 3. 生成风险报告和建议
 */
export interface RiskScore {
  severity: number;              // 1-10，变更的内在风险
  affectedScope: number;         // 0-10，影响范围
  monetaryRisk: number;          // 0-10，金额风险
  historicalFailureRate: number; // 0-10，历史失败率
  aiConfidenceLevel: number;     // 0-100%，AI的置信度
  recommendedLevel: number;      // 1-4，推荐审批级别
  overallScore: number;          // 0-100，综合分
  status: 'AUTO_APPROVED' | 'ASYNC_REVIEW' | 'MANUAL_APPROVAL' | 'CEO_APPROVAL';
  reasoning: string;             // 决策理由
  recommendations: string[];     // 建议措施
}

export class RiskScorer {
  private historicalData: Map<string, { successes: number; failures: number }> = new Map();
  private aiConfidenceModel: any;

  /**
   * 计算综合风险分
   */
  async calculate(impact: any): Promise<RiskScore> {
    // 1. 计算各维度的风险分

    // 变更严重度 (1-10)
    const severity = this.calculateSeverity(impact.change);

    // 影响范围 (0-10)
    const affectedScope = this.calculateAffectedScope(
      impact.affectedPlayerCount,
      impact.estimatedRiskAmount
    );

    // 金额风险 (0-10)
    const monetaryRisk = this.calculateMonetaryRisk(impact.estimatedRiskAmount);

    // 历史失败率 (0-10)
    const historicalFailureRate = this.getHistoricalFailureRate(impact.change.type);

    // AI置信度 (0-100%)
    const aiConfidenceLevel = await this.calculateAIConfidence(impact);

    // 2. 加权综合
    const overallScore =
      (severity * 0.35) +
      (affectedScope * 0.25) +
      (monetaryRisk * 0.20) +
      (historicalFailureRate * 0.10) +
      ((100 - aiConfidenceLevel) * 0.10);

    // 3. 确定推荐级别
    const recommendedLevel = this.determineLevel(overallScore, aiConfidenceLevel);

    // 4. 生成理由和建议
    const reasoning = this.generateReasoning(
      severity,
      affectedScope,
      monetaryRisk,
      historicalFailureRate,
      aiConfidenceLevel
    );

    const recommendations = this.generateRecommendations(
      recommendedLevel,
      impact,
      severity
    );

    return {
      severity,
      affectedScope,
      monetaryRisk,
      historicalFailureRate,
      aiConfidenceLevel,
      recommendedLevel,
      overallScore: Math.round(overallScore),
      status: this.levelToStatus(recommendedLevel),
      reasoning,
      recommendations
    };
  }

  /**
   * 计算变更严重度
   * 规则:
   * - 新增字段: 1-2 (很低)
   * - 新增索引: 1 (最低)
   * - 字段重命名: 5 (中等)
   * - 字段类型变更: 7 (高)
   * - 字段删除: 10 (最高)
   * - 表删除: 10 (最高)
   * - 经济参数调整: 8-10 (很高)
   */
  private calculateSeverity(change: any): number {
    const severityMap: Record<string, number> = {
      'ADD_COLUMN': 1,
      'ADD_INDEX': 1,
      'UPDATE_CONFIG': 3,
      'RENAME_FIELD': 5,
      'MODIFY_FIELD': 7,
      'DROP_COLUMN': 10,
      'DROP_TABLE': 10,
      'UPDATE_ECONOMIC_PARAM': 9,
      'UPDATE_TOKEN_RATE': 10
    };

    return severityMap[change.type] || 5;
  }

  /**
   * 计算影响范围
   * 考虑受影响的玩家数和金额
   */
  private calculateAffectedScope(playerCount: number, riskAmount: number): number {
    // 假设总玩家数为125000
    const totalPlayers = 125000;
    const dailyTokenFlow = 3000000;  // 日均代币流入

    const playerRatio = playerCount / totalPlayers;
    const amountRatio = riskAmount / dailyTokenFlow;

    // 取较大值
    const ratio = Math.max(playerRatio, amountRatio);

    // 按比例转换为 0-10
    return Math.min(10, ratio * 10);
  }

  /**
   * 计算金额风险
   */
  private calculateMonetaryRisk(riskAmount: number): number {
    const thresholds = [
      { max: 10000, score: 1 },      // < 1万 AIGG
      { max: 50000, score: 3 },      // < 5万 AIGG
      { max: 100000, score: 5 },     // < 10万 AIGG
      { max: 500000, score: 7 },     // < 50万 AIGG
      { max: Infinity, score: 10 }   // >= 50万 AIGG
    ];

    for (const threshold of thresholds) {
      if (riskAmount <= threshold.max) {
        return threshold.score;
      }
    }

    return 10;
  }

  /**
   * 获取历史失败率
   */
  private getHistoricalFailureRate(changeType: string): number {
    const stats = this.historicalData.get(changeType);
    if (!stats) return 0;

    const total = stats.successes + stats.failures;
    if (total === 0) return 0;

    const failureRate = stats.failures / total;
    return Math.min(10, failureRate * 10);
  }

  /**
   * 计算AI置信度
   * 考虑因素:
   * - 变更类型的历史成功率
   * - 影响范围的明确度
   * - 是否有相似的历史案例
   */
  private async calculateAIConfidence(impact: any): Promise<number> {
    let confidence = 50;  // 基础分50

    // 因素1: 变更类型的熟悉度
    const changeType = impact.change.type;
    const typeConfidence = this.getTypeConfidence(changeType);
    confidence += typeConfidence * 0.3;

    // 因素2: 影响范围的清晰度
    if (impact.affectedConsumers && impact.affectedConsumers.length > 0) {
      confidence += 5;  // 清晰的影响范围
    }

    // 因素3: 是否有测试计划
    if (impact.hasTestPlan) {
      confidence += 10;
    }

    // 因素4: 是否有回滚计划
    if (impact.hasRollbackPlan) {
      confidence += 10;
    }

    // 因素5: 是否有备份
    if (impact.hasBackup) {
      confidence += 10;
    }

    // 因素6: 历史相似案例的成功率
    const similarCases = this.findSimilarHistoricalCases(impact.change);
    if (similarCases.length > 0) {
      const successRate = similarCases.filter(c => c.success).length / similarCases.length;
      confidence += successRate * 15;
    }

    return Math.min(100, confidence);
  }

  /**
   * 获取变更类型的AI熟悉度
   */
  private getTypeConfidence(changeType: string): number {
    const typeConfidenceMap: Record<string, number> = {
      'ADD_COLUMN': 95,
      'ADD_INDEX': 95,
      'UPDATE_CONFIG': 90,
      'RENAME_FIELD': 70,
      'MODIFY_FIELD': 60,
      'DROP_COLUMN': 50,
      'DROP_TABLE': 40,
      'UPDATE_ECONOMIC_PARAM': 60
    };

    return typeConfidenceMap[changeType] || 50;
  }

  /**
   * 查找相似的历史案例
   */
  private findSimilarHistoricalCases(change: any): any[] {
    // 在实际系统中，应该查询历史数据库
    return [];
  }

  /**
   * 根据综合分确定推荐级别
   */
  private determineLevel(
    overallScore: number,
    aiConfidence: number
  ): number {
    // Level 1: 自动执行 (高置信度 + 低风险)
    if (aiConfidence > 90 && overallScore < 25) {
      return 1;
    }

    // Level 2: 异步审核 (中等置信度 + 中等风险)
    if (aiConfidence >= 60 && overallScore < 50) {
      return 2;
    }

    // Level 3: 人工审批 (低置信度或高风险)
    if (overallScore < 80) {
      return 3;
    }

    // Level 4: CEO审批 (非常高风险)
    return 4;
  }

  /**
   * 将级别转换为状态
   */
  private levelToStatus(level: number): 'AUTO_APPROVED' | 'ASYNC_REVIEW' | 'MANUAL_APPROVAL' | 'CEO_APPROVAL' {
    const statusMap = {
      1: 'AUTO_APPROVED',
      2: 'ASYNC_REVIEW',
      3: 'MANUAL_APPROVAL',
      4: 'CEO_APPROVAL'
    };

    return statusMap[level as keyof typeof statusMap] || 'MANUAL_APPROVAL';
  }

  /**
   * 生成决策理由
   */
  private generateReasoning(
    severity: number,
    affectedScope: number,
    monetaryRisk: number,
    historicalFailureRate: number,
    aiConfidence: number
  ): string {
    let reasoning = '';

    if (severity < 3) {
      reasoning += '变更风险低，';
    } else if (severity < 7) {
      reasoning += '变更风险中等，';
    } else {
      reasoning += '变更风险高，';
    }

    if (affectedScope < 3) {
      reasoning += '影响范围小，';
    } else if (affectedScope < 7) {
      reasoning += '影响范围中等，';
    } else {
      reasoning += '影响范围广泛，';
    }

    if (monetaryRisk < 3) {
      reasoning += '金额风险低。';
    } else if (monetaryRisk < 7) {
      reasoning += '金额风险中等。';
    } else {
      reasoning += '金额风险高。';
    }

    reasoning += ` AI置信度为${aiConfidence.toFixed(0)}%。`;

    return reasoning;
  }

  /**
   * 生成建议措施
   */
  private generateRecommendations(
    level: number,
    impact: any,
    severity: number
  ): string[] {
    const recommendations: string[] = [];

    // 通用建议
    recommendations.push('确保所有变更已在测试环境验证');
    recommendations.push('准备完整的回滚计划');

    // 级别特定建议
    if (level >= 2) {
      recommendations.push('在灰度阶段监控错误率和性能指标');
    }

    if (level >= 3) {
      recommendations.push('邀请相关团队进行技术评审');
      recommendations.push('准备跨部门沟通计划');
    }

    if (level >= 4) {
      recommendations.push('获取CEO和CFO的明确批准');
      recommendations.push('准备玩家公告和补偿方案');
      recommendations.push('安排专责团队全程监控');
    }

    // 风险特定建议
    if (severity >= 8) {
      recommendations.push('考虑延期至低峰期（北京时间凌晨）');
    }

    if (impact.migrationComplexity === 'CRITICAL') {
      recommendations.push('进行全面的压力测试');
      recommendations.push('准备多个回滚选项');
    }

    return recommendations;
  }
}
```

### 5. 决策网关

```typescript
// file: services/decision-gate.ts

/**
 * 决策网关
 * 职责:
 * 1. 根据风险评分路由到不同的审批流程
 * 2. 管理异步审核和人工审批
 * 3. 执行自动批准的决策
 * 4. 记录决策日志
 */
export interface UpgradeDecision {
  proposalId: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' | 'PENDING_APPROVAL';
  level: number;
  approvedBy?: string;
  approvedAt?: number;
  reason?: string;
  conditions?: string[];  // 批准条件
}

export class DecisionGate {
  private reviewQueue: Map<string, any> = new Map();
  private auditLog: any[];

  /**
   * 路由决策到不同的流程
   */
  async route(riskScore: any): Promise<UpgradeDecision> {
    const proposalId = riskScore.proposalId;
    const level = riskScore.recommendedLevel;

    if (level === 1) {
      // Level 1: 自动执行
      return this.autoApprove(proposalId, riskScore);
    } else if (level === 2) {
      // Level 2: 异步审核
      return this.asyncReview(proposalId, riskScore);
    } else if (level === 3) {
      // Level 3: 人工审批
      return this.manualApproval(proposalId, riskScore);
    } else {
      // Level 4: CEO审批
      return this.ceoApproval(proposalId, riskScore);
    }
  }

  /**
   * Level 1: 自动执行
   */
  private async autoApprove(proposalId: string, riskScore: any): Promise<UpgradeDecision> {
    const decision: UpgradeDecision = {
      proposalId,
      status: 'APPROVED',
      level: 1,
      approvedBy: 'SYSTEM',
      approvedAt: Date.now(),
      reason: riskScore.reasoning,
      conditions: [
        '风险分数低于25',
        'AI置信度高于90%',
        '自动监控已启用'
      ]
    };

    await this.logDecision(decision);
    return decision;
  }

  /**
   * Level 2: 异步审核
   * 发送给团队审核，同时可能自动执行
   */
  private async asyncReview(proposalId: string, riskScore: any): Promise<UpgradeDecision> {
    const decision: UpgradeDecision = {
      proposalId,
      status: 'PENDING_REVIEW',
      level: 2,
      reason: riskScore.reasoning,
      conditions: [
        '需要Design Lead或Operations Lead审核',
        '24小时内做决议',
        '如无异议，可自动执行'
      ]
    };

    // 添加到审核队列
    this.reviewQueue.set(proposalId, {
      proposal: riskScore,
      createdAt: Date.now(),
      deadline: Date.now() + 24 * 3600 * 1000,
      reviewers: ['design_lead', 'operations_lead'],
      votes: []
    });

    // 发送通知（示例）
    await this.notifyReviewers(proposalId, riskScore);

    await this.logDecision(decision);
    return decision;
  }

  /**
   * Level 3: 人工审批
   */
  private async manualApproval(proposalId: string, riskScore: any): Promise<UpgradeDecision> {
    const decision: UpgradeDecision = {
      proposalId,
      status: 'PENDING_APPROVAL',
      level: 3,
      reason: riskScore.reasoning,
      conditions: [
        '需要CTO或Lead Engineer人工审批',
        '72小时内做决议',
        '必须进行技术评审',
        '必须明确风险理解和缓解措施'
      ]
    };

    // 发送给CTO（示例）
    await this.escalateToCTO(proposalId, riskScore);

    await this.logDecision(decision);
    return decision;
  }

  /**
   * Level 4: CEO审批
   */
  private async ceoApproval(proposalId: string, riskScore: any): Promise<UpgradeDecision> {
    const decision: UpgradeDecision = {
      proposalId,
      status: 'PENDING_APPROVAL',
      level: 4,
      reason: riskScore.reasoning,
      conditions: [
        '需要CEO、CFO和CTO联合审批',
        '需要董事会通知',
        '需要法务评审',
        '需要风险管理部门批准',
        '需要完整的事后分析流程'
      ]
    };

    // 发送给CEO办公室（示例）
    await this.escalateToCEO(proposalId, riskScore);

    await this.logDecision(decision);
    return decision;
  }

  /**
   * 处理审核完成
   */
  async completeReview(proposalId: string, approved: boolean, reviewer: string, comments: string): Promise<void> {
    const review = this.reviewQueue.get(proposalId);
    if (!review) {
      throw new Error(`审核未找到: ${proposalId}`);
    }

    review.votes.push({
      reviewer,
      approved,
      timestamp: Date.now(),
      comments
    });

    // 检查是否所有评审者都已投票
    if (review.votes.length === review.reviewers.length) {
      const allApproved = review.votes.every(v => v.approved);

      if (allApproved) {
        // 所有评审者都同意，可自动执行
        await this.logDecision({
          proposalId,
          status: 'APPROVED',
          level: 2,
          approvedBy: review.reviewers.join(', '),
          approvedAt: Date.now(),
          reason: `审核通过: ${comments}`
        });
      } else {
        // 至少有一个评审者反对
        await this.logDecision({
          proposalId,
          status: 'REJECTED',
          level: 2,
          reason: `审核未通过: ${comments}`
        });
      }

      this.reviewQueue.delete(proposalId);
    }
  }

  /**
   * 记录决策到审计日志
   */
  private async logDecision(decision: UpgradeDecision): Promise<void> {
    const entry = {
      ...decision,
      timestamp: Date.now(),
      version: 1
    };

    this.auditLog.push(entry);

    // 在实际系统中，应该持久化到数据库
    // await db.insertAuditLog(entry);
  }

  // 辅助方法（示例实现）
  private async notifyReviewers(proposalId: string, riskScore: any): Promise<void> {
    console.log(`通知评审者: 提案${proposalId}`);
  }

  private async escalateToCTO(proposalId: string, riskScore: any): Promise<void> {
    console.log(`升级给CTO: 提案${proposalId}`);
  }

  private async escalateToCEO(proposalId: string, riskScore: any): Promise<void> {
    console.log(`升级给CEO: 提案${proposalId}`);
  }
}
```

### 6. 数据完整性守护者

```typescript
// file: services/integrity-guardian.ts

/**
 * 数据完整性守护者
 * 职责:
 * 1. 定期运行一致性检查
 * 2. 检测数据异常
 * 3. 触发自愈机制
 * 4. 生成完整性报告
 */
export interface IntegrityCheckResult {
  timestamp: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: IntegrityIssue[];
  overallScore: number;  // 0-100
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface IntegrityIssue {
  checkName: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  affectedRecords: number;
  description: string;
  rootCause?: string;
  autoFixApplied?: boolean;
  autoFixResult?: 'SUCCESS' | 'FAILED';
}

export class IntegrityGuardian {
  private database: any;
  private eventStore: any;
  private checkSchedule: Map<string, number> = new Map();

  constructor(database: any, eventStore: any) {
    this.database = database;
    this.eventStore = eventStore;
  }

  /**
   * 运行完整的一致性检查
   */
  async check(): Promise<IntegrityCheckResult> {
    const timestamp = Date.now();
    const issues: IntegrityIssue[] = [];

    try {
      // Check 1: 事件与投影一致性
      const eventCheck = await this.checkEventProjectionConsistency();
      if (!eventCheck.passed) issues.push(...eventCheck.issues);

      // Check 2: EGGS余额一致性
      const balanceCheck = await this.checkEggBalanceConsistency();
      if (!balanceCheck.passed) issues.push(...balanceCheck.issues);

      // Check 3: 外键完整性
      const fkCheck = await this.checkForeignKeyIntegrity();
      if (!fkCheck.passed) issues.push(...fkCheck.issues);

      // Check 4: 数据异常检测
      const anomalyCheck = await this.detectDataAnomalies();
      if (!anomalyCheck.passed) issues.push(...anomalyCheck.issues);

      // Check 5: 状态一致性
      const stateCheck = await this.checkStateConsistency();
      if (!stateCheck.passed) issues.push(...stateCheck.issues);

    } catch (error) {
      console.error('完整性检查异常:', error);
      issues.push({
        checkName: 'SYSTEM_ERROR',
        severity: 'CRITICAL',
        affectedRecords: -1,
        description: `系统错误: ${error}`
      });
    }

    // 计算综合分
    const totalChecks = 5;
    const passedChecks = totalChecks - issues.filter(i => i.severity === 'ERROR' || i.severity === 'CRITICAL').length;
    const overallScore = Math.max(0, (passedChecks / totalChecks) * 100);

    const result: IntegrityCheckResult = {
      timestamp,
      totalChecks,
      passedChecks,
      failedChecks: issues,
      overallScore: Math.round(overallScore),
      status: overallScore >= 95 ? 'HEALTHY' : overallScore >= 80 ? 'WARNING' : 'CRITICAL'
    };

    if (result.status !== 'HEALTHY') {
      await this.sendAlert(result);
    }

    return result;
  }

  /**
   * Check 1: 事件与投影一致性
   * 验证: Event Store中的事件数 === 投影表的行数
   */
  private async checkEventProjectionConsistency(): Promise<any> {
    const issues: IntegrityIssue[] = [];

    // 检查players表
    const eventCount = await this.eventStore.count({
      eventType: 'player_created'
    });
    const projectionCount = await this.database.count('players');

    if (eventCount !== projectionCount) {
      issues.push({
        checkName: 'EventProjectionConsistency',
        severity: 'ERROR',
        affectedRecords: Math.abs(eventCount - projectionCount),
        description: `玩家事件数(${eventCount}) != 投影表(${projectionCount})`,
        autoFixApplied: false
      });
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * Check 2: EGGS余额一致性
   * 验证: 缓存的eggs_balance === 从交易表汇总的结果
   */
  private async checkEggBalanceConsistency(): Promise<any> {
    const issues: IntegrityIssue[] = [];

    const query = `
      SELECT
        p.id,
        p.eggs_balance as cached,
        COALESCE(SUM(CASE WHEN et.quantity > 0 THEN et.quantity ELSE 0 END), 0) as actual,
        ABS(p.eggs_balance - COALESCE(SUM(CASE WHEN et.quantity > 0 THEN et.quantity ELSE 0 END), 0)) as discrepancy
      FROM players p
      LEFT JOIN eggs_transactions et ON p.id = et.player_id
      GROUP BY p.id
      HAVING discrepancy > 1
      LIMIT 1000
    `;

    const inconsistencies = await this.database.query(query);

    if (inconsistencies.length > 0) {
      const totalDiscrepancy = inconsistencies.reduce((sum: number, row: any) => sum + row.discrepancy, 0);

      issues.push({
        checkName: 'EggBalanceConsistency',
        severity: 'ERROR',
        affectedRecords: inconsistencies.length,
        description: `${inconsistencies.length}个玩家的EGGS余额不一致，总差异: ${totalDiscrepancy}`,
        rootCause: '可能的原因: 1) 交易日志丢失 2) 缓存更新失败 3) 并发写入冲突',
        autoFixApplied: await this.attemptAutoFix('EggBalanceConsistency', inconsistencies)
      });
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * Check 3: 外键完整性
   * 验证: 所有外键引用都指向有效的记录
   */
  private async checkForeignKeyIntegrity(): Promise<any> {
    const issues: IntegrityIssue[] = [];

    // 检查farms表
    const orphanedFarms = await this.database.query(`
      SELECT COUNT(*) as count FROM farms
      WHERE player_id NOT IN (SELECT id FROM players)
    `);

    if (orphanedFarms[0]?.count > 0) {
      issues.push({
        checkName: 'ForeignKeyIntegrity',
        severity: 'ERROR',
        affectedRecords: orphanedFarms[0].count,
        description: `${orphanedFarms[0].count}个农场记录孤立（玩家已删除）`
      });
    }

    // 检查其他外键关系...

    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * Check 4: 数据异常检测
   * 使用统计模型检测异常值
   */
  private async detectDataAnomalies(): Promise<any> {
    const issues: IntegrityIssue[] = [];

    // 检测异常的交易量
    const anomalies = await this.database.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        AVG(quantity) as avg_quantity,
        STDDEV(quantity) as std_dev
      FROM eggs_transactions
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
    `);

    for (const record of anomalies) {
      const expectedCount = 50000;  // 历史日均
      const deviation = Math.abs(record.transaction_count - expectedCount) / expectedCount;

      if (deviation > 0.5) {
        issues.push({
          checkName: 'DataAnomalyDetection',
          severity: 'WARNING',
          affectedRecords: record.transaction_count,
          description: `${record.date}的交易量异常: ${record.transaction_count}笔 (期望~${expectedCount}笔, 偏差${(deviation * 100).toFixed(1)}%)`
        });
      }
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * Check 5: 状态一致性
   * 验证: 特定状态下的字段值合法性
   */
  private async checkStateConsistency(): Promise<any> {
    const issues: IntegrityIssue[] = [];

    // 检查: is_inventory_full标志是否准确
    const inventoryMismatch = await this.database.query(`
      SELECT COUNT(*) as count FROM farms
      WHERE (is_inventory_full = TRUE AND egg_inventory < egg_capacity)
      OR (is_inventory_full = FALSE AND egg_inventory >= egg_capacity)
    `);

    if (inventoryMismatch[0]?.count > 0) {
      issues.push({
        checkName: 'InventoryFlagConsistency',
        severity: 'WARNING',
        affectedRecords: inventoryMismatch[0].count,
        description: `${inventoryMismatch[0].count}个农场的is_inventory_full标志不准确`,
        autoFixApplied: await this.attemptAutoFix('InventoryFlagConsistency', [])
      });
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * 尝试自动修复
   */
  private async attemptAutoFix(issue: string, affectedRecords: any[]): Promise<boolean> {
    try {
      if (issue === 'EggBalanceConsistency') {
        // 从事件流重建余额
        for (const record of affectedRecords.slice(0, 10)) {
          await this.rebuildPlayerEggBalance(record.id);
        }
        return true;
      }

      if (issue === 'InventoryFlagConsistency') {
        // 重新计算标志
        await this.database.query(`
          UPDATE farms
          SET is_inventory_full = (egg_inventory >= egg_capacity)
        `);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`自动修复失败 (${issue}):`, error);
      return false;
    }
  }

  /**
   * 从事件流重建单个玩家的EGGS余额
   */
  private async rebuildPlayerEggBalance(playerId: string): Promise<void> {
    const events = await this.eventStore.query({
      playerId,
      orderBy: 'timestamp ASC'
    });

    let balance = 0;
    for (const event of events) {
      if (event.type === 'EggProduced') {
        balance += event.quantity;
      } else if (event.type === 'StealOccurred') {
        balance -= event.quantity;
      } else if (event.type === 'ExchangeExecuted') {
        balance -= event.quantity;
      }
    }

    // 更新缓存
    await this.database.update('players', { id: playerId }, {
      eggs_balance: balance
    });
  }

  /**
   * 发送告警
   */
  private async sendAlert(result: IntegrityCheckResult): Promise<void> {
    console.log(`数据完整性告警 [${result.status}]: ${result.overallScore}分`);
    console.log(`失败检查数: ${result.failedChecks.length}`);

    for (const issue of result.failedChecks) {
      console.log(`  - ${issue.checkName} (${issue.severity}): ${issue.description}`);
    }

    // 在实际系统中，应该发送到监控系统
    // await monitoringSystem.alert({...});
  }

  /**
   * 生成完整性报告
   */
  async generateReport(timeRange: { start: number; end: number }): Promise<string> {
    let report = `# 数据完整性报告\n\n`;
    report += `时间范围: ${new Date(timeRange.start).toISOString()} - ${new Date(timeRange.end).toISOString()}\n\n`;

    // 运行检查
    const result = await this.check();

    report += `## 综合评分: ${result.overallScore}分 [${result.status}]\n\n`;
    report += `通过检查数: ${result.passedChecks}/${result.totalChecks}\n\n`;

    if (result.failedChecks.length > 0) {
      report += `## 失败检查\n\n`;
      for (const issue of result.failedChecks) {
        report += `### ${issue.checkName}\n`;
        report += `- 严重级别: ${issue.severity}\n`;
        report += `- 影响记录数: ${issue.affectedRecords}\n`;
        report += `- 描述: ${issue.description}\n`;
        if (issue.rootCause) report += `- 根本原因: ${issue.rootCause}\n`;
        if (issue.autoFixApplied) report += `- 自动修复: ${issue.autoFixResult}\n`;
        report += '\n';
      }
    } else {
      report += `✓ 所有检查通过\n`;
    }

    return report;
  }
}
```

---

## 总结

该系统提供了一套完整的数据保护和AI升级治理框架，包括：

### 核心价值

1. **防止连锁破坏**: 数据契约系统确保所有模块升级时保持兼容性
2. **智能决策路由**: 风险评分和分级审批确保不同风险级别的变更有适合的流程
3. **灰度发布安全**: 从1%逐步推进到100%，异常时自动回滚
4. **数据完整性守护**: 定时检查和自愈机制确保数据永远一致
5. **完整审计追踪**: 所有决策和升级都有完整的日志记录

### 适用场景

- ✓ 日常功能迭代 (Level 1 - 自动化)
- ✓ 经济参数调整 (Level 2 - 异步审核)
- ✓ 数据库结构变更 (Level 3 - 人工审批)
- ✓ 紧急数据修复 (加急流程)
- ✓ CEO级决策 (Level 4 - 最高审批)

### 下一步建议

1. 在测试环境中验证各个模块的交互
2. 配置真实的监控告警和通知渠道
3. 建立相关团队的培训和流程规范
4. 逐步迁移现有系统数据到事件溯源架构

