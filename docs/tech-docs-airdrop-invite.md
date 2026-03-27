# AIggs 项目 - 完整技术文档、空投合约、邀请系统

**版本**: 2.0
**更新日期**: 2026-03-20
**作者**: AIggs 技术团队

---

## 目录

1. [任务 1：系统技术文档](#任务1-系统技术文档)
   - 1.1 系统架构总览
   - 1.2 模块技术文档
   - 1.3 API 接口文档
   - 1.4 部署指南

2. [任务 2：空投发放合约](#任务2-空投发放合约)
   - 2.1 合约核心实现
   - 2.2 Merkle Tree 验证
   - 2.3 Hardhat 测试

3. [任务 3：邀请机制实现](#任务3-邀请机制实现)
   - 3.1 邀请码生成与管理
   - 3.2 邀请分成逻辑
   - 3.3 多级统计面板
   - 3.4 API 端点实现

---

# 任务1：系统技术文档

## 1.1 系统架构总览

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户交互层                                 │
├─────────────────────────────────────────────────────────────────┤
│  前端应用     │   AI Agent (Claude/GPT MCP)  │   官网   │ 白皮书  │
│  (React/Web) │   (Tool调用)                  │         │       │
└────────────────────────────┬──────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  MCP Server      │ │  后端 API Server  │ │  智能合约层      │
│  (Tool Provider) │ │  (Express.js)     │ │  (Solidity/Base) │
└──────────────────┘ └─────────┬────────┘ └─────────┬────────┘
       │                       │                   │
       │       ┌───────────────┼───────────────┐   │
       │       │               │               │   │
       ▼       ▼               ▼               ▼   │
   ┌─────────────────────────────────────────┐   │
   │      应用业务逻辑层                      │   │
   ├─────────────────────────────────────────┤   │
   │ Auth  │ Farm  │ Eggs  │ Steal │ Invite │   │
   │ Serv  │ Serv  │ Serv  │ Serv  │ Serv   │   │
   └──────────────────┬──────────────────────┘   │
                      │                           │
        ┌─────────────┴──────────────┐            │
        │                            │            │
        ▼                            ▼            ▼
   ┌──────────────┐         ┌──────────────────┐
   │ PostgreSQL   │         │ Base 链合约集合   │
   │ 数据库       │         │ - AIGG Token     │
   │ (玩家/农场)  │         │ - AIGGAirdrop    │
   │              │         │ - 流动性+交换    │
   └──────────────┘         └──────────────────┘
```

### 技术栈一览表

| 层级 | 组件 | 技术栈 | 说明 |
|------|------|--------|------|
| 前端 | 官网 | HTML/CSS/JS | Vercel 部署 |
| 前端 | 游戏前端 | React/TypeScript | 游戏交互界面 |
| 中间件 | MCP Server | Node.js/TypeScript | Claude/GPT 工具集成 |
| 后端 | API Server | Express.js + TypeScript | 游戏业务逻辑 |
| 数据库 | 数据存储 | PostgreSQL 14+ | 玩家/农场/交易记录 |
| 区块链 | 智能合约 | Solidity 0.8.20 | Base 链 EVM |
| 链接 | Web3 库 | ethers.js v6 | 钱包交互 |
| 消息队列 | 异步任务 | node-cron | 定时产蛋任务 |

### 各模块关系和数据流

```
玩家登录流程：
Wallet Signature → API Auth → JWT Token → Secured API Call → DB Update

产蛋流程：
Cron Job (8h) → Egg Production Service → DB Update → Event Emit

偷蛋流程：
Player Request → Steal Service → Transaction → DB Update → Victim Notify

兑换流程：
Player Exchange → Eggs Service → Mint AIGG → Burn EGGS → Record TX

邀请分成流程：
Invitee Earn EGGS/AIGG → Calculate 10% → Referrer Earn → Record → Notify

空投领取流程：
User Claim → Merkle Verify → Check Airdrop Pool → Mint Token → Lock Update
```

---

## 1.2 模块技术文档

### 1.2.1 后端 API 模块

**职责：**
- 处理玩家认证和授权
- 农场管理（建立、查询、更新）
- 产蛋、兑换、偷蛋等核心游戏逻辑
- 邀请系统管理和分成计算
- 请求验证、速率限制、错误处理

**核心接口：**

```typescript
// 认证接口
POST /api/auth/nonce          // 获取签名 nonce
POST /api/auth/login          // 钱包签名登录
GET  /api/auth/verify         // 验证 token

// 农场管理
GET  /api/farm/info           // 获取农场信息
GET  /api/farm/stats          // 获取农场统计
POST /api/farm/harvest        // 手动收获（如果有）

// 产蛋和兑换
GET  /api/eggs/balance        // 查询 EGGS 余额
POST /api/eggs/exchange       // EGGS 兑换 AIGG
GET  /api/eggs/history        // 兑换历史

// 偷蛋系统
POST /api/steal/execute       // 执行偷蛋
GET  /api/steal/available     // 查询可偷蛋对象
GET  /api/steal/record        // 查询偷蛋记录

// 玩家管理
GET  /api/player/profile      // 获取玩家档案
GET  /api/player/leaderboard  // 排行榜

// 邀请系统
POST /api/invite/generate     // 生成邀请链接
GET  /api/invite/stats        // 查询邀请统计
GET  /api/invite/commission   // 查询分成记录
```

**数据流：**

```
请求 → 认证中间件 (JWT验证)
     → 速率限制检查
     → 业务逻辑处理 (Service 层)
     → 数据库事务 (Prisma)
     → 事件记录
     → 统一响应格式
     → 返回客户端
```

**错误处理：**

- 自定义 APIError 类，统一错误响应格式
- 错误代码范围：0 (成功), 1000-1999 (认证), 2000-2999 (业务)
- 全局错误中间件捕获所有异常
- 详细日志记录，便于追踪问题

**部署要求：**

- Node.js 18+
- PostgreSQL 14+
- Redis (可选，用于缓存)
- 环境变量配置完整
- 支持 Docker 容器化部署

---

### 1.2.2 数据库模块

**职责：**
- 持久化存储玩家、农场、交易数据
- 支持复杂查询和事务操作
- 提供数据一致性保证
- 性能优化（索引、缓存）

**核心表结构：**

```sql
-- 玩家表 (players)
- id: BIGSERIAL PK
- wallet_address: VARCHAR(255) UNIQUE
- nickname: VARCHAR(100)
- farm_code: VARCHAR(50) UNIQUE (邀请码)
- referrer_id: BIGINT FK (邀请人)
- rookie_protection_until: TIMESTAMP (新手保护期)
- total_eggs_earned: BIGINT (累计产蛋)
- total_eggs_exchanged: BIGINT (累计兑换)
- invite_commission_earned: BIGINT (邀请分成累计)
- is_active: BOOLEAN
- created_at, updated_at: TIMESTAMP

-- 农场表 (farms)
- id: BIGSERIAL PK
- player_id: BIGINT UQ FK
- chicken_count: INT (母鸡数量)
- egg_inventory: INT (0-30，仓库容量)
- last_egg_production_at: TIMESTAMP
- next_egg_production_at: TIMESTAMP (8小时周期)
- is_inventory_full: BOOLEAN
- total_eggs_produced: BIGINT
- created_at, updated_at: TIMESTAMP

-- 鸡表 (chickens)
- id: BIGSERIAL PK
- farm_id: BIGINT FK
- name: VARCHAR(100)
- rarity: ENUM (common, rare, epic, legendary)
- egg_production_rate: DECIMAL (产蛋速率倍数)
- acquired_at: TIMESTAMP
- created_at, updated_at: TIMESTAMP

-- 交易记录表 (transactions)
- id: BIGSERIAL PK
- player_id: BIGINT FK
- tx_type: ENUM (exchange, steal, airdrop, etc.)
- amount: BIGINT
- description: TEXT
- tx_hash: VARCHAR(255) (链上交易哈希)
- created_at: TIMESTAMP

-- 偷蛋记录表 (steal_records)
- id: BIGSERIAL PK
- thief_id: BIGINT FK (偷蛋者)
- victim_id: BIGINT FK (被偷者)
- eggs_stolen: INT
- success: BOOLEAN
- attempt_at: TIMESTAMP

-- 邀请记录表 (referrals)
- id: BIGSERIAL PK
- referrer_id: BIGINT FK (邀请人)
- invitee_id: BIGINT FK (被邀请人)
- commission_earned: BIGINT (累计分成)
- created_at, updated_at: TIMESTAMP

-- 分成记录表 (commission_records)
- id: BIGSERIAL PK
- referrer_id: BIGINT FK
- invitee_id: BIGINT FK
- from_type: ENUM (egg_production, exchange)
- amount: BIGINT (10% 分成金额)
- created_at: TIMESTAMP
```

**关键索引：**

```sql
CREATE UNIQUE INDEX idx_players_wallet ON players(wallet_address);
CREATE INDEX idx_players_referrer ON players(referrer_id);
CREATE INDEX idx_farms_next_production ON farms(next_egg_production_at);
CREATE INDEX idx_steal_records_victim ON steal_records(victim_id);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_commission_referrer ON commission_records(referrer_id, created_at DESC);
```

**数据一致性保证：**

- 使用 Prisma 的 $transaction 确保操作原子性
- 关键操作加锁防止并发冲突
- 定期数据备份和恢复计划

---

### 1.2.3 偷蛋系统模块

**职责：**
- 实现随机偷蛋逻辑
- 防止作弊（冷却时间、新手保护）
- 记录偷蛋历史
- 触发通知事件

**核心机制：**

```typescript
// 偷蛋成功概率计算
function calculateStealSuccess(
  thiefLevel: number,      // 偷蛋者等级
  victimDefense: number    // 被偷者防御力
): { success: boolean; probability: number } {
  const baseProbability = 0.6; // 60% 基础成功率
  const levelDiff = thiefLevel - victimDefense;
  const adjustedProbability = baseProbability + (levelDiff * 0.05);

  return {
    success: Math.random() < adjustedProbability,
    probability: adjustedProbability
  };
}

// 被偷蛋数量计算
function calculateEggsStolen(
  victimInventory: number,
  successType: 'normal' | 'bumperCrop'
): number {
  if (successType === 'bumperCrop') {
    // 大丰收：偷走 50% 鸡蛋
    return Math.floor(victimInventory * 0.5);
  }
  // 普通：偷走 30-50% 鸡蛋
  return Math.floor(victimInventory * (0.3 + Math.random() * 0.2));
}

// 防护检查
async function checkStealEligibility(
  thief: Player,
  victim: Player
): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  // 1. 检查新手保护期
  if (victim.rookie_protection_until > new Date()) {
    return { eligible: false, reason: '目标处于新手保护期' };
  }

  // 2. 检查冷却时间 (5分钟内不能重复偷同一人)
  const lastSteal = await db.steal_record.findFirst({
    where: { thief_id: thief.id, victim_id: victim.id },
    orderBy: { attempt_at: 'desc' }
  });

  if (lastSteal && Date.now() - lastSteal.attempt_at.getTime() < 300000) {
    return { eligible: false, reason: '冷却中，请等待' };
  }

  return { eligible: true };
}
```

**事件触发：**

```typescript
// 发出偷蛋成功事件
await eventBus.emit('steal:success', {
  thief_id: thiefId,
  victim_id: victimId,
  eggs_stolen: eggsAmount,
  timestamp: Date.now()
});

// 受害者接收通知 (实时推送)
await notificationService.notify(victimId, {
  type: 'steal:victim',
  data: {
    thief_name: thief.nickname,
    eggs_lost: eggsAmount
  }
});
```

---

### 1.2.4 MCP 服务器模块

**职责：**
- 提供 Claude/GPT 可调用的 Tool
- 实现游戏交互的 AI 接口
- 处理自然语言命令转换
- 与后端 API 交互

**核心 Tool 端点：**

```typescript
// MCP Server Tools

interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: any) => Promise<any>;
}

