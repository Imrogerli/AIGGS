# AIggs 数据库迁移管道设计文档

**版本**: 1.0
**日期**: 2026-03-27
**作者**: AIggs DevOps 架构师
**状态**: 生产级架构

---

## 目录

1. [系统概述](#系统概述)
2. [核心架构](#核心架构)
3. [模块设计](#模块设计)
4. [数据库设计](#数据库设计)
5. [API 接口](#api-接口)
6. [使用指南](#使用指南)
7. [运维手册](#运维手册)
8. [安全策略](#安全策略)

---

## 系统概述

### 背景问题

AIggs 是 AI 原生游戏，AI 会自主升级产品功能并改变数据库结构。传统的、手工的数据库迁移方案无法满足以下需求：

1. **自动化**：AI 提出 Schema 变更时，自动生成迁移文件
2. **安全性**：防止破坏性变更导致数据丢失
3. **可观测性**：完整的迁移历史和影响分析
4. **零停机**：蓝绿部署支持，渐进式流量切换
5. **可恢复性**：自动备份和多层次回滚机制

### 解决方案架构

```
AI 提出 Schema 变更
    ↓
迁移生成器 → 生成 Migration File
    ↓
迁移验证器 → 安全检查 + 影响分析
    ↓
影子表试跑 → 数据完整性 + 性能基准
    ↓
自动备份 → pg_dump + 备份验证
    ↓
人工审批 (如果破坏性变更)
    ↓
迁移执行器 → 执行迁移 + 记录历史
    ↓
蓝绿部署 → 新旧 Schema 并行 → 渐进式切换
    ↓
监控告警 + 自动回滚机制
```

---

## 核心架构

### 1. 版本化迁移系统

#### 迁移文件结构

```
migrations/
├── 001_init_schema.up.sql
├── 001_init_schema.down.sql
├── 002_add_farm_level.up.sql
├── 002_add_farm_level.down.sql
├── 003_rename_egg_count.up.sql
├── 003_rename_egg_count.down.sql
└── ...
```

#### 迁移文件命名规则

- **格式**: `{timestamp}_{description}.{up|down}.sql`
- **示例**: `202603271430_add_farm_level.up.sql`
- **优势**:
  - 按时间戳自动排序
  - 避免冲突
  - 清晰的描述信息

#### 迁移历史表 (schema_migrations)

```sql
CREATE TABLE schema_migrations (
    id BIGSERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,           -- 迁移版本号（时间戳_描述）
    name VARCHAR(255) NOT NULL,                    -- 迁移名称
    description TEXT,                              -- 迁移描述
    checksum VARCHAR(64),                          -- 迁移文件内容的 SHA256 校验和

    -- 执行信息
    applied_at TIMESTAMP,                          -- 应用时间
    executed_by VARCHAR(255),                      -- 执行人/执行者 (CI/CD or 'ai-agent')
    execution_time_ms BIGINT,                      -- 执行耗时（毫秒）

    -- 回滚信息
    rolled_back_at TIMESTAMP,                      -- 回滚时间
    rolled_back_by VARCHAR(255),                   -- 回滚执行者
    rollback_reason TEXT,                          -- 回滚原因

    -- 风险等级
    risk_level VARCHAR(20) DEFAULT 'MEDIUM',       -- LOW, MEDIUM, HIGH, CRITICAL
    requires_approval BOOLEAN DEFAULT FALSE,       -- 是否需要人工审批

    -- 审批流程
    approved_by VARCHAR(255),                      -- 审批人
    approved_at TIMESTAMP,                         -- 审批时间
    approval_notes TEXT,                           -- 审批备注

    -- 备份关联
    backup_snapshot_id VARCHAR(255),               -- 关联的备份快照 ID

    -- 审计信息
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 索引优化
CREATE INDEX idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);
CREATE INDEX idx_schema_migrations_risk_level ON schema_migrations(risk_level);
CREATE INDEX idx_schema_migrations_approved ON schema_migrations(requires_approval, approved_at);
```

---

### 2. 迁移验证系统

#### 破坏性变更检测

验证器会扫描迁移文件，识别以下风险操作：

| 风险类型 | SQL 模式 | 风险等级 | 说明 |
|---------|---------|--------|------|
| 删表 | `DROP TABLE` | CRITICAL | 不可逆，可能导致数据完全丢失 |
| 删列 | `DROP COLUMN` | HIGH | 删除列中的数据丢失 |
| 类型缩小 | `ALTER COLUMN ... SET DATA TYPE` | HIGH | 数据截断风险（VARCHAR(255)→VARCHAR(50)） |
| 删索引 | `DROP INDEX` | MEDIUM | 性能下降，可重建 |
| 删约束 | `ALTER TABLE DROP CONSTRAINT` | MEDIUM | 可能导致数据一致性问题 |
| 修改约束 | `ALTER TABLE ... CONSTRAINT` | MEDIUM | 可能违反现有约束 |
| 添加非空列 | `ADD COLUMN NOT NULL` | HIGH | 已有行插入失败 |
| 修改默认值 | `ALTER COLUMN SET DEFAULT` | LOW | 仅影响新行 |
| 添加新列 | `ADD COLUMN` | LOW | 安全操作 |
| 添加索引 | `CREATE INDEX` | LOW | 安全操作 |
| 新增约束 | `ALTER TABLE ADD CONSTRAINT` | MEDIUM | 可能违反现有数据 |

#### 影响分析报告

```typescript
interface MigrationImpactReport {
  version: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresApproval: boolean;

  // 受影响的对象
  affectedTables: {
    tableName: string;
    operations: string[];
    estimatedRowCount: number;
  }[];

  // 破坏性变更
  destructiveChanges: {
    type: string;
    sql: string;
    severity: string;
    mitigation: string;
  }[];

  // 数据风险
  dataRisks: {
    type: string;
    description: string;
    affectedRows: number;
    severity: string;
  }[];

  // 性能影响
  performanceImpact: {
    estimatedDuration: number;     // 预估执行时间（秒）
    lockingStrategy: string;        // EXCLUSIVE, SHARE, NONE
    downtime: boolean;              // 是否需要停机
  };

  // 回滚可行性
  rollbackFeasibility: {
    isReversible: boolean;
    estimatedRollbackTime: number;
    risks: string[];
  };
}
```

---

### 3. 影子表试跑系统（Shadow Testing）

#### 工作流程

```
1. 创建影子 Schema: shadow_current
2. 复制生产数据子集到影子表（最多 1M 行）
3. 在影子 Schema 执行迁移
4. 验证数据完整性：
   - 行数对比（迁移前后）
   - 列类型检查
   - 约束校验
   - 数据采样检查
5. 性能基准测试
6. 清理影子表
```

#### 影子表数据验证

```typescript
interface ShadowTestingReport {
  status: 'PASSED' | 'FAILED' | 'WARNING';
  duration: number;                    // 执行时间（毫秒）

  // 数据完整性检查
  dataIntegrity: {
    rowCountBefore: number;
    rowCountAfter: number;
    rowCountMatch: boolean;

    columnValidation: {
      columnName: string;
      type: string;
      typeMatch: boolean;
      nullViolations: number;
    }[];

    constraintValidation: {
      constraintName: string;
      violations: number;
      status: 'PASSED' | 'FAILED';
    }[];

    dataSamples: {
      tableName: string;
      sampleRows: number;
      checksumMatch: boolean;
    }[];
  };

  // 性能基准
  performanceBenchmark: {
    executionTime: number;             // 迁移执行时间（毫秒）
    cpuUsage: number;
    memoryUsage: number;
    diskIO: number;

    indexRebuildTime?: number;
    lockWaitTime?: number;
  };

  // 问题警告
  warnings: string[];
  errors: string[];
}
```

---

### 4. 自动备份系统

#### 备份策略

| 备份类型 | 频率 | 保留期 | 用途 |
|---------|------|--------|------|
| 迁移前快照 | 每次迁移前 | 30 天 | 迁移失败回滚 |
| 每日快照 | 每天 00:00 UTC | 30 天 | 日常恢复 |
| 每周快照 | 每周一 00:00 UTC | 90 天 | 周期性保存 |
| 每月快照 | 每月 1 日 00:00 UTC | 永久 | 长期存档 |
| 增量备份 | 每小时 | 7 天 | 快速恢复 |

#### 备份表结构

```sql
CREATE TABLE backups (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id VARCHAR(255) UNIQUE NOT NULL,     -- 备份唯一ID
    backup_type VARCHAR(50) NOT NULL,             -- full, incremental
    backup_path TEXT NOT NULL,                    -- 文件系统路径或 S3 URI
    size_bytes BIGINT,                            -- 备份大小

    -- 备份范围
    database_name VARCHAR(100),
    schema_name VARCHAR(100),
    tables_included TEXT[],                       -- 包含的表列表

    -- 元数据
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,                         -- 备份过期时间
    compression_type VARCHAR(50),                 -- gzip, bzip2
    encryption_enabled BOOLEAN DEFAULT FALSE,

    -- 验证信息
    verified_at TIMESTAMP,
    verified_by VARCHAR(255),
    verification_result VARCHAR(50),              -- passed, failed, pending

    -- 关联迁移
    migration_version VARCHAR(50) REFERENCES schema_migrations(version),

    -- 恢复信息
    restored_at TIMESTAMP,
    restored_by VARCHAR(255),
    restored_to_database VARCHAR(100),

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX idx_backups_expires_at ON backups(expires_at);
CREATE INDEX idx_backups_migration_version ON backups(migration_version);
```

#### 备份命名规则

```
full_backup_{timestamp}_{database}.sql.gz
  示例: full_backup_20260327_143000_aiggs_prod.sql.gz

incremental_backup_{timestamp}_{base_id}.sql.gz
  示例: incremental_backup_20260327_150000_20260327_140000.sql.gz
```

---

### 5. 回滚机制

#### 多层次回滚策略

```
1. 自动回滚（自动触发）
   - 执行超时（默认 5 分钟）
   - 数据验证失败
   - 磁盘空间不足
   - 连接池耗尽

2. 手动回滚（人工审批）
   - 业务发现问题
   - 监控告警异常
   - 灰度发布异常

3. 完整恢复（备份恢复）
   - 迁移 Down 脚本失败
   - 多个迁移回滚
   - 完整数据库恢复
```

#### 回滚表结构

```sql
CREATE TABLE rollbacks (
    id BIGSERIAL PRIMARY KEY,
    migration_version VARCHAR(50) NOT NULL,
    rollback_type VARCHAR(50),                    -- automatic, manual, recovery

    -- 回滚执行
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms BIGINT,

    -- 触发信息
    triggered_by VARCHAR(255),
    trigger_reason VARCHAR(500),

    -- 状态
    status VARCHAR(50),                           -- in_progress, completed, failed
    error_message TEXT,

    -- 验证
    data_validated BOOLEAN,
    validation_errors TEXT[],

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 6. 蓝绿部署支持

#### 架构设计

```
生产环境分为两套 Schema：

Schema A (蓝)          Schema B (绿)
├─ players_a           ├─ players_b
├─ farms_a             ├─ farms_b
├─ chickens_a          ├─ chickens_b
└─ ...                 └─ ...

流量切换过程：
1. 迁移前 → 所有流量到 Schema A
2. 在 Schema B 执行迁移（Schema A 继续服务）
3. 验证通过 → 新连接切换到 Schema B
4. 渐进切换 → 旧连接逐步迁移到 Schema B
5. 回退窗口 → 保留 Schema A 数据 24 小时
6. 清理 → 24 小时后删除 Schema A
```

#### 蓝绿部署表结构

```sql
CREATE TABLE blue_green_deployments (
    id BIGSERIAL PRIMARY KEY,
    deployment_id VARCHAR(255) UNIQUE NOT NULL,

    -- Schema 信息
    blue_schema VARCHAR(100),
    green_schema VARCHAR(100),
    active_schema VARCHAR(100),                   -- 当前活跃 Schema

    -- 迁移版本
    blue_version VARCHAR(50),
    green_version VARCHAR(50),

    -- 流量分配
    blue_traffic_percentage INT DEFAULT 100,      -- 0-100
    green_traffic_percentage INT DEFAULT 0,       -- 0-100

    -- 时间戳
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cutover_started_at TIMESTAMP,
    cutover_completed_at TIMESTAMP,
    rollback_deadline TIMESTAMP,                  -- 24 小时后自动清理蓝环境

    -- 状态
    status VARCHAR(50),                           -- preparing, testing, cutover, completed, rolled_back

    -- 性能指标
    error_rate_threshold NUMERIC(5, 2) DEFAULT 1.0,   -- %
    current_error_rate NUMERIC(5, 2),

    -- 监控
    monitoring_enabled BOOLEAN DEFAULT TRUE,
    health_checks_passed BOOLEAN,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_blue_green_status ON blue_green_deployments(status);
CREATE INDEX idx_blue_green_rollback_deadline ON blue_green_deployments(rollback_deadline);
```

---

### 7. AI 迁移审批流程

#### 置信度系统集成

```typescript
interface MigrationApprovalWorkflow {
  // AI 生成的迁移
  aiConfidenceScore: number;          // 0-100，AI 对迁移安全性的置信度

  // 审批规则
  approvalRules: {
    lowRisk: {
      confidenceThreshold: 80,        // ≥80% 不需人工审批
      autoApprove: true
    },
    mediumRisk: {
      confidenceThreshold: 60,        // 60-79% 需高级工程师审批
      autoApprove: false
    },
    highRisk: {
      confidenceThreshold: 40,        // <40% 需多人审批 + 影子表测试通过
      autoApprove: false
    },
    criticalRisk: {
      autoApprove: false              // 永远需要人工审批
    }
  };

  // 审批流程状态机
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ROLLED_BACK';

  // 审批记录
  approvals: {
    approver: string;
    role: 'ai-agent' | 'engineer' | 'dba' | 'senior-engineer' | 'manager';
    decision: 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
    notes: string;
    timestamp: Date;
  }[];

  // 条件审批（MEDIUM/HIGH 等级可选）
  conditionalApprovals: {
    requiresShadowTest: boolean;      // 必须通过影子表测试
    requiresPerformanceTest: boolean;
    requiresDataValidation: boolean;
    requiredApprovalCount: number;    // 需要几个审批
  };
}
```

#### 审批规则表

```sql
CREATE TABLE migration_approvals (
    id BIGSERIAL PRIMARY KEY,
    migration_version VARCHAR(50) NOT NULL REFERENCES schema_migrations(version),

    -- AI 信息
    ai_confidence_score INT,                     -- 0-100
    ai_reasoning TEXT,                           -- AI 的推理过程

    -- 风险评估
    risk_level VARCHAR(20),                      -- LOW, MEDIUM, HIGH, CRITICAL
    requires_manual_approval BOOLEAN,

    -- 审批流程
    approval_status VARCHAR(50),                 -- pending, approved, rejected
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 审批人信息
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    approver_role VARCHAR(50),                   -- engineer, dba, senior, manager
    approval_notes TEXT,

    -- 条件检查
    shadow_test_passed BOOLEAN,
    performance_test_passed BOOLEAN,
    data_validation_passed BOOLEAN,

    -- 拒绝信息
    rejection_reason TEXT,
    rejected_by VARCHAR(255),
    rejected_at TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_migration_approvals_status ON migration_approvals(approval_status);
CREATE INDEX idx_migration_approvals_created_at ON migration_approvals(created_at DESC);
```

---

## 数据库设计

### 完整 Schema 初始化

```sql
-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 创建迁移历史表
CREATE TABLE schema_migrations (
    id BIGSERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    checksum VARCHAR(64),

    applied_at TIMESTAMP,
    executed_by VARCHAR(255),
    execution_time_ms BIGINT,

    rolled_back_at TIMESTAMP,
    rolled_back_by VARCHAR(255),
    rollback_reason TEXT,

    risk_level VARCHAR(20) DEFAULT 'MEDIUM',
    requires_approval BOOLEAN DEFAULT FALSE,

    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    approval_notes TEXT,

    backup_snapshot_id VARCHAR(255),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);
CREATE INDEX idx_schema_migrations_risk_level ON schema_migrations(risk_level);

-- 创建备份表
CREATE TABLE backups (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id VARCHAR(255) UNIQUE NOT NULL,
    backup_type VARCHAR(50) NOT NULL,
    backup_path TEXT NOT NULL,
    size_bytes BIGINT,

    database_name VARCHAR(100),
    schema_name VARCHAR(100),
    tables_included TEXT[],

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    compression_type VARCHAR(50),
    encryption_enabled BOOLEAN DEFAULT FALSE,

    verified_at TIMESTAMP,
    verified_by VARCHAR(255),
    verification_result VARCHAR(50),

    migration_version VARCHAR(50) REFERENCES schema_migrations(version),

    restored_at TIMESTAMP,
    restored_by VARCHAR(255),
    restored_to_database VARCHAR(100),

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX idx_backups_expires_at ON backups(expires_at);

-- 创建回滚表
CREATE TABLE rollbacks (
    id BIGSERIAL PRIMARY KEY,
    migration_version VARCHAR(50) NOT NULL,
    rollback_type VARCHAR(50),

    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms BIGINT,

    triggered_by VARCHAR(255),
    trigger_reason VARCHAR(500),

    status VARCHAR(50),
    error_message TEXT,

    data_validated BOOLEAN,
    validation_errors TEXT[],

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建蓝绿部署表
CREATE TABLE blue_green_deployments (
    id BIGSERIAL PRIMARY KEY,
    deployment_id VARCHAR(255) UNIQUE NOT NULL,

    blue_schema VARCHAR(100),
    green_schema VARCHAR(100),
    active_schema VARCHAR(100),

    blue_version VARCHAR(50),
    green_version VARCHAR(50),

    blue_traffic_percentage INT DEFAULT 100,
    green_traffic_percentage INT DEFAULT 0,

    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cutover_started_at TIMESTAMP,
    cutover_completed_at TIMESTAMP,
    rollback_deadline TIMESTAMP,

    status VARCHAR(50),

    error_rate_threshold NUMERIC(5, 2) DEFAULT 1.0,
    current_error_rate NUMERIC(5, 2),

    monitoring_enabled BOOLEAN DEFAULT TRUE,
    health_checks_passed BOOLEAN,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建迁移审批表
CREATE TABLE migration_approvals (
    id BIGSERIAL PRIMARY KEY,
    migration_version VARCHAR(50) NOT NULL REFERENCES schema_migrations(version),

    ai_confidence_score INT,
    ai_reasoning TEXT,

    risk_level VARCHAR(20),
    requires_manual_approval BOOLEAN,

    approval_status VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    approver_role VARCHAR(50),
    approval_notes TEXT,

    shadow_test_passed BOOLEAN,
    performance_test_passed BOOLEAN,
    data_validation_passed BOOLEAN,

    rejection_reason TEXT,
    rejected_by VARCHAR(255),
    rejected_at TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_migration_approvals_status ON migration_approvals(approval_status);
```

---

## API 接口

### 1. 迁移管理 API

```typescript
// 迁移执行
POST /api/migrations/execute
{
  "version": "202603271430_add_farm_level",
  "dryRun": false,
  "skipBackup": false,
  "skipShadowTest": false,
  "timeoutSeconds": 300,
  "approvalToken": "token_xxx"
}

// 迁移回滚
POST /api/migrations/rollback
{
  "version": "202603271430_add_farm_level",
  "force": false,
  "reason": "数据验证失败"
}

// 获取迁移历史
GET /api/migrations/history?limit=20&offset=0&riskLevel=MEDIUM,HIGH

// 获取待审批迁移
GET /api/migrations/pending-approval

// 审批迁移
POST /api/migrations/approve
{
  "version": "202603271430_add_farm_level",
  "approvalNotes": "已在测试环境验证",
  "role": "senior-engineer"
}
```

### 2. 备份管理 API

```typescript
// 创建手动备份
POST /api/backups/create
{
  "backupType": "full",
  "tables": ["players", "farms", "chickens"],
  "compression": "gzip",
  "encryption": true
}

// 验证备份
POST /api/backups/{snapshotId}/verify

// 恢复备份
POST /api/backups/{snapshotId}/restore
{
  "targetDatabase": "aiggs_restore",
  "skipDataValidation": false
}

// 列出备份
GET /api/backups?type=full&limit=20&minAge=7
```

### 3. 影子表测试 API

```typescript
// 执行影子表测试
POST /api/shadow-testing/run
{
  "migrationVersion": "202603271430_add_farm_level",
  "dataSubsetSize": 1000000,
  "includeTables": ["players", "farms"]
}

// 获取测试结果
GET /api/shadow-testing/{testId}/report
```

### 4. 蓝绿部署 API

```typescript
// 启动蓝绿部署
POST /api/blue-green/start
{
  "migrationVersion": "202603271430_add_farm_level",
  "monitoringDuration": 3600,
  "errorRateThreshold": 1.0
}

// 切换流量
POST /api/blue-green/cutover
{
  "deploymentId": "bgd_xxx",
  "blueTrafficPercentage": 0
}

// 回滚蓝绿部署
POST /api/blue-green/rollback
{
  "deploymentId": "bgd_xxx",
  "reason": "错误率过高"
}
```

---

## 使用指南

### 快速开始

#### 1. 环境准备

```bash
# 安装依赖
npm install

# 配置数据库连接
cp .env.example .env

# 初始化迁移表
npm run migration:init
```

#### 2. 生成迁移文件

```bash
# AI 或开发者提出 Schema 变更
npm run migration:generate --name "add_farm_level" --type ai

# 系统会：
# 1. 生成 202603271430_add_farm_level.up.sql
# 2. 生成 202603271430_add_farm_level.down.sql
# 3. 检查破坏性变更
# 4. 生成影响分析报告
# 5. 等待审批（如果是高风险）
```

#### 3. 执行迁移

```bash
# 干运行（不修改数据库）
npm run migration:execute 202603271430_add_farm_level --dry-run

# 执行迁移
npm run migration:execute 202603271430_add_farm_level

# 执行迁移（跳过影子表测试）
npm run migration:execute 202603271430_add_farm_level --skip-shadow-test
```

#### 4. 回滚迁移

```bash
# 回滚单个迁移
npm run migration:rollback 202603271430_add_farm_level

# 回滚到指定版本
npm run migration:rollback --to 202603271200_add_user_level

# 强制回滚（用于紧急情况）
npm run migration:rollback 202603271430_add_farm_level --force
```

---

## 运维手册

### 监控和告警

```typescript
// 关键指标
- 迁移执行时间（目标 < 5 分钟）
- 数据验证成功率（目标 > 99.9%）
- 备份验证成功率（目标 = 100%）
- 蓝绿部署切换时间（目标 < 30 秒）
- 错误率（目标 < 0.1%）

// 告警规则
- 迁移执行超时 5 分钟 → 自动回滚 + 告警
- 影子表测试失败 → 暂停执行 + 告警
- 备份验证失败 → 重试 3 次 + 告警
- 蓝绿部署错误率 > 1% → 自动回滚 + 告警
```

### 日志管理

```typescript
// 日志级别
- INFO: 迁移开始/结束、备份创建/验证
- WARN: 影子表测试警告、性能下降
- ERROR: 迁移失败、备份失败、数据不一致
- DEBUG: 详细的 SQL 执行日志、性能计数器

// 日志保留策略
- 实时日志：7 天
- 存档日志：30 天
- 审计日志：永久（S3）
```

### 故障排查

#### 迁移执行失败

```bash
# 1. 查看迁移日志
npm run migration:logs 202603271430_add_farm_level

# 2. 运行影子表测试
npm run shadow-testing:run 202603271430_add_farm_level

# 3. 检查数据库状态
npm run db:status

# 4. 恢复备份（如必要）
npm run backup:restore 20260327_140000_aiggs_prod.sql.gz
```

#### 蓝绿部署异常

```bash
# 1. 监控流量指标
npm run blue-green:monitor bgd_xxx

# 2. 检查两个 Schema 的数据一致性
npm run blue-green:validate bgd_xxx

# 3. 立即回滚
npm run blue-green:rollback bgd_xxx --force
```

---

## 安全策略

### 1. 访问控制

| 操作 | 所需角色 | 说明 |
|------|--------|------|
| 查看迁移历史 | engineer | 只读 |
| 执行迁移 | dba, senior-engineer | 需要审批 |
| 审批迁移 | senior-engineer, manager | 可以决定是否执行 |
| 执行回滚 | dba, senior-engineer | 紧急情况可跳过审批 |
| 管理备份 | dba | 敏感操作 |
| 修改迁移验证规则 | manager | 策略变更 |

### 2. 审计追踪

所有迁移操作都记录：
- 执行人/AI 身份
- 执行时间
- 执行内容（SQL 语句）
- 执行结果（成功/失败）
- 关联的备份和回滚
- 审批流程记录

### 3. 加密和备份

```typescript
// 备份加密
- 算法: AES-256
- 密钥管理: AWS KMS
- 传输: HTTPS + TLS 1.3

// 敏感数据
- 备份内容: 加密存储
- 传输中: HTTPS + TLS
- 访问日志: 永久保留
```

### 4. 验证和校验和

```typescript
// 迁移文件校验
- 格式: SHA256
- 存储: schema_migrations.checksum
- 验证: 执行前检查

// 备份完整性
- 格式: MD5 + SHA256
- 验证: 恢复前检查
- 定期验证: 每周一次
```

---

## 完整工作流示例

### 场景：AI 提出新功能 - 添加农场等级系统

```
1. AI 生成迁移文件
   → migrations/202603271430_add_farm_level.up.sql
   → migrations/202603271430_add_farm_level.down.sql

2. 迁移验证
   ✓ 新增列 (farms.level) → 风险 LOW
   ✗ 删除列会导致数据丢失 → 风险检查通过

3. 风险评估
   - 风险等级: MEDIUM
   - AI 置信度: 75%
   - 需要审批: true

4. 影子表试跑
   ✓ 数据完整性: PASSED
   ✓ 性能基准: 2.3 秒（可接受）
   ✓ 约束验证: PASSED

5. 自动备份
   → 创建 full_backup_20260327_140000_aiggs_prod.sql.gz
   ✓ 备份验证: PASSED

6. 人工审批
   → senior-engineer 审批通过
   → 批准备注: "影子表测试通过，数据完整性无问题"

7. 执行迁移
   → 开始执行迁移
   → 执行时间: 2.1 秒
   → 数据验证: PASSED
   ✓ 迁移完成

8. 监控
   → 蓝绿部署: 新 Schema 流量 10%
   → 监控 1 小时
   → 错误率: 0.02% (正常)
   → 逐步提升到 100%

9. 清理
   → 24 小时后删除旧 Schema
   ✓ 迁移流程结束
```

---

## 总结

AIggs 数据库迁移管道提供了完整的、生产级的解决方案，确保：

1. ✓ **自动化**: AI 可以自主提出和执行 Schema 变更
2. ✓ **安全性**: 多层次验证防止数据丢失
3. ✓ **可观测性**: 完整的迁移历史和影响分析
4. ✓ **零停机**: 蓝绿部署支持无缝升级
5. ✓ **可恢复性**: 自动备份和多层次回滚
6. ✓ **合规性**: 完整的审计追踪和访问控制

该系统可以持续支持 AIggs 的 AI 驱动的产品迭代。

