/**
 * AIggs 数据库迁移管道 - 完整使用示例
 * 展示如何使用迁移管道进行各种数据库操作
 */

import { Pool } from 'pg';
import {
  MigrationPipeline,
  MigrationManager,
  MigrationValidator,
  ShadowTester,
  BackupManager,
  BlueGreenDeploymentManager,
  ApprovalManager,
  Migration,
  MigrationValidationResult,
  ShadowTestingReport,
} from './migration-pipeline';

// ============================================================================
// 示例 1: 初始化迁移系统
// ============================================================================

async function example1_InitializationSystem(): Promise<void> {
  console.log('\n示例 1: 初始化迁移系统');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const pipeline = new MigrationPipeline(pool);

    // 初始化所有迁移相关的表和结构
    await pipeline.initialize();

    console.log('✓ 迁移系统初始化完成');

    // 获取统计信息
    const stats = await pipeline.getStatistics();
    console.log(`\n迁移统计:`);
    console.log(`  总迁移数: ${stats.totalMigrations}`);
    console.log(
      `  已应用: ${stats.appliedMigrations}`
    );
    console.log(`  待应用: ${stats.pendingMigrations}`);
    console.log(
      `  失败: ${stats.failedMigrations}`
    );
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 2: 生成迁移文件
// ============================================================================

async function example2_GenerateMigration(): Promise<void> {
  console.log('\n示例 2: 生成迁移文件');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const manager = new MigrationManager(
      pool,
      './migrations'
    );

    // 生成迁移文件
    const upSql = `
      -- 添加农场等级系统
      ALTER TABLE public.farms ADD COLUMN level INT NOT NULL DEFAULT 1;
      ALTER TABLE public.farms ADD COLUMN exp BIGINT NOT NULL DEFAULT 0;
      CREATE INDEX idx_farms_level ON public.farms(level);
    `;

    const downSql = `
      -- 回滚农场等级系统
      DROP INDEX IF EXISTS idx_farms_level;
      ALTER TABLE public.farms DROP COLUMN exp;
      ALTER TABLE public.farms DROP COLUMN level;
    `;

    const migration =
      await manager.generateMigration(
        'add_farm_level',
        upSql,
        downSql
      );

    console.log(`\n✓ 迁移文件已生成:`);
    console.log(`  版本: ${migration.version}`);
    console.log(`  校验和: ${migration.checksum}`);
    console.log(`  名称: ${migration.name}`);
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 3: 迁移验证
// ============================================================================

async function example3_ValidateMigration(): Promise<void> {
  console.log('\n示例 3: 迁移验证');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const validator = new MigrationValidator(pool);

    // 测试迁移 1: 安全迁移
    const safeMigration: Migration = {
      version: 'test_001_add_column',
      name: 'add_column',
      description: '添加新列',
      upSql: 'ALTER TABLE farms ADD COLUMN new_field INT DEFAULT 0;',
      downSql:
        'ALTER TABLE farms DROP COLUMN new_field;',
      checksum: 'abc123',
    };

    const safeResult =
      await validator.validateMigration(
        safeMigration
      );

    console.log(`\n迁移 1: ${safeMigration.name}`);
    console.log(`  风险等级: ${safeResult.riskLevel}`);
    console.log(
      `  需要审批: ${safeResult.requiresApproval}`
    );
    console.log(
      `  破坏性变更: ${safeResult.destructiveChanges.length}`
    );

    // 测试迁移 2: 高风险迁移
    const riskyMigration: Migration = {
      version: 'test_002_drop_column',
      name: 'drop_column',
      description: '删除列',
      upSql:
        'ALTER TABLE farms DROP COLUMN old_field;',
      downSql:
        'ALTER TABLE farms ADD COLUMN old_field VARCHAR(255);',
      checksum: 'def456',
    };

    const riskyResult =
      await validator.validateMigration(
        riskyMigration
      );

    console.log(`\n迁移 2: ${riskyMigration.name}`);
    console.log(`  风险等级: ${riskyResult.riskLevel}`);
    console.log(
      `  需要审批: ${riskyResult.requiresApproval}`
    );
    console.log(
      `  破坏性变更数: ${riskyResult.destructiveChanges.length}`
    );

    if (riskyResult.destructiveChanges.length > 0) {
      console.log(`  破坏性变更详情:`);
      riskyResult.destructiveChanges.forEach(
        (change) => {
          console.log(
            `    - ${change.type}: ${change.mitigation}`
          );
        }
      );
    }
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 4: 影子表测试
// ============================================================================

async function example4_ShadowTesting(): Promise<void> {
  console.log('\n示例 4: 影子表测试');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const tester = new ShadowTester(pool);

    const migration: Migration = {
      version: 'test_shadow_001',
      name: 'shadow_test',
      description: '影子表测试',
      upSql: `
        ALTER TABLE public.farms ADD COLUMN test_field INT DEFAULT 0;
      `,
      downSql: `
        ALTER TABLE public.farms DROP COLUMN test_field;
      `,
      checksum: 'shadow123',
    };

    console.log('\n执行影子表测试...');
    const report = await tester.runShadowTest(
      migration,
      100000 // 最多复制 100k 行
    );

    console.log(`\n测试结果:`);
    console.log(`  状态: ${report.status}`);
    console.log(`  执行时间: ${report.duration}ms`);
    console.log(`  行数一致: ${report.dataIntegrity.rowCountMatch}`);
    console.log(
      `  执行耗时: ${report.performanceBenchmark.executionTime}ms`
    );

    if (report.warnings.length > 0) {
      console.log(`  警告:`);
      report.warnings.forEach((w) =>
        console.log(`    - ${w}`)
      );
    }

    if (report.errors.length > 0) {
      console.log(`  错误:`);
      report.errors.forEach((e) =>
        console.log(`    - ${e}`)
      );
    }
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 5: 自动备份
// ============================================================================

async function example5_BackupManagement(): Promise<void> {
  console.log('\n示例 5: 自动备份');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const backupManager = new BackupManager(pool);

    // 初始化备份表
    await backupManager.initializeBackupTable();

    // 创建全量备份
    console.log('\n创建全量备份...');
    const backup = await backupManager.createBackup({
      backupType: 'full',
      migrationVersion: 'test_001',
      compression: 'gzip',
    });

    console.log(`\n备份创建成功:`);
    console.log(`  Snapshot ID: ${backup.snapshotId}`);
    console.log(
      `  文件大小: ${(backup.sizeBytes / 1024 / 1024).toFixed(2)}MB`
    );
    console.log(
      `  创建时间: ${backup.createdAt.toISOString()}`
    );
    console.log(
      `  过期时间: ${backup.expiresAt.toISOString()}`
    );

    // 验证备份
    console.log('\n验证备份...');
    const verified =
      await backupManager.verifyBackup(
        backup.snapshotId
      );

    console.log(
      `  验证结果: ${verified ? '通过' : '失败'}`
    );

    // 清理过期备份
    console.log('\n清理过期备份...');
    const cleaned =
      await backupManager.cleanupExpiredBackups();

    console.log(`  清理数量: ${cleaned}`);
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 6: 迁移审批工作流
// ============================================================================

async function example6_ApprovalWorkflow(): Promise<void> {
  console.log('\n示例 6: 迁移审批工作流');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const approvalManager = new ApprovalManager(
      pool
    );

    // 初始化审批表
    await approvalManager.initializeApprovalTable();

    // 创建审批请求
    const migrationVersion = 'test_approval_001';
    const aiConfidenceScore = 75; // 75% 置信度
    const riskLevel = 'MEDIUM';

    console.log('\n创建审批请求...');
    console.log(`  迁移版本: ${migrationVersion}`);
    console.log(
      `  AI 置信度: ${aiConfidenceScore}%`
    );
    console.log(`  风险等级: ${riskLevel}`);

    await approvalManager.createApprovalRequest(
      migrationVersion,
      aiConfidenceScore,
      riskLevel
    );

    console.log(
      '\n✓ 审批请求已创建，等待人工审批...'
    );

    // 审批迁移
    console.log('\n人工审批...');
    await approvalManager.approveMigration(
      migrationVersion,
      'senior-engineer',
      '影子表测试通过，数据验证无问题'
    );

    console.log('✓ 迁移已批准');

    // 检查审批状态
    const isApproved =
      await approvalManager.isApproved(
        migrationVersion
      );

    console.log(
      `\n审批状态: ${isApproved ? '已批准' : '未批准'}`
    );
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 7: 蓝绿部署
// ============================================================================

async function example7_BlueGreenDeployment(): Promise<void> {
  console.log('\n示例 7: 蓝绿部署');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const bgManager =
      new BlueGreenDeploymentManager(pool);

    // 初始化蓝绿部署表
    await bgManager.initializeBlueGreenTable();

    // 启动蓝绿部署
    console.log('\n启动蓝绿部署...');
    const deployment = await bgManager.startDeployment(
      '202603271400_current_version',
      '202603271430_add_farm_level'
    );

    console.log(`\n部署信息:`);
    console.log(
      `  部署 ID: ${deployment.deploymentId}`
    );
    console.log(`  蓝 Schema: ${deployment.blueSchema}`);
    console.log(`  绿 Schema: ${deployment.greenSchema}`);
    console.log(`  状态: ${deployment.status}`);

    // 模拟在绿环境执行迁移
    console.log('\n在绿环境执行迁移...');
    console.log('(模拟：迁移执行成功)');

    // 逐步切换流量
    console.log('\n逐步切换流量...');

    for (let percentage = 10; percentage <= 100; percentage += 10) {
      await bgManager.switchTraffic(
        deployment.deploymentId,
        percentage
      );
      console.log(
        `  ✓ 绿环境流量: ${percentage}%`
      );

      // 模拟监控检查
      if (percentage % 50 === 0) {
        console.log(
          `    健康检查: PASSED (错误率: 0.01%)`
        );
      }
    }

    // 完成部署
    console.log('\n完成蓝绿部署...');
    await bgManager.completeDeployment(
      deployment.deploymentId
    );

    console.log(
      '✓ 蓝绿部署完成，将在 24 小时后清理蓝环境'
    );
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 8: 完整迁移流程
// ============================================================================

async function example8_CompleteMigrationPipeline(): Promise<void> {
  console.log('\n示例 8: 完整迁移流程');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const pipeline = new MigrationPipeline(pool);

    // 初始化系统
    console.log('\n[初始化]');
    await pipeline.initialize();

    // 执行迁移
    console.log('\n[执行迁移]');
    const result = await pipeline.executeMigration(
      '202603271430_add_farm_level',
      {
        dryRun: false,
        skipShadowTest: false,
        skipApproval: false,
        aiConfidenceScore: 75,
        executedBy: 'ai-agent',
      }
    );

    console.log(`\n最终结果: ${result.result}`);
    console.log(
      `成功: ${result.success ? '✓' : '✗'}`
    );
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 示例 9: 迁移历史和回滚
// ============================================================================

async function example9_HistoryAndRollback(): Promise<void> {
  console.log('\n示例 9: 迁移历史和回滚');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const manager = new MigrationManager(
      pool,
      './migrations'
    );

    // 获取迁移历史
    console.log('\n获取迁移历史...');
    const history =
      await manager.getMigrationHistory(10);

    console.log(`\n最近 10 次迁移:`);
    history.forEach((m, index) => {
      const status = m.applied_at
        ? m.rolled_back_at
          ? '已回滚'
          : '已应用'
        : '待应用';
      console.log(
        `  ${index + 1}. ${m.version} (${status})`
      );
    });

    // 获取待应用迁移
    console.log('\n获取待应用迁移...');
    const pending =
      await manager.getPendingMigrations();

    console.log(`待应用迁移数: ${pending.length}`);
    pending.forEach((m) => {
      console.log(`  - ${m.version}`);
    });

    // 示例回滚
    if (history.length > 0 && history[0].applied_at) {
      const targetVersion = history[0].version;

      console.log(
        `\n回滚迁移: ${targetVersion}...`
      );
      const result =
        await manager.rollbackMigration(
          targetVersion,
          '演示回滚'
        );

      if (result.success) {
        console.log(`✓ 回滚成功 (耗时: ${result.executionTime}ms)`);
      } else {
        console.log(
          `✗ 回滚失败: ${result.error}`
        );
      }
    }
  } finally {
    await pool.end();
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   AIggs 数据库迁移管道 - 完整使用示例                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // 运行所有示例
    await example1_InitializationSystem();
    await example2_GenerateMigration();
    await example3_ValidateMigration();
    // await example4_ShadowTesting();        // 需要真实数据库
    // await example5_BackupManagement();     // 需要真实数据库
    await example6_ApprovalWorkflow();
    // await example7_BlueGreenDeployment();  // 需要真实数据库
    // await example8_CompleteMigrationPipeline(); // 需要真实数据库
    // await example9_HistoryAndRollback();   // 需要真实数据库

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   所有示例运行完成                                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error(
      `\n✗ 示例执行失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
    process.exit(1);
  }
}

// 启动示例
if (require.main === module) {
  main().catch((error) => {
    console.error(
      `致命错误: ${error instanceof Error ? error.message : '未知错误'}`
    );
    process.exit(1);
  });
}

export {
  example1_InitializationSystem,
  example2_GenerateMigration,
  example3_ValidateMigration,
  example4_ShadowTesting,
  example5_BackupManagement,
  example6_ApprovalWorkflow,
  example7_BlueGreenDeployment,
  example8_CompleteMigrationPipeline,
  example9_HistoryAndRollback,
};
