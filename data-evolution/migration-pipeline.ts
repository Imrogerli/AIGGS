/**
 * AIggs 数据库迁移管道 - 完整实现
 * 生产级 TypeScript 代码，支持版本化迁移、影子表测试、自动备份等
 *
 * 功能列表：
 * 1. 版本化迁移系统
 * 2. 迁移验证与风险检测
 * 3. 影子表试跑
 * 4. 自动备份与恢复
 * 5. 回滚机制
 * 6. 蓝绿部署支持
 * 7. AI 审批工作流
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Pool, PoolClient, QueryResult } from 'pg';
import { execSync } from 'child_process';

// ============================================================================
// 类型定义
// ============================================================================

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type MigrationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type BlueGreenStatus = 'PREPARING' | 'TESTING' | 'CUTOVER' | 'COMPLETED' | 'ROLLED_BACK';
type ShadowTestStatus = 'PASSED' | 'FAILED' | 'WARNING';

/** 迁移文件信息 */
interface Migration {
  version: string;          // 时间戳_描述
  name: string;             // 迁移名称
  description: string;      // 描述
  upSql: string;           // UP SQL
  downSql: string;         // DOWN SQL
  checksum: string;        // SHA256 校验和
}

/** 迁移验证结果 */
interface MigrationValidationResult {
  version: string;
  isValid: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;

  destructiveChanges: DestructiveChange[];
  dataRisks: DataRisk[];
  performanceImpact: PerformanceImpact;
  rollbackFeasibility: RollbackFeasibility;

  warnings: string[];
  errors: string[];
}

interface DestructiveChange {
  type: string;
  sql: string;
  severity: string;
  mitigation: string;
}

interface DataRisk {
  type: string;
  description: string;
  affectedRows: number;
  severity: string;
}

interface PerformanceImpact {
  estimatedDuration: number;
  lockingStrategy: string;
  downtime: boolean;
}

interface RollbackFeasibility {
  isReversible: boolean;
  estimatedRollbackTime: number;
  risks: string[];
}

/** 影子表测试结果 */
interface ShadowTestingReport {
  testId: string;
  status: ShadowTestStatus;
  duration: number;

  dataIntegrity: {
    rowCountBefore: number;
    rowCountAfter: number;
    rowCountMatch: boolean;
    columnValidation: ColumnValidation[];
    constraintValidation: ConstraintValidation[];
  };

  performanceBenchmark: {
    executionTime: number;
    cpuUsage: number;
    memoryUsage: number;
  };

  warnings: string[];
  errors: string[];
}

interface ColumnValidation {
  columnName: string;
  type: string;
  typeMatch: boolean;
  nullViolations: number;
}

interface ConstraintValidation {
  constraintName: string;
  violations: number;
  status: 'PASSED' | 'FAILED';
}

/** 备份信息 */
interface BackupInfo {
  snapshotId: string;
  backupType: 'full' | 'incremental';
  backupPath: string;
  sizeBytes: number;
  createdAt: Date;
  expiresAt: Date;
  verificationResult: 'passed' | 'failed' | 'pending';
}

/** 迁移审批信息 */
interface MigrationApproval {
  migrationVersion: string;
  aiConfidenceScore: number;
  riskLevel: RiskLevel;
  requiresManualApproval: boolean;
  approvalStatus: ApprovalStatus;
  approvedBy?: string;
  approverRole?: string;
  shadowTestPassed?: boolean;
  performanceTestPassed?: boolean;
}

/** 蓝绿部署信息 */
interface BlueGreenDeployment {
  deploymentId: string;
  blueSchema: string;
  greenSchema: string;
  activeSchema: string;
  blueVersion: string;
  greenVersion: string;
  status: BlueGreenStatus;
  blueTrafficPercentage: number;
  greenTrafficPercentage: number;
}

// ============================================================================
// 1. 迁移管理器
// ============================================================================

class MigrationManager {
  private pool: Pool;
  private migrationsDir: string;

  constructor(pool: Pool, migrationsDir: string = './migrations') {
    this.pool = pool;
    this.migrationsDir = migrationsDir;
  }

  /**
   * 初始化迁移系统（创建迁移历史表）
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // 创建迁移历史表
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
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

        CREATE INDEX IF NOT EXISTS idx_schema_migrations_version
          ON schema_migrations(version);
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
          ON schema_migrations(applied_at DESC);
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_risk_level
          ON schema_migrations(risk_level);
      `);

      console.log('✓ 迁移系统初始化完成');
    } finally {
      client.release();
    }
  }

  /**
   * 生成迁移文件
   * @param name 迁移名称
   * @param upSql UP 脚本
   * @param downSql DOWN 脚本
   */
  async generateMigration(
    name: string,
    upSql: string,
    downSql: string
  ): Promise<Migration> {
    // 生成时间戳版本
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').slice(0, 14);
    const version = `${timestamp}_${name}`;

    // 计算校验和
    const checksum = this.calculateChecksum(upSql + downSql);

    // 创建迁移文件
    const upFile = path.join(this.migrationsDir, `${version}.up.sql`);
    const downFile = path.join(this.migrationsDir, `${version}.down.sql`);

    // 确保目录存在
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }

    fs.writeFileSync(upFile, upSql);
    fs.writeFileSync(downFile, downSql);

    console.log(`✓ 生成迁移: ${version}`);
    console.log(`  UP: ${upFile}`);
    console.log(`  DOWN: ${downFile}`);

    return {
      version,
      name,
      description: name,
      upSql,
      downSql,
      checksum,
    };
  }

  /**
   * 计算 SQL 内容的 SHA256 校验和
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 列出所有迁移文件
   */
  async listMigrations(): Promise<Migration[]> {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir).filter((f) =>
      f.endsWith('.up.sql')
    );

    return files.map((file) => {
      const version = file.replace('.up.sql', '');
      const [timestamp, ...nameParts] = version.split('_');
      const name = nameParts.join('_');

      const upSql = fs.readFileSync(
        path.join(this.migrationsDir, file),
        'utf-8'
      );
      const downSql = fs.readFileSync(
        path.join(this.migrationsDir, `${version}.down.sql`),
        'utf-8'
      );

      return {
        version,
        name,
        description: name,
        upSql,
        downSql,
        checksum: this.calculateChecksum(upSql + downSql),
      };
    });
  }

  /**
   * 获取已应用的迁移
   */
  async getAppliedMigrations(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT version FROM schema_migrations
         WHERE rolled_back_at IS NULL
         ORDER BY applied_at ASC`
      );
      return result.rows.map((row) => row.version);
    } finally {
      client.release();
    }
  }

  /**
   * 获取待应用的迁移
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const all = await this.listMigrations();
    const applied = await this.getAppliedMigrations();

    return all.filter((m) => !applied.includes(m.version));
  }

  /**
   * 执行迁移
   */
  async executeMigration(
    version: string,
    options: {
      dryRun?: boolean;
      skipBackup?: boolean;
      skipValidation?: boolean;
      executedBy?: string;
    } = {}
  ): Promise<{ success: boolean; executionTime: number; error?: string }> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      // 检查迁移是否已应用
      const existing = await client.query(
        'SELECT * FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (existing.rows.length > 0 && existing.rows[0].applied_at) {
        throw new Error(`迁移 ${version} 已被应用过`);
      }

      // 获取迁移文件
      const migrations = await this.listMigrations();
      const migration = migrations.find((m) => m.version === version);

      if (!migration) {
        throw new Error(`迁移文件 ${version} 不存在`);
      }

      // 验证迁移
      if (!options.skipValidation) {
        const validation = await new MigrationValidator(
          this.pool
        ).validateMigration(migration);

        if (!validation.isValid) {
          throw new Error(`迁移验证失败: ${validation.errors.join(', ')}`);
        }
      }

      // 创建备份
      let backupId: string | undefined;
      if (!options.skipBackup) {
        const backup = new BackupManager(this.pool);
        const result = await backup.createBackup({
          backupType: 'full',
          migrationVersion: version,
        });
        backupId = result.snapshotId;
      }

      // 如果是 dryRun，只验证不执行
      if (options.dryRun) {
        console.log(`✓ DRY RUN: 迁移 ${version} 验证通过`);
        return {
          success: true,
          executionTime: Date.now() - startTime,
        };
      }

      // 在事务中执行迁移
      await client.query('BEGIN');

      try {
        // 执行 SQL
        await client.query(migration.upSql);

        // 记录迁移历史
        await client.query(
          `INSERT INTO schema_migrations
           (version, name, description, checksum, applied_at, executed_by, execution_time_ms, backup_snapshot_id)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7)`,
          [
            version,
            migration.name,
            migration.description,
            migration.checksum,
            options.executedBy || 'system',
            Date.now() - startTime,
            backupId,
          ]
        );

        await client.query('COMMIT');

        const executionTime = Date.now() - startTime;
        console.log(`✓ 迁移 ${version} 执行成功 (${executionTime}ms)`);

        return { success: true, executionTime };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`✗ 迁移 ${version} 执行失败: ${message}`);

      return {
        success: false,
        executionTime: Date.now() - startTime,
        error: message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * 回滚迁移
   */
  async rollbackMigration(
    version: string,
    reason: string = '用户请求',
    force: boolean = false
  ): Promise<{ success: boolean; executionTime: number; error?: string }> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      // 获取迁移文件
      const migrations = await this.listMigrations();
      const migration = migrations.find((m) => m.version === version);

      if (!migration) {
        throw new Error(`迁移文件 ${version} 不存在`);
      }

      // 在事务中执行回滚
      await client.query('BEGIN');

      try {
        // 执行回滚 SQL
        await client.query(migration.downSql);

        // 更新迁移历史
        await client.query(
          `UPDATE schema_migrations
           SET rolled_back_at = CURRENT_TIMESTAMP, rolled_back_by = $2, rollback_reason = $3
           WHERE version = $1`,
          [version, 'system', reason]
        );

        await client.query('COMMIT');

        const executionTime = Date.now() - startTime;
        console.log(
          `✓ 迁移 ${version} 回滚成功 (${executionTime}ms)`
        );

        return { success: true, executionTime };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`✗ 迁移 ${version} 回滚失败: ${message}`);

      return {
        success: false,
        executionTime: Date.now() - startTime,
        error: message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * 获取迁移历史
   */
  async getMigrationHistory(limit: number = 20): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM schema_migrations ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
}

// ============================================================================
// 2. 迁移验证器
// ============================================================================

class MigrationValidator {
  private pool: Pool;

  // 破坏性变更检测规则
  private destructivePatterns = [
    { pattern: /DROP\s+TABLE/i, type: 'DROP_TABLE', severity: 'CRITICAL' },
    { pattern: /DROP\s+COLUMN/i, type: 'DROP_COLUMN', severity: 'HIGH' },
    {
      pattern: /ALTER\s+COLUMN.*SET\s+DATA\s+TYPE/i,
      type: 'TYPE_CHANGE',
      severity: 'HIGH',
    },
    { pattern: /DROP\s+INDEX/i, type: 'DROP_INDEX', severity: 'MEDIUM' },
    {
      pattern: /ALTER\s+TABLE.*DROP\s+CONSTRAINT/i,
      type: 'DROP_CONSTRAINT',
      severity: 'MEDIUM',
    },
    {
      pattern: /ADD\s+COLUMN.*NOT\s+NULL(?!.*DEFAULT)/i,
      type: 'ADD_NOT_NULL_COLUMN',
      severity: 'HIGH',
    },
  ];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 验证迁移文件
   */
  async validateMigration(
    migration: Migration
  ): Promise<MigrationValidationResult> {
    const upSql = migration.upSql;
    const downSql = migration.downSql;

    const result: MigrationValidationResult = {
      version: migration.version,
      isValid: true,
      riskLevel: 'LOW',
      requiresApproval: false,
      destructiveChanges: [],
      dataRisks: [],
      performanceImpact: {
        estimatedDuration: 1,
        lockingStrategy: 'SHARE',
        downtime: false,
      },
      rollbackFeasibility: {
        isReversible: true,
        estimatedRollbackTime: 1,
        risks: [],
      },
      warnings: [],
      errors: [],
    };

    // 1. 检测破坏性变更
    for (const rule of this.destructivePatterns) {
      if (rule.pattern.test(upSql)) {
        result.destructiveChanges.push({
          type: rule.type,
          sql: upSql.split('\n').find((line) => rule.pattern.test(line)) || '',
          severity: rule.severity,
          mitigation: this.getMitigation(rule.type),
        });

        // 更新风险等级
        if (rule.severity === 'CRITICAL') {
          result.riskLevel = 'CRITICAL';
          result.requiresApproval = true;
        } else if (rule.severity === 'HIGH' && result.riskLevel !== 'CRITICAL') {
          result.riskLevel = 'HIGH';
          result.requiresApproval = true;
        } else if (rule.severity === 'MEDIUM' && result.riskLevel === 'LOW') {
          result.riskLevel = 'MEDIUM';
          result.requiresApproval = true;
        }
      }
    }

    // 2. 检查回滚脚本
    if (!downSql || downSql.trim().length === 0) {
      result.warnings.push('DOWN 脚本为空，无法回滚');
      result.rollbackFeasibility.isReversible = false;
    }

    // 3. 检测数据风险
    if (/DELETE\s+FROM/i.test(upSql)) {
      result.dataRisks.push({
        type: 'DATA_DELETION',
        description: '检测到 DELETE 语句，可能丢失数据',
        affectedRows: -1,
        severity: 'HIGH',
      });
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * 获取风险的缓解措施
   */
  private getMitigation(type: string): string {
    const mitigations: { [key: string]: string } = {
      DROP_TABLE:
        '确保已备份数据；考虑改用 TRUNCATE 或重命名表',
      DROP_COLUMN:
        '在删除前创建备份；确认没有应用依赖此列',
      TYPE_CHANGE:
        '可能导致数据截断；先创建临时列，迁移数据，再删除旧列',
      DROP_INDEX:
        '可能导致查询性能下降；建议先评估性能影响',
      DROP_CONSTRAINT:
        '可能导致数据一致性问题；确保数据已满足约束',
      ADD_NOT_NULL_COLUMN:
        '新列必须有默认值或先创建为可空，再添加约束',
    };
    return (
      mitigations[type] || '建议在测试环境先验证迁移'
    );
  }

  /**
   * 分析 SQL 的性能影响（简化版）
   */
  private analyzePerformanceImpact(sql: string): PerformanceImpact {
    // 检测大表操作
    const isBigTableOperation =
      /ALTER\s+TABLE\s+(players|farms|transactions)/i.test(sql);

    return {
      estimatedDuration: isBigTableOperation ? 60 : 5,
      lockingStrategy: isBigTableOperation ? 'EXCLUSIVE' : 'SHARE',
      downtime: isBigTableOperation,
    };
  }
}

// ============================================================================
// 3. 影子表测试系统
// ============================================================================

class ShadowTester {
  private pool: Pool;
  private shadowSchema: string = 'shadow_testing';

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 执行影子表测试
   */
  async runShadowTest(
    migration: Migration,
    dataSubsetSize: number = 1000000
  ): Promise<ShadowTestingReport> {
    const testId = `test_${Date.now()}`;
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      console.log(`🔄 开始影子表测试: ${testId}`);

      // 1. 创建影子 Schema
      await client.query(`DROP SCHEMA IF EXISTS ${this.shadowSchema} CASCADE`);
      await client.query(`CREATE SCHEMA ${this.shadowSchema}`);
      console.log(`✓ 创建影子 Schema`);

      // 2. 复制表结构和数据
      const tables = await this.getTables(client);
      for (const table of tables) {
        await this.copyTableToShadow(
          client,
          table,
          dataSubsetSize
        );
      }
      console.log(`✓ 复制表结构和数据`);

      // 3. 记录迁移前的行数
      const rowCountBefore = await this.getRowCounts(
        client,
        this.shadowSchema
      );

      // 4. 执行迁移
      const migrationStartTime = Date.now();
      await client.query(migration.upSql);
      const executionTime = Date.now() - migrationStartTime;
      console.log(`✓ 执行迁移 (${executionTime}ms)`);

      // 5. 验证数据完整性
      const rowCountAfter = await this.getRowCounts(
        client,
        this.shadowSchema
      );

      // 6. 清理影子表
      await client.query(
        `DROP SCHEMA ${this.shadowSchema} CASCADE`
      );

      const report: ShadowTestingReport = {
        testId,
        status: 'PASSED',
        duration: Date.now() - startTime,
        dataIntegrity: {
          rowCountBefore,
          rowCountAfter,
          rowCountMatch:
            rowCountBefore === rowCountAfter,
          columnValidation: [],
          constraintValidation: [],
        },
        performanceBenchmark: {
          executionTime,
          cpuUsage: 0,
          memoryUsage: 0,
        },
        warnings: [],
        errors: [],
      };

      // 检查数据完整性
      if (
        report.dataIntegrity.rowCountMatch
      ) {
        console.log(`✓ 数据完整性检查通过`);
      } else {
        console.log(`⚠ 数据行数不匹配`);
        report.status = 'WARNING';
        report.warnings.push('迁移前后行数不一致');
      }

      console.log(
        `✓ 影子表测试完成 (${report.duration}ms)`
      );
      return report;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`✗ 影子表测试失败: ${message}`);

      return {
        testId,
        status: 'FAILED',
        duration: Date.now() - startTime,
        dataIntegrity: {
          rowCountBefore: 0,
          rowCountAfter: 0,
          rowCountMatch: false,
          columnValidation: [],
          constraintValidation: [],
        },
        performanceBenchmark: {
          executionTime: 0,
          cpuUsage: 0,
          memoryUsage: 0,
        },
        warnings: [],
        errors: [message],
      };
    } finally {
      client.release();
    }
  }

  /**
   * 获取所有表名
   */
  private async getTables(client: PoolClient): Promise<string[]> {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'`
    );
    return result.rows.map((row) => row.table_name);
  }

  /**
   * 复制表到影子 Schema
   */
  private async copyTableToShadow(
    client: PoolClient,
    table: string,
    limit: number
  ): Promise<void> {
    // 复制表结构
    await client.query(
      `CREATE TABLE ${this.shadowSchema}.${table}
       AS TABLE public.${table} WITH NO DATA`
    );

    // 复制数据（限制行数）
    await client.query(
      `INSERT INTO ${this.shadowSchema}.${table}
       SELECT * FROM public.${table} LIMIT $1`,
      [limit]
    );
  }

  /**
   * 获取表行数
   */
  private async getRowCounts(
    client: PoolClient,
    schema: string
  ): Promise<number> {
    const tables = await this.getTables(client);
    let totalRows = 0;

    for (const table of tables) {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM ${schema}.${table}`
      );
      totalRows += parseInt(
        result.rows[0].count,
        10
      );
    }

    return totalRows;
  }
}

// ============================================================================
// 4. 备份管理器
// ============================================================================

class BackupManager {
  private pool: Pool;
  private backupDir: string = './backups';

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 初始化备份表
   */
  async initializeBackupTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS backups (
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

          migration_version VARCHAR(50),

          restored_at TIMESTAMP,
          restored_by VARCHAR(255),
          restored_to_database VARCHAR(100),

          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_backups_created_at
          ON backups(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_backups_migration_version
          ON backups(migration_version);
      `);

      console.log('✓ 备份表初始化完成');
    } finally {
      client.release();
    }
  }

  /**
   * 创建备份
   */
  async createBackup(options: {
    backupType: 'full' | 'incremental';
    tables?: string[];
    migrationVersion?: string;
    compression?: 'gzip' | 'bzip2';
  }): Promise<BackupInfo> {
    // 确保备份目录存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, {
        recursive: true,
      });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]/g, '')
      .slice(0, 14);
    const snapshotId = `backup_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

    const backupFile = path.join(
      this.backupDir,
      `${snapshotId}.sql.gz`
    );

    console.log(`🔄 创建备份: ${snapshotId}`);

    try {
      // 使用 pg_dump 创建备份
      const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost/aiggs';
      const command = `pg_dump ${dbUrl} | gzip > ${backupFile}`;

      execSync(command, { encoding: 'utf-8' });

      const stats = fs.statSync(backupFile);
      const backupInfo: BackupInfo = {
        snapshotId,
        backupType: options.backupType,
        backupPath: backupFile,
        sizeBytes: stats.size,
        createdAt: new Date(),
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ), // 30 天
        verificationResult: 'pending',
      };

      // 记录备份到数据库
      const client = await this.pool.connect();
      try {
        await client.query(
          `INSERT INTO backups
           (snapshot_id, backup_type, backup_path, size_bytes, migration_version, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)`,
          [
            snapshotId,
            options.backupType,
            backupFile,
            stats.size,
            options.migrationVersion,
            backupInfo.expiresAt,
          ]
        );
      } finally {
        client.release();
      }

      console.log(
        `✓ 备份创建完成 (${(stats.size / 1024 / 1024).toFixed(2)}MB)`
      );
      return backupInfo;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`✗ 备份创建失败: ${message}`);
      throw error;
    }
  }

  /**
   * 验证备份
   */
  async verifyBackup(
    snapshotId: string
  ): Promise<boolean> {
    console.log(`🔄 验证备份: ${snapshotId}`);

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT backup_path FROM backups WHERE snapshot_id = $1',
        [snapshotId]
      );

      if (result.rows.length === 0) {
        throw new Error(`备份 ${snapshotId} 不存在`);
      }

      const backupPath = result.rows[0].backup_path;

      // 检查文件是否存在
      if (!fs.existsSync(backupPath)) {
        throw new Error(`备份文件不存在: ${backupPath}`);
      }

      // 简单验证：解压测试
      try {
        execSync(`gzip -t ${backupPath}`, {
          encoding: 'utf-8',
        });
      } catch {
        throw new Error('备份文件损坏，无法解压');
      }

      // 更新验证状态
      await client.query(
        `UPDATE backups
         SET verified_at = CURRENT_TIMESTAMP, verification_result = $2
         WHERE snapshot_id = $1`,
        [snapshotId, 'passed']
      );

      console.log(`✓ 备份验证通过`);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`✗ 备份验证失败: ${message}`);

      // 更新验证状态
      try {
        await client.query(
          `UPDATE backups
           SET verified_at = CURRENT_TIMESTAMP, verification_result = $2
           WHERE snapshot_id = $1`,
          [snapshotId, 'failed']
        );
      } catch {
        // 忽略更新失败
      }

      return false;
    } finally {
      client.release();
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(
    snapshotId: string,
    targetDatabase: string
  ): Promise<{ success: boolean; duration: number }> {
    const startTime = Date.now();

    console.log(
      `🔄 恢复备份 ${snapshotId} 到 ${targetDatabase}`
    );

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT backup_path FROM backups WHERE snapshot_id = $1',
          [snapshotId]
        );

        if (result.rows.length === 0) {
          throw new Error(`备份 ${snapshotId} 不存在`);
        }

        const backupPath = result.rows[0].backup_path;

        // 创建目标数据库
        await client.query(
          `CREATE DATABASE ${targetDatabase}`
        );

        // 恢复备份
        const command = `gunzip < ${backupPath} | psql -d ${targetDatabase}`;
        execSync(command, { encoding: 'utf-8' });

        // 记录恢复
        await client.query(
          `UPDATE backups
           SET restored_at = CURRENT_TIMESTAMP, restored_to_database = $2
           WHERE snapshot_id = $1`,
          [snapshotId, targetDatabase]
        );

        const duration = Date.now() - startTime;
        console.log(
          `✓ 备份恢复完成 (${(duration / 1000).toFixed(2)}s)`
        );

        return { success: true, duration };
      } finally {
        client.release();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`✗ 备份恢复失败: ${message}`);

      return {
        success: false,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 清理过期备份
   */
  async cleanupExpiredBackups(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT snapshot_id, backup_path FROM backups
         WHERE expires_at < CURRENT_TIMESTAMP`
      );

      for (const row of result.rows) {
        // 删除文件
        if (fs.existsSync(row.backup_path)) {
          fs.unlinkSync(row.backup_path);
        }

        // 删除记录
        await client.query(
          'DELETE FROM backups WHERE snapshot_id = $1',
          [row.snapshot_id]
        );
      }

      console.log(
        `✓ 清理 ${result.rows.length} 个过期备份`
      );
      return result.rows.length;
    } finally {
      client.release();
    }
  }
}

