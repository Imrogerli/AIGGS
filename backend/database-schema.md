# AIggs 数据库 Schema 设计文档

## 项目背景
AIggs 是首个 AI 原生链上养鸡农场游戏，部署在 Base 链。玩家通过饲养母鸡产出 EGGS，兑换为 $AIGG 代币，支持偷蛋、邀请等核心玩法。

---

## 一、完整 SQL Schema

### 1. 玩家表（players）

```sql
-- 玩家表：记录所有玩家的基本信息和账户状态
CREATE TABLE players (
    id BIGSERIAL PRIMARY KEY,                           -- 玩家唯一ID
    wallet_address VARCHAR(255) UNIQUE NOT NULL,       -- 钱包地址（唯一标识）
    nickname VARCHAR(100),                               -- 昵称
    farm_code VARCHAR(50) UNIQUE,                       -- 农场码（邀请分享）
    referrer_id BIGINT REFERENCES players(id) ON DELETE SET NULL,  -- 邀请人 ID
    registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 注册时间
    rookie_protection_until TIMESTAMP,                  -- 新手保护期截止时间（注册+24h）
    total_eggs_earned BIGINT DEFAULT 0,                 -- 累计产蛋数
    total_eggs_exchanged BIGINT DEFAULT 0,              -- 累计兑换数
    total_stolen_count INT DEFAULT 0,                   -- 被偷蛋次数
    total_successful_steals INT DEFAULT 0,              -- 成功偷蛋次数
    invite_commission_earned BIGINT DEFAULT 0,          -- 邀请分成累计获得
    is_active BOOLEAN DEFAULT TRUE,                     -- 账户是否活跃
    last_login_at TIMESTAMP,                            -- 最后登录时间
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 索引
CREATE UNIQUE INDEX idx_players_wallet ON players(wallet_address);
CREATE INDEX idx_players_registered_at ON players(registered_at);
CREATE INDEX idx_players_referrer ON players(referrer_id);
CREATE INDEX idx_players_active ON players(is_active);
```

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键，玩家唯一ID |
| wallet_address | VARCHAR(255) | 玩家钱包地址，唯一且不可变 |
| nickname | VARCHAR(100) | 玩家昵称，可选 |
| farm_code | VARCHAR(50) | 农场邀请码，用于分享和统计邀请关系 |
| referrer_id | BIGINT | 邀请人ID，NULL表示无邀请人 |
| registered_at | TIMESTAMP | 账户注册时间 |
| rookie_protection_until | TIMESTAMP | 新手保护期截止（注册+24h，期间不能被偷蛋） |
| total_eggs_earned | BIGINT | 累计产蛋数（用于统计和排行） |
| total_eggs_exchanged | BIGINT | 累计兑换数（$AIGG兑换记录） |
| total_stolen_count | INT | 被偷蛋次数统计 |
| total_successful_steals | INT | 成功偷蛋次数统计 |
| invite_commission_earned | BIGINT | 邀请10%分成累计获得 |
| is_active | BOOLEAN | 账户激活状态 |
| last_login_at | TIMESTAMP | 最后登录时间 |

---

### 2. 农场表（farms）

```sql
-- 农场表：记录每个玩家的农场状态
CREATE TABLE farms (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT UNIQUE NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- 与玩家一一对应
    chicken_count INT NOT NULL DEFAULT 0,              -- 当前母鸡数量
    egg_inventory INT NOT NULL DEFAULT 0,              -- 仓库中的EGGS数量（0-30）
    egg_capacity INT NOT NULL DEFAULT 30,              -- 仓库容量（固定30）
    last_egg_production_at TIMESTAMP,                  -- 上次产蛋时间
    next_egg_production_at TIMESTAMP,                  -- 下次产蛋时间（8小时后）
    is_inventory_full BOOLEAN DEFAULT FALSE,           -- 仓库是否满（优化查询）
    total_eggs_produced BIGINT DEFAULT 0,              -- 农场累计产蛋数
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 索引
CREATE UNIQUE INDEX idx_farms_player ON farms(player_id);
CREATE INDEX idx_farms_next_production ON farms(next_egg_production_at);
CREATE INDEX idx_farms_inventory_full ON farms(is_inventory_full);
```

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 农场ID |
| player_id | BIGINT | 关联的玩家ID，一对一关系 |
| chicken_count | INT | 当前饲养的母鸡总数 |
| egg_inventory | INT | 仓库中的EGGS数量（0-30范围） |
| egg_capacity | INT | 仓库容量（固定值30） |
| last_egg_production_at | TIMESTAMP | 上次产蛋时刻 |
| next_egg_production_at | TIMESTAMP | 下次自动产蛋时刻（每8小时） |
| is_inventory_full | BOOLEAN | 仓库满状态标志（用于快速查询是否需要暂停产蛋） |
| total_eggs_produced | BIGINT | 农场历史累计产蛋数 |

---

### 3. 鸡表（chickens）

