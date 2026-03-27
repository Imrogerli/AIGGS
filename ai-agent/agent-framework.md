# AIggs AI Agent 协作框架完整实现

## 文档版本
- **版本**: 2.0
- **日期**: 2026-03-20
- **项目**: AIggs - 首个 AI 原生链上养鸡农场游戏

---

## 1. 架构概览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户交互层                                │
│  (Claude/ChatGPT/文心一言 AI 工具)                           │
└────────┬────────────────────────┬────────────────────────┬───┘
         │                        │                        │
    Director EP             Design AI EP           Operations AI EP
         │                        │                        │
    ┌────▼────────────────────────▼─────────────────────────▼──┐
    │             Agent 间消息总线 (Event Bus)                   │
    │  - Publish/Subscribe 事件驱动                             │
    │  - 优先级队列 (Urgent/High/Normal/Low)                    │
    │  - 消息持久化 + 重试机制                                  │
    │  - 路由规则引擎                                          │
    └────┬─────────────────┬──────────────┬────────────┬──────┘
         │                 │              │            │
    ┌────▼────────┐  ┌────▼────────┐  ┌─▼─────────┐  ┌▼──────────┐
    │ Meta-AI     │  │ Design AI   │  │Operations│  │ Decision AI│
    │ Director    │  │ (数值设计)  │  │AI(运营)  │  │ (决策)    │
    └────┬────────┘  └────┬────────┘  └─┬────────┘  └┬──────────┘
         │                │              │           │
         └────┬───────────┼──────────────┼───────────┘
              │           │              │
    ┌─────────▼───────────▼──────────────▼──────────┐
    │   置信度评分引擎 + 决策审核流水线            │
    │  ┌──────────────────────────────────────────┐│
    │  │ 评分模块: 同类决策成功率/影响范围/金额等 ││
    │  │ 分级处理:                                  ││
    │  │  >90%  → 自动执行 + 日志记录             ││
    │  │  60-90% → 异步审核 + 可自动执行          ││
    │  │  <60%  → 暂停 + 人工审批                 ││
    │  └──────────────────────────────────────────┘│
    │  ┌──────────────────────────────────────────┐│
    │  │ 决策流水线:                                ││
    │  │ 提交→评估→路由→执行/审核→记录            ││
    │  │ 依赖链管理 + 回滚机制                      ││
    │  └──────────────────────────────────────────┘│
    └──────┬──────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │  Runtime 沙箱 + 执行引擎                 │
    │  - 输出校验                              │
    │  - 智能合约集成                          │
    │  - 人工熔断阈值                          │
    └──────┬──────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │  链上事件溯源 + 审计日志                 │
    │  - 所有决策完整记录                      │
    │  - 回滚机制                              │
    │  - 透明可审计                            │
    └──────┬──────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │  游戏引擎 + 业务逻辑                     │
    │  - EGGS 产蛋逻辑                         │
    │  - 偷蛋机制                              │
    │  - 代币兑换                              │
    │  - 玩家数据持久化                        │
    └───────────────────────────────────────────┘
```

### 1.2 数据流向

```
用户请求 (farm-code + action)
    ↓
Agent 处理业务逻辑
    ↓
生成决策 + 置信度评分
    ↓
┌─────────────────┬──────────────────┬──────────────────┐
│                 │                  │                  │
>90%          60-90%              <60%            合规检查
自动执行      异步审核            人工审批           始终审批
  │             │                  │                  │
  └─────────┬───┴──────────────┬────┴──────────────┬──┘
            │                  │                   │
        ┌───▼──────────────────▼─────────────────▼───┐
        │  决策执行引擎                               │
        │  - 参数验证                                │
        │  - 状态变更                                │
        │  - 链上事件发送                            │
        │  - 返回结果                                │
        └───┬──────────────────────────────────────┘
            │
        链上记录 + 返回用户
```

---

## 2. 核心数据结构与接口定义

### 2.1 消息总线数据结构

```typescript
// ==================== 消息总线类型定义 ====================

/**
 * 消息优先级枚举
 * urgent: 紧急 - 立即处理 (< 100ms)
 * high: 高优先级 - 快速处理 (< 1s)
 * normal: 正常优先级 - 标准处理 (< 5s)
 * low: 低优先级 - 延迟处理 (< 30s)
 */
export enum MessagePriority {
  URGENT = 'urgent',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

/**
 * 消息类型枚举
 * DECISION_REQUEST: 决策请求 - 需要其他 Agent 做决策
 * DATA_QUERY: 数据查询 - 请求数据信息
 * STATUS_NOTIFICATION: 状态通知 - 广播状态更新
 * ALERT: 告警 - 异常情况告警
 * COLLABORATION_REQUEST: 协作请求 - 多 Agent 协同
 */
export enum MessageType {
  DECISION_REQUEST = 'decision_request',
  DATA_QUERY = 'data_query',
  STATUS_NOTIFICATION = 'status_notification',
  ALERT = 'alert',
  COLLABORATION_REQUEST = 'collaboration_request',
}

/**
 * Agent 身份枚举
 */
export enum AgentRole {
  META_DIRECTOR = 'meta_director',        // 总指挥
  DESIGN_AI = 'design_ai',                // 数值设计师
  OPERATIONS_AI = 'operations_ai',        // 运营官
  DECISION_AI = 'decision_ai',            // 决策官
  SYSTEM = 'system',                      // 系统内部消息
}

/**
 * Agent 间消息接口
 */
export interface AgentMessage {
  // 消息元信息
  messageId: string;                      // 唯一消息 ID (UUID)
  timestamp: number;                      // 时间戳 (Unix ms)
  priority: MessagePriority;              // 优先级
  type: MessageType;                      // 消息类型

  // 发送者和接收者
  sender: AgentRole;                      // 发送者 Agent
  receivers: AgentRole[];                 // 接收者列表 (可多个)

  // 消息内容
  payload: {
    subject: string;                      // 消息主题
    content: unknown;                     // 消息内容 (具体格式由 type 决定)
    context?: Record<string, unknown>;    // 附加上下文信息
  };

  // 路由和追踪
  correlationId?: string;                 // 关联 ID (用于追踪相关消息)
  replyTo?: string;                       // 回复消息的源 messageId
  routingKey: string;                     // 路由键 (用于消息路由)

  // 重试和持久化
  retryCount: number;                     // 重试次数
  maxRetries: number;                     // 最大重试次数
  persistent: boolean;                    // 是否持久化
  expiresAt?: number;                     // 过期时间戳

  // 处理状态
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errors?: string[];                      // 错误信息
}

/**
 * Agent 消息总线响应
 */
export interface MessageBusResponse<T = unknown> {
  success: boolean;
  messageId: string;
  result?: T;
  errors?: string[];
  timestamp: number;
}

/**
 * 消息路由规则
 */
export interface RoutingRule {
  pattern: RegExp;                        // 路由键匹配模式
  targets: AgentRole[];                   // 目标 Agent
  priority?: MessagePriority;             // 优先级覆盖
  timeout?: number;                       // 超时时间 (ms)
}
```

### 2.2 置信度评分数据结构

```typescript
// ==================== 置信度评分类型定义 ====================

/**
 * 决策类型枚举
 */
export enum DecisionType {
  // 运营类
  DAILY_RANKING_UPDATE = 'daily_ranking_update',          // 每日排行更新
  USER_RECALL = 'user_recall',                            // 用户召回推送
  PRICE_ADJUSTMENT = 'price_adjustment',                  // 价格调整

  // 数值平衡
  STEAL_SUCCESS_RATE_ADJUST = 'steal_success_rate_adjust', // 偷蛋成功率调整
  EGGS_PRODUCTION_ADJUST = 'eggs_production_adjust',      // 产蛋速率调整
  EXCHANGE_RATE_ADJUST = 'exchange_rate_adjust',          // 兑换汇率调整

  // 决策类
  GAMEPLAY_PROPOSAL = 'gameplay_proposal',                // 玩法提案
  EVENT_LAUNCH = 'event_launch',                          // 活动上线
  FEATURE_ENABLE = 'feature_enable',                      // 功能启用

  // 系统类
  SECURITY_ACTION = 'security_action',                    // 安全处置
  COMPLIANCE_CHECK = 'compliance_check',                  // 合规审查
  EMERGENCY_HOTFIX = 'emergency_hotfix',                  // 紧急修复
}

/**
 * 置信度评分因素接口
 */
export interface ConfidenceFactors {
  // 历史数据
  historicalSuccessRate: number;          // 同类决策历史成功率 (0-1)
  decisionCount: number;                  // 历史同类决策数量

  // 影响范围
  impactScope: 'individual' | 'region' | 'server';  // 影响范围
  affectedUsers: number;                  // 受影响用户数

  // 金额影响
  amountInvolved: number;                 // 涉及金额 ($AIGG 或 EGGS)
  amountRiskLevel: 'low' | 'medium' | 'high';      // 金额风险等级

  // 可逆性
  isReversible: boolean;                  // 是否可逆
  reversalCost: number;                   // 回滚成本

  // 时间因素
  urgency: 0.0 | 0.3 | 0.6 | 1.0;        // 紧急程度 (0=常规, 1=紧急)
  hasDeadline: boolean;                   // 是否有截止期

  // 模式匹配
  matchedPatterns: string[];              // 匹配的历史决策模式
  anomalyScore: number;                   // 异常分数 (0-1)
}

/**
 * 置信度评分结果
 */
export interface ConfidenceScore {
  decisionId: string;                     // 决策 ID
  decisionType: DecisionType;             // 决策类型
  score: number;                          // 置信度分数 (0-100)
  level: 'high' | 'medium' | 'low';      // 置信度级别

  // 分数细节
  breakdown: {
    historicalFactor: number;             // 历史成功率的权重贡献
    impactFactor: number;                 // 影响范围的权重贡献
    reversibilityFactor: number;          // 可逆性的权重贡献
    timelinessBonus: number;              // 时间性奖励或惩罚
  };

  // 处理方式
  processingRule: 'auto_execute' | 'async_review' | 'manual_approval';

  // 解释和建议
  explanation: string;                    // 评分原因说明
  recommendation: string;                 // 建议行动
  riskFactors: string[];                  // 风险因素列表