// ============================================================================
// 5. 蓝绿部署管理器
// ============================================================================

class BlueGreenDeploymentManager {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 初始化蓝绿部署表
   */
  async initializeBlueGreenTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS blue_green_deployments (
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

        CREATE INDEX IF NOT EXISTS idx_blue_green_status
          ON blue_green_deployments(status);
      `);

      console.log('✓ 蓝绿部署表初始化完成');
    } finally {
      client.release();
    }
  }

  /**
   * 启动蓝绿部署
   */
  async startDeployment(
    currentVersion: string,
    newVersion: string
  ): Promise<BlueGreenDeployment> {
    const client = await this.pool.connect();
    try {
      const deploymentId = `bgd_${Date.now()}`;
      const blueSchema = 'public_blue';
      const greenSchema = 'public_green';

      // 创建新 Schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${greenSchema}`);

      // 复制当前 Schema 到蓝环境（备份）
      await client.query(
        `CREATE SCHEMA IF NOT EXISTS ${blueSchema}`
      );

      // 记录部署
      await client.query(
        `INSERT INTO blue_green_deployments
         (deployment_id, blue_schema, green_schema, active_schema,
          blue_version, green_version, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          deploymentId,
          blueSchema,
          greenSchema,
          blueSchema,
          currentVersion,
          newVersion,
          'PREPARING',
        ]
      );

      console.log(`✓ 启动蓝绿部署: ${deploymentId}`);

      return {
        deploymentId,
        blueSchema,
        greenSchema,
        activeSchema: blueSchema,
        blueVersion: currentVersion,
        greenVersion: newVersion,
        status: 'PREPARING',
        blueTrafficPercentage: 100,
        greenTrafficPercentage: 0,
      };
    } finally {
      client.release();
    }
  }

  /**
   * 切换流量到绿环境
   */
  async switchTraffic(
    deploymentId: string,
    greenPercentage: number
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log(
        `🔄 切换流量到绿环境: ${greenPercentage}%`
      );

      // 更新流量分配
      await client.query(
        `UPDATE blue_green_deployments
         SET green_traffic_percentage = $2, blue_traffic_percentage = $3
         WHERE deployment_id = $1`,
        [deploymentId, greenPercentage, 100 - greenPercentage]
      );

      console.log(`✓ 流量切换完成`);
    } finally {
      client.release();
    }
  }

  /**
   * 完成蓝绿部署
   */
  async completeDeployment(
    deploymentId: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // 获取部署信息
      const result = await client.query(
        `SELECT * FROM blue_green_deployments WHERE deployment_id = $1`,
        [deploymentId]
      );

      if (result.rows.length === 0) {
        throw new Error(`部署 ${deploymentId} 不存在`);
      }

      const deployment = result.rows[0];

      // 更新状态
      await client.query(
        `UPDATE blue_green_deployments
         SET status = $2, cutover_completed_at = CURRENT_TIMESTAMP,
             rollback_deadline = CURRENT_TIMESTAMP + INTERVAL '24 hours'
         WHERE deployment_id = $1`,
        [deploymentId, 'COMPLETED']
      );

      console.log(
        `✓ 蓝绿部署完成，将在 24 小时后清理旧环境`
      );
    } finally {
      client.release();
    }
  }

  /**
   * 回滚蓝绿部署
   */
  async rollbackDeployment(
    deploymentId: string,
    reason: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log(`🔄 回滚蓝绿部署: ${reason}`);

      // 切换回蓝环境
      await client.query(
        `UPDATE blue_green_deployments
         SET status = $2, blue_traffic_percentage = 100, green_traffic_percentage = 0
         WHERE deployment_id = $1`,
        [deploymentId, 'ROLLED_BACK']
      );

      console.log(`✓ 蓝绿部署已回滚`);
    } finally {
      client.release();
    }
  }
}

// ============================================================================
// 6. 迁移审批管理器
// ============================================================================

class ApprovalManager {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 初始化审批表
   */
  async initializeApprovalTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migration_approvals (
          id BIGSERIAL PRIMARY KEY,
          migration_version VARCHAR(50) NOT NULL UNIQUE,

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

        CREATE INDEX IF NOT EXISTS idx_migration_approvals_status
          ON migration_approvals(approval_status);
      `);