```sql
-- 鸡表：记录每只母鸡的详细信息
CREATE TABLE chickens (
    id BIGSERIAL PRIMARY KEY,
    farm_id BIGINT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,  -- 所属农场
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- 所属玩家
    chicken_type VARCHAR(50) NOT NULL,                 -- 鸡的类型（普通鸡/稀有鸡/传奇鸡等）
    rarity_level INT DEFAULT 1,                        -- 稀有度等级（1-5）
    eggs_per_cycle BIGINT NOT NULL DEFAULT 10,         -- 每个生产周期产蛋数
    production_cycle_hours INT DEFAULT 8,              -- 生产周期（小时）
    base_production_rate DECIMAL(5, 2) DEFAULT 1.0,    -- 基础产蛋速率倍数
    boost_multiplier DECIMAL(5, 2) DEFAULT 1.0,        -- 加速倍数（临时buff）
    boost_until TIMESTAMP,                             -- 加速效果截止时间
    hatching_date TIMESTAMP NOT NULL,                  -- 孵化日期
    acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 获得日期
    is_active BOOLEAN DEFAULT TRUE,                    -- 是否处于活跃状态
    total_eggs_produced BIGINT DEFAULT 0,              -- 该鸡累计产蛋数
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_chickens_farm ON chickens(farm_id);
CREATE INDEX idx_chickens_player ON chickens(player_id);
CREATE INDEX idx_chickens_type ON chickens(chicken_type);
CREATE INDEX idx_chickens_active ON chickens(is_active);
CREATE INDEX idx_chickens_boost_until ON chickens(boost_until);
```

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 鸡的唯一ID |
| farm_id | BIGINT | 所属农场ID |
| player_id | BIGINT | 所属玩家ID（冗余存储用于查询优化） |
| chicken_type | VARCHAR(50) | 鸡的类型分类（如：普通鸡、稀有鸡、传奇鸡等） |
| rarity_level | INT | 稀有度等级（1-5，影响产蛋速度） |
| eggs_per_cycle | BIGINT | 每个生产周期产出的EGGS数量 |
| production_cycle_hours | INT | 生产周期（通常为8小时） |
| base_production_rate | DECIMAL(5, 2) | 基础产蛋速率倍数（1.0 = 标准速率） |
| boost_multiplier | DECIMAL(5, 2) | 临时加速倍数（如使用道具时） |
| boost_until | TIMESTAMP | 加速效果的截止时间 |
| hatching_date | TIMESTAMP | 鸡的孵化日期 |
| acquired_at | TIMESTAMP | 玩家获得该鸡的时间 |
| is_active | BOOLEAN | 鸡的活跃状态 |
| total_eggs_produced | BIGINT | 该鸡历史累计产蛋数 |

---

### 4. EGGS流水表（eggs_transactions）

```sql
-- EGGS流水表：记录所有EGGS的产出、消耗、偷取、兑换
CREATE TABLE eggs_transactions (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- 交易相关玩家
    farm_id BIGINT REFERENCES farms(id) ON DELETE SET NULL,  -- 关联的农场
    transaction_type VARCHAR(50) NOT NULL,              -- 交易类型：production/steal/steal_success/steal_fail/exchange/invite_commission
    quantity BIGINT NOT NULL,                           -- EGGS数量（正数为增加，负数为减少）
    previous_balance BIGINT NOT NULL,                   -- 交易前余额
    after_balance BIGINT NOT NULL,                      -- 交易后余额

    -- 产蛋相关字段
    produced_by_chicken_id BIGINT REFERENCES chickens(id) ON DELETE SET NULL,  -- 产蛋的鸡ID

    -- 偷蛋相关字段
    steal_event_id BIGINT REFERENCES steal_events(id) ON DELETE SET NULL,  -- 关联的偷蛋事件
    other_player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,  -- 交互对方（偷蛋中的被盗者）

    -- 兑换相关字段
    exchange_rate DECIMAL(10, 2),                       -- 兑换汇率（EGGS:$AIGG）
    aigg_amount BIGINT,                                 -- 兑换的$AIGG数量
    tx_hash VARCHAR(255),                               -- 链上交易哈希

    -- 邀请分成相关字段
    referrer_id BIGINT REFERENCES players(id) ON DELETE SET NULL,  -- 邀请人ID

    description VARCHAR(500),                           -- 交易说明
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_eggs_transactions_player ON eggs_transactions(player_id);
CREATE INDEX idx_eggs_transactions_type ON eggs_transactions(transaction_type);
CREATE INDEX idx_eggs_transactions_created ON eggs_transactions(created_at);
CREATE INDEX idx_eggs_transactions_other_player ON eggs_transactions(other_player_id);
CREATE INDEX idx_eggs_transactions_farm ON eggs_transactions(farm_id);
CREATE COMPOSITE INDEX idx_eggs_transactions_player_type ON eggs_transactions(player_id, transaction_type);
```

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 流水ID |
| player_id | BIGINT | 主要涉及玩家 |
| farm_id | BIGINT | 关联的农场 |
| transaction_type | VARCHAR(50) | 交易类型：production(产蛋)/steal(偷蛋尝试)/steal_success(偷成功)/steal_fail(偷失败)/exchange(兑换)/invite_commission(邀请分成) |
| quantity | BIGINT | 数量变化（正为收入，负为支出） |
| previous_balance | BIGINT | 交易前余额快照 |
| after_balance | BIGINT | 交易后余额快照 |
| produced_by_chicken_id | BIGINT | 产蛋的鸡ID |
| steal_event_id | BIGINT | 关联的偷蛋事件 |
| other_player_id | BIGINT | 交互对方（偷蛋时的被盗者） |
| exchange_rate | DECIMAL(10, 2) | 兑换汇率（如30:1） |
| aigg_amount | BIGINT | 兑换获得的$AIGG数量 |
| tx_hash | VARCHAR(255) | 链上交易哈希 |
| referrer_id | BIGINT | 邀请人ID（邀请分成记录） |
| description | VARCHAR(500) | 备注说明 |