  // 元数据
  timestamp: number;                      // 评分时间戳
  scoredBy: AgentRole;                    // 评分 Agent
  reviewRequired: boolean;                // 是否需要复核
}

/**
 * 置信度学习记录 (用于自适应调整)
 */
export interface ConfidenceLearningRecord {
  decisionId: string;                     // 关联的决策 ID
  decisionType: DecisionType;             // 决策类型

  // 初始评分
  predictedConfidence: number;            // 预测的置信度
  predictedLevel: 'high' | 'medium' | 'low';

  // 实际结果
  actualOutcome: 'success' | 'partial' | 'failure';  // 实际结果
  humanApprovalResult?: 'approved' | 'rejected' | 'modified';

  // 差异分析
  deviationDelta: number;                 // 预测与实际的差异
  rootCauseAnalysis?: string;             // 差异原因分析

  // 反馈权重调整
  updatedWeights: {
    historicalFactor?: number;
    impactFactor?: number;
    reversibilityFactor?: number;
    timelinessBonus?: number;
  };

  // 记录信息
  timestamp: number;
  processedBy: AgentRole;
  notes?: string;
}
```

### 2.3 决策审核流水线数据结构

```typescript
// ==================== 决策审核流水线类型定义 ====================

/**
 * 决策状态枚举
 */
export enum DecisionStatus {
  SUBMITTED = 'submitted',                // 已提交
  CONFIDENCE_SCORING = 'confidence_scoring',  // 评分中
  SCORED = 'scored',                      // 评分完成
  ROUTING = 'routing',                    // 路由分发中
  PENDING_REVIEW = 'pending_review',      // 待审核
  APPROVED = 'approved',                  // 已批准
  EXECUTING = 'executing',                // 执行中
  COMPLETED = 'completed',                // 已完成
  ROLLBACK_INITIATED = 'rollback_initiated',  // 回滚中
  ROLLED_BACK = 'rolled_back',            // 已回滚
  FAILED = 'failed',                      // 失败
  CANCELLED = 'cancelled',                // 已取消
}

/**
 * 决策依赖关系
 */
export interface DecisionDependency {
  decisionId: string;                     // 当前决策 ID
  dependsOn: string[];                    // 依赖的决策 ID 列表
  dependencyType: 'sequential' | 'parallel' | 'conditional';
  condition?: (depResult: DecisionResult) => boolean;
}

/**
 * 决策请求接口
 */
export interface DecisionRequest {
  // 基本信息
  decisionId: string;                     // 唯一决策 ID
  type: DecisionType;                     // 决策类型
  title: string;                          // 决策标题
  description: string;                    // 详细描述

  // 提案者信息
  proposedBy: {
    agentRole: AgentRole;                 // 提案 Agent
    timestamp: number;                    // 提案时间
    reasoning: string;                    // 提案理由
  };

  // 决策参数
  targetMetrics: Record<string, unknown>; // 目标指标 (影响的游戏参数)
  expectedImpact: {
    positiveOutcomes: string[];           // 预期正面影响
    potentialRisks: string[];             // 潜在风险
    affectedSystems: string[];            // 受影响的子系统
  };

  // 依赖和顺序
  dependencies?: DecisionDependency;      // 决策依赖关系
  priorityQueue?: number;                 // 优先级队列位置

  // 数据支撑
  dataEvidence: {
    metrics: Record<string, number>;      // 关键指标数据
    historicalComparison?: Record<string, unknown>;
    simulationResults?: Record<string, unknown>;
  };

  // 回滚计划
  rollbackPlan?: {
    enabled: boolean;
    triggers: string[];                   // 触发回滚的条件
    steps: string[];                      // 回滚步骤
    estimatedTime: number;                // 预计回滚时间 (ms)
  };

  // 审批流程
  reviewers: AgentRole[];                 // 指定审查者
  reviewDeadline?: number;                // 审查期限

  // 状态和元数据
  status: DecisionStatus;
  createdAt: number;
  updatedAt: number;
}

/**
 * 决策结果接口
 */
export interface DecisionResult {
  decisionId: string;                     // 决策 ID
  type: DecisionType;                     // 决策类型
  status: DecisionStatus;                 // 最终状态

  // 执行信息
  executedBy: AgentRole;                  // 执行者 Agent
  executionTime: number;                  // 执行时间戳
  executionDuration: number;              // 执行耗时 (ms)

  // 结果数据
  result: {
    success: boolean;
    output: unknown;                      // 执行输出数据
    changes: Record<string, unknown>;     // 状态变更
    events: {
      eventName: string;                  // 事件名称
      eventData: unknown;                 // 事件数据
      timestamp: number;                  // 事件时间
    }[];
  };

  // 置信度评分
  confidenceScore: ConfidenceScore;       // 置信度评分结果

  // 审核信息
  review?: {
    reviewer: AgentRole;                  // 审查者
    reviewedAt: number;                   // 审查时间
    decision: 'approved' | 'rejected' | 'requested_changes';
    feedback: string;                     // 审查反馈
  };

  // 回滚信息
  rollback?: {
    initiatedAt: number;                  // 回滚时间
    completedAt?: number;                 // 回滚完成时间
    reason: string;                       // 回滚原因
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  };

  // 审计日志
  auditLog: {
    userId?: string;                      // 相关用户 ID (farm_code)
    action: string;                       // 操作描述
    timestamp: number;                    // 时间戳
    metadata: Record<string, unknown>;    // 元数据
  }[];

  // 完整性校验
  hash: string;                           // 决策执行结果的哈希值 (用于链上验证)
  onChainEventId?: string;                // 链上事件 ID
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  entryId: string;                        // 日志条目 ID
  timestamp: number;                      // 时间戳

  // 操作信息
  operation: string;                      // 操作类型
  operationDetails: Record<string, unknown>;

  // 关联实体
  decisionId?: string;                    // 关联决策 ID
  farmCode?: string;                      // 关联玩家 farm_code
  agentRole: AgentRole;                   // 执行 Agent

  // 状态变更
  stateChanges: {
    entity: string;                       // 实体类型 (farm, eggs, aigg等)
    entityId: string;                     // 实体 ID
    before: Record<string, unknown>;      // 变更前
    after: Record<string, unknown>;       // 变更后
    delta: Record<string, unknown>;       // 差异
  }[];

  // 完整性
  hash: string;                           // 该条日志的哈希
  previousHash: string;                   // 前一条日志的哈希 (形成链)

  // 可追溯性
  traceId: string;                        // 分布式追踪 ID
}
```

---

## 3. 核心实现代码

### 3.1 消息总线实现

```typescript
// ==================== Agent 消息总线实现 ====================

/**
 * Agent 消息总线
 * 事件驱动架构，支持 publish/subscribe 模式
 * 包含优先级队列、消息持久化和重试机制
 */
export class AgentMessageBus {
  // 单例实例
  private static instance: AgentMessageBus;

  // 消息存储
  private messageQueue: Map<MessagePriority, AgentMessage[]>;
  private processedMessages: Map<string, AgentMessage>;
  private failedMessages: Map<string, { message: AgentMessage; errors: string[] }>;

  // 订阅者
  private subscribers: Map<AgentRole, Set<(msg: AgentMessage) => Promise<void>>>;
  private routingRules: RoutingRule[];

  // 处理线程
  private processingQueue: Promise<void> = Promise.resolve();
  private isProcessing: boolean = false;
  private retryTimer: NodeJS.Timer | null = null;

  // 统计
  private stats = {
    totalMessages: 0,
    processedMessages: 0,
    failedMessages: 0,
    retries: 0,
  };

  private constructor() {
    // 初始化优先级队列
    this.messageQueue = new Map([
      [MessagePriority.URGENT, []],
      [MessagePriority.HIGH, []],
      [MessagePriority.NORMAL, []],
      [MessagePriority.LOW, []],
    ]);

    this.processedMessages = new Map();
    this.failedMessages = new Map();
    this.subscribers = new Map();
    this.routingRules = [];

    // 初始化 Agent 订阅者集合
    Object.values(AgentRole).forEach(role => {
      this.subscribers.set(role as AgentRole, new Set());
    });

    // 启动消息处理循环
    this.startMessageProcessor();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): AgentMessageBus {
    if (!AgentMessageBus.instance) {
      AgentMessageBus.instance = new AgentMessageBus();
    }
    return AgentMessageBus.instance;
  }