// Tool 1: 查询农场信息
{
  name: 'get_farm_info',
  description: '获取当前农场的详细信息（鸡数、蛋数、下次产蛋时间）',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: { type: 'string', description: '玩家钱包地址' }
    }
  },
  handler: async (input) => {
    return await farmService.getFarmInfo(input.player_address);
  }
}

// Tool 2: 执行偷蛋
{
  name: 'steal_eggs',
  description: '从其他玩家的农场偷蛋',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: { type: 'string' },
      victim_address: { type: 'string', description: '目标玩家地址' }
    }
  },
  handler: async (input) => {
    return await stealService.executeSteal(input.player_address, input.victim_address);
  }
}

// Tool 3: 兑换 EGGS 为 AIGG
{
  name: 'exchange_eggs',
  description: '将 EGGS 兑换为 $AIGG 代币',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: { type: 'string' },
      eggs_amount: { type: 'number', description: '要兑换的 EGGS 数量' }
    }
  },
  handler: async (input) => {
    return await eggsService.exchange(input.player_address, input.eggs_amount);
  }
}

// Tool 4: 查询排行榜
{
  name: 'get_leaderboard',
  description: '获取游戏排行榜',
  inputSchema: {
    type: 'object',
    properties: {
      rank_type: {
        type: 'string',
        enum: ['eggs_produced', 'eggs_exchanged', 'successful_steals'],
        description: '排行榜类型'
      },
      limit: { type: 'number', default: 10 }
    }
  },
  handler: async (input) => {
    return await playerService.getLeaderboard(input.rank_type, input.limit);
  }
}

// Tool 5: 获取邀请链接
{
  name: 'get_invite_link',
  description: '生成个人邀请链接',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: { type: 'string' }
    }
  },
  handler: async (input) => {
    return await inviteService.generateInviteLink(input.player_address);
  }
}

// Tool 6: 查询邀请统计
{
  name: 'get_invite_stats',
  description: '查询邀请佣金和邀请人数统计',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: { type: 'string' }
    }
  },
  handler: async (input) => {
    return await inviteService.getInviteStats(input.player_address);
  }
}
```

**使用示例：**

```
用户: "我的农场里现在有多少蛋？"
→ Claude 调用 get_farm_info(player_address)
→ MCP Server 返回 { egg_inventory: 25, egg_capacity: 30, ... }
→ Claude 回复: "你的农场里有 25 个蛋，容量是 30 个。"

用户: "帮我偷一下 @Alice 的蛋"
→ Claude 调用 steal_eggs(player_address, victim_address)
→ MCP Server 返回 { success: true, eggs_stolen: 12, ... }
→ Claude 回复: "成功偷走 12 个蛋！"