---

### 5. 偷蛋事件表（steal_events）

```sql
-- 偷蛋事件表：记录所有偷蛋尝试和结果
CREATE TABLE steal_events (
    id BIGSERIAL PRIMARY KEY,
    stealer_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- 偷蛋者
    victim_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,   -- 被偷者

    -- 偷蛋结果
    outcome VARCHAR(50) NOT NULL,                       -- 结果：bumper_crop(大丰收20%)/success(成功55%)/fail(扑空25%)
    bumper_crop BOOLEAN DEFAULT FALSE,                  -- 是否触发大丰收（20%概率，获得20%的库存）
    eggs_stolen BIGINT DEFAULT 0,                       -- 实际偷取的EGGS数量
    victim_inventory_before BIGINT NOT NULL,            -- 被盗者偷蛋前库存
    victim_inventory_after BIGINT NOT NULL,             -- 被盗者偷蛋后库存

    -- 冷却机制
    stealer_last_target_id BIGINT REFERENCES players(id) ON DELETE SET NULL,  -- 偷蛋者上次的目标
    cooldown_until TIMESTAMP,                           -- 对该目标的冷却时间（24h）
    stealer_daily_steal_count INT DEFAULT 1,            -- 偷蛋者今日偷蛋次数

    -- AI相关
    ai_decision_log_id BIGINT REFERENCES ai_decision_logs(id) ON DELETE SET NULL,  -- 关联的AI决策日志

    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 偷蛋尝试时间
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_steal_events_stealer ON steal_events(stealer_id);
CREATE INDEX idx_steal_events_victim ON steal_events(victim_id);
CREATE INDEX idx_steal_events_outcome ON steal_events(outcome);
CREATE INDEX idx_steal_events_attempted ON steal_events(attempted_at);
CREATE INDEX idx_steal_events_cooldown ON steal_events(cooldown_until);
CREATE COMPOSITE INDEX idx_steal_events_stealer_victim ON steal_events(stealer_id, victim_id, attempted_at);
```

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 偷蛋事件ID |
| stealer_id | BIGINT | 发起偷蛋的玩家ID |
| victim_id | BIGINT | 被偷蛋的玩家ID |
| outcome | VARCHAR(50) | 偷蛋结果：bumper_crop(20%大丰收)/success(55%成功)/fail(25%扑空) |
| bumper_crop | BOOLEAN | 是否触发大丰收（偷蛋成功时20%概率） |
| eggs_stolen | BIGINT | 实际偷取的EGGS数量 |
| victim_inventory_before | BIGINT | 被盗者偷前库存 |
| victim_inventory_after | BIGINT | 被盗者偷后库存 |
| stealer_last_target_id | BIGINT | 偷蛋者上次目标（用于判断冷却） |
| cooldown_until | TIMESTAMP | 对该目标的24h冷却截止 |
| stealer_daily_steal_count | INT | 偷蛋者当天的偷蛋次数（最多2次） |
| ai_decision_log_id | BIGINT | 关联的AI决策日志 |
| attempted_at | TIMESTAMP | 偷蛋发生时间 |

---

### 6. AI决策日志表（ai_decision_logs）

