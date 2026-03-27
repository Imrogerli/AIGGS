/**
 * AIggs 迁移管道 CLI 工具
 * 提供命令行接口来管理数据库迁移
 *
 * 使用方式:
 * npx ts-node migration-cli.ts init
 * npx ts-node migration-cli.ts generate --name "add_farm_level"
 * npx ts-node migration-cli.ts execute 202603271430_add_farm_level
 * npx ts-node migration-cli.ts rollback 202603271430_add_farm_level
 * npx ts-node migration-cli.ts status
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import {
  MigrationPipeline,
  MigrationManager,
  BackupManager,
} from './migration-pipeline';

// ============================================================================
// CLI 工具类
// ============================================================================

class MigrationCLI {
  private pool: Pool;
  private pipeline: MigrationPipeline;

  constructor() {
    // 从环境变量初始化数据库连接
    const databaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://postgres:password@localhost:5432/aiggs';

    this.pool = new Pool({ connectionString: databaseUrl });
    this.pipeline = new MigrationPipeline(this.pool);
  }

  /**
   * 初始化迁移系统
   */
  async init(): Promise<void> {
    console.log('初始化 AIggs 迁移系统...');
    try {
      await this.pipeline.initialize();
      console.log('✓ 初始化完成');
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 生成迁移文件
   */
  async generate(
    name: string,
    upSql?: string,
    downSql?: string
  ): Promise<void> {
    if (!name) {
      console.error('错误: 需要指定迁移名称');
      return;
    }

    console.log(`生成迁移: ${name}`);

    // 如果没有提供 SQL，使用默认模板
    const defaultUpSql = upSql || `
-- UP: ${name}
-- TODO: 在这里编写 UP 迁移脚本

ALTER TABLE public.farms ADD COLUMN level INT DEFAULT 1;
`;

    const defaultDownSql = downSql || `
-- DOWN: ${name}
-- TODO: 在这里编写 DOWN 迁移脚本

ALTER TABLE public.farms DROP COLUMN level;
`;

    try {
      const manager = new MigrationManager(
        this.pool,
        './migrations'
      );
      const migration = await manager.generateMigration(
        name,
        defaultUpSql,
        defaultDownSql
      );

      console.log(`\n✓ 迁移文件已生成:`);
      console.log(`  版本: ${migration.version}`);
      console.log(
        `  校验和: ${migration.checksum.slice(0, 16)}...`
      );

      // 输出模板
      console.log(`\n编辑迁移文件:
  UP:   migrations/${migration.version}.up.sql
  DOWN: migrations/${migration.version}.down.sql
      `);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 执行迁移
   */
  async execute(
    version: string,
    options: {
      dryRun?: boolean;
      skipShadowTest?: boolean;
      skipApproval?: boolean;
      confidence?: number;
    } = {}
  ): Promise<void> {
    try {
      const result = await this.pipeline.executeMigration(
        version,
        {
          dryRun: options.dryRun || false,
          skipShadowTest:
            options.skipShadowTest || false,
          skipApproval:
            options.skipApproval || false,
          aiConfidenceScore: options.confidence || 75,
        }
      );

      console.log(`\n结果: ${result.result}`);
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error(
        `执行失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 回滚迁移
   */
  async rollback(
    version: string,
    options: { force?: boolean } = {}
  ): Promise<void> {
    try {
      const manager = new MigrationManager(
        this.pool,
        './migrations'
      );

      const reason = options.force
        ? '强制回滚'
        : '用户请求回滚';

      const result =
        await manager.rollbackMigration(
          version,
          reason,
          options.force || false
        );

      if (result.success) {
        console.log(
          `✓ 迁移 ${version} 回滚成功`
        );
      } else {
        console.log(
          `✗ 迁移 ${version} 回滚失败: ${result.error}`
        );
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error(
        `回滚失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 显示迁移状态
   */
  async status(): Promise<void> {
    try {
      const manager = new MigrationManager(
        this.pool,
        './migrations'
      );

      const applied =
        await manager.getAppliedMigrations();
      const pending = await manager.getPendingMigrations();
      const history =
        await manager.getMigrationHistory(10);

      console.log('\n========================================');
      console.log('迁移系统状态');
      console.log('========================================\n');

      console.log(`已应用迁移数: ${applied.length}`);
      console.log(`待应用迁移数: ${pending.length}\n`);

      if (applied.length > 0) {
        console.log('最近应用的迁移:');
        history
          .filter((m) => m.applied_at)
          .slice(0, 5)
          .forEach((m) => {
            console.log(
              `  ✓ ${m.version} (${m.applied_at})`
            );
          });
      }

      if (pending.length > 0) {
        console.log('\n待应用的迁移:');
        pending.slice(0, 5).forEach((m) => {
          console.log(`  ⏳ ${m.version}`);
        });
      }
    } catch (error) {
      console.error(
        `查询状态失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 显示迁移历史
   */
  async history(limit: number = 20): Promise<void> {
    try {
      const manager = new MigrationManager(
        this.pool,
        './migrations'
      );
      const history =
        await manager.getMigrationHistory(limit);

      console.log('\n========================================');
      console.log('迁移历史');
      console.log('========================================\n');

      console.log(
        'ID\tVersion\t\t\tRisk\tStatus\t\tTime'
      );
      console.log('-'.repeat(80));

      history.forEach((m) => {
        const status = m.applied_at
          ? m.rolled_back_at
            ? '已回滚'
            : '已应用'
          : '待应用';
        const time = m.execution_time_ms
          ? `${m.execution_time_ms}ms`
          : '-';

        console.log(
          `${m.id}\t${m.version}\t${m.risk_level}\t${status}\t${time}`
        );
      });
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 创建备份
   */
  async backup(): Promise<void> {
    try {
      const backupManager = new BackupManager(
        this.pool
      );

      await backupManager.initializeBackupTable();

      const result = await backupManager.createBackup(
        {
          backupType: 'full',
        }
      );

      console.log(`✓ 备份创建成功`);
      console.log(`  Snapshot ID: ${result.snapshotId}`);
      console.log(
        `  文件大小: ${(result.sizeBytes / 1024 / 1024).toFixed(2)}MB`
      );
      console.log(
        `  过期时间: ${result.expiresAt.toISOString()}`
      );
    } catch (error) {
      console.error(
        `备份失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 验证备份
   */
  async verifyBackup(
    snapshotId: string
  ): Promise<void> {
    try {
      const backupManager = new BackupManager(
        this.pool
      );

      const success =
        await backupManager.verifyBackup(snapshotId);

      if (success) {
        console.log(
          `✓ 备份 ${snapshotId} 验证成功`
        );
      } else {
        console.log(
          `✗ 备份 ${snapshotId} 验证失败`
        );
      }

      process.exit(success ? 0 : 1);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * 清理过期备份
   */
  async cleanupBackups(): Promise<void> {
    try {
      const backupManager = new BackupManager(
        this.pool
      );

      const count =
        await backupManager.cleanupExpiredBackups();

      console.log(`✓ 清理 ${count} 个过期备份`);
    } catch (error) {
      console.error(
        `清理失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printHelp();
    process.exit(0);
  }

  const cli = new MigrationCLI();

  try {
    switch (command) {
      case 'init':
        await cli.init();
        break;

      case 'generate':
        {
          const nameIndex = args.indexOf('--name');
          const name =
            nameIndex !== -1 ? args[nameIndex + 1] : null;

          if (!name) {
            console.error(
              '错误: 需要指定 --name 参数'
            );
            process.exit(1);
          }

          await cli.generate(name);
        }
        break;

      case 'execute':
        {
          const version = args[1];
          if (!version) {
            console.error(
              '错误: 需要指定迁移版本'
            );
            process.exit(1);
          }

          const options = {
            dryRun:
              args.indexOf('--dry-run') !== -1,
            skipShadowTest:
              args.indexOf('--skip-shadow-test') !==
              -1,
            skipApproval:
              args.indexOf('--skip-approval') !== -1,
          };

          await cli.execute(version, options);
        }
        break;

      case 'rollback':
        {
          const version = args[1];
          if (!version) {
            console.error(
              '错误: 需要指定迁移版本'
            );
            process.exit(1);
          }

          const options = {
            force: args.indexOf('--force') !== -1,
          };

          await cli.rollback(version, options);
        }
        break;

      case 'status':
        await cli.status();
        break;

      case 'history':
        {
          const limitIndex = args.indexOf(
            '--limit'
          );
          const limit =
            limitIndex !== -1
              ? parseInt(args[limitIndex + 1], 10)
              : 20;

          await cli.history(limit);
        }
        break;

      case 'backup':
        await cli.backup();
        break;

      case 'verify-backup':
        {
          const snapshotId = args[1];
          if (!snapshotId) {
            console.error(
              '错误: 需要指定 Snapshot ID'
            );
            process.exit(1);
          }

          await cli.verifyBackup(snapshotId);
        }
        break;

      case 'cleanup-backups':
        await cli.cleanupBackups();
        break;

      case 'help':
        printHelp();
        break;

      default:
        console.error(
          `未知命令: ${command}`
        );
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(
      `执行失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
    process.exit(1);
  }
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
  console.log(`
AIggs 迁移管道 CLI 工具

用法: npx ts-node migration-cli.ts <command> [options]

命令:
  init                 初始化迁移系统
  generate            生成新迁移
    --name <name>     迁移名称 (必需)

  execute            执行迁移
    <version>        迁移版本 (必需)
    --dry-run        干运行（仅验证）
    --skip-shadow-test 跳过影子表测试
    --skip-approval  跳过审批流程

  rollback           回滚迁移
    <version>        迁移版本 (必需)
    --force          强制回滚

  status             显示迁移系统状态
  history            显示迁移历史
    --limit <n>      显示最近 n 条记录 (默认 20)

  backup             创建数据库备份
  verify-backup      验证备份
    <snapshot_id>    备份 ID (必需)

  cleanup-backups    清理过期备份
  help               显示帮助信息

示例:
  # 初始化系统
  npx ts-node migration-cli.ts init

  # 生成新迁移
  npx ts-node migration-cli.ts generate --name "add_farm_level"

  # 执行迁移（带影子表测试）
  npx ts-node migration-cli.ts execute 202603271430_add_farm_level

  # 干运行测试
  npx ts-node migration-cli.ts execute 202603271430_add_farm_level --dry-run

  # 回滚迁移
  npx ts-node migration-cli.ts rollback 202603271430_add_farm_level

  # 查看状态
  npx ts-node migration-cli.ts status

  # 创建备份
  npx ts-node migration-cli.ts backup

环境变量:
  DATABASE_URL  数据库连接字符串 (默认: postgresql://localhost/aiggs)
`);
}

// 启动 CLI
if (require.main === module) {
  main().catch((error) => {
    console.error(
      `致命错误: ${error instanceof Error ? error.message : '未知错误'}`
    );
    process.exit(1);
  });
}

export { MigrationCLI };