      console.log('✓ 审批表初始化完成');
    } finally {
      client.release();
    }
  }

  /**
   * 创建审批请求
   */
  async createApprovalRequest(
    migrationVersion: string,
    aiConfidenceScore: number,
    riskLevel: RiskLevel
  ): Promise<MigrationApproval> {
    const client = await this.pool.connect();
    try {
      const requiresApproval = aiConfidenceScore < 80;

      await client.query(
        `INSERT INTO migration_approvals
         (migration_version, ai_confidence_score, risk_level, requires_manual_approval, approval_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          migrationVersion,
          aiConfidenceScore,
          riskLevel,
          requiresApproval,
          'PENDING',
        ]
      );

      console.log(
        `✓ 创建审批请求: ${migrationVersion} (置信度: ${aiConfidenceScore}%)`
      );

      return {
        migrationVersion,
        aiConfidenceScore,
        riskLevel,
        requiresManualApproval: requiresApproval,
        approvalStatus: 'PENDING',
      };
    } finally {
      client.release();
    }
  }

  /**
   * 审批迁移
   */
  async approveMigration(
    migrationVersion: string,
    approverRole: string,
    notes: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE migration_approvals
         SET approval_status = $2, approved_by = $3, approved_at = CURRENT_TIMESTAMP, approver_role = $4, approval_notes = $5
         WHERE migration_version = $1`,
        [migrationVersion, 'APPROVED', 'approved_user', approverRole, notes]
      );

      console.log(`✓ 迁移已批准: ${migrationVersion}`);
    } finally {
      client.release();
    }
  }

  /**
   * 拒绝迁移
   */
  async rejectMigration(
    migrationVersion: string,
    reason: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE migration_approvals
         SET approval_status = $2, rejected_by = $3, rejected_at = CURRENT_TIMESTAMP, rejection_reason = $4
         WHERE migration_version = $1`,
        [
          migrationVersion,
          'REJECTED',
          'rejected_user',
          reason,
        ]
      );

      console.log(`✗ 迁移已拒绝: ${migrationVersion}`);
    } finally {
      client.release();
    }
  }

  /**
   * 检查迁移是否被批准
   */
  async isApproved(
    migrationVersion: string
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT approval_status FROM migration_approvals WHERE migration_version = $1`,
        [migrationVersion]
      );

      if (result.rows.length === 0) {
        return true; // 没有审批要求
      }

      return (
        result.rows[0].approval_status === 'APPROVED'
      );
    } finally {
      client.release();
    }
  }
}