```sql
-- AI决策日志表：记录4大AI Agent的决策过程和结果
CREATE TABLE ai_decision_logs (
    id BIGSERIAL PRIMARY KEY,

    -- AI Agent信息
    agent_type VARCHAR(50) NOT NULL,                    -- Agent类型：game_state_analyzer/farm_optimizer/steal_strategist/market_predictor
    agent_model VARCHAR(100),                           -- 模型名称（如claude-3-haiku, gpt-4, etc）

    -- 决策关联对象
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- 决策相关玩家
    farm_id BIGINT REFERENCES farms(id) ON DELETE SET NULL,  -- 关联的农场
    steal_event_id BIGINT REFERENCES steal_events(id) ON DELETE SET NULL,  -- 关联的偷蛋事件

    -- 决策输入
    decision_context TEXT NOT NULL,                     -- 决策上下文（JSON格式）
    input_prompt TEXT,                                  -- 发送给AI的Prompt

    -- 决策输出
    decision_output TEXT NOT NULL,                      -- AI的决策结果（JSON格式）
    recommended_action VARCHAR(255),                    -- 推荐的行动
    confidence_score DECIMAL(5, 2),                     -- 置信度评分（0-1）
    reasoning TEXT,                                     -- 决策理由

    -- 执行结果
    execution_status VARCHAR(50),                       -- 执行状态：pending/executed/failed
    actual_result TEXT,                                 -- 实际执行结果

    -- 质量评估
    is_correct BOOLEAN,                                 -- 决策是否正确（后续验证）
    feedback_score DECIMAL(5, 2),                       -- 反馈评分（用于模型优化）

    -- 性能指标
    response_time_ms INT,                               -- AI响应时间（毫秒）
    token_usage INT,                                    -- token消耗数
    cost_usd DECIMAL(10, 4),                            -- API调用成本（美元）

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_ai_decision_logs_player ON ai_decision_logs(player_id);
CREATE INDEX idx_ai_decision_logs_agent ON ai_decision_logs(agent_type);
CREATE INDEX idx_ai_decision_logs_status ON ai_decision_logs(execution_status);
CREATE INDEX idx_ai_decision_logs_created ON ai_decision_logs(created_at);
CREATE INDEX idx_ai_decision_logs_confidence ON ai_decision_logs(confidence_score);
CREATE COMPOSITE INDEX idx_ai_decision_logs_agent_player ON ai_decision_logs(agent_type, player_id, created_at);
```

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 日志ID |
| agent_type | VARCHAR(50) | Agent类型：game_state_analyzer(游戏状态分析)/farm_optimizer(农场优化)/steal_strategist(偷蛋策略)/market_predictor(市场预测) |
| agent_model | VARCHAR(100) | 使用的AI模型（如claude-3-haiku、gpt-4等） |
| player_id | BIGINT | 决策相关的玩家 |
| farm_id | BIGINT | 关联的农场 |
| steal_event_id | BIGINT | 关联的偷蛋事件（仅steal_strategist） |
| decision_context | TEXT | 决策的输入上下文（JSON格式） |
| input_prompt | TEXT | 发送给AI的完整Prompt |
| decision_output | TEXT | AI的输出结果（JSON格式） |
| recommended_action | VARCHAR(255) | 推荐的行动 |
| confidence_score | DECIMAL(5, 2) | 置信度评分（0-1） |
| reasoning | TEXT | AI的决策理由 |
| execution_status | VARCHAR(50) | 执行状态：pending(待执行)/executed(已执行)/failed(执行失败) |
| actual_result | TEXT | 实际执行的结果 |
| is_correct | BOOLEAN | 决策后验正确性 |
| feedback_score | DECIMAL(5, 2) | 反馈评分（用于AI模型优化） |
| response_time_ms | INT | AI响应耗时（毫秒） |
| token_usage | INT | API调用消耗的token数 |
| cost_usd | DECIMAL(10, 4) | API调用成本（美元） |

---

## 二、ER 关系图

```
┌─────────────────┐
│    players      │  (玩家表)
├─────────────────┤
│ id (PK)         │
│ wallet_address  │
│ farm_code       │
│ referrer_id (FK)├──────────────┐
│ ...             │              │
└─────────────────┘              │ (自关联：邀请关系)
        │                        │
        │ 1:1                    │
        ├──────────────────────┐ │
        │                      │ │
        ▼                      │ │
   ┌──────────────┐           │ │
   │    farms     │ (农场表)  │ │
   ├──────────────┤           │ │
   │ id (PK)      │           │ │
   │ player_id(FK)├───────────┘ │
   │ chicken_count│             │
   │ egg_inventory│             │
   │ ...          │             │
   └──────────────┘             │
        │                       │
        │ 1:N                   │
        ▼                       │
   ┌──────────────┐             │
   │  chickens    │ (鸡表)      │
   ├──────────────┤             │
   │ id (PK)      │             │
   │ farm_id (FK) │             │
   │ player_id(FK)├─────────────┤
   │ chicken_type │             │
   │ ...          │             │
   └──────────────┘             │
                                │
   ┌──────────────────────┐     │
   │ eggs_transactions    │ (EGGS流水表)
   ├──────────────────────┤     │
   │ id (PK)              │     │
   │ player_id (FK)       ├─────┘
   │ other_player_id (FK) │ (交互对方)
   │ produced_by_chicken  │
   │ steal_event_id (FK)  │
   │ ...                  │
   └──────────────────────┘
                │
                │ 1:1
                ▼
   ┌──────────────────────┐
   │   steal_events       │ (偷蛋事件表)
   ├──────────────────────┤
   │ id (PK)              │
   │ stealer_id (FK)      │ ──┐
   │ victim_id (FK)       │   ├──> 都指向 players
   │ ai_decision_log_id   │ ──┘
   │ outcome              │
   │ ...                  │
   └──────────────────────┘
                │
                │ 1:1
                ▼
   ┌──────────────────────┐
   │  ai_decision_logs    │ (AI决策日志表)
   ├──────────────────────┤
   │ id (PK)              │
   │ agent_type           │
   │ player_id (FK)       │
   │ farm_id (FK)         │
   │ steal_event_id (FK)  │
   │ confidence_score     │
   │ ...                  │
   └──────────────────────┘

关键关系：
- players.id ← farms.player_id (1:1)
- players.id ← chickens.player_id (1:N)
- farms.id ← chickens.farm_id (1:N)
- players.id ← players.referrer_id (自关联)
- players.id ← eggs_transactions.player_id (1:N)
- players.id ← eggs_transactions.other_player_id (1:N)
- chickens.id ← eggs_transactions.produced_by_chicken_id (1:N)
- steal_events.id ← eggs_transactions.steal_event_id (1:1)
- players.id ← steal_events.stealer_id (1:N)
- players.id ← steal_events.victim_id (1:N)
- ai_decision_logs.id ← steal_events.ai_decision_log_id (1:1)
```