  /**
   * 发布消息到总线
   */
  public async publish(message: AgentMessage): Promise<MessageBusResponse> {
    try {
      // 验证消息
      this.validateMessage(message);

      // 增加统计
      this.stats.totalMessages++;

      // 应用路由规则确定接收者
      const resolvedReceivers = this.resolveReceivers(
        message.routingKey,
        message.receivers
      );
      message.receivers = resolvedReceivers;

      // 加入队列
      const queue = this.messageQueue.get(message.priority)!;
      queue.push(message);

      // 若消息需要持久化，存储到数据库
      if (message.persistent) {
        await this.persistMessage(message);
      }

      return {
        success: true,
        messageId: message.messageId,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        messageId: message.messageId,
        errors: [errorMessage],
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 订阅 Agent 消息
   * @param agentRole - 要订阅的 Agent 角色
   * @param handler - 消息处理函数
   */
  public subscribe(
    agentRole: AgentRole,
    handler: (msg: AgentMessage) => Promise<void>
  ): void {
    const handlers = this.subscribers.get(agentRole);
    if (handlers) {
      handlers.add(handler);
    }
  }

  /**
   * 取消订阅
   */
  public unsubscribe(
    agentRole: AgentRole,
    handler: (msg: AgentMessage) => Promise<void>
  ): void {
    const handlers = this.subscribers.get(agentRole);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 注册路由规则
   */
  public registerRoute(rule: RoutingRule): void {
    this.routingRules.push(rule);
    // 按优先级排序
    this.routingRules.sort((a, b) => {
      const aPriority = a.priority || MessagePriority.NORMAL;
      const bPriority = b.priority || MessagePriority.NORMAL;
      const priorityOrder = {
        [MessagePriority.URGENT]: 0,
        [MessagePriority.HIGH]: 1,
        [MessagePriority.NORMAL]: 2,
        [MessagePriority.LOW]: 3,
      };
      return priorityOrder[aPriority] - priorityOrder[bPriority];
    });
  }

  /**
   * 验证消息格式
   */
  private validateMessage(message: AgentMessage): void {
    if (!message.messageId) {
      throw new Error('Message must have messageId');
    }
    if (!message.sender) {
      throw new Error('Message must have sender');
    }
    if (!Array.isArray(message.receivers) || message.receivers.length === 0) {
      throw new Error('Message must have at least one receiver');
    }
    if (!message.payload) {
      throw new Error('Message must have payload');
    }
  }

  /**
   * 根据路由键解析接收者
   */
  private resolveReceivers(
    routingKey: string,
    declaredReceivers: AgentRole[]
  ): AgentRole[] {
    let receivers = new Set(declaredReceivers);

    // 应用路由规则
    for (const rule of this.routingRules) {
      if (rule.pattern.test(routingKey)) {
        rule.targets.forEach(target => receivers.add(target));
      }
    }

    return Array.from(receivers);
  }

  /**
   * 消息处理循环
   */
  private startMessageProcessor(): void {
    this.isProcessing = true;
    this.processMessages();

    // 定期重试失败消息
    this.retryTimer = setInterval(() => {
      this.retryFailedMessages();
    }, 10000); // 每 10 秒重试一次
  }

  /**
   * 处理消息队列
   */
  private async processMessages(): Promise<void> {
    while (this.isProcessing) {
      try {
        // 按优先级处理消息
        const message = this.getNextMessage();

        if (!message) {
          // 队列为空，稍微延迟后继续
          await this.delay(100);
          continue;
        }

        // 处理消息
        await this.handleMessage(message);
      } catch (error) {
        console.error('Error processing message:', error);
        await this.delay(100);
      }
    }
  }

  /**
   * 获取下一条消息
   */
  private getNextMessage(): AgentMessage | null {
    // 按优先级顺序获取
    const priorities = [
      MessagePriority.URGENT,
      MessagePriority.HIGH,
      MessagePriority.NORMAL,
      MessagePriority.LOW,
    ];

    for (const priority of priorities) {
      const queue = this.messageQueue.get(priority)!;
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }

    return null;
  }

  /**
   * 处理单条消息
   */
  private async handleMessage(message: AgentMessage): Promise<void> {
    try {
      message.status = 'processing';

      // 分发给所有接收者
      const handlers = await Promise.allSettled(
        message.receivers.map(receiver => {
          const subscriptions = this.subscribers.get(receiver);
          if (!subscriptions || subscriptions.size === 0) {
            return Promise.reject(new Error(`No handlers for ${receiver}`));
          }

          // 触发所有订阅者
          return Promise.all(
            Array.from(subscriptions).map(handler => handler(message))
          );
        })
      );

      // 检查是否所有处理都成功
      const hasFailure = handlers.some(h => h.status === 'rejected');

      if (hasFailure) {
        throw new Error('Some message handlers failed');
      }

      message.status = 'completed';
      this.processedMessages.set(message.messageId, message);
      this.stats.processedMessages++;
    } catch (error) {
      message.status = 'failed';
      message.errors = [error instanceof Error ? error.message : String(error)];

      // 处理重试
      if (message.retryCount < message.maxRetries) {
        message.retryCount++;
        message.status = 'pending';
        this.stats.retries++;

        // 重新加入队列
        const queue = this.messageQueue.get(message.priority)!;
        queue.push(message);
      } else {
        // 超过最大重试次数，加入失败队列
        this.failedMessages.set(message.messageId, {
          message,
          errors: message.errors || [],
        });
        this.stats.failedMessages++;
      }
    }
  }

  /**
   * 重试失败的消息
   */
  private async retryFailedMessages(): Promise<void> {
    const failedEntries = Array.from(this.failedMessages.entries());

    for (const [, { message, errors }] of failedEntries) {
      // 只重试可恢复的错误
      if (errors.some(e => e.includes('timeout') || e.includes('network'))) {
        message.retryCount = 0;
        message.status = 'pending';
        this.failedMessages.delete(message.messageId);

        const queue = this.messageQueue.get(message.priority)!;
        queue.push(message);
      }
    }
  }

  /**
   * 消息持久化
   */
  private async persistMessage(message: AgentMessage): Promise<void> {
    // TODO: 实现消息持久化到数据库
    // 这里应该存储到 PostgreSQL/MongoDB 等持久化存储
    console.log(`[Persist] Message ${message.messageId}`);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取统计信息
   */
  public getStats() {
    return { ...this.stats };
  }

  /**
   * 关闭消息总线
   */
  public shutdown(): void {
    this.isProcessing = false;
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
  }
}
```

### 3.2 置信度评分引擎实现

```typescript
// ==================== 置信度评分引擎实现 ====================

/**
 * 置信度评分引擎
 * 评估每个决策的自动化执行程度
 * 基于历史数据、影响范围、可逆性等因素
 */
export class ConfidenceEngine {
  // 权重配置
  private weights = {
    historicalSuccessRate: 0.35,           // 历史成功率权重
    impactScope: 0.20,                     // 影响范围权重
    amountInvolved: 0.15,                  // 金额影响权重
    reversibility: 0.15,                   // 可逆性权重
    timelinessBonus: 0.10,                 // 时间性因素权重
    anomalyPenalty: 0.05,                  // 异常情况惩罚
  };

  // 学习记录存储
  private learningRecords: Map<DecisionType, ConfidenceLearningRecord[]>;

  // 决策历史
  private decisionHistory: Map<DecisionType, DecisionResult[]>;

  constructor() {
    this.learningRecords = new Map();
    this.decisionHistory = new Map();

    // 初始化各决策类型的记录
    Object.values(DecisionType).forEach(type => {
      this.learningRecords.set(type as DecisionType, []);
      this.decisionHistory.set(type as DecisionType, []);
    });
  }

  /**
   * 计算决策的置信度评分
   */
  public scoreDecision(
    decision: DecisionRequest,
    factors: ConfidenceFactors
  ): ConfidenceScore {
    const decisionId = decision.decisionId;
    const decisionType = decision.type;

    // 计算各部分评分
    const historicalScore = this.scoreHistoricalFactor(decisionType, factors);
    const impactScore = this.scoreImpactFactor(factors);
    const reversibilityScore = this.scoreReversibilityFactor(factors);
    const timelinessBonus = this.calculateTimelineBonus(factors);
    const anomalyPenalty = this.calculateAnomalyPenalty(factors);

    // 加权计算总分
    const totalScore =
      historicalScore * this.weights.historicalSuccessRate +
      impactScore * this.weights.impactScope +
      reversibilityScore * this.weights.amountInvolved +
      reversibilityScore * this.weights.reversibility +
      timelinessBonus * this.weights.timelinessBonus -
      anomalyPenalty * this.weights.anomalyPenalty;

    // 正规化到 0-100
    const normalizedScore = Math.max(0, Math.min(100, totalScore));

    // 确定置信度级别
    const level = this.scoreToLevel(normalizedScore);

    // 确定处理规则
    const processingRule = this.levelToProcessingRule(level);

    // 生成解释和建议
    const { explanation, recommendation, riskFactors } = this.generateExplanation(
      decisionType,
      normalizedScore,
      factors,
      historicalScore,
      impactScore,
      reversibilityScore
    );

    return {
      decisionId,
      decisionType,
      score: normalizedScore,
      level,
      breakdown: {
        historicalFactor: historicalScore,
        impactFactor: impactScore,
        reversibilityFactor: reversibilityScore,
        timelinessBonus,
      },
      processingRule,
      explanation,
      recommendation,
      riskFactors,
      timestamp: Date.now(),
      scoredBy: AgentRole.SYSTEM,
      reviewRequired: level === 'low' || anomalyPenalty > 30,
    };
  }

  /**
   * 历史成功率评分
   */
  private scoreHistoricalFactor(
    decisionType: DecisionType,
    factors: ConfidenceFactors
  ): number {
    const history = this.decisionHistory.get(decisionType) || [];

    if (history.length === 0) {
      // 无历史数据，返回中等分数
      return 50;
    }

    // 计算该类型决策的历史成功率
    const successCount = history.filter(d => d.result.success).length;
    const successRate = successCount / history.length;

    // 根据历史成功率评分 (0-100)
    let score = successRate * 100;

    // 加权历史因素（数据量越多，越有信心）
    const dataWeightFactor = Math.min(1, history.length / 20);
    score = score * 0.7 + 50 * 0.3 * dataWeightFactor;

    return score;
  }

  /**
   * 影响范围评分
   */
  private scoreImpactFactor(factors: ConfidenceFactors): number {
    let score = 100;

    // 根据影响范围降分
    switch (factors.impactScope) {
      case 'individual':
        score = 90; // 个人影响：高置信度
        break;
      case 'region':
        score = 70; // 区域影响：中置信度
        break;
      case 'server':
        score = 50; // 全服影响：低置信度
        break;
    }

    // 根据受影响用户数进一步调整
    if (factors.affectedUsers > 10000) {
      score -= 20;
    } else if (factors.affectedUsers > 1000) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  /**
   * 可逆性评分
   */
  private scoreReversibilityFactor(factors: ConfidenceFactors): number {
    if (factors.isReversible) {
      // 可逆决策：高置信度
      let score = 85;

      // 回滚成本越高，信心越低
      if (factors.reversalCost > 100000) {
        score -= 20;
      } else if (factors.reversalCost > 10000) {
        score -= 10;
      }

      return score;
    } else {
      // 不可逆决策：低置信度
      return 40;
    }
  }

  /**
   * 时间性奖励
   */
  private calculateTimelineBonus(factors: ConfidenceFactors): number {
    if (factors.urgency === 1.0 && factors.hasDeadline) {
      // 紧急且有截止期：增加置信度评分
      return 15;
    } else if (factors.urgency === 0.6) {
      // 中等紧急性
      return 8;
    } else if (factors.urgency === 0.3) {
      // 低紧急性
      return 2;
    }
    return 0;
  }

  /**
   * 异常情况惩罚
   */
  private calculateAnomalyPenalty(factors: ConfidenceFactors): number {
    return factors.anomalyScore * 50; // 异常分数越高，惩罚越大
  }

  /**
   * 分数转换为置信度级别
   */
  private scoreToLevel(score: number): 'high' | 'medium' | 'low' {
    if (score > 90) {
      return 'high';
    } else if (score >= 60) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 置信度级别转换为处理规则
   */
  private levelToProcessingRule(
    level: 'high' | 'medium' | 'low'
  ): 'auto_execute' | 'async_review' | 'manual_approval' {
    switch (level) {
      case 'high':
        return 'auto_execute';
      case 'medium':
        return 'async_review';
      case 'low':
        return 'manual_approval';
    }
  }

  /**
   * 生成解释和建议
   */
  private generateExplanation(
    decisionType: DecisionType,
    score: number,
    factors: ConfidenceFactors,
    historicalScore: number,
    impactScore: number,
    reversibilityScore: number
  ): {
    explanation: string;
    recommendation: string;
    riskFactors: string[];
  } {
    const riskFactors: string[] = [];
    let explanation = '';
    let recommendation = '';

    // 分析各评分因素
    if (historicalScore < 60) {
      riskFactors.push('Historical success rate is low');
      explanation += 'Past performance on similar decisions is concerning. ';
    }

    if (impactScore < 60) {
      riskFactors.push('Large impact scope');
      explanation += 'This decision affects many users or systems. ';
    }

    if (reversibilityScore < 60) {
      riskFactors.push('Decision is not easily reversible');
      explanation += 'This decision is difficult or costly to reverse. ';
    }

    if (factors.anomalyScore > 0.5) {
      riskFactors.push('Anomalous pattern detected');
      explanation += 'The decision pattern deviates from historical norms. ';
    }

    // 根据总分生成建议
    if (score > 90) {
      recommendation =
        'This decision can be executed immediately with minimal oversight. ' +
        'It will be logged automatically.';
    } else if (score >= 60) {
      recommendation =
        'This decision can be executed with asynchronous human review. ' +
        'Monitor execution and be prepared to roll back if necessary.';
    } else {
      recommendation =
        'This decision requires explicit human approval before execution. ' +
        'Please review the risk factors carefully.';
    }

    if (!explanation) {
      explanation = 'Decision parameters are within normal ranges. ';
    }

    return {
      explanation: explanation.trim(),
      recommendation: recommendation.trim(),
      riskFactors,
    };
  }

  /**
   * 记录决策执行结果用于自适应学习
   */
  public recordLearningData(
    decisionType: DecisionType,
    predictedConfidence: number,
    actualOutcome: 'success' | 'partial' | 'failure',
    humanApprovalResult?: 'approved' | 'rejected' | 'modified'
  ): void {
    const record: ConfidenceLearningRecord = {
      decisionId: `decision-${Date.now()}`,
      decisionType,
      predictedConfidence,
      predictedLevel: this.scoreToLevel(predictedConfidence),
      actualOutcome,
      humanApprovalResult,
      deviationDelta:
        actualOutcome === 'success'
          ? 0
          : actualOutcome === 'partial'
            ? -15
            : -50,
      updatedWeights: {},
      timestamp: Date.now(),
      processedBy: AgentRole.SYSTEM,
    };

    // 存储学习记录
    const records = this.learningRecords.get(decisionType) || [];
    records.push(record);
    this.learningRecords.set(decisionType, records);

    // 触发权重自适应调整
    this.updateWeights(decisionType, record);
  }

  /**
   * 自适应调整权重
   */
  private updateWeights(
    decisionType: DecisionType,
    record: ConfidenceLearningRecord
  ): void {
    // 简单的自适应学习：根据历史错误调整权重
    const records = this.learningRecords.get(decisionType) || [];

    if (records.length < 5) {
      // 数据不足，不进行调整
      return;
    }

    // 计算该决策类型的预测误差
    const errors = records
      .slice(-10) // 只看最近 10 条记录
      .map(r => Math.abs(r.deviationDelta));
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

    // 如果误差过大，适度降低相关因素的权重
    if (avgError > 30) {
      // 减少权重，转向更保守的评估
      this.weights.historicalSuccessRate = Math.max(0.25, this.weights.historicalSuccessRate - 0.02);
      this.weights.anomalyPenalty = Math.min(0.10, this.weights.anomalyPenalty + 0.02);

      // 重新归一化权重
      this.normalizeWeights();
    }
  }

  /**
   * 权重归一化
   */
  private normalizeWeights(): void {
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    Object.keys(this.weights).forEach(key => {
      this.weights[key as keyof typeof this.weights] /= total;
    });
  }

  /**
   * 添加决策执行结果到历史记录
   */
  public addDecisionResult(result: DecisionResult): void {
    const history = this.decisionHistory.get(result.type) || [];
    history.push(result);
    this.decisionHistory.set(result.type, history);
  }

  /**
   * 获取评分引擎的统计信息
   */
  public getStatistics() {
    return {
      weights: { ...this.weights },
      learningRecordCounts: Object.fromEntries(
        Array.from(this.learningRecords.entries()).map(([type, records]) => [
          type,
          records.length,
        ])
      ),
      decisionHistoryCounts: Object.fromEntries(
        Array.from(this.decisionHistory.entries()).map(([type, results]) => [
          type,
          results.length,
        ])
      ),
    };
  }
}
```

### 3.3 决策审核流水线实现

```typescript
// ==================== 决策审核流水线实现 ====================

/**
 * 决策审核流水线管理器
 * 管理决策的完整生命周期：提交 → 评分 → 路由 → 执行 → 记录
 */
export class DecisionPipeline {
  private decisions: Map<string, DecisionRequest> = new Map();
  private results: Map<string, DecisionResult> = new Map();
  private confidenceEngine: ConfidenceEngine;
  private messageBus: AgentMessageBus;
  private auditLog: AuditLogEntry[] = [];

  // 依赖关系管理
  private dependencyGraph: Map<string, string[]> = new Map();
  private completedDecisions: Set<string> = new Set();

  constructor(
    confidenceEngine: ConfidenceEngine,
    messageBus: AgentMessageBus
  ) {
    this.confidenceEngine = confidenceEngine;
    this.messageBus = messageBus;
  }

  /**
   * 提交决策请求
   */
  public async submitDecision(
    request: DecisionRequest
  ): Promise<{ decisionId: string; status: DecisionStatus }> {
    try {
      // 验证决策请求
      this.validateDecisionRequest(request);

      // 初始化状态
      request.status = DecisionStatus.SUBMITTED;
      request.createdAt = Date.now();
      request.updatedAt = Date.now();

      // 存储决策
      this.decisions.set(request.decisionId, request);

      // 记录审计日志
      this.logAudit({
        operation: 'decision_submitted',
        decisionId: request.decisionId,
        agentRole: request.proposedBy.agentRole,
      });

      // 发布决策提交消息
      await this.messageBus.publish({
        messageId: `msg-${Date.now()}`,
        timestamp: Date.now(),
        priority: MessagePriority.HIGH,
        type: MessageType.DECISION_REQUEST,
        sender: request.proposedBy.agentRole,
        receivers: [AgentRole.META_DIRECTOR],
        payload: {
          subject: `New decision proposal: ${request.title}`,
          content: request,
        },
        correlationId: request.decisionId,
        routingKey: `decision.${request.type}`,
        retryCount: 0,
        maxRetries: 3,
        persistent: true,
        status: 'pending',
      });

      return {
        decisionId: request.decisionId,
        status: DecisionStatus.SUBMITTED,
      };
    } catch (error) {
      throw new Error(
        `Failed to submit decision: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 处理决策的置信度评分
   */
  public async scoreDecision(
    decisionId: string,
    factors: ConfidenceFactors
  ): Promise<ConfidenceScore> {
    const request = this.decisions.get(decisionId);
    if (!request) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    // 更新状态
    request.status = DecisionStatus.CONFIDENCE_SCORING;
    request.updatedAt = Date.now();

    try {
      // 计算置信度
      const score = this.confidenceEngine.scoreDecision(request, factors);

      // 更新状态
      request.status = DecisionStatus.SCORED;
      request.updatedAt = Date.now();

      // 根据置信度级别决定下一步
      if (score.processingRule === 'manual_approval') {
        request.status = DecisionStatus.PENDING_REVIEW;
      } else if (score.processingRule === 'async_review') {
        request.status = DecisionStatus.APPROVED; // 自动批准，但标记需要异步复核
      } else {
        request.status = DecisionStatus.APPROVED; // 自动批准
      }

      // 记录审计
      this.logAudit({
        operation: 'decision_scored',
        decisionId,
        agentRole: AgentRole.SYSTEM,
        metadata: { confidenceScore: score.score, level: score.level },
      });

      return score;
    } catch (error) {
      request.status = DecisionStatus.FAILED;
      throw error;
    }
  }

  /**
   * 路由决策分配
   */
  public async routeDecision(decisionId: string): Promise<AgentRole[]> {
    const request = this.decisions.get(decisionId);
    if (!request) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    request.status = DecisionStatus.ROUTING;
    request.updatedAt = Date.now();

    try {
      // 根据决策类型确定审查者
      let reviewers: AgentRole[] = [];

      switch (request.type) {
        case DecisionType.DAILY_RANKING_UPDATE:
        case DecisionType.USER_RECALL:
        case DecisionType.PRICE_ADJUSTMENT:
          // 运营类决策 → Operations AI + Meta Director
          reviewers = [AgentRole.OPERATIONS_AI, AgentRole.META_DIRECTOR];
          break;

        case DecisionType.STEAL_SUCCESS_RATE_ADJUST:
        case DecisionType.EGGS_PRODUCTION_ADJUST:
        case DecisionType.EXCHANGE_RATE_ADJUST:
          // 数值平衡 → Design AI + Meta Director
          reviewers = [AgentRole.DESIGN_AI, AgentRole.META_DIRECTOR];
          break;

        case DecisionType.GAMEPLAY_PROPOSAL:
        case DecisionType.EVENT_LAUNCH:
        case DecisionType.FEATURE_ENABLE:
          // 游戏决策 → Decision AI + Meta Director
          reviewers = [AgentRole.DECISION_AI, AgentRole.META_DIRECTOR];
          break;

        case DecisionType.SECURITY_ACTION:
        case DecisionType.COMPLIANCE_CHECK:
        case DecisionType.EMERGENCY_HOTFIX:
          // 系统级 → 全部 Agent 审核
          reviewers = [
            AgentRole.META_DIRECTOR,
            AgentRole.DESIGN_AI,
            AgentRole.OPERATIONS_AI,
            AgentRole.DECISION_AI,
          ];
          break;
      }

      request.reviewers = reviewers;
      request.status = DecisionStatus.PENDING_REVIEW;
      request.updatedAt = Date.now();

      // 发送审核请求消息
      for (const reviewer of reviewers) {
        await this.messageBus.publish({
          messageId: `msg-${Date.now()}`,
          timestamp: Date.now(),
          priority:
            request.type === DecisionType.EMERGENCY_HOTFIX
              ? MessagePriority.URGENT
              : MessagePriority.HIGH,
          type: MessageType.DECISION_REQUEST,
          sender: AgentRole.SYSTEM,
          receivers: [reviewer],
          payload: {
            subject: `Review required: ${request.title}`,
            content: request,
          },
          correlationId: decisionId,
          routingKey: `review.${request.type}`,
          retryCount: 0,
          maxRetries: 3,
          persistent: true,
          status: 'pending',
        });
      }

      // 记录审计
      this.logAudit({
        operation: 'decision_routed',
        decisionId,
        agentRole: AgentRole.SYSTEM,
        metadata: { reviewers },
      });

      return reviewers;
    } catch (error) {
      request.status = DecisionStatus.FAILED;
      throw error;
    }
  }

  /**
   * 审批决策
   */
  public async approveDecision(
    decisionId: string,
    reviewer: AgentRole,
    feedback?: string
  ): Promise<void> {
    const request = this.decisions.get(decisionId);
    if (!request) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    try {
      request.status = DecisionStatus.APPROVED;
      request.updatedAt = Date.now();

      // 记录审计
      this.logAudit({
        operation: 'decision_approved',
        decisionId,
        agentRole: reviewer,
        metadata: { feedback },
      });

      // 发送批准通知
      await this.messageBus.publish({
        messageId: `msg-${Date.now()}`,
        timestamp: Date.now(),
        priority: MessagePriority.HIGH,
        type: MessageType.STATUS_NOTIFICATION,
        sender: reviewer,
        receivers: [AgentRole.META_DIRECTOR],
        payload: {
          subject: `Decision approved: ${request.title}`,
          content: { decisionId, reviewer, feedback },
        },
        correlationId: decisionId,
        routingKey: `approval.${request.type}`,
        retryCount: 0,
        maxRetries: 3,
        persistent: true,
        status: 'pending',
      });
    } catch (error) {
      request.status = DecisionStatus.FAILED;
      throw error;
    }
  }

  /**
   * 执行决策
   */
  public async executeDecision(
    decisionId: string,
    executor: AgentRole
  ): Promise<DecisionResult> {
    const request = this.decisions.get(decisionId);
    if (!request) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    // 检查依赖
    if (request.dependencies) {
      const dependsOn = request.dependencies.dependsOn;
      for (const depId of dependsOn) {
        if (!this.completedDecisions.has(depId)) {
          throw new Error(`Decision depends on ${depId} which is not completed`);
        }
      }
    }

    request.status = DecisionStatus.EXECUTING;
    request.updatedAt = Date.now();

    try {
      // 执行决策逻辑
      const output = await this.executeDecisionLogic(request);

      // 构造决策结果
      const result: DecisionResult = {
        decisionId,
        type: request.type,
        status: DecisionStatus.COMPLETED,
        executedBy: executor,
        executionTime: Date.now(),
        executionDuration: 0, // 实际应该计算
        result: {
          success: true,
          output,
          changes: {}, // 实际应该填充
          events: [],
        },
        confidenceScore: {} as ConfidenceScore, // 应该从之前的评分获取
        auditLog: [],
        hash: this.generateHash(output),
      };

      // 存储结果
      this.results.set(decisionId, result);

      // 标记为完成
      this.completedDecisions.add(decisionId);
      request.status = DecisionStatus.COMPLETED;
      request.updatedAt = Date.now();

      // 记录审计
      this.logAudit({
        operation: 'decision_executed',
        decisionId,
        agentRole: executor,
        metadata: { success: true, output },
      });

      return result;
    } catch (error) {
      request.status = DecisionStatus.FAILED;

      // 记录失败
      this.logAudit({
        operation: 'decision_failed',
        decisionId,
        agentRole: executor,
        metadata: { error: String(error) },
      });

      throw error;
    }
  }

  /**
   * 回滚决策
   */
  public async rollbackDecision(
    decisionId: string,
    reason: string
  ): Promise<void> {
    const result = this.results.get(decisionId);
    if (!result) {
      throw new Error(`Decision result ${decisionId} not found`);
    }

    try {
      // 执行回滚逻辑
      if (result.rollbackPlan) {
        // TODO: 执行回滚步骤
      }

      // 更新状态
      result.status = DecisionStatus.ROLLED_BACK;
      if (!result.rollback) {
        result.rollback = {
          initiatedAt: Date.now(),
          completedAt: Date.now(),
          reason,
          status: 'completed',
        };
      }

      // 移除完成标记
      this.completedDecisions.delete(decisionId);

      // 记录审计
      this.logAudit({
        operation: 'decision_rolled_back',
        decisionId,
        agentRole: AgentRole.SYSTEM,
        metadata: { reason },
      });
    } catch (error) {
      throw new Error(
        `Rollback failed for ${decisionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行决策逻辑（由具体的 Agent 实现）
   */
  private async executeDecisionLogic(
    request: DecisionRequest
  ): Promise<unknown> {
    // TODO: 根据决策类型调用具体的业务逻辑
    // 这里应该根据 request.type 分发到相应的执行器

    switch (request.type) {
      case DecisionType.DAILY_RANKING_UPDATE:
        return this.executeDailyRankingUpdate(request);
      case DecisionType.STEAL_SUCCESS_RATE_ADJUST:
        return this.executeStealRateAdjust(request);
      case DecisionType.EGGS_PRODUCTION_ADJUST:
        return this.executeProductionAdjust(request);
      default:
        throw new Error(`Unsupported decision type: ${request.type}`);
    }
  }

  /**
   * 执行每日排行更新
   */
  private async executeDailyRankingUpdate(
    request: DecisionRequest
  ): Promise<unknown> {
    // TODO: 实现排行榜更新逻辑
    console.log(`Executing daily ranking update: ${request.decisionId}`);
    return { ranking_updated: true };
  }

  /**
   * 执行偷蛋成功率调整
   */
  private async executeStealRateAdjust(
    request: DecisionRequest
  ): Promise<unknown> {
    // TODO: 实现数值调整逻辑
    const newRate = request.targetMetrics['steal_success_rate'];
    console.log(`Executing steal rate adjustment: ${newRate}`);
    return { rate_adjusted: true, new_rate: newRate };
  }

  /**
   * 执行产蛋速率调整
   */
  private async executeProductionAdjust(
    request: DecisionRequest
  ): Promise<unknown> {
    // TODO: 实现数值调整逻辑
    const newRate = request.targetMetrics['eggs_per_hour'];
    console.log(`Executing production adjustment: ${newRate}`);
    return { production_adjusted: true, new_rate: newRate };
  }

  /**
   * 验证决策请求
   */
  private validateDecisionRequest(request: DecisionRequest): void {
    if (!request.decisionId) {
      throw new Error('decisionId is required');
    }
    if (!request.type) {
      throw new Error('type is required');
    }
    if (!request.title) {
      throw new Error('title is required');
    }
  }

  /**
   * 记录审计日志
   */
  private logAudit(options: {
    operation: string;
    decisionId?: string;
    agentRole: AgentRole;
    metadata?: Record<string, unknown>;
  }): void {
    const entry: AuditLogEntry = {
      entryId: `audit-${Date.now()}`,
      timestamp: Date.now(),
      operation: options.operation,
      operationDetails: options.metadata || {},
      decisionId: options.decisionId,
      agentRole: options.agentRole,
      stateChanges: [],
      hash: this.generateHash({ ...options, timestamp: Date.now() }),
      previousHash: this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1].hash : '',
      traceId: `trace-${Date.now()}`,
    };

    this.auditLog.push(entry);
  }

  /**
   * 生成哈希值
   */
  private generateHash(data: unknown): string {
    // TODO: 实现真实的哈希计算 (使用 crypto)
    return `hash-${Date.now()}`;
  }

  /**
   * 获取决策状态
   */
  public getDecisionStatus(decisionId: string): DecisionStatus | null {
    return this.decisions.get(decisionId)?.status || null;
  }

  /**
   * 获取决策结果
   */
  public getDecisionResult(decisionId: string): DecisionResult | null {
    return this.results.get(decisionId) || null;
  }

  /**
   * 获取审计日志
   */
  public getAuditLog(
    filter?: { decisionId?: string; agentRole?: AgentRole }
  ): AuditLogEntry[] {
    if (!filter) {
      return this.auditLog;
    }

    return this.auditLog.filter(entry => {
      if (filter.decisionId && entry.decisionId !== filter.decisionId) {
        return false;
      }
      if (filter.agentRole && entry.agentRole !== filter.agentRole) {
        return false;
      }
      return true;
    });
  }
}
```

### 3.4 四大 Agent 独立交互端点实现

```typescript
// ==================== Agent 交互端点实现 ====================

/**
 * Meta-AI Director 交互端点
 * 总指挥：接收所有决策请求，协调全局
 */
export class MetaDirectorEndpoint {
  constructor(
    private messageBus: AgentMessageBus,
    private pipeline: DecisionPipeline,
    private confidenceEngine: ConfidenceEngine
  ) {
    this.registerMessageHandlers();
  }

  /**
   * 提交游戏改进建议
   */
  public async submitSuggestion(suggestion: {
    title: string;
    description: string;
    expectedImpact: string;
    priority: 'low' | 'normal' | 'high';
  }): Promise<{ suggestionId: string; status: string }> {
    const decisionRequest: DecisionRequest = {
      decisionId: `dec-${Date.now()}`,
      type: DecisionType.GAMEPLAY_PROPOSAL,
      title: suggestion.title,
      description: suggestion.description,
      proposedBy: {
        agentRole: AgentRole.META_DIRECTOR,
        timestamp: Date.now(),
        reasoning: suggestion.expectedImpact,
      },
      targetMetrics: {},
      expectedImpact: {
        positiveOutcomes: [suggestion.expectedImpact],
        potentialRisks: [],
        affectedSystems: ['gameplay'],
      },
      dataEvidence: {
        metrics: {},
      },
      reviewers: [AgentRole.DECISION_AI],
      status: DecisionStatus.SUBMITTED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = await this.pipeline.submitDecision(decisionRequest);
    return {
      suggestionId: result.decisionId,
      status: result.status,
    };
  }

  /**
   * 查询任意决策的执行理由和状态
   */
  public async queryDecision(decisionId: string): Promise<{
    decision: DecisionRequest | null;
    result: DecisionResult | null;
    explanation: string;
  }> {
    const request = this.pipeline['decisions'].get(decisionId);
    const result = this.pipeline.getDecisionResult(decisionId);

    let explanation = '';
    if (request) {
      explanation = `Decision "${request.title}" proposed by ${request.proposedBy.agentRole} at ${new Date(request.proposedBy.timestamp).toISOString()}`;
    }

    return {
      decision: request || null,
      result: result || null,
      explanation,
    };
  }

  /**
   * 查询全局状态
   */
  public async queryGlobalState(): Promise<{
    agentStats: Record<string, unknown>;
    decisionStats: Record<string, number>;
    systemHealth: {
      messageQueueHealth: string;
      confidenceEngineHealth: string;
      pipelineHealth: string;
    };
  }> {
    return {
      agentStats: {
        messageBusStats: this.messageBus.getStats(),
        confidenceEngineStats: this.confidenceEngine.getStatistics(),
      },
      decisionStats: {
        totalDecisions: this.pipeline['decisions'].size,
        completedDecisions: this.pipeline['completedDecisions'].size,
        pendingDecisions: Array.from(this.pipeline['decisions'].values()).filter(
          d => d.status === DecisionStatus.PENDING_REVIEW
        ).length,
      },
      systemHealth: {
        messageQueueHealth: 'healthy',
        confidenceEngineHealth: 'healthy',
        pipelineHealth: 'healthy',
      },
    };
  }

  /**
   * 紧急熔断 (熔断权)
   */
  public async emergencyBreaker(decisionId: string, reason: string): Promise<void> {
    const result = this.pipeline.getDecisionResult(decisionId);
    if (result && result.status === DecisionStatus.COMPLETED) {
      await this.pipeline.rollbackDecision(decisionId, reason);
    }
  }

  /**
   * 注册消息处理器
   */
  private registerMessageHandlers(): void {
    this.messageBus.subscribe(AgentRole.META_DIRECTOR, async (msg: AgentMessage) => {
      if (msg.type === MessageType.COLLABORATION_REQUEST) {
        // 处理协作请求
        console.log(`[Meta-Director] Processing collaboration request:`, msg.payload);
      }
    });
  }
}

/**
 * Design AI 交互端点
 * 数值设计师：负责游戏平衡调整
 */
export class DesignAIEndpoint {
  constructor(
    private messageBus: AgentMessageBus,
    private pipeline: DecisionPipeline
  ) {
    this.registerMessageHandlers();
  }

  /**
   * 查询当前数值状态
   */
  public async queryNumericalState(): Promise<{
    stealSuccessRate: number;
    eggsProductionRate: number;
    exchangeRate: number;
    serverWideMetrics: Record<string, unknown>;
  }> {
    return {
      stealSuccessRate: 0.45, // 50%
      eggsProductionRate: 1.0, // 每 8 小时 1 枚
      exchangeRate: 30, // 30 EGGS = 1 AIGG
      serverWideMetrics: {
        totalEggsInCirculation: 1000000,
        totalPlayersActive: 50000,
        avgEggsPerPlayer: 20,
      },
    };
  }

  /**
   * 查询调参历史
   */
  public async queryAdjustmentHistory(limit: number = 10): Promise<{
    adjustments: Array<{
      timestamp: number;
      parameter: string;
      oldValue: unknown;
      newValue: unknown;
      reason: string;
      confidence: number;
    }>;
  }> {
    return {
      adjustments: [
        {
          timestamp: Date.now() - 86400000,
          parameter: 'steal_success_rate',
          oldValue: 0.50,
          newValue: 0.45,
          reason: 'Players complained too much stealing',
          confidence: 0.78,
        },
      ],
    };
  }

  /**
   * 提交平衡建议
   */
  public async submitBalanceSuggestion(suggestion: {
    parameter: string;
    currentValue: unknown;
    suggestedValue: unknown;
    reason: string;
    simulationResults?: Record<string, unknown>;
  }): Promise<{ suggestionId: string; status: string }> {
    const decisionRequest: DecisionRequest = {
      decisionId: `dec-${Date.now()}`,
      type: DecisionType.STEAL_SUCCESS_RATE_ADJUST, // 示例
      title: `Adjust ${suggestion.parameter}`,
      description: suggestion.reason,
      proposedBy: {
        agentRole: AgentRole.DESIGN_AI,
        timestamp: Date.now(),
        reasoning: suggestion.reason,
      },
      targetMetrics: {
        [suggestion.parameter]: suggestion.suggestedValue,
      },
      expectedImpact: {
        positiveOutcomes: ['Improved game balance'],
        potentialRisks: [],
        affectedSystems: ['gameplay'],
      },
      dataEvidence: {
        metrics: {
          currentValue: suggestion.currentValue,
          suggestedValue: suggestion.suggestedValue,
        },
        simulationResults: suggestion.simulationResults,
      },
      reviewers: [AgentRole.META_DIRECTOR],
      status: DecisionStatus.SUBMITTED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = await this.pipeline.submitDecision(decisionRequest);
    return {
      suggestionId: result.decisionId,
      status: result.status,
    };
  }

  /**
   * 注册消息处理器
   */
  private registerMessageHandlers(): void {
    this.messageBus.subscribe(AgentRole.DESIGN_AI, async (msg: AgentMessage) => {
      if (msg.type === MessageType.DATA_QUERY) {
        console.log(`[Design AI] Processing data query:`, msg.payload);
      }
    });
  }
}

/**
 * Operations AI 交互端点
 * 运营官：负责社区和用户留存
 */
export class OperationsAIEndpoint {
  constructor(private messageBus: AgentMessageBus) {
    this.registerMessageHandlers();
  }

  /**
   * 获取偷蛋排行榜
   */
  public async getStealingLeaderboard(limit: number = 10): Promise<{
    leaderboard: Array<{
      rank: number;
      farmCode: string;
      farmName: string;
      stealsCount: number;
      totalEggsStolen: number;
      lastStealTime: number;
    }>;
  }> {
    return {
      leaderboard: [
        {
          rank: 1,
          farmCode: 'farm-xxxx',
          farmName: '黄金农场',
          stealsCount: 15,
          totalEggsStolen: 300,
          lastStealTime: Date.now() - 3600000,
        },
      ],
    };
  }

  /**
   * 获取全服数据
   */
  public async getServerData(): Promise<{
    totalPlayers: number;
    activePlayers: number;
    totalEggsProduced: number;
    totalEggsStolen: number;
    conversionRate: number;
    averageRetention: number;
  }> {
    return {
      totalPlayers: 100000,
      activePlayers: 50000,
      totalEggsProduced: 5000000,
      totalEggsStolen: 1000000,
      conversionRate: 0.3, // 30% 转化为 $AIGG
      averageRetention: 0.65, // 65% 留存
    };
  }

  /**
   * 获取社区洞察
   */
  public async getCommunityInsight(): Promise<{
    trending: string[];
    playerSentiment: 'positive' | 'neutral' | 'negative';
    topComplaints: string[];
    suggestions: string[];
  }> {
    return {
      trending: ['太容易被偷了', '想要更多鸡', '交换汇率太差'],
      playerSentiment: 'neutral',
      topComplaints: ['偷蛋难度太低', '鸡的寿命太短'],
      suggestions: ['增加防守机制', '提高汇率'],
    };
  }

  /**
   * 注册消息处理器
   */
  private registerMessageHandlers(): void {
    this.messageBus.subscribe(AgentRole.OPERATIONS_AI, async (msg: AgentMessage) => {
      if (msg.type === MessageType.STATUS_NOTIFICATION) {
        console.log(`[Operations AI] Processing notification:`, msg.payload);
      }
    });
  }
}

/**
 * Decision AI 交互端点
 * 决策官：处理提案和影响分析
 */
export class DecisionAIEndpoint {
  constructor(
    private messageBus: AgentMessageBus,
    private pipeline: DecisionPipeline
  ) {
    this.registerMessageHandlers();
  }

  /**
   * 提交游戏改进提案
   */
  public async submitProposal(proposal: {
    title: string;
    description: string;
    affectedFeatures: string[];
    expectedBenefits: string[];
    potentialRisks: string[];
  }): Promise<{ proposalId: string; status: string }> {
    const decisionRequest: DecisionRequest = {
      decisionId: `dec-${Date.now()}`,
      type: DecisionType.GAMEPLAY_PROPOSAL,
      title: proposal.title,
      description: proposal.description,
      proposedBy: {
        agentRole: AgentRole.DECISION_AI,
        timestamp: Date.now(),
        reasoning: proposal.expectedBenefits.join('; '),
      },
      targetMetrics: {},
      expectedImpact: {
        positiveOutcomes: proposal.expectedBenefits,
        potentialRisks: proposal.potentialRisks,
        affectedSystems: proposal.affectedFeatures,
      },
      dataEvidence: {
        metrics: {},
      },
      reviewers: [AgentRole.META_DIRECTOR],
      status: DecisionStatus.SUBMITTED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = await this.pipeline.submitDecision(decisionRequest);
    return {
      proposalId: result.decisionId,
      status: result.status,
    };
  }

  /**
   * 生成影响分析
   */
  public async analyzeImpact(decisionId: string): Promise<{
    impactScores: {
      playerExperience: number; // 0-100
      economics: number;
      retention: number;
      engagement: number;
    };
    affectedGroups: {
      newPlayers: { impactScore: number; direction: 'positive' | 'negative' };
      veterans: { impactScore: number; direction: 'positive' | 'negative' };
      whales: { impactScore: number; direction: 'positive' | 'negative' };
    };
    timeline: {
      immediateEffect: string;
      shortTerm: string; // 1 周
      longTerm: string; // 1 月
    };
    recommendation: string;
  }> {
    return {
      impactScores: {
        playerExperience: 75,
        economics: 65,
        retention: 80,
        engagement: 70,
      },
      affectedGroups: {
        newPlayers: {
          impactScore: 80,
          direction: 'positive',
        },
        veterans: {
          impactScore: 60,
          direction: 'neutral',
        },
        whales: {
          impactScore: 50,
          direction: 'negative',
        },
      },
      timeline: {
        immediateEffect: 'Players notice increased earning rate',
        shortTerm: 'More active participation in stealing',
        longTerm: 'Potential inflation, may need further adjustments',
      },
      recommendation: 'Recommend approval with 30-day monitoring period',
    };
  }

  /**
   * 获取投票结果 (如果有社区治理机制)
   */
  public async getVotingResults(): Promise<{
    proposals: Array<{
      proposalId: string;
      title: string;
      yesVotes: number;
      noVotes: number;
      result: 'approved' | 'rejected' | 'pending';
    }>;
  }> {
    return {
      proposals: [],
    };
  }

  /**
   * 注册消息处理器
   */
  private registerMessageHandlers(): void {
    this.messageBus.subscribe(AgentRole.DECISION_AI, async (msg: AgentMessage) => {
      if (msg.type === MessageType.DECISION_REQUEST) {
        console.log(`[Decision AI] Processing decision request:`, msg.payload);
      }
    });
  }
}
```

---

## 4. 完整使用示例

### 4.1 初始化框架

```typescript
// ==================== 框架初始化 ====================

/**
 * 初始化整个 AI Agent 协作框架
 */
async function initializeAIFramework(): Promise<{
  messageBus: AgentMessageBus;
  confidenceEngine: ConfidenceEngine;
  pipeline: DecisionPipeline;
  endpoints: {
    director: MetaDirectorEndpoint;
    design: DesignAIEndpoint;
    operations: OperationsAIEndpoint;
    decision: DecisionAIEndpoint;
  };
}> {
  // 1. 初始化消息总线
  const messageBus = AgentMessageBus.getInstance();

  // 注册路由规则
  messageBus.registerRoute({
    pattern: /^decision\./,
    targets: [AgentRole.META_DIRECTOR, AgentRole.DECISION_AI],
    priority: MessagePriority.HIGH,
  });

  messageBus.registerRoute({
    pattern: /^review\.steal_/,
    targets: [AgentRole.DESIGN_AI, AgentRole.META_DIRECTOR],
  });

  messageBus.registerRoute({
    pattern: /^review\.user_recall/,
    targets: [AgentRole.OPERATIONS_AI],
  });

  // 2. 初始化置信度评分引擎
  const confidenceEngine = new ConfidenceEngine();

  // 3. 初始化决策审核流水线
  const pipeline = new DecisionPipeline(confidenceEngine, messageBus);

  // 4. 初始化四大 Agent 交互端点
  const director = new MetaDirectorEndpoint(messageBus, pipeline, confidenceEngine);
  const design = new DesignAIEndpoint(messageBus, pipeline);
  const operations = new OperationsAIEndpoint(messageBus);
  const decision = new DecisionAIEndpoint(messageBus, pipeline);

  return {
    messageBus,
    confidenceEngine,
    pipeline,
    endpoints: {
      director,
      design,
      operations,
      decision,
    },
  };
}
```

### 4.2 工作流示例

```typescript
// ==================== 工作流示例 ====================

/**
 * 示例 1: Design AI 发起数值调整提案
 */
async function exampleDesignAIProposal(
  endpoints: any,
  pipeline: DecisionPipeline,
  confidenceEngine: ConfidenceEngine
): Promise<void> {
  console.log('\n=== Example 1: Design AI Proposal ===\n');

  // Design AI 观察到偷蛋成功率偏低
  const result = await endpoints.design.submitBalanceSuggestion({
    parameter: 'steal_success_rate',
    currentValue: 0.40, // 当前 40%
    suggestedValue: 0.45, // 建议调整到 45%
    reason: 'Players complaint about stealing being too difficult',
    simulationResults: {
      expectedDAU: 55000, // 预期日活上升
      expectedEngagement: 0.75,
    },
  });

  console.log(`✅ Proposal submitted: ${result.suggestionId}`);
  console.log(`   Status: ${result.status}`);

  // 对该提案进行置信度评分
  const factors: ConfidenceFactors = {
    historicalSuccessRate: 0.82, // 过去类似调整的成功率
    decisionCount: 12,
    impactScope: 'server', // 全服范围
    affectedUsers: 50000,
    amountInvolved: 50000000, // 涉及的 EGGS 总量
    amountRiskLevel: 'high',
    isReversible: true,
    reversalCost: 0, // 可以立即回滚
    urgency: 0.6, // 中等紧急性
    hasDeadline: false,
    matchedPatterns: ['balance_adjustment_positive_impact'],
    anomalyScore: 0.1,
  };

  const score = await pipeline.scoreDecision(result.suggestionId, factors);

  console.log(`\n📊 Confidence Score: ${score.score.toFixed(2)}/100`);
  console.log(`   Level: ${score.level}`);
  console.log(`   Processing Rule: ${score.processingRule}`);
  console.log(`   Explanation: ${score.explanation}`);
  console.log(`   Recommendation: ${score.recommendation}`);
  if (score.riskFactors.length > 0) {
    console.log(`   Risk Factors: ${score.riskFactors.join(', ')}`);
  }

  // 根据置信度级别处理
  if (score.processingRule === 'auto_execute') {
    console.log(`\n✅ HIGH CONFIDENCE: Auto-executing decision`);
    try {
      const execResult = await pipeline.executeDecision(
        result.suggestionId,
        AgentRole.DESIGN_AI
      );
      console.log(`   Executed at: ${new Date(execResult.executionTime).toISOString()}`);
    } catch (error) {
      console.error(`   Execution failed: ${error}`);
    }
  } else if (score.processingRule === 'async_review') {
    console.log(`\n⏳ MEDIUM CONFIDENCE: Async review + execution`);
    console.log(`   Decision approved for execution but marked for human review`);
  } else {
    console.log(`\n🚫 LOW CONFIDENCE: Awaiting human approval`);
    console.log(`   Decision is queued for manual review`);
  }
}

/**
 * 示例 2: Operations AI 用户召回提案
 */
async function exampleOperationsAIRecall(
  endpoints: any,
  pipeline: DecisionPipeline
): Promise<void> {
  console.log('\n=== Example 2: Operations AI User Recall ===\n');

  // Operations AI 识别到 3 天未活跃的玩家
  const inactiveCount = 5000;

  const result = await endpoints.operations.submitProposal?.({
    title: 'Recall Inactive Players',
    description: `Target ${inactiveCount} players inactive for 3+ days`,
    affectedFeatures: ['user_engagement', 'retention'],
    expectedBenefits: [
      `Expected to recall 20% (${inactiveCount * 0.2} players)`,
      'Increase DAU by ~8000 over next 7 days',
    ],
    potentialRisks: [
      'Message fatigue if frequency too high',
    ],
  });

  if (result) {
    console.log(`✅ Recall campaign proposal submitted: ${result.proposalId}`);
  }
}

/**
 * 示例 3: 查询决策历史和审计日志
 */
async function exampleQueryDecisions(
  endpoints: any,
  pipeline: DecisionPipeline
): Promise<void> {
  console.log('\n=== Example 3: Query Decisions ===\n');

  // Meta Director 查询某个决策
  const queryResult = await endpoints.director.queryDecision('dec-1234567890');

  console.log(`Decision:`, queryResult.decision?.title);
  console.log(`Status:`, queryResult.decision?.status);
  console.log(`Explanation:`, queryResult.explanation);

  // 查询全局状态
  const globalState = await endpoints.director.queryGlobalState();
  console.log(`\nGlobal State:`);
  console.log(`  Total Decisions: ${globalState.decisionStats.totalDecisions}`);
  console.log(`  Completed: ${globalState.decisionStats.completedDecisions}`);
  console.log(`  Pending Review: ${globalState.decisionStats.pendingDecisions}`);

  // 查询审计日志
  const auditLog = pipeline.getAuditLog();
  console.log(`\nRecent Audit Entries: ${auditLog.length}`);
  auditLog.slice(-3).forEach(entry => {
    console.log(`  - ${entry.operation} at ${new Date(entry.timestamp).toISOString()}`);
  });
}

/**
 * 示例 4: 紧急熔断
 */
async function exampleEmergencyBreaker(
  endpoints: any,
  decisionId: string
): Promise<void> {
  console.log('\n=== Example 4: Emergency Breaker ===\n');

  console.log(`⚠️  Initiating emergency breaker for decision: ${decisionId}`);

  try {
    await endpoints.director.emergencyBreaker(
      decisionId,
      'Unexpected negative impact on player retention detected'
    );
    console.log(`✅ Decision rolled back successfully`);
  } catch (error) {
    console.log(`❌ Rollback failed: ${error}`);
  }
}
```

### 4.3 完整工作流集成示例

```typescript
// ==================== 完整工作流集成 ====================

/**
 * 完整的工作流示例：从提案 → 评分 → 路由 → 执行 → 记录
 */
async function completeWorkflowExample(): Promise<void> {
  console.log('====== AIggs AI Agent Framework Complete Workflow ======\n');

  // 初始化框架
  const framework = await initializeAIFramework();
  const { messageBus, confidenceEngine, pipeline, endpoints } = framework;

  // 示例工作流
  console.log('📌 STEP 1: Create Decision Request\n');

  const decisionRequest: DecisionRequest = {
    decisionId: `dec-${Date.now()}`,
    type: DecisionType.EGGS_PRODUCTION_ADJUST,
    title: 'Increase EGGS Production Rate',
    description: 'Players find early-game egg production too slow',
    proposedBy: {
      agentRole: AgentRole.DESIGN_AI,
      timestamp: Date.now(),
      reasoning: 'Data shows 40% of new players quit before day 3',
    },
    targetMetrics: {
      eggs_per_hour: 0.2, // 从 0.125 (每 8 小时 1 个) 提高到 0.2
    },
    expectedImpact: {
      positiveOutcomes: [
        'Improved new player retention (est. +15%)',
        'Faster progression for casual players',
      ],
      potentialRisks: [
        'Potential EGGS inflation',
        'May reduce grinding sense of achievement',
      ],
      affectedSystems: ['eggs_production', 'economy'],
    },
    dataEvidence: {
      metrics: {
        currentChurnRate: 0.4,
        expectedChurnAfter: 0.25,
        dayThreeRetention: 0.6,
      },
      historicalComparison: {
        previousAdjustmentResult: 'Positive (egg adjustment in Q4)',
      },
    },
    rollbackPlan: {
      enabled: true,
      triggers: ['retention_drops_below_50%', 'manual_override'],
      steps: [
        'Restore eggs_per_hour to 0.125',
        'Monitor churn rate for 24h',
      ],
      estimatedTime: 3600000, // 1 hour
    },
    reviewers: [AgentRole.META_DIRECTOR],
    status: DecisionStatus.SUBMITTED,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 提交决策
  console.log(`Submitting: "${decisionRequest.title}"`);
  const submitResult = await pipeline.submitDecision(decisionRequest);
  const decisionId = submitResult.decisionId;
  console.log(`✅ Decision submitted with ID: ${decisionId}\n`);

  // STEP 2: 置信度评分
  console.log('📌 STEP 2: Confidence Scoring\n');

  const factors: ConfidenceFactors = {
    historicalSuccessRate: 0.88,
    decisionCount: 8,
    impactScope: 'server',
    affectedUsers: 50000,
    amountInvolved: 100000000, // EGGS 总量
    amountRiskLevel: 'high',
    isReversible: true,
    reversalCost: 0,
    urgency: 0.6,
    hasDeadline: false,
    matchedPatterns: ['production_increase', 'new_player_retention'],
    anomalyScore: 0.05,
  };

  const scoreResult = await pipeline.scoreDecision(decisionId, factors);
  console.log(`Confidence Score: ${scoreResult.score.toFixed(1)}/100`);
  console.log(`Level: ${scoreResult.level} (${scoreResult.processingRule})`);
  console.log(`Reasoning: ${scoreResult.explanation}`);
  console.log(`Recommendation: ${scoreResult.recommendation}\n`);

  // STEP 3: 路由
  console.log('📌 STEP 3: Decision Routing\n');

  const reviewers = await pipeline.routeDecision(decisionId);
  console.log(`Routed to reviewers: ${reviewers.join(', ')}\n`);

  // STEP 4: 批准
  console.log('📌 STEP 4: Review & Approval\n');

  await pipeline.approveDecision(
    decisionId,
    AgentRole.META_DIRECTOR,
    'Data looks solid, new player retention is critical metric'
  );
  console.log(`✅ Decision approved by Meta-AI Director\n`);

  // STEP 5: 执行
  console.log('📌 STEP 5: Execution\n');

  const execResult = await pipeline.executeDecision(decisionId, AgentRole.DESIGN_AI);
  console.log(`✅ Decision executed`);
  console.log(`   Execution time: ${new Date(execResult.executionTime).toISOString()}`);
  console.log(`   Status: ${execResult.status}\n`);

  // STEP 6: 查询和审计
  console.log('📌 STEP 6: Query & Audit\n');

  const queryResult = await endpoints.director.queryDecision(decisionId);
  console.log(`Decision status: ${queryResult.decision?.status}`);
  console.log(`Result success: ${queryResult.result?.result.success}\n`);

  const auditLog = pipeline.getAuditLog({ decisionId });
  console.log(`Audit log entries for this decision: ${auditLog.length}`);
  auditLog.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.operation} at ${new Date(entry.timestamp).toISOString()}`);
  });

  // STEP 7: 框架统计
  console.log('\n📌 STEP 7: Framework Statistics\n');

  const globalState = await endpoints.director.queryGlobalState();
  console.log(`Message Bus Stats:`);
  console.log(`  Total messages: ${globalState.agentStats['messageBusStats']?.totalMessages}`);
  console.log(`  Processed: ${globalState.agentStats['messageBusStats']?.processedMessages}`);

  console.log(`\nDecision Pipeline Stats:`);
  console.log(`  Total decisions: ${globalState.decisionStats.totalDecisions}`);
  console.log(`  Completed: ${globalState.decisionStats.completedDecisions}`);
  console.log(`  Pending: ${globalState.decisionStats.pendingDecisions}`);

  console.log('\n✅ Complete workflow executed successfully!\n');

  // 清理
  messageBus.shutdown();
}

// 运行示例
completeWorkflowExample().catch(console.error);
```

---

## 5. 配置指南

### 5.1 消息优先级配置

```typescript
// 建议的优先级配置规则
const priorityRules = {
  // URGENT (< 100ms)
  [DecisionType.EMERGENCY_HOTFIX]: MessagePriority.URGENT,
  [DecisionType.SECURITY_ACTION]: MessagePriority.URGENT,

  // HIGH (< 1s)
  [DecisionType.DAILY_RANKING_UPDATE]: MessagePriority.HIGH,
  [DecisionType.USER_RECALL]: MessagePriority.HIGH,

  // NORMAL (< 5s)
  [DecisionType.EGGS_PRODUCTION_ADJUST]: MessagePriority.NORMAL,
  [DecisionType.STEAL_SUCCESS_RATE_ADJUST]: MessagePriority.NORMAL,

  // LOW (< 30s)
  [DecisionType.GAMEPLAY_PROPOSAL]: MessagePriority.LOW,
  [DecisionType.EVENT_LAUNCH]: MessagePriority.LOW,
};
```

### 5.2 置信度阈值配置

```typescript
// 建议的置信度处理阈值
const confidenceThresholds = {
  autoExecute: 90, // 分数 > 90
  asyncReview: 60, // 分数 60-90
  manualApproval: 60, // 分数 < 60
};

// 不同决策类型的基础阈值调整
const decisionTypeThresholds = {
  [DecisionType.DAILY_RANKING_UPDATE]: { autoExecute: 95 }, // 更严格
  [DecisionType.SECURITY_ACTION]: { autoExecute: 100 }, // 始终需要人工
  [DecisionType.EGGS_PRODUCTION_ADJUST]: { autoExecute: 85 }, // 略宽松
};
```

### 5.3 权重调整指南

```typescript
// 权重微调建议
const weightAdjustments = {
  // 偏向历史数据的系统
  conservativeMode: {
    historicalSuccessRate: 0.45,
    anomalyPenalty: 0.08,
    timelinessBonus: 0.02,
  },

  // 平衡风险和敏捷性
  balancedMode: {
    historicalSuccessRate: 0.35,
    anomalyPenalty: 0.05,
    timelinessBonus: 0.10,
  },

  // 快速响应，接受更高风险
  aggressiveMode: {
    historicalSuccessRate: 0.25,
    anomalyPenalty: 0.02,
    timelinessBonus: 0.18,
  },
};
```

---

## 6. 部署检查清单

### 6.1 预发布验证

- [ ] 消息总线初始化成功，队列处理正常
- [ ] 置信度引擎权重配置合理，评分范围在 0-100
- [ ] 决策流水线支持所有决策类型的完整生命周期
- [ ] 四大 Agent 端点均可正常接收和处理消息
- [ ] 审计日志完整记录所有决策操作
- [ ] 回滚机制可以正确恢复系统状态
- [ ] 紧急熔断权限正确配置给 Meta-AI Director

### 6.2 运行时监控指标

```typescript
// 关键监控指标
const monitoringMetrics = {
  // 消息总线
  messageProcessingLatency: 'avg < 500ms',
  messageFailureRate: 'avg < 1%',
  retrySuccessRate: 'avg > 95%',

  // 置信度评分
  scoreAccuracy: 'calibrated quarterly',
  confidenceDrift: 'alert if MAE > 10%',
  learningEffectiveness: 'weight updates impact > 2%',

  // 决策执行
  executionSuccessRate: 'target > 98%',
  rollbackFrequency: 'alert if > 5% of decisions',
  averageExecutionTime: '< 2s for auto-execute decisions',

  // 系统整体
  agentResponsiveness: '< 1s for all endpoints',
  auditLogConsistency: '100% completeness',
};
```

---

## 7. 总结

### 7.1 架构优势

1. **置信度驱动的自动化**
   - 高置信度决策自动执行，无人工延迟
   - 中置信度决策快速执行但标记异步复核
   - 低置信度决策等待人工审批，保证安全

2. **Agent 间的清晰协作**
   - 事件驱动的消息总线确保低耦合
   - 路由规则灵活，支持多对多通信
   - 优先级队列保证关键决策优先处理

3. **完整的可追溯性**
   - 链上事件记录所有决策和执行结果
   - 审计日志形成不可篡改的链
   - 支持完整的回滚机制

4. **自适应学习**
   - 置信度评分根据实际执行结果自动调整
   - 权重优化逐渐改进评分准确度
   - 历史数据反馈形成正向循环

### 7.2 实施建议

1. **阶段一 (第 1-2 周)**
   - 部署消息总线和决策流水线核心
   - 集成 Meta-AI Director 和基础路由规则
   - 测试基本的决策提交和执行流程

2. **阶段二 (第 3-4 周)**
   - 上线置信度评分引擎
   - 集成四大 Agent 的完整端点
   - 建立审计日志和监控系统

3. **阶段三 (第 5-6 周)**
   - 启用自适应学习和权重调整
   - 部署链上事件记录
   - 完整压力测试和性能优化

4. **阶段四 (上线后)**
   - 持续监控各项指标
   - 定期审查和优化权重配置
   - 收集 Agent 反馈，迭代框架功能

---

**AIggs AI Agent 协作框架 · 完整实现**
*首个由 AI 完整运营的链上游戏——架构设计与代码实现*
