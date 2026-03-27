# 🐔 AIggs — AI-Native On-Chain Chicken Farm

> 首个 AI 原生链上养鸡农场游戏 | The First AI-Native On-Chain Chicken Farm Game

- **Chain**: Base
- **Token**: $AIGG
- **Website**: https://aiggs.xyz

## 📁 项目结构

```
AIGGS/
├── docs/                    # 白皮书 + SEO + 技术文档
│   ├── whitepaper-zh.md     # 中文白皮书
│   ├── whitepaper-en.md     # English Whitepaper
│   ├── seo-optimization-report.md
│   └── tech-docs-airdrop-invite.md
├── web/                     # 官网源码 (Vercel 部署)
│   ├── index.html           # 主页
│   ├── whitepaper.html      # 白皮书页面
│   ├── deck.html            # Pitch Deck
│   ├── 404.html             # 自定义 404 页面
│   └── vercel.json          # Vercel 路由配置
├── contracts/               # 链上合约设计
│   ├── token-contract.md    # $AIGG ERC-20 + 锁仓合约
│   └── liquidity-exchange-contracts.md  # 流动性 + 兑换桥
├── backend/                 # 后端核心服务
│   ├── database-schema.md   # PostgreSQL 6 张核心表
│   ├── backend-api.md       # Node.js + Express API
│   ├── steal-system.md      # 偷蛋系统 (概率引擎 + Redis 锁)
│   └── mcp-server.md        # MCP 协议服务器 (6 端点)
├── ai-agent/                # AI Agent 系统
│   ├── agent-framework.md   # 多 Agent 协作框架
│   ├── morning-report-system.md  # 每日早报系统
│   ├── skill-storage-404.md # Cowork Skill + 持久化
│   └── content-tracking-system.md  # 内容运营 + 注册追踪
├── data-evolution/          # 数据库演进安全框架
│   ├── event-sourcing.md    # 事件溯源层
│   ├── migration-pipeline.md # 迁移管道系统
│   ├── data-contract-governance.md  # 数据契约 + AI 治理
│   └── *.ts                 # TypeScript 实现代码
├── high-concurrency/        # 百万级高并发架构
│   ├── high-concurrency-data.md    # 分片调度 + 缓存 + 读写分离
│   ├── high-concurrency-service.md # 微服务 + 限流 + WebSocket
│   ├── concurrency-toolkit.ts      # 并发工具包
│   ├── capacity-planning.md        # 容量规划
│   └── performance-benchmark.md    # 性能基准测试
├── infrastructure/          # K8s 部署 + 监控
│   ├── k8s-deployment.yaml  # 5 微服务 + 中间件部署
│   ├── k8s-autoscaling.yaml # HPA/VPA/KEDA 自动扩缩容
│   ├── k8s-monitoring.yaml  # Prometheus + AlertManager
│   └── grafana-dashboard.json  # Grafana 18 面板仪表盘
├── .env.example             # 环境变量模板
└── package.json             # Node.js 依赖配置
```

## 🎮 核心玩法

- 母鸡每 8 小时自动产出 EGGS
- EGGS 在 Base 上兑换为 $AIGG 代币
- $AIGG 可兑换真实鸡蛋或公开市场交易
- 偷蛋机制增加博弈乐趣
- AI 原生交互 — 通过 Claude/GPT 等 MCP 协议工具直接操作

## 🏗️ 技术架构

- **后端**: Node.js + Express + TypeScript + Prisma + PostgreSQL
- **缓存**: Redis Cluster (多层缓存 L1/L2/L3)
- **消息**: RabbitMQ + BullMQ
- **实时**: Socket.IO + Redis Adapter (百万连接)
- **链上**: Solidity (Base) + Hardhat
- **部署**: K8s + HPA/VPA/KEDA + Prometheus + Grafana
- **AI**: MCP Server + Multi-Agent Framework

## 📄 License

All rights reserved © 2026 AIggs