---

## 三、关键业务逻辑查询

### 3.1 产蛋逻辑

#### 查询：获取需要产蛋的农场

```sql
-- 查询所有需要自动产蛋的农场（next_egg_production_at <= NOW）
SELECT f.*, p.wallet_address, p.id as player_id
FROM farms f
JOIN players p ON f.player_id = p.id
WHERE f.next_egg_production_at <= CURRENT_TIMESTAMP
  AND f.is_inventory_full = FALSE
  AND f.chicken_count > 0
  AND p.is_active = TRUE
ORDER BY f.next_egg_production_at ASC
LIMIT 100;
```

#### 产蛋交易记录

```sql
-- 记录产蛋事件
INSERT INTO eggs_transactions (
    player_id,
    farm_id,
    transaction_type,
    quantity,
    previous_balance,
    after_balance,
    produced_by_chicken_id,
    description,
    created_at
) VALUES (
    $1, -- player_id
    $2, -- farm_id
    'production',
    $3, -- 产出的EGGS数量
    $4, -- 产前库存
    $5, -- 产后库存
    $6, -- chicken_id
    CONCAT('鸡 #', $6, ' 产蛋'),
    CURRENT_TIMESTAMP
);

-- 更新农场库存和产蛋时间
UPDATE farms
SET
    egg_inventory = LEAST(egg_inventory + $1, egg_capacity),
    is_inventory_full = (egg_inventory + $1 >= egg_capacity),
    last_egg_production_at = CURRENT_TIMESTAMP,
    next_egg_production_at = CURRENT_TIMESTAMP + INTERVAL '8 hours',
    total_eggs_produced = total_eggs_produced + $1
WHERE id = $2;
```

#### 仓库满状态检查

```sql
-- 检查仓库是否已满
SELECT
    id,
    egg_inventory,
    egg_capacity,
    (egg_inventory >= egg_capacity) as is_full
FROM farms
WHERE player_id = $1;

-- 更新满仓标志
UPDATE farms
SET is_inventory_full = TRUE
WHERE id = $1 AND egg_inventory >= egg_capacity;
```

---

### 3.2 偷蛋逻辑

#### 查询：检查是否可以对目标进行偷蛋

```sql
-- 检查偷蛋者的各项限制
SELECT
    p.id as stealer_id,
    p.wallet_address,
    p.rookie_protection_until,
    COUNT(CASE WHEN DATE(se.attempted_at) = CURDATE() THEN 1 END) as today_steal_count,
    MAX(CASE WHEN se.victim_id = $2 THEN se.cooldown_until END) as cooldown_for_victim
FROM players p
LEFT JOIN steal_events se ON p.id = se.stealer_id
WHERE p.id = $1
GROUP BY p.id, p.wallet_address, p.rookie_protection_until;

-- 返回检查结果
-- 不能偷蛋的情况：
-- 1. 偷蛋者在新手保护期（24h）
-- 2. 偷蛋者今日已偷蛋2次
-- 3. 对该目标有24h冷却
-- 4. 目标在新手保护期
-- 5. 目标库存 <= 15（最低保护）
```

#### 查询：获取被偷者信息

```sql
-- 查询被偷者当前农场状态
SELECT
    p.id as player_id,
    p.wallet_address,
    p.rookie_protection_until,
    f.egg_inventory,
    f.egg_capacity,
    COUNT(c.id) as chicken_count
FROM players p
LEFT JOIN farms f ON p.id = f.player_id
LEFT JOIN chickens c ON f.id = c.farm_id AND c.is_active = TRUE
WHERE p.id = $1
GROUP BY p.id, p.wallet_address, p.rookie_protection_until, f.id, f.egg_inventory, f.egg_capacity;
```