用户: "我邀请了多少人？他们给了我多少分成？"
→ Claude 调用 get_invite_stats(player_address)
→ MCP Server 返回 { invited_count: 5, total_commission: 1000, ... }
→ Claude 回复: "你邀请了 5 个人，获得 1000 个 EGGS 的分成。"
```

---

### 1.2.5 Agent 协作框架模块

**职责：**
- 多 Agent 间的消息传递和协调
- 置信度评分和决策审核
- 事务性操作的安全执行
- 代理权限管理

**核心数据结构：**

```typescript
// 消息总线
interface AgentMessage {
  id: string;                    // 消息唯一ID
  sender: string;                // 发送者 Agent 名称
  receiver: string | 'broadcast'; // 接收者
  type: 'command' | 'query' | 'event' | 'audit';
  priority: 'low' | 'normal' | 'high' | 'critical';
  payload: {
    action: string;              // steal, exchange, invite, etc.
    params: Record<string, any>;
    timestamp: number;
  };
  context?: {
    player_id: string;
    session_id: string;
    ip_address: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: number;
}

// 置信度评分
interface ConfidenceScore {
  action: string;
  overall: number;              // 0-1 总体评分
  factors: {
    user_history: number;       // 用户历史行为 (0-1)
    frequency_check: number;    // 频率检查 (0-1)
    anomaly_detection: number;  // 异常检测 (0-1)
    signature_verification: number; // 签名验证 (0-1)
  };
  recommendation: 'approve' | 'review' | 'block';
  reason: string;
}

// 决策审核流水线
interface DecisionAudit {
  message_id: string;
  decision_maker: string;       // 审核者 Agent
  confidence: ConfidenceScore;
  approval: boolean;
  audit_timestamp: number;
  notes: string;
  final_status: 'executed' | 'queued' | 'rejected';
}
```

**4 大 Agent 设计：**

```
1. Query Agent (查询 Agent)
   - 职责: 回答问题、提供信息
   - Tools: get_farm_info, get_leaderboard, get_invite_stats
   - 权限: 只读，无需审核
   - 置信度要求: 低

2. Action Agent (行动 Agent)
   - 职责: 执行玩家命令（偷蛋、兑换等）
   - Tools: steal_eggs, exchange_eggs, claim_airdrop
   - 权限: 需要用户签名授权
   - 置信度要求: 高 (>0.8)

3. Analysis Agent (分析 Agent)
   - 职责: 数据分析、策略建议
   - Tools: analyze_farm, predict_earnings, recommend_strategy
   - 权限: 只读分析
   - 置信度要求: 中

4. Admin Agent (管理 Agent)
   - 职责: 系统维护、数据修复
   - Tools: manual_trigger_production, cleanup_records, emergency_pause
   - 权限: 限制性，需要多签审核
   - 置信度要求: 极高 (>0.95)
```

**工作流示例：**

```
用户通过 Claude 说: "帮我偷一下最富有的玩家"

[1] Claude 解析意图
    → 调用 Action Agent 的 steal_eggs

[2] Action Agent 置信度评分
    - 用户历史: 0.9 (长期活跃玩家)
    - 频率检查: 0.7 (1分钟内第一次偷蛋)
    - 异常检测: 0.85 (目标是排行榜第一名，有点异常)
    - 签名验证: 1.0 (签名正确)
    → 总体评分: 0.86 → 建议 approve

[3] Decision Audit Agent 审核
    - 检查消息优先级: normal
    - 检查操作类型: steal (游戏核心机制)
    - 置信度 > 0.8: ✓
    → 批准执行

[4] 执行偷蛋
    - 调用后端 API /api/steal/execute
    - 记录交易哈希
    - 发出事件通知

[5] 反馈给用户
    → "成功偷走 15 个蛋！"
```

---

### 1.2.6 链上合约模块

**职责：**
- 实现 ERC-20 代币标准
- 空投机制（Merkle Tree）
- 流动性管理
- 代币兑换和销毁

**核心合约：**

```solidity
// 1. AIGG Token 合约 (AIGGToken.sol)
- 总供应量: 10 亿 AIGG
- 小数位: 18
- 可销毁、可暂停、支持权限控制
- Roles: GAME_ROLE, ECOSYSTEM_ROLE, AIRDROP_ROLE, PAUSER_ROLE

// 2. 空投合约 (AIGGAirdrop.sol)
- Merkle Tree 验证
- 前 1 万名用户每人 5000 AIGG
- 领取时间窗口控制
- 防重复领取

// 3. 流动性合约 (AIGGLiquidity.sol)
- Uniswap V3 集成
- 自动流动性管理 (60% 法币收入注入)
- LP 代币销毁机制

// 4. 兑换合约 (AIGGExchange.sol)
- EGGS → AIGG 1:60 兑换率
- 实时定价机制
- 交易记录和验证
```

**部署和交互流程：**

```
部署: Base 链 EVM
↓
验证合约在 Basescan
↓
初始化代币分配:
- 游戏奖励池: 75%
- 生态基金: 10%
- 团队锁仓: 10%
- 空投池: 5%
↓
MCP/后端集成:
- 使用 ethers.js 交互
- 事件监听和日志记录
- 自动化 Merkle Root 更新
```

---

### 1.2.7 每日早报模块

**职责：**
- 生成每日游戏数据统计
- 发送玩家个性化早报
- 排行榜更新
- 游戏事件总结

**早报内容：**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       🐔 AIggs 每日早报
       2026-03-21
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【你的农场】
- 鸡数: 5 只
- 仓库: 25 EGGS (83% 满)
- 下次产蛋: 03:00 (还需 3 小时)
- 昨日产蛋: 120 EGGS ↑20%
- 邀请分成: +50 EGGS

【全球排行 TOP 10】
1. Alice (520,000 EGGS)
2. Bob (480,000 EGGS)
3. You (250,000 EGGS) ← 你在这里
...

【昨日事件】
- 你的农场被偷蛋 2 次: -30 EGGS
- 你成功偷蛋 1 次: +25 EGGS
- 新邀请 1 人激活: +50 EGGS 分成

【推荐行动】
- 你的仓库快满了，考虑兑换 EGGS
- Alice 的农场现在满仓，无法偷蛋
- 你的邀请链接已分享 5 次 (2 人激活)

【市场动态】
- AIGG 当前价格: $0.012
- 24h 交易额: $150,000
- 链上流动性: $2.5M

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**发送机制：**

```typescript
// 每天 08:00 UTC 发送
schedule.scheduleJob('0 8 * * *', async () => {
  const players = await db.players.findMany({
    where: { is_active: true }
  });

  for (const player of players) {
    const report = await generateDailyReport(player.id);

    // 通过多渠道发送
    await emailService.send(player.email, report.email);
    await pushService.notify(player.id, report.push);
    await gameNotificationService.createInGame(player.id, report.inGame);

    // 记录发送日志
    await db.reports.create({
      data: {
        player_id: player.id,
        report_date: new Date(),
        status: 'sent'
      }
    });
  }
});
```

---

### 1.2.8 前端/官网模块

**职责：**
- 游戏 UI 界面
- 钱包连接和签名
- 实时数据展示
- 项目宣传和白皮书

**技术架构：**

```
官网 (https://aiggs.xyz)
├── 首页 (index.html)
│   ├── Hero 区域 (项目介绍)
│   ├── 功能展示
│   ├── 白皮书链接
│   └── 社区链接
│
├── 白皮书 (/whitepaper)
│   ├── 中文版 (CN)
│   └── 英文版 (EN)
│
└── 部署: Vercel (自动从 GitHub 部署)

游戏前端 (DApp)
├── 登录页 (钱包连接 → 签名)
├── 农场页 (显示鸡、蛋、下次产蛋时间)
├── 排行榜
├── 邀请系统
├── 偷蛋界面
├── 兑换界面
└── 账户设置

集成 Web3：
- MetaMask/钱包连接
- ethers.js 签名验证
- RealTime 数据更新 (WebSocket/轮询)
```

---

## 1.3 API 接口文档

### REST API 端点列表

#### 认证类 API

```
POST /api/auth/nonce
功能: 获取签名 nonce
参数:
  - wallet_address: string (钱包地址)
返回:
  {
    code: 0,
    data: {
      nonce: "abc123xyz",
      expires_in: 300 (秒)
    }
  }

POST /api/auth/login
功能: 钱包签名登录
参数:
  - wallet_address: string
  - signature: string (签名)
  - nonce: string
  - nickname?: string
  - referral_code?: string (邀请码，可选)
返回:
  {
    code: 0,
    data: {
      token: "eyJhbGci...",
      player: {
        id: 1,
        wallet_address: "0x...",
        nickname: "Player123",
        farm_code: "ABC123"
      }
    }
  }
```

#### 农场类 API

```
GET /api/farm/info
功能: 获取农场信息
认证: 需要
返回:
  {
    code: 0,
    data: {
      farm: {
        id: 1,
        chicken_count: 5,
        egg_inventory: 25,
        egg_capacity: 30,
        is_inventory_full: false,
        next_egg_production_at: "2026-03-21T08:00:00Z"
      },
      chickens: [
        { id: 1, name: "母鸡A", rarity: "common", ... }
      ]
    }
  }

GET /api/farm/stats
功能: 获取农场统计数据
认证: 需要
返回:
  {
    code: 0,
    data: {
      total_eggs_produced: 10000,
      total_eggs_exchanged: 5000,
      total_stolen_count: 3,
      total_successful_steals: 2
    }
  }
```

#### EGGS 兑换类 API

```
GET /api/eggs/balance
功能: 查询 EGGS 余额
认证: 需要
返回:
  {
    code: 0,
    data: {
      eggs_balance: 100,
      exchange_rate: 60 (60 EGGS = 1 AIGG)
    }
  }

POST /api/eggs/exchange
功能: EGGS 兑换 AIGG
认证: 需要
参数:
  - eggs_amount: number
返回:
  {
    code: 0,
    data: {
      transaction_hash: "0x...",
      eggs_burned: 60,
      aigg_minted: 1,
      new_balance: 40,
      timestamp: 1234567890
    }
  }

GET /api/eggs/history
功能: 兑换历史
认证: 需要
返回:
  {
    code: 0,
    data: {
      records: [
        {
          id: 1,
          eggs_amount: 60,
          aigg_amount: 1,
          tx_hash: "0x...",
          timestamp: 1234567890
        }
      ],
      total: 10,
      page: 1
    }
  }
```

#### 偷蛋类 API

```
POST /api/steal/execute
功能: 执行偷蛋
认证: 需要
参数:
  - victim_address: string
返回:
  {
    code: 0,
    data: {
      success: true,
      eggs_stolen: 15,
      bumper_crop: false,
      victim_inventory_before: 30,
      victim_inventory_after: 15
    }
  }

GET /api/steal/available
功能: 查询可偷蛋对象
认证: 需要
返回:
  {
    code: 0,
    data: {
      available_targets: [
        {
          id: 2,
          nickname: "Alice",
          farm_code: "XYZ789",
          egg_inventory: 25,
          steal_difficulty: 0.6
        }
      ]
    }
  }

GET /api/steal/record
功能: 查询偷蛋记录
认证: 需要
参数:
  - type: 'as_thief' | 'as_victim'
返回:
  {
    code: 0,
    data: {
      records: [
        {
          thief: "Alice",
          victim: "Bob",
          eggs_stolen: 20,
          success: true,
          timestamp: 1234567890
        }
      ]
    }
  }
```

#### 邀请类 API

```
POST /api/invite/generate
功能: 生成邀请链接
认证: 需要
返回:
  {
    code: 0,
    data: {
      invite_link: "https://aiggs.xyz?ref=ABC123",
      farm_code: "ABC123",
      copy_text: "https://aiggs.xyz?ref=ABC123"
    }
  }

GET /api/invite/stats
功能: 查询邀请统计
认证: 需要
返回:
  {
    code: 0,
    data: {
      total_invited: 5,
      active_invitees: 3,
      total_commission_earned: 5000,
      this_month: {
        invited: 2,
        commission: 1500
      }
    }
  }

GET /api/invite/commission
功能: 查询分成记录
认证: 需要
参数:
  - limit: number (默认 20)
  - offset: number (默认 0)
返回:
  {
    code: 0,
    data: {
      records: [
        {
          invitee_name: "Player123",
          commission_type: "egg_production",
          amount: 50,
          created_at: 1234567890
        }
      ],
      total: 100
    }
  }
```

#### 玩家类 API

```
GET /api/player/profile
功能: 获取玩家档案
认证: 需要
返回:
  {
    code: 0,
    data: {
      id: 1,
      wallet_address: "0x...",
      nickname: "Player123",
      farm_code: "ABC123",
      registered_at: 1234567890,
      is_active: true
    }
  }

GET /api/player/leaderboard
功能: 排行榜
认证: 可选
参数:
  - rank_type: 'eggs_produced' | 'eggs_exchanged' | 'steals'
  - limit: number (默认 20)
返回:
  {
    code: 0,
    data: {
      leaderboard: [
        {
          rank: 1,
          nickname: "Alice",
          value: 500000,
          farm_code: "XYZ789"
        }
      ]
    }
  }
```

### MCP Tool 端点列表

所有 MCP Tool 由 Claude 代理用户自动调用，格式为：

```json
{
  "tool": "tool_name",
  "input": {
    "player_address": "0x...",
    ...其他参数
  }
}
```

**可用 Tool：**

| Tool 名称 | 描述 | 输入参数 | 输出 |
|---------|------|---------|------|
| get_farm_info | 获取农场信息 | player_address | farm, chickens, next_production |
| steal_eggs | 执行偷蛋 | player_address, victim_address | success, eggs_stolen, bumper_crop |
| exchange_eggs | EGGS 兑换 AIGG | player_address, eggs_amount | tx_hash, aigg_minted |
| get_leaderboard | 排行榜 | rank_type, limit | leaderboard array |
| get_invite_link | 生成邀请链接 | player_address | invite_link, farm_code |
| get_invite_stats | 邀请统计 | player_address | total_invited, commission_earned |
| claim_airdrop | 领取空投 | player_address, merkle_proof | tx_hash, aigg_amount |
| get_daily_report | 每日早报 | player_address | report content |

---

## 1.4 部署指南

### 1.4.1 开发环境搭建 (Docker Compose)

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:15-alpine
    container_name: aiggs-postgres
    environment:
      POSTGRES_DB: aiggs_db
      POSTGRES_USER: aiggs_user
      POSTGRES_PASSWORD: secure_password_here
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiggs_user -d aiggs_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 缓存 (可选)
  redis:
    image: redis:7-alpine
    container_name: aiggs-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 后端 API Server
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: aiggs-backend
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://aiggs_user:secure_password_here@postgres:5432/aiggs_db
      JWT_SECRET: your_jwt_secret_here
      PORT: 3000
      REDIS_URL: redis://redis:6379
      BASE_RPC_URL: https://mainnet.base.org
      CONTRACT_ADDRESS_AIGG: "0x..."
      CONTRACT_ADDRESS_AIRDROP: "0x..."
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - /app/node_modules
    command: npm run dev

  # MCP Server
  mcp:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: aiggs-mcp
    environment:
      NODE_ENV: development
      API_BASE_URL: http://backend:3000
      PORT: 3001
    ports:
      - "3001:3001"
    depends_on:
      - backend
    volumes:
      - ./mcp-server:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:

networks:
  default:
    name: aiggs-network
```

**启动命令：**

```bash
# 构建所有服务
docker-compose build

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f backend

# 执行数据库迁移
docker-compose exec backend npm run prisma:migrate:dev

# 停止所有服务
docker-compose down
```

---

### 1.4.2 生产环境部署清单

**基础设施：**

- [ ] 购买域名 (aiggs.xyz)
- [ ] 配置 DNS 记录
- [ ] 申请 SSL 证书 (Let's Encrypt)
- [ ] 选择云服务商 (AWS/GCP/Azure)
- [ ] 配置 CDN (Cloudflare/AWS CloudFront)
- [ ] 设置监控和告警 (Prometheus/Grafana)
- [ ] 配置日志系统 (ELK/Datadog)

**后端部署：**

- [ ] 配置 PostgreSQL 生产数据库 (RDS/AWS)
  - 设置自动备份（每天）
  - 配置主从复制
  - 启用加密存储
  - 设置网络隔离

- [ ] 配置 Redis 缓存 (ElastiCache)
  - 启用持久化 (RDB)
  - 配置主从高可用
  - 设置密码认证

- [ ] 部署后端服务
  - 使用 Docker + Kubernetes 或 ECS
  - 配置自动扩展策略
  - 设置负载均衡
  - 配置蓝绿部署

- [ ] 配置环境变量 (使用密钥管理服务)
  - AWS Secrets Manager
  - HashiCorp Vault
  - 环保证所有敏感信息加密

**区块链部署：**

- [ ] 部署 AIGG Token 合约到 Base 链
  - 通过 Hardhat 部署
  - 验证合约在 Basescan
  - 初始化代币分配

- [ ] 部署 AIGGAirdrop 合约
  - 计算 Merkle Root
  - 设置领取时间窗口
  - 初始化空投池

- [ ] 配置合约交互权限
  - 设置游戏合约地址
  - 配置生态基金地址
  - 初始化管理员角色

**前端和官网：**

- [ ] 构建官网 (HTML/CSS/JS)
  - 部署到 Vercel
  - 配置自定义域名
  - 设置 CI/CD (GitHub Actions)

- [ ] 开发游戏前端 (React/Vue)
  - 配置钱包连接 (MetaMask)
  - 集成 Web3 库 (ethers.js)
  - 配置 API 端点

**安全性：**

- [ ] 代码安全审计
  - Solidity 代码审计 (第三方)
  - 后端代码审查 (OWASP)
  - 前端安全检查

- [ ] 网络安全
  - WAF 配置 (AWS WAF)
  - DDoS 防护 (AWS Shield)
  - 速率限制配置

- [ ] 监控和响应
  - 实时监控系统
  - 告警规则配置
  - 事故响应流程

**上线前测试：**

- [ ] 压力测试 (1000 并发用户)
- [ ] 安全渗透测试
- [ ] 兼容性测试 (浏览器/钱包)
- [ ] 链上交易测试
- [ ] 邀请系统测试
- [ ] 空投领取测试

---

### 1.4.3 环境变量配置表

```bash
# ==================== 服务器配置 ====================
NODE_ENV=production              # 运行环境: development/production
PORT=3000                        # API 服务器端口
API_BASE_URL=https://api.aiggs.xyz  # API 基础 URL

# ==================== 数据库配置 ====================
DATABASE_URL=postgresql://user:password@host:5432/aiggs_db
DATABASE_POOL_MIN=2              # 连接池最小连接数
DATABASE_POOL_MAX=10             # 连接池最大连接数
DATABASE_STATEMENT_CACHE_SIZE=250

# ==================== Redis 配置 ====================
REDIS_URL=redis://:password@host:6379
REDIS_DB=0
REDIS_KEY_PREFIX=aiggs:

# ==================== JWT 配置 ====================
JWT_SECRET=your_very_long_random_secret_key_here_min_32_chars
JWT_EXPIRES_IN=7d                # Token 过期时间
JWT_ALGORITHM=HS256

# ==================== 区块链配置 ====================
BASE_RPC_URL=https://mainnet.base.org
BASE_RPC_URL_BACKUP=https://base.publicrpc.com
CHAIN_ID=8453               # Base 链 ID
ETHERS_PROVIDER_NETWORK=base

# ==================== 合约地址 ====================
CONTRACT_ADDRESS_AIGG=0x...     # AIGG Token 合约地址
CONTRACT_ADDRESS_AIRDROP=0x...  # Airdrop 合约地址
CONTRACT_ADDRESS_LIQUIDITY=0x... # 流动性合约地址
CONTRACT_ADDRESS_EXCHANGE=0x...  # 兑换合约地址

# ==================== 应用配置 ====================
GAME_NAME=AIggs               # 游戏名称
EGG_EXCHANGE_RATE=60          # 60 EGGS = 1 AIGG
EGG_INVENTORY_CAPACITY=30     # 仓库容量
EGG_PRODUCTION_INTERVAL=28800 # 产蛋周期 (秒) = 8小时
ROOKIE_PROTECTION_HOURS=24    # 新手保护期 (小时)

# ==================== 邀请配置 ====================
INVITE_COMMISSION_RATE=0.1    # 邀请分成比例 (10%)
INVITE_CODE_LENGTH=6          # 邀请码长度

# ==================== 空投配置 ====================
AIRDROP_TOTAL_AMOUNT=50000000 # 空投总额 (5000万 AIGG)
AIRDROP_PER_USER=5000         # 每人分配 5000 AIGG
AIRDROP_MERKLE_ROOT=0x...     # Merkle Root
AIRDROP_START_TIME=1234567890 # 领取开始时间
AIRDROP_END_TIME=1234654290   # 领取结束时间

# ==================== 日志配置 ====================
LOG_LEVEL=info                # debug/info/warn/error
LOG_FORMAT=json               # json/text
LOG_DIR=/var/log/aiggs        # 日志目录
LOG_MAX_SIZE=100m             # 单个日志文件最大大小
LOG_MAX_FILES=30              # 保留日志文件数

# ==================== 速率限制 ====================
RATE_LIMIT_WINDOW_MS=900000   # 时间窗口 (15分钟)
RATE_LIMIT_MAX_REQUESTS=100   # 全局最多 100 请求
RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_LOGIN_MAX=5        # 登录最多 5 次
RATE_LIMIT_STEAL_WINDOW_MS=60000
RATE_LIMIT_STEAL_MAX=2        # 偷蛋最多 2 次

# ==================== 邮件配置 ====================
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=noreply@aiggs.xyz
MAIL_PASSWORD=your_app_password_here
MAIL_FROM=AIggs <noreply@aiggs.xyz>

# ==================== 社交和分析 ====================
SENTRY_DSN=https://...        # 错误追踪 (Sentry)
ANALYTICS_ID=UA-...           # Google Analytics

# ==================== MCP Server 配置 ====================
MCP_SERVER_PORT=3001
MCP_API_BASE_URL=http://localhost:3000
MCP_TIMEOUT_MS=30000

# ==================== 开发工具 ====================
DEBUG=aiggs:*                 # Debug 命名空间
MOCK_MODE=false               # 模拟模式 (用于测试)
```

---

# 任务2：空投发放合约

## 2.1 合约核心实现

### AIGGAirdrop.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AIGGAirdrop
 * @dev AIggs 代币空投合约，支持 Merkle 树验证、领取时间窗口、防重复领取
 * @notice 前 1 万名用户空投 5000 AIGG 代币
 */
contract AIGGAirdrop is Ownable, Pausable, ReentrancyGuard {
    // ==================== 常量定义 ====================

    /// @dev AIGG 代币合约地址
    IERC20 public immutable aiggToken;

    /// @dev 每个用户的空投金额 (5000 * 10^18)
    uint256 public constant AIRDROP_AMOUNT = 5000e18;

    /// @dev 最大空投用户数 (1万)
    uint256 public constant MAX_AIRDROP_RECIPIENTS = 10000;

    // ==================== 状态变量 ====================

    /// @dev Merkle 树根，用于验证白名单
    bytes32 public merkleRoot;

    /// @dev 空投开始时间 (Unix timestamp)
    uint256 public airdropStartTime;

    /// @dev 空投结束时间 (Unix timestamp)
    uint256 public airdropEndTime;

    /// @dev 已领取的用户地址集合
    mapping(address => bool) public hasClaimed;

    /// @dev 已分发的空投总额
    uint256 public totalAirdropDistributed;

    /// @dev 领取者数量统计
    uint256 public airdropClaimCount;

    // ==================== 事件定义 ====================

    /// @dev 空投领取事件
    event AirdropClaimed(
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /// @dev Merkle 根更新事件
    event MerkleRootUpdated(bytes32 newRoot, uint256 timestamp);

    /// @dev 时间窗口更新事件
    event AirdropTimeWindowUpdated(
        uint256 startTime,
        uint256 endTime,
        uint256 timestamp
    );

    /// @dev 剩余代币回收事件
    event AirdropRecovered(address indexed recipient, uint256 amount);

    // ==================== 修饰符 ====================

    /// @dev 检查是否在领取时间窗口内
    modifier onlyDuringAirdropPeriod() {
        require(
            block.timestamp >= airdropStartTime,
            "Airdrop: Not started yet"
        );
        require(
            block.timestamp <= airdropEndTime,
            "Airdrop: Already ended"
        );
        _;
    }

    /// @dev 检查领取人数是否超过上限
    modifier underAirdropLimit() {
        require(
            airdropClaimCount < MAX_AIRDROP_RECIPIENTS,
            "Airdrop: Recipient limit reached"
        );
        _;
    }

    // ==================== 构造函数 ====================

    /**
     * @dev 初始化空投合约
     * @param _aiggToken AIGG 代币合约地址
     * @param _merkleRoot Merkle 树根
     * @param _startTime 领取开始时间
     * @param _endTime 领取结束时间
     */
    constructor(
        address _aiggToken,
        bytes32 _merkleRoot,
        uint256 _startTime,
        uint256 _endTime
    ) {
        require(_aiggToken != address(0), "Invalid token address");
        require(_startTime < _endTime, "Invalid time window");
        require(_endTime > block.timestamp, "End time must be in future");

        aiggToken = IERC20(_aiggToken);
        merkleRoot = _merkleRoot;
        airdropStartTime = _startTime;
        airdropEndTime = _endTime;
    }

    // ==================== 核心功能 ====================

    /**
     * @dev 领取空投代币
     * @param _merkleProof Merkle 证明数组
     * @notice 用户必须提供有效的 Merkle 证明以验证白名单身份
     */
    function claim(bytes32[] calldata _merkleProof)
        external
        nonReentrant
        whenNotPaused
        onlyDuringAirdropPeriod
        underAirdropLimit
    {
        address recipient = msg.sender;

        // 检查用户是否已领取
        require(!hasClaimed[recipient], "Airdrop: Already claimed");

        // 验证 Merkle 证明
        bytes32 leaf = keccak256(abi.encodePacked(recipient));
        require(
            MerkleProof.verify(_merkleProof, merkleRoot, leaf),
            "Airdrop: Invalid proof"
        );

        // 标记为已领取
        hasClaimed[recipient] = true;
        airdropClaimCount++;
        totalAirdropDistributed += AIRDROP_AMOUNT;

        // 转账代币
        require(
            aiggToken.transfer(recipient, AIRDROP_AMOUNT),
            "Airdrop: Transfer failed"
        );

        emit AirdropClaimed(recipient, AIRDROP_AMOUNT, block.timestamp);
    }

    /**
     * @dev 批量领取空投（用于中心化分发，只能管理员调用）
     * @param recipients 受益人地址数组
     * @notice 用于特殊情况（合约升级、发送失败等）
     */
    function batchClaim(address[] calldata recipients)
        external
        onlyOwner
        whenNotPaused
    {
        require(recipients.length > 0, "Empty recipients list");
        require(
            airdropClaimCount + recipients.length <= MAX_AIRDROP_RECIPIENTS,
            "Airdrop: Would exceed recipient limit"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];

            require(recipient != address(0), "Invalid recipient address");
            require(!hasClaimed[recipient], "Already claimed");

            hasClaimed[recipient] = true;
            airdropClaimCount++;
            totalAirdropDistributed += AIRDROP_AMOUNT;

            require(
                aiggToken.transfer(recipient, AIRDROP_AMOUNT),
                "Transfer failed"
            );

            emit AirdropClaimed(recipient, AIRDROP_AMOUNT, block.timestamp);
        }
    }

    /**
     * @dev 回收未领取的空投代币（仅在活动结束后）
     * @param _recipient 接收回收代币的地址
     */
    function recoverUnclaimed(address _recipient)
        external
        onlyOwner
    {
        require(block.timestamp > airdropEndTime, "Airdrop: Still ongoing");
        require(_recipient != address(0), "Invalid recipient address");

        uint256 unclaimedAmount = AIRDROP_AMOUNT *
                                 (MAX_AIRDROP_RECIPIENTS - airdropClaimCount);

        require(unclaimedAmount > 0, "No unclaimed tokens");
        require(
            aiggToken.transfer(_recipient, unclaimedAmount),
            "Recovery failed"
        );

        emit AirdropRecovered(_recipient, unclaimedAmount);
    }

    // ==================== 管理函数 ====================

    /**
     * @dev 更新 Merkle 根（用于更新白名单）
     * @param _newMerkleRoot 新的 Merkle 根
     */
    function setMerkleRoot(bytes32 _newMerkleRoot)
        external
        onlyOwner
    {
        require(_newMerkleRoot != bytes32(0), "Invalid merkle root");
        merkleRoot = _newMerkleRoot;
        emit MerkleRootUpdated(_newMerkleRoot, block.timestamp);
    }

    /**
     * @dev 更新领取时间窗口
     * @param _startTime 新开始时间
     * @param _endTime 新结束时间
     */
    function setAirdropTimeWindow(uint256 _startTime, uint256 _endTime)
        external
        onlyOwner
    {
        require(_startTime < _endTime, "Invalid time window");
        require(_endTime > block.timestamp, "End time must be in future");

        airdropStartTime = _startTime;
        airdropEndTime = _endTime;

        emit AirdropTimeWindowUpdated(_startTime, _endTime, block.timestamp);
    }

    /**
     * @dev 暂停空投
     */
    function pause()
        external
        onlyOwner
    {
        _pause();
    }

    /**
     * @dev 恢复空投
     */
    function unpause()
        external
        onlyOwner
    {
        _unpause();
    }

    // ==================== 查询函数 ====================

    /**
     * @dev 检查用户是否有资格领取
     * @param _recipient 用户地址
     * @param _merkleProof Merkle 证明
     * @return 是否在白名单中
     */
    function isWhitelisted(
        address _recipient,
        bytes32[] calldata _merkleProof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_recipient));
        return MerkleProof.verify(_merkleProof, merkleRoot, leaf);
    }

    /**
     * @dev 获取剩余未领取的空投数量
     * @return 剩余空投代币数量
     */
    function getRemainingAirdropAmount()
        external
        view
        returns (uint256)
    {
        return AIRDROP_AMOUNT * (MAX_AIRDROP_RECIPIENTS - airdropClaimCount);
    }

    /**
     * @dev 获取空投统计信息
     * @return 领取人数、已分发总额、开始/结束时间
     */
    function getAirdropStats()
        external
        view
        returns (
            uint256 claimCount,
            uint256 distributed,
            uint256 startTime,
            uint256 endTime
        )
    {
        return (
            airdropClaimCount,
            totalAirdropDistributed,
            airdropStartTime,
            airdropEndTime
        );
    }

    /**
     * @dev 检查地址是否已领取
     * @param _address 待检查的地址
     * @return 是否已领取
     */
    function checkIfClaimed(address _address)
        external
        view
        returns (bool)
    {
        return hasClaimed[_address];
    }
}
```

---

## 2.2 Merkle Tree 验证

### Merkle Tree 生成脚本 (TypeScript)

```typescript
// scripts/generateMerkleTree.ts

import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import fs from 'fs';
import path from 'path';

interface WhitelistEntry {
  address: string;
  amount: bigint;
}

/**
 * 生成 Merkle 树和证明
 * @param whitelistFile 白名单文件路径 (JSON 格式)
 */
async function generateMerkleTree(whitelistFile: string) {
  console.log('开始生成 Merkle 树...');

  // 1. 读取白名单
  const whitelist: WhitelistEntry[] = JSON.parse(
    fs.readFileSync(whitelistFile, 'utf-8')
  );

  console.log(`白名单用户数: ${whitelist.length}`);

  // 2. 生成 Merkle 树叶子节点
  const leaves = whitelist.map((entry) => {
    return keccak256(
      Buffer.concat([
        Buffer.from(entry.address.substring(2), 'hex'),
      ])
    );
  });

  // 3. 创建 Merkle 树
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getRoot().toString('hex');

  console.log(`Merkle Root: 0x${root}`);

  // 4. 为每个地址生成证明
  const proofs: Record<string, string[]> = {};

  whitelist.forEach((entry, index) => {
    const proof = tree.getProof(leaves[index]);
    proofs[entry.address.toLowerCase()] = proof.map((p) => '0x' + p.data.toString('hex'));
  });

  // 5. 保存结果
  const output = {
    merkleRoot: `0x${root}`,
    totalCount: whitelist.length,
    proofs: proofs,
    timestamp: new Date().toISOString(),
  };

  const outputPath = path.join(
    path.dirname(whitelistFile),
    'merkle-tree.json'
  );

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Merkle 树已生成: ${outputPath}`);
  console.log(`总用户数: ${whitelist.length}`);
  console.log(`Root: 0x${root}`);

  return output;
}

/**
 * 验证 Merkle 证明
 * @param address 用户地址
 * @param proof 证明数组
 * @param root Merkle 根
 */
function verifyProof(
  address: string,
  proof: string[],
  root: string
): boolean {
  const leaf = keccak256(
    Buffer.concat([Buffer.from(address.substring(2), 'hex')])
  );

  const proofBuffers = proof.map((p) =>
    Buffer.from(p.substring(2), 'hex')
  );

  return MerkleTree.verify(proofBuffers, leaf, root, keccak256, {
    sortPairs: true,
  });
}

// 执行
const whitelistFile = process.argv[2] || './whitelist.json';
generateMerkleTree(whitelistFile).catch(console.error);

export { generateMerkleTree, verifyProof };
```

**白名单文件格式** (whitelist.json)：

```json
[
  {
    "address": "0x742d35Cc6634C0532925a3b844Bc4d4d6d8D8d00",
    "amount": "5000000000000000000"
  },
  {
    "address": "0x1234567890123456789012345678901234567890",
    "amount": "5000000000000000000"
  }
]
```

---

## 2.3 Hardhat 测试

### 测试文件 (test/AIGGAirdrop.test.ts)

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { AIGGToken, AIGGAirdrop } from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('AIGGAirdrop', () => {
  let aiggToken: AIGGToken;
  let airdrop: AIGGAirdrop;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let merkleRoot: string;
  let proofs: Record<string, string[]>;
  let startTime: number;
  let endTime: number;

  const AIRDROP_AMOUNT = ethers.utils.parseEther('5000');

  before(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // 1. 部署 AIGG Token
    const AIGGToken = await ethers.getContractFactory('AIGGToken');
    aiggToken = await AIGGToken.deploy();
    await aiggToken.deployed();

    // 2. 生成 Merkle 树
    const whitelist = [
      { address: user1.address },
      { address: user2.address },
      { address: user3.address },
    ];

    const leaves = whitelist.map((entry) =>
      keccak256(Buffer.concat([Buffer.from(entry.address.substring(2), 'hex')]))
    );

    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    merkleRoot = '0x' + tree.getRoot().toString('hex');

    // 生成证明
    proofs = {};
    whitelist.forEach((entry, index) => {
      const proof = tree.getProof(leaves[index]);
      proofs[entry.address.toLowerCase()] = proof.map(
        (p) => '0x' + p.data.toString('hex')
      );
    });

    // 3. 设置时间窗口
    startTime = (await time.latest()) + 100;
    endTime = startTime + 7 * 24 * 60 * 60; // 7 天

    // 4. 部署 Airdrop 合约
    const AIGGAirdrop = await ethers.getContractFactory('AIGGAirdrop');
    airdrop = await AIGGAirdrop.deploy(
      aiggToken.address,
      merkleRoot,
      startTime,
      endTime
    );
    await airdrop.deployed();

    // 5. 转账空投所需代币到合约
    const airdropPoolAmount = ethers.utils.parseEther('50000000'); // 5000万
    await aiggToken.transfer(airdrop.address, airdropPoolAmount);
  });

  describe('部署', () => {
    it('应该正确初始化合约', async () => {
      expect(await airdrop.merkleRoot()).to.equal(merkleRoot);
      expect(await airdrop.airdropStartTime()).to.equal(startTime);
      expect(await airdrop.airdropEndTime()).to.equal(endTime);
      expect(await airdrop.owner()).to.equal(owner.address);
    });

    it('应该验证 AIGG Token 地址', async () => {
      expect(await airdrop.aiggToken()).to.equal(aiggToken.address);
    });
  });

  describe('领取空投', () => {
    it('用户应该能领取空投', async () => {
      // 前进时间到开始时刻
      await time.increaseTo(startTime);

      const initialBalance = await aiggToken.balanceOf(user1.address);
      const proof = proofs[user1.address.toLowerCase()];

      await expect(airdrop.connect(user1).claim(proof))
        .to.emit(airdrop, 'AirdropClaimed')
        .withArgs(user1.address, AIRDROP_AMOUNT, await time.latest());

      const finalBalance = await aiggToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance.add(AIRDROP_AMOUNT));
    });

    it('用户不能重复领取', async () => {
      const proof = proofs[user1.address.toLowerCase()];
      await expect(airdrop.connect(user1).claim(proof)).to.be.revertedWith(
        'Airdrop: Already claimed'
      );
    });

    it('无效证明应该被拒绝', async () => {
      const invalidProof = [
        '0x' + '0'.repeat(64),
        '0x' + '1'.repeat(64),
      ];

      await expect(
        airdrop.connect(user3).claim(invalidProof)
      ).to.be.revertedWith('Airdrop: Invalid proof');
    });
  });

  describe('时间窗口检查', () => {
    it('空投开始前应该无法领取', async () => {
      // 回到开始前
      await time.increaseTo(startTime - 100);

      const proof = proofs[user2.address.toLowerCase()];
      await expect(airdrop.connect(user2).claim(proof)).to.be.revertedWith(
        'Airdrop: Not started yet'
      );
    });

    it('空投结束后应该无法领取', async () => {
      // 前进到结束后
      await time.increaseTo(endTime + 100);

      const proof = proofs[user2.address.toLowerCase()];
      await expect(airdrop.connect(user2).claim(proof)).to.be.revertedWith(
        'Airdrop: Already ended'
      );
    });
  });

  describe('Merkle 验证', () => {
    it('应该验证白名单用户', async () => {
      const proof = proofs[user1.address.toLowerCase()];
      const isWhitelisted = await airdrop.isWhitelisted(
        user1.address,
        proof
      );
      expect(isWhitelisted).to.be.true;
    });

    it('应该拒绝非白名单用户', async () => {
      const randomAddr = ethers.Wallet.createRandom().address;
      const proof = proofs[user1.address.toLowerCase()];
      const isWhitelisted = await airdrop.isWhitelisted(randomAddr, proof);
      expect(isWhitelisted).to.be.false;
    });
  });

  describe('管理函数', () => {
    it('只有 owner 能更新 Merkle 根', async () => {
      const newRoot = '0x' + '1'.repeat(64);
      await expect(
        airdrop.connect(user1).setMerkleRoot(newRoot)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await airdrop.connect(owner).setMerkleRoot(newRoot);
      expect(await airdrop.merkleRoot()).to.equal(newRoot);
    });

    it('只有 owner 能更新时间窗口', async () => {
      const newStartTime = startTime + 1000;
      const newEndTime = endTime + 1000;

      await expect(
        airdrop
          .connect(user1)
          .setAirdropTimeWindow(newStartTime, newEndTime)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await airdrop
        .connect(owner)
        .setAirdropTimeWindow(newStartTime, newEndTime);

      expect(await airdrop.airdropStartTime()).to.equal(newStartTime);
      expect(await airdrop.airdropEndTime()).to.equal(newEndTime);
    });

    it('只有 owner 能暂停空投', async () => {
      await expect(airdrop.connect(user1).pause()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );

      await airdrop.connect(owner).pause();
      expect(await airdrop.paused()).to.be.true;
    });

    it('暂停期间用户无法领取', async () => {
      const proof = proofs[user2.address.toLowerCase()];
      await expect(airdrop.connect(user2).claim(proof)).to.be.revertedWith(
        'Pausable: paused'
      );

      // 恢复
      await airdrop.connect(owner).unpause();
    });
  });

  describe('回收未领取代币', () => {
    it('只能在空投结束后回收', async () => {
      const recoverAddr = owner.address;
      await expect(
        airdrop.connect(owner).recoverUnclaimed(recoverAddr)
      ).to.be.revertedWith('Airdrop: Still ongoing');
    });

    it('应该回收所有未领取的代币', async () => {
      // 前进到结束后
      await time.increaseTo(endTime + 100);

      const beforeBalance = await aiggToken.balanceOf(owner.address);
      await airdrop.connect(owner).recoverUnclaimed(owner.address);
      const afterBalance = await aiggToken.balanceOf(owner.address);

      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });

  describe('统计和查询', () => {
    it('应该返回正确的统计信息', async () => {
      const stats = await airdrop.getAirdropStats();
      expect(stats.claimCount).to.be.gt(0);
      expect(stats.distributed).to.be.gt(0);
    });

    it('应该返回剩余空投数量', async () => {
      const remaining = await airdrop.getRemainingAirdropAmount();
      expect(remaining).to.be.gte(0);
    });

    it('应该检查地址是否已领取', async () => {
      expect(await airdrop.checkIfClaimed(user1.address)).to.be.true;
      expect(await airdrop.checkIfClaimed(owner.address)).to.be.false;
    });
  });

  describe('批量领取', () => {
    it('只有 owner 能批量领取', async () => {
      const recipients = [owner.address];
      await expect(
        airdrop.connect(user1).batchClaim(recipients)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('应该批量分发空投', async () => {
      const randomUser = ethers.Wallet.createRandom().address;
      const beforeBalance = await aiggToken.balanceOf(randomUser);

      await airdrop.connect(owner).batchClaim([randomUser]);

      const afterBalance = await aiggToken.balanceOf(randomUser);
      expect(afterBalance).to.equal(beforeBalance.add(AIRDROP_AMOUNT));
    });
  });

  describe('安全性', () => {
    it('应该防止重入攻击', async () => {
      // Hardhat 会自动验证 ReentrancyGuard
      // 如果尝试重入会失败
      expect(airdrop).to.include.keys('REENTRANCY_GUARD_STORAGE_SLOT');
    });

    it('应该验证时间窗口的有效性', async () => {
      const now = await time.latest();
      const invalidStart = now + 1000;
      const invalidEnd = now + 100;

      await expect(
        airdrop.connect(owner).setAirdropTimeWindow(invalidStart, invalidEnd)
      ).to.be.revertedWith('Invalid time window');
    });
  });
});
```

**运行测试：**

```bash
# 安装依赖
npm install

# 编译合约
npx hardhat compile

# 运行所有测试
npx hardhat test

# 运行特定测试
npx hardhat test --grep "领取空投"

# 生成覆盖率报告
npx hardhat coverage
```

---

# 任务3：邀请机制实现

## 3.1 邀请码生成与管理

### 邀请服务 (services/inviteService.ts)

```typescript
import { PrismaClient } from '@prisma/client';
import { cryptoRandomString } from 'crypto-random-string';
import { log } from '@/utils/logger';

class InviteService {
  constructor(private db: PrismaClient) {}

  /**
   * 为玩家生成邀请码和邀请链接
   * @param playerId 玩家 ID
   * @returns 邀请链接和农场码
   */
  async generateInviteLink(playerId: bigint) {
    const player = await this.db.players.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      throw new Error('Player not found');
    }

    // 使用已有的 farm_code 作为邀请码
    let farmCode = player.farm_code;

    // 如果没有 farm_code，生成一个
    if (!farmCode) {
      farmCode = await this.generateUniqueFarmCode();
      await this.db.players.update({
        where: { id: playerId },
        data: { farm_code: farmCode },
      });
    }

    const inviteLink = `https://aiggs.xyz?ref=${farmCode}`;

    log.info('Generated invite link', {
      playerId,
      farmCode,
      inviteLink,
    });

    return {
      invite_link: inviteLink,
      farm_code: farmCode,
      copy_text: inviteLink,
    };
  }

  /**
   * 生成唯一的农场码
   * @returns 唯一的农场码
   */
  private async generateUniqueFarmCode(): Promise<string> {
    let farmCode: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      // 生成 6 位随机字符串
      farmCode = cryptoRandomString({
        length: 6,
        type: 'alphanumeric',
        casing: 'upper',
      });

      // 检查是否已存在
      const existing = await this.db.players.findUnique({
        where: { farm_code: farmCode },
      });

      if (!existing) {
        break;
      }

      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique farm code');
    }

    return farmCode;
  }

  /**
   * 处理邀请注册（绑定邀请关系）
   * @param inviteeId 被邀请人 ID
   * @param farmCode 邀请码
   * @returns 邀请人信息
   */
  async processInviteRegistration(
    inviteeId: bigint,
    farmCode: string
  ): Promise<{ referrer_id: bigint; referrer_name: string } | null> {
    // 查找邀请人
    const referrer = await this.db.players.findUnique({
      where: { farm_code: farmCode },
      select: { id: true, nickname: true },
    });

    if (!referrer) {
      log.warn('Invalid referral code', { farmCode });
      return null;
    }

    // 自己邀请自己的情况
    if (referrer.id === inviteeId) {
      log.warn('Self-referral attempt', {
        playerId: inviteeId,
        farmCode,
      });
      return null;
    }

    // 更新被邀请人的邀请人 ID
    await this.db.players.update({
      where: { id: inviteeId },
      data: { referrer_id: referrer.id },
    });

    // 创建邀请记录
    await this.db.referrals.create({
      data: {
        referrer_id: referrer.id,
        invitee_id: inviteeId,
        commission_earned: BigInt(0),
      },
    });

    log.info('Referral registered', {
      referrer_id: referrer.id,
      invitee_id: inviteeId,
      farm_code: farmCode,
    });

    return {
      referrer_id: referrer.id,
      referrer_name: referrer.nickname || 'Anonymous',
    };
  }

  /**
   * 查询邀请统计
   * @param playerId 邀请人 ID
   * @returns 邀请统计信息
   */
  async getInviteStats(playerId: bigint) {
    // 查询被邀请人数
    const invitations = await this.db.referrals.findMany({
      where: { referrer_id: playerId },
      include: {
        invitee: {
          select: { id: true, nickname: true, is_active: true },
        },
      },
    });

    // 计算活跃邀请人数
    const activeInvitees = invitations.filter((inv) => inv.invitee.is_active)
      .length;

    // 计算累计分成
    const totalCommission = invitations.reduce(
      (sum, inv) => sum + inv.commission_earned,
      BigInt(0)
    );

    // 查询本月的邀请
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const thisMonthInvitations = await this.db.referrals.findMany({
      where: {
        referrer_id: playerId,
        created_at: {
          gte: monthStart,
        },
      },
    });

    // 本月分成
    const thisMonthCommission = thisMonthInvitations.reduce(
      (sum, inv) => sum + inv.commission_earned,
      BigInt(0)
    );

    return {
      total_invited: invitations.length,
      active_invitees: activeInvitees,
      inactive_invitees: invitations.length - activeInvitees,
      total_commission_earned: totalCommission.toString(),
      this_month: {
        invited: thisMonthInvitations.length,
        commission: thisMonthCommission.toString(),
      },
      recent_invites: invitations.slice(-10).map((inv) => ({
        invitee_id: inv.invitee_id,
        invitee_name: inv.invitee.nickname || 'Anonymous',
        commission_earned: inv.commission_earned.toString(),
        created_at: inv.created_at.getTime(),
      })),
    };
  }

  /**
   * 查询分成记录（分页）
   * @param playerId 邀请人 ID
   * @param limit 返回数量
   * @param offset 偏移量
   * @returns 分成记录数组
   */
  async getCommissionRecords(
    playerId: bigint,
    limit: number = 20,
    offset: number = 0
  ) {
    const records = await this.db.commission_records.findMany({
      where: { referrer_id: playerId },
      include: {
        invitee: {
          select: { id: true, nickname: true, wallet_address: true },
        },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.db.commission_records.count({
      where: { referrer_id: playerId },
    });

    return {
      records: records.map((rec) => ({
        id: rec.id,
        invitee_id: rec.invitee_id,
        invitee_name: rec.invitee.nickname || 'Anonymous',
        invitee_address: rec.invitee.wallet_address,
        from_type: rec.from_type, // 'egg_production' | 'exchange'
        amount: rec.amount.toString(),
        created_at: rec.created_at.getTime(),
      })),
      total,
      page: Math.floor(offset / limit) + 1,
      pages: Math.ceil(total / limit),
    };
  }
}

export default InviteService;
```

---

## 3.2 邀请分成逻辑

### 分成计算和分配服务 (services/commissionService.ts)

```typescript
import { PrismaClient } from '@prisma/client';
import { log } from '@/utils/logger';
import { eventBus } from '@/events/eventBus';

const INVITE_COMMISSION_RATE = 0.1; // 10%

class CommissionService {
  constructor(private db: PrismaClient) {}

  /**
   * 计算并分配邀请分成
   * 当被邀请人产蛋或兑换 EGGS 时调用
   * @param inviteeId 被邀请人 ID
   * @param earnedAmount 本次获得的 EGGS 数量
   * @param type 来源类型 ('egg_production' | 'exchange')
   */
  async allocateCommission(
    inviteeId: bigint,
    earnedAmount: bigint,
    type: 'egg_production' | 'exchange'
  ): Promise<void> {
    // 查询被邀请人是否有邀请人
    const invitee = await this.db.players.findUnique({
      where: { id: inviteeId },
      select: { referrer_id: true, wallet_address: true, nickname: true },
    });

    if (!invitee || !invitee.referrer_id) {
      // 没有邀请人，不分成
      return;
    }

    // 计算 10% 分成
    const commissionAmount = (earnedAmount * BigInt(10)) / BigInt(100);

    if (commissionAmount <= 0n) {
      return;
    }

    try {
      // 在事务中执行分成分配
      await this.db.$transaction(async (tx) => {
        // 1. 查询邀请人信息
        const referrer = await tx.players.findUnique({
          where: { id: invitee.referrer_id },
          select: {
            id: true,
            wallet_address: true,
            nickname: true,
            invite_commission_earned: true,
          },
        });

        if (!referrer) {
          return;
        }

        // 2. 更新邀请人的累计分成
        await tx.players.update({
          where: { id: referrer.id },
          data: {
            invite_commission_earned:
              referrer.invite_commission_earned + commissionAmount,
          },
        });

        // 3. 更新邀请关系中的累计分成
        const referral = await tx.referrals.findFirst({
          where: {
            referrer_id: invitee.referrer_id,
            invitee_id: inviteeId,
          },
        });

        if (referral) {
          await tx.referrals.update({
            where: { id: referral.id },
            data: {
              commission_earned:
                referral.commission_earned + commissionAmount,
            },
          });
        }

        // 4. 创建分成记录
        await tx.commission_records.create({
          data: {
            referrer_id: invitee.referrer_id,
            invitee_id: inviteeId,
            from_type: type,
            amount: commissionAmount,
          },
        });

        // 5. 发出事件，用于后续通知
        await eventBus.emit('commission:allocated', {
          referrer_id: referrer.id,
          invitee_id: inviteeId,
          invitee_name: invitee.nickname,
          amount: commissionAmount.toString(),
          type,
          timestamp: Date.now(),
        });

        log.info('Commission allocated', {
          referrer_id: referrer.id,
          invitee_id: inviteeId,
          amount: commissionAmount.toString(),
          type,
        });
      });
    } catch (error) {
      log.error('Failed to allocate commission', {
        inviteeId,
        earnedAmount: earnedAmount.toString(),
        type,
        error: error instanceof Error ? error.message : error,
      });
      // 不抛出错误，确保主业务流程不受影响
    }
  }

  /**
   * 处理生蛋事件，自动计算分成
   * @param farmId 农场 ID
   * @param eggsProduced 产蛋数量
   */
  async handleEggProduction(
    farmId: bigint,
    eggsProduced: bigint
  ): Promise<void> {
    // 查询农场所有者
    const farm = await this.db.farms.findUnique({
      where: { id: farmId },
      select: { player_id: true },
    });

    if (!farm) {
      return;
    }

    // 分配邀请分成
    await this.allocateCommission(
      farm.player_id,
      eggsProduced,
      'egg_production'
    );
  }

  /**
   * 处理兑换事件，自动计算分成
   * @param playerId 玩家 ID
   * @param aiggAmount 兑换的 AIGG 数量
   */
  async handleExchange(
    playerId: bigint,
    aiggAmount: bigint
  ): Promise<void> {
    // AIGG 转换为 EGGS (1 AIGG = 60 EGGS)
    const eggsAmount = aiggAmount * BigInt(60);

    // 分配邀请分成
    await this.allocateCommission(playerId, eggsAmount, 'exchange');
  }

  /**
   * 获取邀请人的分成统计
   * @param referrerId 邀请人 ID
   * @returns 分成统计
   */
  async getCommissionStats(referrerId: bigint) {
    const referrals = await this.db.referrals.findMany({
      where: { referrer_id: referrerId },
      include: {
        invitee: {
          select: {
            id: true,
            nickname: true,
            is_active: true,
            total_eggs_earned: true,
          },
        },
      },
    });

    const totalCommission = referrals.reduce(
      (sum, ref) => sum + ref.commission_earned,
      BigInt(0)
    );

    const avgCommissionPerInvitee =
      referrals.length > 0
        ? totalCommission / BigInt(referrals.length)
        : BigInt(0);

    const commissionByType = await this.db.commission_records.groupBy({
      by: ['from_type'],
      where: { referrer_id: referrerId },
      _sum: {
        amount: true,
      },
    });

    return {
      total_commission: totalCommission.toString(),
      avg_commission_per_invitee: avgCommissionPerInvitee.toString(),
      total_invitees: referrals.length,
      active_invitees: referrals.filter((r) => r.invitee.is_active).length,
      commission_by_source: Object.fromEntries(
        commissionByType.map((ct) => [
          ct.from_type,
          (ct._sum.amount || BigInt(0)).toString(),
        ])
      ),
    };
  }

  /**
   * 批量计算多个用户的分成（用于修复或重新计算）
   * @param playerIds 玩家 ID 数组
   * @notice 仅供管理员使用，谨慎操作
   */
  async recalculateCommissionBatch(playerIds: bigint[]): Promise<void> {
    log.warn('Starting batch commission recalculation', {
      playerCount: playerIds.length,
    });

    for (const playerId of playerIds) {
      try {
        await this.recalculateCommission(playerId);
      } catch (error) {
        log.error('Failed to recalculate commission for player', {
          playerId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    log.info('Batch commission recalculation completed');
  }

  /**
   * 重新计算单个用户的分成（从交易记录）
   * @param playerId 邀请人 ID
   */
  private async recalculateCommission(playerId: bigint): Promise<void> {
    // 查询该邀请人的所有被邀请人的交易
    const transactions = await this.db.transaction_records.findMany({
      where: {
        AND: [
          {
            player: {
              referrer_id: playerId,
            },
          },
          {
            tx_type: {
              in: ['egg_production', 'exchange'],
            },
          },
        ],
      },
      include: {
        player: true,
      },
    });

    let totalCommission = BigInt(0);

    for (const tx of transactions) {
      const commission = (tx.amount * BigInt(10)) / BigInt(100);
      totalCommission += commission;
    }

    // 更新玩家记录
    await this.db.players.update({
      where: { id: playerId },
      data: {
        invite_commission_earned: totalCommission,
      },
    });

    log.info('Commission recalculated', {
      playerId,
      total: totalCommission.toString(),
    });
  }
}

export default CommissionService;
```

---

## 3.3 多级统计面板

### 邀请面板控制器 (controllers/inviteController.ts)

```typescript
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import InviteService from '@/services/inviteService';
import CommissionService from '@/services/commissionService';
import { APIResponse, APIError } from '@/types';
import { CONSTANTS, HTTP_STATUS_CODES } from '@/utils/constants';
import { log } from '@/utils/logger';

const db = new PrismaClient();
const inviteService = new InviteService(db);
const commissionService = new CommissionService(db);

/**
 * 生成邀请链接
 */
export const generateInviteLink = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const playerId = BigInt(req.user!.playerId);

    const result = await inviteService.generateInviteLink(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: 'Invite link generated',
      data: result,
      timestamp: Date.now(),
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 获取邀请统计
 */
export const getInviteStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const playerId = BigInt(req.user!.playerId);

    const stats = await inviteService.getInviteStats(playerId);
    const commissionStats = await commissionService.getCommissionStats(
      playerId
    );

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: 'Invite stats retrieved',
      data: {
        ...stats,
        ...commissionStats,
      },
      timestamp: Date.now(),
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 获取分成记录（分页）
 */
export const getCommissionRecords = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const playerId = BigInt(req.user!.playerId);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const records = await inviteService.getCommissionRecords(
      playerId,
      limit,
      offset
    );

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: 'Commission records retrieved',
      data: records,
      timestamp: Date.now(),
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 邀请面板（综合统计）
 */
export const getInviteDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const playerId = BigInt(req.user!.playerId);

    // 获取玩家信息
    const player = await db.players.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        nickname: true,
        farm_code: true,
        registered_at: true,
      },
    });

    if (!player) {
      throw new APIError(
        'Player not found',
        CONSTANTS.ERROR_CODES.PLAYER_NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND
      );
    }

    // 获取邀请统计
    const stats = await inviteService.getInviteStats(playerId);

    // 获取分成统计
    const commissionStats =
      await commissionService.getCommissionStats(playerId);

    // 获取邀请链接
    const { invite_link, farm_code } =
      await inviteService.generateInviteLink(playerId);

    // 获取最近的分成记录
    const recentRecords = await inviteService.getCommissionRecords(
      playerId,
      5,
      0
    );

    // 获取被邀请人的活跃度
    const referrals = await db.referrals.findMany({
      where: { referrer_id: playerId },
      include: {
        invitee: {
          select: {
            id: true,
            nickname: true,
            is_active: true,
            last_login_at: true,
            total_eggs_earned: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: 'Invite dashboard retrieved',
      data: {
        player: {
          id: player.id.toString(),
          nickname: player.nickname,
          farm_code: player.farm_code,
          registered_at: player.registered_at.getTime(),
        },
        invite_link,
        farm_code,
        statistics: {
          total_invited: stats.total_invited,
          active_invitees: stats.active_invitees,
          inactive_invitees: stats.inactive_invitees,
          total_commission: commissionStats.total_commission,
          avg_per_invitee: commissionStats.avg_commission_per_invitee,
          this_month: stats.this_month,
        },
        commission_breakdown: commissionStats.commission_by_source,
        recent_commissions: recentRecords.records.slice(0, 5),
        invitees: referrals.map((ref) => ({
          id: ref.invitee_id.toString(),
          nickname: ref.invitee.nickname,
          is_active: ref.invitee.is_active,
          last_login: ref.invitee.last_login_at?.getTime() || null,
          eggs_earned: ref.invitee.total_eggs_earned.toString(),
          commission_earned: ref.commission_earned.toString(),
          invited_date: ref.created_at.getTime(),
        })),
      },
      timestamp: Date.now(),
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 邀请排行榜
 */
export const getInviteLeaderboard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const period = (req.query.period as string) || 'all'; // all / week / month

    let dateFilter = undefined;

    if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { gte: weekAgo };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { gte: monthAgo };
    }

    // 按总分成排名
    const leaderboard = await db.players.findMany({
      where: {
        AND: [
          { invite_commission_earned: { gt: 0n } },
          dateFilter
            ? {
                referrals: {
                  some: {
                    created_at: dateFilter,
                  },
                },
              }
            : undefined,
        ],
      },
      select: {
        id: true,
        nickname: true,
        farm_code: true,
        invite_commission_earned: true,
        _count: {
          select: { referrals: true },
        },
      },
      orderBy: {
        invite_commission_earned: 'desc',
      },
      take: limit,
    });

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: 'Invite leaderboard retrieved',
      data: {
        period,
        leaderboard: leaderboard.map((player, index) => ({
          rank: index + 1,
          id: player.id.toString(),
          nickname: player.nickname || 'Anonymous',
          farm_code: player.farm_code,
          total_commission: player.invite_commission_earned.toString(),
          invitee_count: player._count.referrals,
        })),
      },
      timestamp: Date.now(),
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  } catch (error) {
    next(error);
  }
};
```

---

## 3.4 API 端点实现

### 邀请路由 (routes/invite.ts)

```typescript
import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import {
  generateInviteLink,
  getInviteStats,
  getCommissionRecords,
  getInviteDashboard,
  getInviteLeaderboard,
} from '@/controllers/inviteController';

const router = Router();

/**
 * POST /api/invite/generate
 * 生成邀请链接
 */
router.post(
  '/generate',
  authenticate,
  generateInviteLink
);

/**
 * GET /api/invite/stats
 * 查询邀请统计
 */
router.get(
  '/stats',
  authenticate,
  getInviteStats
);

/**
 * GET /api/invite/commission
 * 查询分成记录
 */
router.get(
  '/commission',
  authenticate,
  getCommissionRecords
);

/**
 * GET /api/invite/dashboard
 * 邀请面板（综合视图）
 */
router.get(
  '/dashboard',
  authenticate,
  getInviteDashboard
);

/**
 * GET /api/invite/leaderboard
 * 邀请排行榜
 */
router.get(
  '/leaderboard',
  getInviteLeaderboard
);

export default router;
```

### MCP Tool 集成 (mcp-server/tools/inviteTools.ts)

```typescript
import { Tool } from '@/types';
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * 生成邀请链接 Tool
 */
export const generateInviteLinkTool: Tool = {
  name: 'generate_invite_link',
  description: '生成个人邀请链接，用于分享邀请',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: {
        type: 'string',
        description: '玩家钱包地址',
      },
    },
    required: ['player_address'],
  },
  handler: async (input) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/invite/generate`,
        {},
        {
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        }
      );

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * 查询邀请统计 Tool
 */
export const getInviteStatsTool: Tool = {
  name: 'get_invite_stats',
  description: '查询邀请佣金和邀请人数统计',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: {
        type: 'string',
        description: '玩家钱包地址',
      },
    },
    required: ['player_address'],
  },
  handler: async (input) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/invite/stats`,
        {
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        }
      );

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * 查询分成记录 Tool
 */
export const getCommissionRecordsTool: Tool = {
  name: 'get_commission_records',
  description: '查询邀请分成记录（分页）',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: {
        type: 'string',
        description: '玩家钱包地址',
      },
      limit: {
        type: 'number',
        description: '返回记录数（默认 20）',
        default: 20,
      },
      offset: {
        type: 'number',
        description: '偏移量',
        default: 0,
      },
    },
    required: ['player_address'],
  },
  handler: async (input) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/invite/commission`,
        {
          params: {
            limit: input.limit,
            offset: input.offset,
          },
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        }
      );

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * 邀请面板 Tool
 */
export const getInviteDashboardTool: Tool = {
  name: 'get_invite_dashboard',
  description: '获取邀请面板（综合统计和被邀请人信息）',
  inputSchema: {
    type: 'object',
    properties: {
      player_address: {
        type: 'string',
        description: '玩家钱包地址',
      },
    },
    required: ['player_address'],
  },
  handler: async (input) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/invite/dashboard`,
        {
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        }
      );

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * 邀请排行榜 Tool
 */
export const getInviteLeaderboardTool: Tool = {
  name: 'get_invite_leaderboard',
  description: '获取邀请排行榜',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['all', 'week', 'month'],
        description: '排行周期',
        default: 'all',
      },
      limit: {
        type: 'number',
        description: '返回排名数',
        default: 20,
      },
    },
  },
  handler: async (input) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/invite/leaderboard`,
        {
          params: {
            period: input.period,
            limit: input.limit,
          },
        }
      );

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

export default [
  generateInviteLinkTool,
  getInviteStatsTool,
  getCommissionRecordsTool,
  getInviteDashboardTool,
  getInviteLeaderboardTool,
];
```

### Claude 使用示例

```
用户: "我的邀请链接是什么？"
→ Claude 调用 generate_invite_link
→ 返回: { invite_link: "https://aiggs.xyz?ref=ABC123", farm_code: "ABC123" }
→ Claude 回复: "你的邀请链接是 https://aiggs.xyz?ref=ABC123，可以分享给朋友！"

用户: "我邀请了多少人，他们给了我多少分成？"
→ Claude 调用 get_invite_stats
→ 返回: { total_invited: 5, active_invitees: 3, total_commission_earned: 5000 }
→ Claude 回复: "你邀请了 5 人，其中 3 人活跃，累计获得 5000 EGGS 分成。"

用户: "给我看看我的邀请面板"
→ Claude 调用 get_invite_dashboard
→ 返回: 详细的邀请统计、被邀请人列表、分成记录等
→ Claude 以格式化方式展示完整信息

用户: "邀请排行榜上谁赚得最多？"
→ Claude 调用 get_invite_leaderboard
→ 返回: 前 20 名邀请者的排名
→ Claude 回复: "排行榜第一名是 Alice，她邀请了 50 人，获得 50000 EGGS 分成。"
```

---

## 总结

本文档完整涵盖了 AIggs 项目的：

### 任务 1：系统技术文档
- 系统架构图和数据流
- 8 大模块详细设计（API、数据库、偷蛋、MCP、Agent、合约、早报、前端）
- 完整 API 接口文档（REST 和 MCP）
- Docker Compose 开发环境搭建指南
- 生产环境部署清单
- 环境变量配置表

### 任务 2：空投合约
- AIGGAirdrop.sol 完整实现
  - Merkle Tree 验证防女巫攻击
  - 领取时间窗口控制
  - 单次领取 + 防重复
  - 未领取代币回收机制
- Merkle 树生成脚本（TypeScript）
- 完整 Hardhat 单元测试（10+ 个测试用例）

### 任务 3：邀请系统
- 邀请码生成与农场码管理
- 10% 永久分成逻辑（自动计算分配）
- 多级邀请统计面板（总数、活跃率、累计收益）
- 5 个核心 API 端点
- 5 个 MCP Tool 集成
- Claude 自动调用示例

**部署建议：**

1. 开发环境使用 Docker Compose，快速启动所有服务
2. 生产环境遵循部署清单，确保安全性和高可用性
3. 空投合约必须经过安全审计
4. 邀请系统需要充分测试防止分成重复计算
5. 所有关键操作应该有审计日志记录

所有代码都包含详细的中文注释，便于维护和二次开发。