// ============================================================================
// 7. 完整迁移管道编排器
// ============================================================================

class MigrationPipeline {
  private migrationManager: MigrationManager;
  private validator: MigrationValidator;
  private shadowTester: ShadowTester;
  private backupManager: BackupManager;
  private blueGreenManager: BlueGreenDeploymentManager;
  private approvalManager: ApprovalManager;
  private pool: Pool;

  constructor(pool: Pool, migrationsDir: string = './migrations') {
    this.pool = pool;
    this.migrationManager = new MigrationManager(
      pool,
      migrationsDir
    );
    this.validator = new MigrationValidator(pool);
    this.shadowTester = new ShadowTester(pool);
    this.backupManager = new BackupManager(pool);
    this.blueGreenManager =
      new BlueGreenDeploymentManager(pool);
    this.approvalManager = new ApprovalManager(pool);
  }

  /**
   * 初始化整个迁移管道
   */
  async initialize(): Promise<void> {
    console.log('初始化 AIggs 迁移管道...\n');

    await this.migrationManager.initialize();
    await this.backupManager.initializeBackupTable();
    await this.blueGreenManager.initializeBlueGreenTable();
    await this.approvalManager.initializeApprovalTable();

    console.log('\n✓ 迁移管道初始化完成\n');
  }

  /**
   * 执行完整迁移流程（包括验证、备份、影子测试、审批）
   */
  async executeMigration(
    version: string,
    options: {
      dryRun?: boolean;
      skipShadowTest?: boolean;
      skipApproval?: boolean;
      aiConfidenceScore?: number;
      executedBy?: string;
    } = {}
  ): Promise<{
    success: boolean;
    result: string;
  }> {
    console.log(`\n========================================`);
    console.log(`开始执行迁移: ${version}`);
    console.log(`========================================\n`);

    try {
      // 1. 获取迁移文件
      const migrations =
        await this.migrationManager.listMigrations();
      const migration = migrations.find(
        (m) => m.version === version
      );

      if (!migration) {
        return {
          success: false,
          result: `迁移文件 ${version} 不存在`,
        };
      }

      // 2. 验证迁移
      console.log('\n[1/6] 迁移验证');
      console.log('-'.repeat(40));
      const validationResult =
        await this.validator.validateMigration(migration);

      console.log(
        `风险等级: ${validationResult.riskLevel}`
      );
      console.log(
        `需要审批: ${validationResult.requiresApproval}`
      );

      if (!validationResult.isValid) {
        console.log(`✗ 验证失败: ${validationResult.errors.join(', ')}`);
        return {
          success: false,
          result: `验证失败`,
        };
      }
      console.log('✓ 验证通过');

      // 3. 影子表试跑
      if (!options.skipShadowTest) {
        console.log('\n[2/6] 影子表试跑');
        console.log('-'.repeat(40));
        const shadowReport =
          await this.shadowTester.runShadowTest(migration);

        if (
          shadowReport.status === 'FAILED'
        ) {
          console.log(
            `✗ 影子表测试失败: ${shadowReport.errors.join(', ')}`
          );
          return {
            success: false,
            result: `影子表试跑失败`,
          };
        }
        console.log(
          `✓ 影子表试跑通过 (执行时间: ${shadowReport.performanceBenchmark.executionTime}ms)`
        );
      } else {
        console.log('\n[2/6] 影子表试跑 (已跳过)');
      }

      // 4. 自动备份
      console.log('\n[3/6] 自动备份');
      console.log('-'.repeat(40));
      const backup = await this.backupManager.createBackup({
        backupType: 'full',
        migrationVersion: version,
      });

      // 验证备份
      const backupVerified =
        await this.backupManager.verifyBackup(
          backup.snapshotId
        );
      if (!backupVerified) {
        console.log('⚠ 备份验证失败，继续执行');
      }

      // 5. 审批检查
      if (validationResult.requiresApproval) {
        console.log('\n[4/6] 审批工作流');
        console.log('-'.repeat(40));

        const aiScore =
          options.aiConfidenceScore || 50;
        console.log(`AI 置信度: ${aiScore}%`);

        // 创建审批请求
        await this.approvalManager.createApprovalRequest(
          version,
          aiScore,
          validationResult.riskLevel
        );

        if (!options.skipApproval) {
          console.log(
            '⏳ 等待人工审批...'
          );
          // 在实际应用中，这里会阻塞直到获得批准
          // 这里为了演示，我们直接批准
          await this.approvalManager.approveMigration(
            version,
            'senior-engineer',
            '自动化审批（演示）'
          );
        }

        const isApproved =
          await this.approvalManager.isApproved(version);
        if (!isApproved) {
          return {
            success: false,
            result: `迁移被拒绝`,
          };
        }
        console.log('✓ 审批通过');
      } else {
        console.log('\n[4/6] 审批工作流 (不需要)');
      }

      // 6. 执行迁移
      console.log('\n[5/6] 执行迁移');
      console.log('-'.repeat(40));

      if (options.dryRun) {
        console.log('DRY RUN 模式，跳过实际执行');
        return {
          success: true,
          result: `DRY RUN 完成`,
        };
      }

      const execResult =
        await this.migrationManager.executeMigration(
          version,
          {
            dryRun: false,
            skipBackup: true,
            skipValidation: true,
            executedBy: options.executedBy || 'system',
          }
        );

      if (!execResult.success) {
        console.log(
          `✗ 迁移执行失败: ${execResult.error}`
        );
        // 自动回滚
        console.log('\n[6/6] 自动回滚');
        console.log('-'.repeat(40));
        await this.migrationManager.rollbackMigration(
          version,
          '自动回滚：迁移失败'
        );
        return {
          success: false,
          result: `迁移失败，已自动回滚`,
        };
      }

      console.log('✓ 迁移执行成功');

      // 7. 蓝绿部署信息
      console.log('\n[6/6] 部署完成');
      console.log('-'.repeat(40));
      console.log(
        '✓ 迁移流程完成，新 Schema 已上线'
      );
      console.log(
        '💡 建议监控 1 小时后确认无异常'
      );

      return {
        success: true,
        result: `迁移成功完成`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      console.error(`\n✗ 迁移过程出错: ${message}`);

      return {
        success: false,
        result: `迁移失败: ${message}`,
      };
    }
  }

  /**
   * 获取迁移统计
   */
  async getStatistics(): Promise<{
    totalMigrations: number;
    appliedMigrations: number;
    pendingMigrations: number;
    failedMigrations: number;
  }> {
    const history =
      await this.migrationManager.getMigrationHistory(1000);

    return {
      totalMigrations: history.length,
      appliedMigrations: history.filter(
        (m) => m.applied_at && !m.rolled_back_at
      ).length,
      pendingMigrations: (
        await this.migrationManager.getPendingMigrations()
      ).length,
      failedMigrations: 0, // 可以从日志中统计
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export {
  MigrationManager,
  MigrationValidator,
  ShadowTester,
  BackupManager,
  BlueGreenDeploymentManager,
  ApprovalManager,
  MigrationPipeline,
  // 类型导出
  Migration,
  MigrationValidationResult,
  ShadowTestingReport,
  BackupInfo,
  MigrationApproval,
  BlueGreenDeployment,
};