#### 偷蛋概率计算

```sql
-- 计算偷蛋结果（应在应用层实现概率逻辑）
-- 结果分布：
--   20% 大丰收 (bumper_crop)：获得被盗者库存的20%
--   55% 成功 (success)：获得被盗者库存的10-15%（随机）
--   25% 扑空 (fail)：获得0

-- 示例：计算偷蛋后的库存变化
-- victim_stolen = CASE
--     WHEN outcome = 'bumper_crop' THEN FLOOR(victim_inventory * 0.20)
--     WHEN outcome = 'success' THEN FLOOR(victim_inventory * (0.10 + RANDOM() * 0.05))
--     WHEN outcome = 'fail' THEN 0
-- END
-- BUT 保护最低15枚不被盗
-- actual_stolen = MIN(victim_stolen, MAX(victim_inventory - 15, 0))
```

#### 记录偷蛋事件

```sql
-- 插入偷蛋事件
INSERT INTO steal_events (
    stealer_id,
    victim_id,
    outcome,
    bumper_crop,
    eggs_stolen,
    victim_inventory_before,
    victim_inventory_after,
    cooldown_until,
    stealer_daily_steal_count,
    ai_decision_log_id,
    attempted_at
) VALUES (
    $1, -- stealer_id
    $2, -- victim_id
    $3, -- outcome: 'bumper_crop'/'success'/'fail'
    $4, -- bumper_crop: true/false
    $5, -- eggs_stolen 数量
    $6, -- victim_inventory_before
    $7, -- victim_inventory_after
    CURRENT_TIMESTAMP + INTERVAL '24 hours', -- cooldown_until
    (SELECT COUNT(*) + 1 FROM steal_events WHERE stealer_id = $1 AND DATE(attempted_at) = CURDATE()),
    $8, -- ai_decision_log_id
    CURRENT_TIMESTAMP
);

-- 更新被盗者库存
UPDATE farms
SET egg_inventory = $1
WHERE player_id = $2;

-- 记录流水
INSERT INTO eggs_transactions (
    player_id,
    farm_id,
    transaction_type,
    quantity,
    previous_balance,
    after_balance,
    steal_event_id,
    other_player_id,
    description,
    created_at
) VALUES
-- 被盗者的流水（负数）
($2, (SELECT id FROM farms WHERE player_id = $2), 'steal', -$3, $6, $7, $9, $1, '被偷蛋', CURRENT_TIMESTAMP),
-- 偷蛋者的流水（正数）
($1, (SELECT id FROM farms WHERE player_id = $1), CASE WHEN $3 = 'fail' THEN 'steal_fail' ELSE 'steal_success' END, $3, ..., ...+$3, $9, $2, '成功偷蛋', CURRENT_TIMESTAMP);
```

---

### 3.3 EGGS兑换 $AIGG 逻辑

#### 查询：获取玩家的兑换历史

```sql
-- 查询玩家兑换历史（最近100条）
SELECT
    id,
    transaction_type,
    quantity,
    previous_balance,
    after_balance,
    aigg_amount,
    exchange_rate,
    tx_hash,
    created_at
FROM eggs_transactions
WHERE player_id = $1
  AND transaction_type = 'exchange'
ORDER BY created_at DESC
LIMIT 100;
```

#### 兑换操作

```sql
-- 兑换 EGGS 为 $AIGG（汇率 30:1）
-- 1. 检查库存充足
SELECT egg_inventory
FROM farms
WHERE player_id = $1;

-- 2. 计算兑换
-- eggs_to_exchange = 300
-- aigg_amount = eggs_to_exchange / 30 = 10
-- exchange_rate = 30

-- 3. 扣减库存
UPDATE farms
SET
    egg_inventory = egg_inventory - $1,
    is_inventory_full = FALSE
WHERE player_id = $2;

-- 4. 记录流水
INSERT INTO eggs_transactions (
    player_id,
    farm_id,
    transaction_type,
    quantity,
    previous_balance,
    after_balance,
    exchange_rate,
    aigg_amount,
    tx_hash,
    description,
    created_at
) VALUES (
    $1, -- player_id
    (SELECT id FROM farms WHERE player_id = $1),
    'exchange',
    -$2, -- 扣减的EGGS
    $3, -- previous_balance
    $4, -- after_balance
    30, -- exchange_rate
    $2 / 30, -- aigg_amount
    $5, -- tx_hash (链上交易)
    CONCAT('兑换', $2 / 30, ' $AIGG'),
    CURRENT_TIMESTAMP
);

-- 5. 可选：触发邀请分成逻辑（如果有邀请人）
-- referrer_commission = aigg_amount * 0.10
-- 记录为 'invite_commission' 类型的流水
```

#### 邀请分成逻辑

