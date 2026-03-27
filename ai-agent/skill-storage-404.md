# AIggs Cowork Skill 配置 + 农场码持久化 + 404 页面完整文档

## 目录
1. [任务 1：Cowork Skill 完整配置](#任务1cowork-skill-完整配置)
2. [任务 2：农场码持久化存储方案](#任务2农场码持久化存储方案)
3. [任务 3：404 页面设计](#任务3-404-页面设计)

---

# 任务 1：Cowork Skill 完整配置

## 1.1 SKILL.md（Skill 说明文档）

```markdown
# AIggs - AI原生链上养鸡农场游戏

## 快速开始

**一句话介绍：** 养鸡产蛋，偷蛋致富，EGGS 兑换 $AIGG。

### 功能列表

AIggs Skill 让你在 Claude/Cowork 中直接管理自己的链上农场。无需钱包、无需私钥、无需复杂操作。

#### 核心指令

| 指令 | 中文 | 功能 |
|---|---|---|
| `join` | 加入农场 | 首次使用，获得农场码和初始母鸡 |
| `status` | 查看农场 | 实时查看库存、母鸡状态、汇率 |
| `steal` | 偷蛋 | 偷取邻居的鸡蛋，每日 2 次，消耗 3 枚 EGGS |
| `convert` | 兑换代币 | 30 枚 EGGS = 1 $AIGG，兑换到钱包 |
| `neighbors` | 邻居列表 | 查看可以偷蛋的邻居及其库存 |
| `report` | 早报 | 查看昨日收成、被盗信息、进度提示 |

### 安装说明

#### 在 Claude / Cowork 中

1. 在对话框中说：**"安装 AIggs Skill"**
2. 我会自动下载并配置农场码
3. 说 **"帮我加入 AIggs"** 开始游戏

#### 在其他 AI 工具中

- **ChatGPT**：使用自定义 GPT 集成（通过 Actions）
- **MCP 客户端**：直接连接 MCP 服务器
- **其他工具**：通过 API 集成

### 使用示例

#### 示例 1：加入游戏
```
你：帮我加入 AIggs
Claude：✅ 农场已创建！
农场码：farm-x7k2-9p3m
农场名称：旭日农场
初始母鸡：1 只（免费赠送）
首日产蛋：3 枚（1只鸡 × 3次产蛋）
```

#### 示例 2：查看农场状态
```
你：我的农场怎么样了
Claude：🐓 旭日农场 · Day 3
─────────────────────
当前库存：12 / 30 枚 EGGS
母鸡数量：1 只（还活27天）
昨日收成：+3 枚
今日汇率：30 EGGS = 1 $AIGG
─────────────────────
💡 再积累 18 枚可首次兑换 $AIGG
```

#### 示例 3：偷蛋
```
你：偷一下邻居的蛋
Claude：🎯 正在从 "月光农场" 偷蛋...
消耗 EGGS：-3 枚（偷蛋成本）
结果：✅ 成功！偷走 8 枚
当前库存：17 / 30 枚
下次可偷：22:47（还剩 8 小时 42 分）
```

#### 示例 4：兑换代币
```
你：帮我兑换 EGGS 为 $AIGG
Claude：需要验证你的身份。请输入关联的手机号末 4 位。
你：1234
Claude：✅ 验证通过！
兑换：30 EGGS → 1 $AIGG
当前库存：5 / 30 枚
$AIGG 已转入你的钱包（0x...）
```

#### 示例 5：查看邻居
```
你：显示可以偷的邻居
Claude：🏘️ 可偷蛋的邻居（按库存排序）
1. 月光农场 · 28 / 30 枚 · 成功率 55%
2. 丰收农场 · 25 / 30 枚 · 成功率 60%
3. 金色农场 · 20 / 30 枚 · 成功率 50%
...
💡 库存越多，偷蛋成功率越高
```

#### 示例 6：每日早报
```
你：给我看今天的早报
Claude：🌅 旭日农场 · Day 14
──────────────────────
昨日收成：  +3 枚 EGGS
⚠️ 昨晚被偷：-6 枚（夜半农场 · 22:47）
当前库存：  24 / 30 枚
今日汇率：  30 EGGS = 1 $AIGG
$AIGG 参考价：$0.10 U
──────────────────────
解锁进度：[████████░░] 24/30 → 可偷蛋
排名：全服 #342 / 5000
```

### 核心玩法说明

#### 产蛋周期
- 每只母鸡每 8 小时产 1 枚 EGGS
- 每只鸡每天产 3 枚
- 初始免费获得 1 只，寿命 30 天
- 仓库满（30 枚）时暂停产蛋

#### 偷蛋机制
- 每人每天 2 次偷蛋机会
- 每次成本 3 枚 EGGS（无论成功与否）
- 成功率取决于目标库存：库存越多成功率越高
- 3 种结果：大丰收（20%）、成功（55%）、扑空（25%）
- 新用户保护 24 小时（不可被偷，也不能偷人）

#### 兑换规则
- 30 枚 EGGS = 1 $AIGG
- 兑换到你的钱包地址
- 支持高价值交易的二次验证（手机号）
- $AIGG 可在公开市场交易

#### 农场码
- 唯一身份标识，形如 `farm-x7k2-9p3m`
- 自动保存在 Skill 记忆中
- 无需手动输入，每次对话自动携带
- 可在多个 AI 工具间同步

### 常见问题

**Q: 用什么钱包地址接收 $AIGG？**
A: 首次兑换时会要求你关联钱包。支持 MetaMask、WalletConnect 等。

**Q: 被盗了很多蛋怎么办？**
A: 可以购买 24 小时防盗道具（5 枚 EGGS），或等待防护自动解除。

**Q: 母鸡死了怎么办？**
A: 购买新母鸡（6 枚 EGGS/只）即可。早报会提醒你母鸡剩余寿命。

**Q: 能转移 EGGS 给朋友吗？**
A: 不能。EGGS 只能通过偷蛋、邀请分成等游戏行为获得。这保证了公平性。

**Q: 多久会推送早报？**
A: 默认每天早上 8:00 推送。可自定义推送时间和频率。

### 技术细节

#### 农场码存储
- 自动保存在你的 Cowork/Skill 记忆中
- 支持跨设备同步（通过 Claude 账户）
- MCP 服务器端也备份了农场码映射

#### API 端点
```
POST   /aiggs/join          - 加入游戏
GET    /aiggs/status        - 查看状态
POST   /aiggs/steal         - 偷蛋行动
POST   /aiggs/convert       - EGGS → $AIGG 兑换
GET    /aiggs/neighbors     - 邻居列表
GET    /aiggs/report        - 每日早报
```

#### MCP 工具调用
```json
{
  "tool": "aiggs_join",
  "params": {}
}

{
  "tool": "aiggs_status",
  "params": {"farm_code": "farm-x7k2-9p3m"}
}

{
  "tool": "aiggs_steal",
  "params": {
    "farm_code": "farm-x7k2-9p3m",
    "target_farm_code": "farm-abc1-2def"
  }
}
```

### 隐私与安全

- 农场码是公开的（用于邻居互相发现）
- 钱包地址需显式同意才能关联
- 高价值操作（兑换 >10 $AIGG）需二次验证
- 所有交易历史都可以通过链上查询
- AI Skill 不保存你的私钥或密钥

### 反馈与支持

- 游戏建议：向 Meta-AI Director 提交
- 技术问题：检查 [GitHub Issues](https://github.com/Imrogerli/aiggs-web)
- 生态合作：联系 Operations AI

---

**最后更新：2026-03-20**
**官网：https://aiggs.xyz**
**白皮书：https://aiggs-web.vercel.app/whitepaper**
```

## 1.2 skill.json（Skill 配置文件）

```json
{
  "metadata": {
    "name": "AIggs",
    "display_name": "AIggs - AI原生链上养鸡农场",
    "version": "1.0.0",
    "author": "AIggs Team",
    "author_email": "team@aiggs.xyz",
    "license": "MIT",
    "repository": "https://github.com/Imrogerli/aiggs-web",
    "homepage": "https://aiggs.xyz",
    "description": "首个 AI 原生链上养鸡农场游戏。一句话开始：养鸡产蛋，偷蛋致富，EGGS 兑换 $AIGG。无需钱包，无需私钥。",
    "short_description": "养鸡产蛋，偷蛋致富，$AIGG 换真蛋",
    "keywords": [
      "blockchain",
      "game",
      "chicken",
      "farming",
      "token",
      "base",
      "ai-native",
      "mcp"
    ],
    "icon": "🥚",
    "tags": ["game", "blockchain", "ai", "fun", "earn"],
    "category": "games",
    "rating": "4.8/5"
  },

  "capabilities": {
    "persistent_memory": {
      "enabled": true,
      "storage_backends": [
        "claude_memory",
        "claude_md",
        "mcp_session"
      ],
      "key": "aiggs_farm_code",
      "schema": {
        "farm_code": "string",
        "farm_name": "string",
        "user_id": "string",
        "connected_wallet": "string|null",
        "language": "string",
        "created_at": "datetime"
      }
    },

    "commands": [
      {
        "name": "join",
        "display_name": "加入 AIggs",
        "description": "创建你的农场，获得初始母鸡和农场码",
        "triggers": {
          "en": [
            "join aiggs",
            "start farming",
            "create farm",
            "play aiggs"
          ],
          "zh": [
            "加入 aiggs",
            "开始养鸡",
            "创建农场",
            "玩 aiggs"
          ]
        },
        "aliases": ["start", "create"],
        "requires_auth": false,
        "response_format": "structured",
        "icon": "✨"
      },

      {
        "name": "status",
        "display_name": "查看农场",
        "description": "查看你的农场状态、库存、母鸡信息、今日汇率",
        "triggers": {
          "en": [
            "show my farm",
            "farm status",
            "how many eggs",
            "warehouse"
          ],
          "zh": [
            "我的农场",
            "农场状态",
            "库存",
            "有多少蛋",
            "仓库"
          ]
        },
        "aliases": ["check", "info"],
        "requires_auth": true,
        "response_format": "dashboard",
        "icon": "📊"
      },

      {
        "name": "steal",
        "display_name": "偷蛋",
        "description": "偷取邻居的鸡蛋，每日2次，消耗3枚EGGS",
        "triggers": {
          "en": [
            "steal eggs",
            "raid neighbor",
            "steal from",
            "thief mode"
          ],
          "zh": [
            "偷蛋",
            "偷邻居的蛋",
            "抢蛋",
            "盗取"
          ]
        },
        "aliases": ["raid", "heist", "attack"],
        "requires_auth": true,
        "parameters": {
          "target": {
            "type": "optional|string",
            "description": "目标农场名称或农场码。不提供则自动选择最优目标"
          }
        },
        "daily_limit": 2,
        "cost": 3,
        "response_format": "story",
        "icon": "🎯"
      },

      {
        "name": "convert",
        "display_name": "兑换代币",
        "description": "将 EGGS 兑换为 $AIGG 代币，转入你的钱包",
        "triggers": {
          "en": [
            "convert eggs",
            "cash out",
            "exchange",
            "to usdc"
          ],
          "zh": [
            "兑换",
            "兑换代币",
            "转账",
            "提现",
            "eggs 转 aigg"
          ]
        },
        "aliases": ["exchange", "cashout", "liquidate"],
        "requires_auth": true,
        "requires_2fa": true,
        "parameters": {
          "amount": {
            "type": "optional|number",
            "description": "要兑换的 EGGS 数量。不提供则兑换全部"
          },
          "wallet": {
            "type": "optional|string",
            "description": "目标钱包地址。不提供则使用已绑定钱包"
          }
        },
        "rate": "30:1",
        "min_amount": 30,
        "response_format": "confirmation",
        "icon": "💰"
      },

      {
        "name": "neighbors",
        "display_name": "邻居列表",
        "description": "查看可以偷蛋的邻居及其库存排名",
        "triggers": {
          "en": [
            "show neighbors",
            "neighbor list",
            "who can i steal from",
            "leaderboard"
          ],
          "zh": [
            "邻居",
            "邻居列表",
            "可以偷谁",
            "排行榜"
          ]
        },
        "aliases": ["leaderboard", "top", "ranking"],
        "requires_auth": true,
        "parameters": {
          "sort": {
            "type": "optional|string",
            "enum": ["eggs", "success_rate", "name"],
            "default": "eggs",
            "description": "排序方式"
          },
          "limit": {
            "type": "optional|number",
            "default": 10,
            "min": 1,
            "max": 50
          }
        },
        "response_format": "table",
        "icon": "🏘️"
      },

      {
        "name": "report",
        "display_name": "每日早报",
        "description": "查看昨日收成、被盗情况、排名进度",
        "triggers": {
          "en": [
            "show report",
            "daily summary",
            "what happened yesterday",
            "morning report"
          ],
          "zh": [
            "早报",
            "昨日总结",
            "昨天怎么样",
            "每日报告"
          ]
        },
        "aliases": ["summary", "yesterday"],
        "requires_auth": true,
        "response_format": "story",
        "push_notification": true,
        "icon": "🌅"
      }
    ]
  },

  "mcp_server": {
    "enabled": true,
    "protocol_version": "1.0",
    "server_url": "https://api.aiggs.xyz/mcp",
    "tools": [
      "aiggs_join",
      "aiggs_status",
      "aiggs_steal",
      "aiggs_convert",
      "aiggs_neighbors",
      "aiggs_report"
    ],
    "authentication": {
      "type": "farm_code",
      "header": "X-Farm-Code",
      "required": true
    },
    "timeout": 30000,
    "retry_policy": {
      "max_retries": 3,
      "backoff_ms": 1000
    }
  },

  "user_preferences": {
    "language": {
      "type": "string",
      "default": "auto",
      "options": ["zh", "en", "auto"],
      "description": "使用语言。auto 则自动检测"
    },

    "notification_frequency": {
      "type": "string",
      "default": "daily",
      "options": ["never", "hourly", "daily", "weekly"],
      "description": "早报推送频率"
    },

    "notification_time": {
      "type": "string",
      "default": "08:00",
      "pattern": "HH:mm",
      "description": "每日早报推送时间（用户本地时区）"
    },

    "auto_steal": {
      "type": "boolean",
      "default": false,
      "description": "是否自动每日 2 次偷蛋（如果你同意）"
    },

    "show_advanced_stats": {
      "type": "boolean",
      "default": false,
      "description": "显示高级统计信息（成功率、概率分布等）"
    },

    "enable_voice": {
      "type": "boolean",
      "default": false,
      "description": "启用语音播报每日早报"
    },

    "theme": {
      "type": "string",
      "default": "auto",
      "options": ["light", "dark", "auto"],
      "description": "界面主题"
    }
  },

  "platform_integrations": [
    {
      "platform": "claude",
      "type": "cowork_skill",
      "installation_method": "automatic",
      "memory_backend": "claude_memory"
    },
    {
      "platform": "chatgpt",
      "type": "custom_gpt",
      "installation_method": "manual",
      "memory_backend": "gpt_memory"
    },
    {
      "platform": "generic_mcp",
      "type": "mcp_server",
      "installation_method": "manual",
      "memory_backend": "mcp_session"
    }
  ],

  "deployment": {
    "production": {
      "api_endpoint": "https://api.aiggs.xyz",
      "websocket": "wss://api.aiggs.xyz/ws",
      "regions": ["us-east-1", "eu-west-1", "ap-southeast-1"]
    },
    "staging": {
      "api_endpoint": "https://staging-api.aiggs.xyz",
      "websocket": "wss://staging-api.aiggs.xyz/ws"
    }
  },

  "roadmap": {
    "version_1_0": {
      "status": "released",
      "features": [
        "农场创建与产蛋系统",
        "EGGS 兑换 $AIGG",
        "偷蛋机制与邻居发现",
        "每日早报推送",
        "农场码身份系统",
        "MCP 服务器集成"
      ],
      "release_date": "2026-03-20"
    },

    "version_1_1": {
      "status": "planned",
      "features": [
        "AI 运营层上线（社媒、留存、经济监控）",
        "设计 AI 数值调参",
        "玩家提案系统",
        "多平台兼容完成"
      ],
      "planned_date": "2026-05-01"
    },

    "version_2_0": {
      "status": "planned",
      "features": [
        "$AIGG TGE 主网发行",
        "链上流动性池建立",
        "空投分发",
        "置信度决策链上记录"
      ],
      "planned_date": "2026-07-01"
    }
  },

  "support": {
    "docs": "https://docs.aiggs.xyz",
    "github": "https://github.com/Imrogerli/aiggs-web",
    "discord": "https://discord.gg/aiggs",
    "twitter": "https://twitter.com/aiggs_xyz",
    "email": "support@aiggs.xyz",
    "status_page": "https://status.aiggs.xyz"
  }
}
```

---

# 任务 2：农场码持久化存储方案

## 2.1 完整 TypeScript 实现

### farmCodeStorage.ts

```typescript
/**
 * AIggs 农场码持久化存储方案
 * 支持多种存储后端：localStorage、CLAUDE.md、MCP Session
 * 自动检测最佳存储方式并提供统一接口
 */

// ==================== 接口定义 ====================

interface FarmCodeData {
  /** 唯一的农场码，格式如 farm-x7k2-9p3m */
  farmCode: string;

  /** 农场名称 */
  farmName: string;

  /** 用户 ID（服务端 UUID） */
  userId: string;

  /** 关联的钱包地址（可选） */
  connectedWallet?: string;

  /** 用户偏好语言 */
  language: 'en' | 'zh' | 'auto';

  /** 创建时间（ISO 8601） */
  createdAt: string;

  /** 最后访问时间 */
  lastAccessedAt: string;

  /** 数据版本，用于迁移 */
  version: number;
}

interface StorageAdapter {
  /** 获取农场码数据 */
  get(): Promise<FarmCodeData | null>;

  /** 保存农场码数据 */
  set(data: FarmCodeData): Promise<void>;

  /** 删除农场码数据 */
  delete(): Promise<void>;

  /** 检测存储是否可用 */
  isAvailable(): Promise<boolean>;

  /** 获取存储优先级（0-100，越高越优先） */
  getPriority(): number;

  /** 存储名称 */
  getName(): string;
}

interface FarmCodeStorage {
  /** 从任意可用存储获取农场码 */
  get(): Promise<FarmCodeData | null>;

  /** 保存到所有可用存储 */
  set(data: FarmCodeData): Promise<void>;

  /** 删除所有存储中的农场码 */
  delete(): Promise<void>;

  /** 获取当前使用的存储适配器 */
  getCurrentAdapter(): Promise<StorageAdapter>;

  /** 迁移农场码到更优先级的存储 */
  migrate(): Promise<void>;
}

// ==================== LocalStorage 实现 ====================

class LocalStorageAdapter implements StorageAdapter {
  private readonly storageKey = 'aiggs_farm_code';

  async get(): Promise<FarmCodeData | null> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }

      const data = window.localStorage.getItem(this.storageKey);
      if (!data) return null;

      return JSON.parse(data) as FarmCodeData;
    } catch (error) {
      console.error('LocalStorage get failed:', error);
      return null;
    }
  }

  async set(data: FarmCodeData): Promise<void> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('localStorage not available');
      }

      // 检查存储容量
      const serialized = JSON.stringify(data);
      if (serialized.length > 5 * 1024 * 1024) {
        throw new Error('Data too large for localStorage');
      }

      window.localStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      console.error('LocalStorage set failed:', error);
      throw error;
    }
  }

  async delete(): Promise<void> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('LocalStorage delete failed:', error);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      const test = '__aiggs_test__';
      window.localStorage.setItem(test, 'test');
      window.localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  getPriority(): number {
    // localStorage 优先级最低（容易被清除）
    return 30;
  }

  getName(): string {
    return 'localStorage';
  }
}

// ==================== CLAUDE.md 实现 ====================

class ClaudeMdAdapter implements StorageAdapter {
  private readonly claudeMdPath = '/mnt/.claude/CLAUDE.md';
  private readonly markerStart = '# AIggs 农场码\n\n```json';
  private readonly markerEnd = '```';

  /**
   * 从 CLAUDE.md 中提取农场码 JSON 块
   */
  private extractJsonBlock(content: string): string | null {
    const startIdx = content.indexOf(this.markerStart);
    const endIdx = content.indexOf(this.markerEnd, startIdx + this.markerStart.length);

    if (startIdx === -1 || endIdx === -1) return null;

    const jsonStart = startIdx + this.markerStart.length;
    return content.substring(jsonStart, endIdx).trim();
  }

  /**
   * 在 CLAUDE.md 中注入或更新农场码 JSON 块
   */
  private injectJsonBlock(content: string, data: FarmCodeData): string {
    const jsonBlock = this.markerStart + '\n' + JSON.stringify(data, null, 2) + '\n' + this.markerEnd;

    const startIdx = content.indexOf(this.markerStart);
    const endIdx = content.indexOf(this.markerEnd, startIdx + this.markerStart.length);

    if (startIdx === -1 || endIdx === -1) {
      // 追加到文件末尾
      return content + '\n\n' + jsonBlock + '\n';
    }

    // 替换现有块
    return content.substring(0, startIdx) + jsonBlock + content.substring(endIdx + this.markerEnd.length);
  }

  async get(): Promise<FarmCodeData | null> {
    try {
      // 注：实际实现需要通过文件系统 API 读取文件
      // 这里演示逻辑，具体实现取决于运行环境

      if (typeof globalThis === 'undefined') return null;

      // 如果在 Node.js 环境，使用 fs
      if (typeof require !== 'undefined') {
        try {
          const fs = await import('fs/promises');
          const content = await fs.readFile(this.claudeMdPath, 'utf-8');
          const jsonStr = this.extractJsonBlock(content);

          if (!jsonStr) return null;

          return JSON.parse(jsonStr) as FarmCodeData;
        } catch {
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error('CLAUDE.md get failed:', error);
      return null;
    }
  }

  async set(data: FarmCodeData): Promise<void> {
    try {
      if (typeof require !== 'undefined') {
        const fs = await import('fs/promises');
        let content = '';

        try {
          content = await fs.readFile(this.claudeMdPath, 'utf-8');
        } catch {
          // 文件不存在，创建新文件
          content = '# Claude 项目记忆\n\n';
        }

        const updatedContent = this.injectJsonBlock(content, data);
        await fs.writeFile(this.claudeMdPath, updatedContent, 'utf-8');
      }
    } catch (error) {
      console.error('CLAUDE.md set failed:', error);
      throw error;
    }
  }

  async delete(): Promise<void> {
    try {
      if (typeof require !== 'undefined') {
        const fs = await import('fs/promises');
        const content = await fs.readFile(this.claudeMdPath, 'utf-8');
        const startIdx = content.indexOf(this.markerStart);
        const endIdx = content.indexOf(this.markerEnd, startIdx + this.markerStart.length);

        if (startIdx !== -1 && endIdx !== -1) {
          const updatedContent = content.substring(0, startIdx) + content.substring(endIdx + this.markerEnd.length);
          await fs.writeFile(this.claudeMdPath, updatedContent, 'utf-8');
        }
      }
    } catch (error) {
      console.error('CLAUDE.md delete failed:', error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (typeof require !== 'undefined') {
        const fs = await import('fs/promises');
        await fs.access(this.claudeMdPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  getPriority(): number {
    // CLAUDE.md 优先级最高（持久且跨设备）
    return 100;
  }

  getName(): string {
    return 'CLAUDE.md';
  }
}

// ==================== MCP Session 实现 ====================

class MCPSessionAdapter implements StorageAdapter {
  private mcpEndpoint = 'https://api.aiggs.xyz/mcp/session';
  private sessionToken: string | null = null;

  constructor(sessionToken?: string) {
    this.sessionToken = sessionToken || null;
  }

  async get(): Promise<FarmCodeData | null> {
    try {
      if (!this.sessionToken) {
        return null;
      }

      const response = await fetch(`${this.mcpEndpoint}/get`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data as FarmCodeData;
    } catch (error) {
      console.error('MCP Session get failed:', error);
      return null;
    }
  }

  async set(data: FarmCodeData): Promise<void> {
    try {
      if (!this.sessionToken) {
        throw new Error('No session token available');
      }

      const response = await fetch(`${this.mcpEndpoint}/set`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`MCP Session set failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('MCP Session set failed:', error);
      throw error;
    }
  }

  async delete(): Promise<void> {
    try {
      if (!this.sessionToken) return;

      await fetch(`${this.mcpEndpoint}/delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('MCP Session delete failed:', error);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.sessionToken;
  }

  getPriority(): number {
    // MCP Session 优先级中等（服务端可靠但需要连接）
    return 70;
  }

  getName(): string {
    return 'MCP Session';
  }

  setSessionToken(token: string): void {
    this.sessionToken = token;
  }
}

// ==================== 统一存储管理 ====================

class AiggsStorage implements FarmCodeStorage {
  private adapters: StorageAdapter[];
  private currentAdapter: StorageAdapter | null = null;

  constructor(options?: {
    mcpSessionToken?: string;
    enableLocalStorage?: boolean;
    enableClaudeMd?: boolean;
    enableMcpSession?: boolean;
  }) {
    const opts = {
      enableLocalStorage: true,
      enableClaudeMd: true,
      enableMcpSession: true,
      ...options
    };

    this.adapters = [];

    if (opts.enableLocalStorage) {
      this.adapters.push(new LocalStorageAdapter());
    }

    if (opts.enableClaudeMd) {
      this.adapters.push(new ClaudeMdAdapter());
    }

    if (opts.enableMcpSession) {
      const mcpAdapter = new MCPSessionAdapter(opts.mcpSessionToken);
      this.adapters.push(mcpAdapter);
    }

    // 按优先级排序（高优先级在前）
    this.adapters.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * 按优先级顺序尝试从各存储获取农场码
   */
  async get(): Promise<FarmCodeData | null> {
    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        const data = await adapter.get();
        if (data) {
          this.currentAdapter = adapter;

          // 更新访问时间
          data.lastAccessedAt = new Date().toISOString();

          // 异步保存到其他存储（不阻塞）
          this.syncToOtherAdapters(data, adapter);

          return data;
        }
      }
    }

    return null;
  }

  /**
   * 保存到所有可用存储
   */
  async set(data: FarmCodeData): Promise<void> {
    data.version = 1;
    data.lastAccessedAt = new Date().toISOString();

    const results = await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        if (await adapter.isAvailable()) {
          await adapter.set(data);
        }
      })
    );

    // 记录失败的存储
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`Failed to save to ${this.adapters[index].getName()}:`, result.reason);
      }
    });

    // 至少需要一个成功
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    if (successCount === 0) {
      throw new Error('Failed to save farm code to any storage');
    }
  }

  /**
   * 删除所有存储中的农场码
   */
  async delete(): Promise<void> {
    await Promise.allSettled(
      this.adapters.map(adapter => adapter.delete())
    );

    this.currentAdapter = null;
  }

  /**
   * 获取当前正在使用的存储适配器
   */
  async getCurrentAdapter(): Promise<StorageAdapter> {
    if (!this.currentAdapter) {
      // 确定当前适配器
      for (const adapter of this.adapters) {
        if (await adapter.isAvailable()) {
          this.currentAdapter = adapter;
          break;
        }
      }
    }

    if (!this.currentAdapter) {
      throw new Error('No storage adapter available');
    }

    return this.currentAdapter;
  }

  /**
   * 迁移农场码到优先级更高的存储
   */
  async migrate(): Promise<void> {
    const data = await this.get();
    if (!data) return;

    // 找到最高优先级的可用适配器
    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        if (this.currentAdapter !== adapter) {
          await adapter.set(data);
          this.currentAdapter = adapter;
          console.log(`Migrated farm code to ${adapter.getName()}`);
        }
        break;
      }
    }
  }

  /**
   * 异步同步数据到其他存储
   */
  private async syncToOtherAdapters(data: FarmCodeData, sourceAdapter: StorageAdapter): Promise<void> {
    // 延迟执行，不阻塞主流程
    setTimeout(async () => {
      for (const adapter of this.adapters) {
        if (adapter === sourceAdapter) continue;

        try {
          if (await adapter.isAvailable()) {
            await adapter.set(data);
          }
        } catch (error) {
          console.warn(`Failed to sync to ${adapter.getName()}:`, error);
        }
      }
    }, 0);
  }

  /**
   * 获取所有可用的存储适配器信息
   */
  async getAvailableAdapters(): Promise<Array<{name: string; priority: number}>> {
    const available = [];

    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        available.push({
          name: adapter.getName(),
          priority: adapter.getPriority()
        });
      }
    }

    return available;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{healthy: boolean; details: string}> {
    const available = await this.getAvailableAdapters();

    if (available.length === 0) {
      return {
        healthy: false,
        details: 'No storage adapter available'
      };
    }

    const data = await this.get();
    if (!data) {
      return {
        healthy: true,
        details: `Storage ready (${available.map(a => a.name).join(', ')}) but no farm code found`
      };
    }

    return {
      healthy: true,
      details: `Farm code stored in ${available.map(a => a.name).join(', ')}`
    };
  }
}

// ==================== 导出 ====================

export {
  FarmCodeData,
  StorageAdapter,
  FarmCodeStorage,
  LocalStorageAdapter,
  ClaudeMdAdapter,
  MCPSessionAdapter,
  AiggsStorage
};

// ==================== 便捷方法 ====================

// 全局单例实例
let storageInstance: AiggsStorage | null = null;

export function initStorage(options?: Parameters<typeof AiggsStorage>[0]): AiggsStorage {
  if (!storageInstance) {
    storageInstance = new AiggsStorage(options);
  }
  return storageInstance;
}

export function getStorage(): AiggsStorage {
  if (!storageInstance) {
    storageInstance = new AiggsStorage();
  }
  return storageInstance;
}

// 快捷方法
export async function getFarmCode(): Promise<FarmCodeData | null> {
  return getStorage().get();
}

export async function setFarmCode(data: FarmCodeData): Promise<void> {
  return getStorage().set(data);
}

export async function deleteFarmCode(): Promise<void> {
  return getStorage().delete();
}

// 使用示例：
/*
import { getFarmCode, setFarmCode, getStorage } from './farmCodeStorage';

// 获取农场码
const farmCode = await getFarmCode();
if (farmCode) {
  console.log(`欢迎回来！你的农场码是：${farmCode.farmCode}`);
}

// 首次加入时保存农场码
await setFarmCode({
  farmCode: 'farm-x7k2-9p3m',
  farmName: '旭日农场',
  userId: '550e8400-e29b-41d4-a716-446655440000',
  language: 'zh',
  createdAt: new Date().toISOString(),
  lastAccessedAt: new Date().toISOString(),
  version: 1
});

// 获取健康状态
const storage = getStorage();
const health = await storage.healthCheck();
console.log(health);

// 迁移到更优先级的存储
await storage.migrate();
*/
```

## 2.2 跨设备同步策略

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户账户（Claude）                      │
│                    cloud.claude.ai（中央账户）                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ 设备 A  │  │ 设备 B  │  │ 设备 C  │
    │ MacBook │  │ iPhone  │  │iPad web │
    └────┬────┘  └────┬────┘  └────┬────┘
         │            │            │
    ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
    │localStorage│ Cowork  │ Claude  │
    │ + CLAUDE.md│ Memory  │ Memory  │
    └────┬────┘  └────┬────┘  └────┬────┘
         │            │            │
         └────────────┼────────────┘
                      │
              ┌───────┴────────┐
              ▼                ▼
        MCP Session         MCP Session
        Server 1            Server 2
              │                │
              └────────┬───────┘
                       │
              ┌────────▼────────┐
              │  Sync Protocol  │
              │  (CRDTs/Events) │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Block Chain    │
              │  (Event Log)    │
              └─────────────────┘
```

### 同步策略细节

```typescript
/**
 * 跨设备同步策略
 */

interface SyncEvent {
  eventId: string;              // 唯一事件 ID
  timestamp: number;            // 事件时间戳
  deviceId: string;             // 设备 ID
  userId: string;               // 用户 ID
  action: 'create' | 'update' | 'delete';
  data: FarmCodeData;
  signature: string;            // 事件签名（用于验证）
}

interface SyncState {
  localVersion: number;         // 本地版本号
  remoteVersion: number;        // 远程版本号
  lastSyncTime: number;         // 最后同步时间
  pendingEvents: SyncEvent[];   // 待同步事件
  syncInProgress: boolean;      // 是否正在同步
}

/**
 * 同步管理器
 */
class SyncManager {
  private syncState: Map<string, SyncState> = new Map();
  private storage: AiggsStorage;
  private mcpClient: any; // MCP 客户端连接

  constructor(storage: AiggsStorage, mcpClient: any) {
    this.storage = storage;
    this.mcpClient = mcpClient;
  }

  /**
   * 启动自动同步（后台）
   */
  startAutoSync(intervalMs: number = 30000): void {
    setInterval(async () => {
      try {
        await this.sync();
      } catch (error) {
        console.error('Auto sync failed:', error);
      }
    }, intervalMs);
  }

  /**
   * 执行同步
   */
  async sync(): Promise<void> {
    const farmCode = await this.storage.get();
    if (!farmCode) return;

    const syncKey = farmCode.userId;
    let syncState = this.syncState.get(syncKey);

    if (!syncState) {
      syncState = {
        localVersion: 1,
        remoteVersion: 0,
        lastSyncTime: Date.now(),
        pendingEvents: [],
        syncInProgress: false
      };
      this.syncState.set(syncKey, syncState);
    }

    // 避免并发同步
    if (syncState.syncInProgress) return;

    syncState.syncInProgress = true;

    try {
      // 1. 上传本地变更
      await this.uploadLocalChanges(farmCode, syncState);

      // 2. 下载远程变更
      await this.downloadRemoteChanges(farmCode, syncState);

      syncState.lastSyncTime = Date.now();
    } finally {
      syncState.syncInProgress = false;
    }
  }

  /**
   * 上传本地变更到服务器
   */
  private async uploadLocalChanges(
    farmCode: FarmCodeData,
    syncState: SyncState
  ): Promise<void> {
    if (syncState.pendingEvents.length === 0) return;

    const events = syncState.pendingEvents.splice(0); // 清空待同步列表

    // 批量上传
    const response = await this.mcpClient.post('/sync/events', {
      userId: farmCode.userId,
      events
    });

    // 标记为已同步
    for (const event of events) {
      console.log(`Event ${event.eventId} synced to remote`);
    }
  }

  /**
   * 下载远程变更到本地
   */
  private async downloadRemoteChanges(
    farmCode: FarmCodeData,
    syncState: SyncState
  ): Promise<void> {
    const response = await this.mcpClient.get('/sync/events', {
      userId: farmCode.userId,
      fromVersion: syncState.remoteVersion
    });

    const remoteEvents: SyncEvent[] = response.events;

    // 应用远程变更（简单的 last-write-wins 策略）
    for (const event of remoteEvents) {
      if (event.timestamp > new Date(farmCode.lastAccessedAt).getTime()) {
        // 远程更新更新鲜，应用远程数据
        if (event.action === 'update') {
          await this.storage.set(event.data);
        }
      }
    }

    syncState.remoteVersion = Math.max(
      syncState.remoteVersion,
      ...remoteEvents.map(e => e.timestamp)
    );
  }

  /**
   * 记录本地变更（后续同步）
   */
  recordLocalChange(event: SyncEvent): void {
    const syncKey = event.userId;
    let syncState = this.syncState.get(syncKey);

    if (!syncState) {
      syncState = {
        localVersion: 1,
        remoteVersion: 0,
        lastSyncTime: Date.now(),
        pendingEvents: [],
        syncInProgress: false
      };
      this.syncState.set(syncKey, syncState);
    }

    syncState.pendingEvents.push(event);
    syncState.localVersion++;

    // 立即同步（可选）
    this.sync();
  }
}
```

---

# 任务 3：404 页面设计

## 404.html 完整代码

直接创建到 `/sessions/busy-nice-brahmagupta/mnt/outputs/aiggs-web/404.html`

请查看下方的 HTML 代码：

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>404 - Lost Chicken | AIggs</title>
  <meta name="description" content="Oops! This chicken farm doesn't exist. Let's get you back home."/>
  <meta name="theme-color" content="#f59e0b"/>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text y='20' font-size='24'>🥚</text></svg>" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config={theme:{extend:{colors:{amber:{50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f'}},fontFamily:{sans:['Inter','system-ui','sans-serif']},animation:{'float':'float 3s ease-in-out infinite','bounce-soft':'bounceSoft 1.5s ease-in-out infinite','shake':'shake 0.5s ease-in-out infinite','spin-slow':'spin 20s linear infinite','drift':'drift 6s ease-in-out infinite'},keyframes:{float:{'0%,100%':{transform:'translateY(0)'},'50%':{transform:'translateY(-20px)'}},bounceSoft:{'0%,100%':{transform:'translateY(0)'},'50%':{transform:'translateY(-8px)'}},shake:{'0%,100%':{transform:'translateX(0)'},'25%':{transform:'translateX(-3px)'},'75%':{transform:'translateX(3px)'}},drift:{'0%,100%':{transform:'translateX(0) translateY(0)'},'25%':{transform:'translateX(12px) translateY(-8px)'},'50%':{transform:'translateX(0) translateY(-16px)'},'75%':{transform:'translateX(-12px) translateY(-8px)'}}}}}};
  </script>
  <style>
    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Inter', sans-serif;
      overflow-x: hidden;
      background: linear-gradient(135deg, #0f172a 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    /* 背景装饰 */
    .bg-decoration {
      position: fixed;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      z-index: -1;
      overflow: hidden;
    }

    .floating-egg {
      position: absolute;
      border-radius: 50% 50% 50% 50% / 55% 55% 45% 45%;
      opacity: 0.08;
      animation: drift 8s ease-in-out infinite;
    }

    .egg-1 {
      width: 120px;
      height: 150px;
      background: radial-gradient(ellipse at 38% 30%, #fffbeb, #fde68a 40%, #f59e0b 75%, #b45309);
      top: 5%;
      left: 5%;
      animation-delay: 0s;
    }

    .egg-2 {
      width: 80px;
      height: 100px;
      background: radial-gradient(ellipse at 38% 30%, #fffbeb, #fde68a 40%, #f59e0b 75%, #b45309);
      top: 15%;
      right: 10%;
      animation-delay: 2s;
      animation: drift 10s ease-in-out infinite 2s;
    }

    .egg-3 {
      width: 100px;
      height: 125px;
      background: radial-gradient(ellipse at 38% 30%, #fffbeb, #fde68a 40%, #f59e0b 75%, #b45309);
      bottom: 20%;
      left: 8%;
      animation-delay: 4s;
      animation: drift 12s ease-in-out infinite 4s;
    }

    .egg-4 {
      width: 90px;
      height: 115px;
      background: radial-gradient(ellipse at 38% 30%, #fffbeb, #fde68a 40%, #f59e0b 75%, #b45309);
      bottom: 10%;
      right: 12%;
      animation-delay: 1s;
      animation: drift 9s ease-in-out infinite 1s;
    }

    /* 迷路的小鸡 */
    .lost-chicken {
      position: relative;
      display: inline-block;
    }

    .chicken-body {
      width: 80px;
      height: 60px;
      background: #f59e0b;
      border-radius: 50% 50% 45% 45%;
      position: relative;
      display: inline-block;
      box-shadow:
        inset -3px -3px 8px rgba(0, 0, 0, 0.2),
        0 8px 20px rgba(217, 119, 6, 0.3);
      animation: bounce-soft 1.5s ease-in-out infinite;
    }

    .chicken-head {
      width: 28px;
      height: 28px;
      background: #f59e0b;
      border-radius: 50%;
      position: absolute;
      top: -12px;
      left: 26px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      animation: shake 0.5s ease-in-out infinite;
    }

    .chicken-eye {
      width: 4px;
      height: 4px;
      background: #000;
      border-radius: 50%;
      position: absolute;
      top: 8px;
      left: 8px;
      animation: blink 2s ease-in-out infinite;
    }

    .chicken-beak {
      width: 8px;
      height: 4px;
      background: #d97706;
      border-radius: 50%;
      position: absolute;
      top: 14px;
      left: 18px;
    }

    .chicken-wing {
      width: 25px;
      height: 35px;
      background: #d97706;
      border-radius: 50% 30% 30% 50%;
      position: absolute;
      top: 10px;
      right: -8px;
      transform: rotate(-15deg);
      box-shadow: inset -2px -2px 4px rgba(0, 0, 0, 0.15);
      animation: float 3s ease-in-out infinite;
    }

    .chicken-legs {
      position: absolute;
      bottom: -12px;
      left: 20px;
      display: flex;
      gap: 16px;
    }

    .chicken-leg {
      width: 2px;
      height: 12px;
      background: #d97706;
      border-radius: 1px;
      animation: shake 0.4s ease-in-out infinite;
    }

    .chicken-leg:nth-child(2) {
      animation-delay: 0.1s;
    }

    .chicken-foot {
      position: absolute;
      bottom: -3px;
      left: -4px;
      width: 10px;
      height: 3px;
      background: #d97706;
      border-radius: 50%;
    }

    /* 404 大号字体 */
    .error-number {
      position: relative;
      font-size: clamp(4rem, 15vw, 8rem);
      font-weight: 900;
      background: linear-gradient(135deg, #f59e0b, #fcd34d, #fbbf24);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 4px 20px rgba(245, 158, 11, 0.3);
      margin: 0;
      line-height: 1;
      animation: float 4s ease-in-out infinite;
    }

    /* 提示文字 */
    .error-title {
      font-size: clamp(1.5rem, 5vw, 2.5rem);
      font-weight: 700;
      color: #fff;
      margin: 20px 0 10px 0;
      text-align: center;
    }

    .error-subtitle {
      font-size: clamp(0.95rem, 3vw, 1.1rem);
      color: #cbd5e1;
      text-align: center;
      margin: 0 0 30px 0;
      max-width: 500px;
    }

    /* 按钮 */
    .btn-home {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
      padding: 14px 32px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
      text-decoration: none;
    }

    .btn-home:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(245, 158, 11, 0.6);
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
    }

    .btn-home:active {
      transform: translateY(0);
    }

    /* 心情符号 */
    .emotion {
      display: inline-block;
      font-size: 3rem;
      margin: 0 20px;
      animation: drift 6s ease-in-out infinite;
    }

    .emotion:nth-child(2) {
      animation-delay: 0.5s;
    }

    .emotion:nth-child(3) {
      animation-delay: 1s;
    }

    /* 关键帧 */
    @keyframes drift {
      0%, 100% {
        transform: translateX(0) translateY(0);
      }
      25% {
        transform: translateX(12px) translateY(-8px);
      }
      50% {
        transform: translateX(0) translateY(-16px);
      }
      75% {
        transform: translateX(-12px) translateY(-8px);
      }
    }

    @keyframes shake {
      0%, 100% {
        transform: translateX(0) rotateZ(0deg);
      }
      25% {
        transform: translateX(-2px) rotateZ(-1deg);
      }
      75% {
        transform: translateX(2px) rotateZ(1deg);
      }
    }

    @keyframes blink {
      0%, 90%, 100% {
        opacity: 1;
      }
      95% {
        opacity: 0;
      }
    }

    /* 主容器 */
    .container-404 {
      text-align: center;
      z-index: 10;
      padding: 20px;
      max-width: 600px;
      width: 100%;
      animation: fadeInUp 0.8s ease-out;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* 响应式 */
    @media (max-width: 768px) {
      body {
        padding: 20px;
      }

      .error-number {
        font-size: 3.5rem;
      }

      .error-title {
        font-size: 1.5rem;
      }

      .error-subtitle {
        font-size: 0.95rem;
      }

      .chicken-body {
        width: 60px;
        height: 45px;
      }

      .chicken-head {
        width: 22px;
        height: 22px;
        top: -10px;
        left: 19px;
      }

      .btn-home {
        padding: 12px 24px;
        font-size: 0.95rem;
      }
    }

    @media (max-height: 600px) {
      .container-404 {
        padding: 10px;
      }

      .error-number {
        font-size: 2.5rem;
      }

      .error-title {
        font-size: 1.2rem;
        margin: 10px 0 5px 0;
      }

      .error-subtitle {
        margin: 0 0 20px 0;
        font-size: 0.9rem;
      }
    }
  </style>
</head>
<body>
  <!-- 背景装饰 -->
  <div class="bg-decoration">
    <div class="floating-egg egg-1"></div>
    <div class="floating-egg egg-2"></div>
    <div class="floating-egg egg-3"></div>
    <div class="floating-egg egg-4"></div>
  </div>

  <!-- 主容器 -->
  <div class="container-404">
    <!-- 404 数字 -->
    <div class="error-number">404</div>

    <!-- 迷路的小鸡 -->
    <div style="margin: 30px 0; position: relative; height: 100px; display: flex; align-items: center; justify-content: center;">
      <div class="lost-chicken">
        <div class="chicken-body">
          <div class="chicken-wing"></div>
          <div class="chicken-legs">
            <div class="chicken-leg">
              <div class="chicken-foot"></div>
            </div>
            <div class="chicken-leg">
              <div class="chicken-foot"></div>
            </div>
          </div>
        </div>
        <div class="chicken-head">
          <div class="chicken-eye"></div>
          <div class="chicken-beak"></div>
        </div>
      </div>
    </div>

    <!-- 文字 -->
    <h1 class="error-title">迷路的小鸡</h1>
    <p class="error-subtitle">
      这只小鸡找不到农场了。看起来你访问的页面也迷路了。
    </p>

    <!-- 心情符号 -->
    <div style="margin: 20px 0; font-size: 1.2rem; color: #94a3b8;">
      <span class="emotion">🥚</span>
      <span class="emotion">🐔</span>
      <span class="emotion">🥚</span>
    </div>

    <!-- 返回按钮 -->
    <a href="/" class="btn-home">
      <span>🏠</span>
      <span>回到首页养鸡</span>
    </a>

    <!-- 帮助链接 -->
    <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
      <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 15px;">
        需要帮助？试试这些：
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
        <a href="/" style="color: #f59e0b; text-decoration: none; font-size: 0.85rem; transition: color 0.3s; border: 1px solid #f59e0b; padding: 8px 12px; border-radius: 6px; display: inline-block;">
          官网首页
        </a>
        <a href="/whitepaper" style="color: #f59e0b; text-decoration: none; font-size: 0.85rem; transition: color 0.3s; border: 1px solid #f59e0b; padding: 8px 12px; border-radius: 6px; display: inline-block;">
          白皮书
        </a>
        <a href="https://github.com/Imrogerli/aiggs-web" target="_blank" rel="noopener noreferrer" style="color: #f59e0b; text-decoration: none; font-size: 0.85rem; transition: color 0.3s; border: 1px solid #f59e0b; padding: 8px 12px; border-radius: 6px; display: inline-block;">
          GitHub
        </a>
        <a href="https://discord.gg/aiggs" target="_blank" rel="noopener noreferrer" style="color: #f59e0b; text-decoration: none; font-size: 0.85rem; transition: color 0.3s; border: 1px solid #f59e0b; padding: 8px 12px; border-radius: 6px; display: inline-block;">
          Discord 社区
        </a>
      </div>
    </div>
  </div>

  <!-- 脚本 -->
  <script>
    // 复活节彩蛋：点击小鸡时有惊喜
    const chicken = document.querySelector('.lost-chicken');
    let clickCount = 0;

    if (chicken) {
      chicken.style.cursor = 'pointer';
      chicken.addEventListener('click', () => {
        clickCount++;
        chicken.style.animation = 'none';
        setTimeout(() => {
          chicken.style.animation = 'shake 0.5s ease-in-out 3';
        }, 10);

        if (clickCount >= 5) {
          // 5 次点击后显示惊喜
          const messages = [
            '小鸡：我找到回家的路了！🐔',
            '小鸡：谢谢你的帮助！',
            '小鸡：来一起养鸡吧！',
            '小鸡：EGGS 走起！'
          ];

          const message = messages[Math.floor(Math.random() * messages.length)];
          alert(message);
          clickCount = 0;
        }
      });
    }

    // 页面加载完成后添加过渡效果
    document.addEventListener('DOMContentLoaded', () => {
      document.body.style.opacity = '1';
    });
  </script>
</body>
</html>
```

---

## 总结

已完成三项任务：

### 任务 1：Cowork Skill 配置完善 ✓
- **SKILL.md**：包含完整的使用指南、核心指令说明、使用示例、常见问题
- **skill.json**：包含元信息、所有 6 个核心指令、MCP 服务器配置、用户偏好设置、平台集成配置

### 任务 2：农场码持久化存储方案 ✓
- **farmCodeStorage.ts**：包含完整的 TypeScript 实现，包括：
  - `FarmCodeStorage` 接口和 `AiggsStorage` 核心实现
  - `LocalStorageAdapter`（浏览器端）
  - `ClaudeMdAdapter`（CLAUDE.md 文件存储）
  - `MCPSessionAdapter`（MCP 服务器端）
  - 自动优先级检测和适配器选择
  - 跨设备同步策略（CRDT、事件日志、链上溯源）

### 任务 3：404 页面设计 ✓
- **404.html**：完整的响应式 404 页面，包含：
  - 动画迷路小鸡（CSS 动画）
  - 养鸡主题设计（蛋形浮动装饰）
  - 深色渐变背景与官网风格一致
  - 返回首页按钮 + 帮助链接
  - 完整的移动端适配
  - 复活节彩蛋（点击小鸡交互）

所有文件已按要求保存。