```sql
-- 当有新邀请的玩家进行兑换时，邀请人获得10%分成
-- 在 exchange 交易后触发

SELECT referrer_id
FROM players
WHERE id = $1; -- 被邀请的玩家

-- 如果 referrer_id 不为 NULL，则：
-- commission_eggs = exchanged_eggs * 0.10
-- 记录分成流水
INSERT INTO eggs_transactions (
    player_id,
    transaction_type,
    quantity,
    previous_balance,
    after_balance,
    referrer_id,
    other_player_id,
    description,
    created_at
) VALUES (
    $1, -- referrer_id（邀请人）
    'invite_commission',
    $2, -- commission_eggs
    $3, -- 邀请人之前的库存
    $4, -- 邀请人之后的库存
    NULL,
    $5, -- 被邀请人ID
    CONCAT('邀请分成：来自玩家', $5),
    CURRENT_TIMESTAMP
);

-- 更新玩家的邀请分成累计
UPDATE players
SET invite_commission_earned = invite_commission_earned + $1
WHERE id = $2; -- referrer_id
```

---

### 3.4 统计查询

#### 排行榜：EGGS产出排名

```sql
-- 按累计产蛋数排名（Top 100）
SELECT
    ROW_NUMBER() OVER (ORDER BY p.total_eggs_earned DESC) as rank,
    p.id,
    p.wallet_address,
    p.nickname,
    p.total_eggs_earned,
    f.chicken_count,
    f.egg_inventory,
    COUNT(DISTINCT c.id) as active_chickens
FROM players p
LEFT JOIN farms f ON p.id = f.player_id
LEFT JOIN chickens c ON f.id = c.farm_id AND c.is_active = TRUE
WHERE p.is_active = TRUE
GROUP BY p.id, f.id
ORDER BY p.total_eggs_earned DESC
LIMIT 100;
```

#### 排行榜：偷蛋成功率排名

```sql
-- 按偷蛋成功率排名
SELECT
    ROW_NUMBER() OVER (ORDER BY success_rate DESC) as rank,
    p.id,
    p.wallet_address,
    p.total_successful_steals,
    CASE WHEN p.total_stolen_count = 0 THEN 0
         ELSE ROUND(p.total_successful_steals::numeric / p.total_stolen_count * 100, 2)
    END as success_rate,
    p.total_stolen_count
FROM players p
WHERE p.total_stolen_count > 0
  AND p.is_active = TRUE
ORDER BY success_rate DESC
LIMIT 50;
```

#### 玩家概览

```sql
-- 获取单个玩家的完整概览
SELECT
    p.id,
    p.wallet_address,
    p.nickname,
    p.farm_code,
    p.registered_at,
    p.rookie_protection_until,
    p.is_active,
    p.total_eggs_earned,
    p.total_eggs_exchanged,
    p.total_stolen_count,
    p.total_successful_steals,
    p.invite_commission_earned,
    f.chicken_count,
    f.egg_inventory,
    f.egg_capacity,
    f.next_egg_production_at,
    CASE WHEN p.rookie_protection_until > CURRENT_TIMESTAMP THEN TRUE ELSE FALSE END as is_in_rookie_period,
    COUNT(DISTINCT c.id) as total_chickens,
    COUNT(DISTINCT CASE WHEN c.is_active = TRUE THEN c.id END) as active_chickens
FROM players p
LEFT JOIN farms f ON p.id = f.player_id
LEFT JOIN chickens c ON f.id = c.farm_id
WHERE p.id = $1
GROUP BY p.id, f.id;
```

#### AI决策效果分析

```sql
-- 分析 AI Agent 的决策准确率
SELECT
    agent_type,
    agent_model,
    COUNT(*) as total_decisions,
    ROUND(AVG(confidence_score), 2) as avg_confidence,
    SUM(CASE WHEN is_correct = TRUE THEN 1 ELSE 0 END) as correct_count,
    ROUND(
        SUM(CASE WHEN is_correct = TRUE THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100,
        2
    ) as accuracy_rate,
    ROUND(AVG(response_time_ms), 2) as avg_response_time_ms,
    ROUND(AVG(cost_usd), 4) as avg_cost_usd,
    SUM(token_usage) as total_tokens_used
FROM ai_decision_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY agent_type, agent_model
ORDER BY accuracy_rate DESC;
```

---

## 四、数据库初始化脚本

### 约束和触发器

#### 触发器：自动更新 updated_at

```sql
-- 创建自动更新时间戳的函数
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表创建触发器
CREATE TRIGGER trigger_players_updated_at
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_farms_updated_at
BEFORE UPDATE ON farms
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_chickens_updated_at
BEFORE UPDATE ON chickens
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_ai_decision_logs_updated_at
BEFORE UPDATE ON ai_decision_logs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
```

#### 约束：农场库存上限

```sql
-- 添加检查约束
ALTER TABLE farms
ADD CONSTRAINT check_egg_inventory
CHECK (egg_inventory >= 0 AND egg_inventory <= egg_capacity);

ALTER TABLE farms
ADD CONSTRAINT check_chicken_count
CHECK (chicken_count >= 0);

ALTER TABLE chickens
ADD CONSTRAINT check_production_rate
CHECK (base_production_rate > 0);

ALTER TABLE ai_decision_logs
ADD CONSTRAINT check_confidence_score
CHECK (confidence_score >= 0 AND confidence_score <= 1);
```

---

## 五、性能优化建议

### 1. 索引策略

**已创建的关键索引：**
- `idx_farms_next_production` — 用于快速查询需要产蛋的农场
- `idx_steal_events_cooldown` — 用于冷却检查
- `idx_eggs_transactions_created` — 用于时序查询和归档
- 复合索引 `idx_steal_events_stealer_victim` — 加速重复偷蛋检查

### 2. 查询优化

```sql
-- 避免全表扫描，使用索引
EXPLAIN ANALYZE
SELECT * FROM farms WHERE next_egg_production_at <= CURRENT_TIMESTAMP;

-- 定期更新统计信息
ANALYZE players;
ANALYZE farms;
ANALYZE eggs_transactions;
```

### 3. 分表和归档

```sql
-- 对 eggs_transactions 按日期分区（大表）
-- 示例：按月分区
CREATE TABLE eggs_transactions_2026_03 PARTITION OF eggs_transactions
FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 对 ai_decision_logs 按日期分区（日志表增长快）
CREATE TABLE ai_decision_logs_2026_03 PARTITION OF ai_decision_logs
FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### 4. 连接池配置

```
# 建议使用 pgBouncer
min_pool_size = 10
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
```

---

## 六、使用示例

### 新玩家注册流程

```sql
-- 1. 插入玩家记录
INSERT INTO players (
    wallet_address,
    nickname,
    farm_code,
    registered_at,
    rookie_protection_until
) VALUES (
    '0x1234567890abcdef1234567890abcdef12345678',
    'Farmer_Alice',
    'FARM_' || UPPER(SUBSTRING(MD5(RANDOM()::text), 1, 8)),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '24 hours'
) RETURNING id;

-- 2. 为玩家创建农场
INSERT INTO farms (
    player_id,
    chicken_count,
    egg_inventory,
    next_egg_production_at
) VALUES (
    $1, -- 新玩家ID
    1, -- 赠送1只母鸡
    0,
    CURRENT_TIMESTAMP + INTERVAL '8 hours'
) RETURNING id;

-- 3. 赠送母鸡
INSERT INTO chickens (
    farm_id,
    player_id,
    chicken_type,
    rarity_level,
    eggs_per_cycle,
    hatching_date,
    is_active
) VALUES (
    $2, -- 农场ID
    $1, -- 玩家ID
    '普通鸡',
    1,
    10,
    CURRENT_TIMESTAMP,
    TRUE
) RETURNING id;
```

### 每日定时任务

```sql
-- 定时触发产蛋（推荐每5分钟执行一次）
WITH ready_farms AS (
    SELECT f.id, f.player_id,
           SUM(c.eggs_per_cycle * c.base_production_rate) as total_eggs
    FROM farms f
    JOIN chickens c ON f.id = c.farm_id AND c.is_active = TRUE
    WHERE f.next_egg_production_at <= CURRENT_TIMESTAMP
      AND f.is_inventory_full = FALSE
    GROUP BY f.id, f.player_id
)
INSERT INTO eggs_transactions (
    player_id,
    farm_id,
    transaction_type,
    quantity,
    previous_balance,
    after_balance,
    description
)
SELECT
    rf.player_id,
    rf.id,
    'production',
    rf.total_eggs,
    f.egg_inventory,
    LEAST(f.egg_inventory + rf.total_eggs, f.egg_capacity),
    'auto_production'
FROM ready_farms rf
JOIN farms f ON rf.id = f.id;
```

---

## 七、安全和合规建议

### 1. 数据安全
- 启用行级安全（RLS），限制玩家只能看到自己和公开的数据
- 定期备份（建议每小时一次）
- 启用 WAL（预写日志）

### 2. 审计日志
```sql
-- 创建审计表
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    operation VARCHAR(10), -- INSERT/UPDATE/DELETE
    user_id BIGINT,
    old_data JSONB,
    new_data JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. 敏感数据处理
- 不存储私钥和助记词
- 钱包地址进行加密存储（可选）
- 交易哈希仅记录，不涉及资金操作

---

## 八、总结

该 Schema 设计采用范式化设计，具有以下特点：

| 特性 | 说明 |
|------|------|
| **扩展性** | 通过分区和索引支持百万级玩家数据 |
| **性能** | 关键查询均有相应索引优化 |
| **可审计性** | 所有交易流水完整记录，支持回溯 |
| **AI集成** | 专门的决策日志表，支持AI Agent决策过程追踪 |
| **业务完整** | 覆盖产蛋、偷蛋、兑换、邀请等全业务流程 |

数据库满足 AIggs 游戏的所有核心玩法需求，支持高并发和实时查询，为后续扩展和优化预留了空间。
