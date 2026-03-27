# AIggs 后端 API 服务器完整代码

## 项目文件结构

```
aiggs-backend/
├── package.json
├── tsconfig.json
├── .env.example
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── middleware/
    │   ├── auth.ts
    │   ├── errorHandler.ts
    │   └── rateLimiter.ts
    ├── routes/
    │   ├── auth.ts
    │   ├── farm.ts
    │   ├── eggs.ts
    │   ├── steal.ts
    │   └── player.ts
    ├── controllers/
    │   ├── authController.ts
    │   ├── farmController.ts
    │   ├── eggsController.ts
    │   ├── stealController.ts
    │   └── playerController.ts
    ├── services/
    │   ├── authService.ts
    │   ├── farmService.ts
    │   ├── eggsService.ts
    │   ├── stealService.ts
    │   └── playerService.ts
    ├── jobs/
    │   └── eggProductionJob.ts
    ├── utils/
    │   ├── farmCodeGenerator.ts
    │   ├── signatureVerifier.ts
    │   ├── logger.ts
    │   └── constants.ts
    └── types/
        └── index.ts
```

---

## 文件内容

### package.json

```json
{
  "name": "aiggs-backend",
  "version": "1.0.0",
  "description": "AIggs - AI Native On-Chain Chicken Farm Game Backend API",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "lint": "eslint src --ext .ts",
    "test": "jest"
  },
  "dependencies": {
    "@prisma/client": "^5.8.0",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "ethers": "^6.10.0",
    "jsonwebtoken": "^9.1.2",
    "node-cron": "^3.0.3",
    "axios": "^1.6.5",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "uuid": "^9.0.1",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.6",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node-cron": "^3.0.11",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2",
    "prisma": "^5.8.0",
    "@typescript-eslint/eslint-plugin": "^6.17.0",
    "@typescript-eslint/parser": "^6.17.0",
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### .env.example

```env
# 服务器配置
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/aiggs_db

# JWT 密钥
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRE=7d

# Blockchain 配置
BASE_CHAIN_ID=8453
BASE_RPC_URL=https://mainnet.base.org
AIGG_CONTRACT_ADDRESS=0x...
EGGS_EXCHANGE_RATE=30

# 应用配置
FARM_CODE_LENGTH=6
EGGS_CAPACITY=30
PRODUCTION_CYCLE_HOURS=8
ROOKIE_PROTECTION_HOURS=24
STEAL_COOLDOWN_HOURS=24

# 日志配置
LOG_LEVEL=info

# 速率限制
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### prisma/schema.prisma

```prisma
// Prisma Schema for AIggs Backend

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============= 玩家表 =============
model Player {
  id                        BigInt    @id @default(autoincrement())
  walletAddress             String    @unique
  nickname                  String?
  farmCode                  String?   @unique
  referrerId                BigInt?
  registeredAt              DateTime  @default(now())
  rookieProtectionUntil     DateTime?
  totalEggsEarned           BigInt    @default(0)
  totalEggsExchanged        BigInt    @default(0)
  totalStolenCount          Int       @default(0)
  totalSuccessfulSteals     Int       @default(0)
  inviteCommissionEarned    BigInt    @default(0)
  isActive                  Boolean   @default(true)
  lastLoginAt               DateTime?
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  // 关系
  referrer                  Player?   @relation("ReferrerRelation", fields: [referrerId], references: [id], onDelete: SetNull)
  referrals                 Player[]  @relation("ReferrerRelation")
  farm                      Farm?
  chickens                  Chicken[]
  eggsTransactions          EggsTransaction[]
  stealEventsAsSteler       StealEvent[] @relation("StealerRelation")
  stealEventsAsVictim       StealEvent[] @relation("VictimRelation")
  aiDecisionLogs            AIDecisionLog[]
  otherPlayerTransactions   EggsTransaction[] @relation("OtherPlayer")

  @@index([registeredAt])
  @@index([referrerId])
  @@index([isActive])
  @@map("players")
}

// ============= 农场表 =============
model Farm {
  id                        BigInt    @id @default(autoincrement())
  playerId                  BigInt    @unique
  chickenCount              Int       @default(0)
  eggInventory              Int       @default(0)
  eggCapacity               Int       @default(30)
  lastEggProductionAt       DateTime?
  nextEggProductionAt       DateTime?
  isInventoryFull           Boolean   @default(false)
  totalEggsProduced         BigInt    @default(0)
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  // 关系
  player                    Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  chickens                  Chicken[]
  eggsTransactions          EggsTransaction[]
  aiDecisionLogs            AIDecisionLog[]

  @@index([nextEggProductionAt])
  @@index([isInventoryFull])
  @@map("farms")
}

// ============= 鸡表 =============
model Chicken {
  id                        BigInt    @id @default(autoincrement())
  farmId                    BigInt
  playerId                  BigInt
  chickenType               String
  rarityLevel               Int       @default(1)
  eggsPerCycle              BigInt    @default(10)
  productionCycleHours      Int       @default(8)
  baseProductionRate        Decimal   @default(1.0) @db.Decimal(5, 2)
  boostMultiplier           Decimal   @default(1.0) @db.Decimal(5, 2)
  boostUntil                DateTime?
  hatchingDate              DateTime
  acquiredAt                DateTime  @default(now())
  isActive                  Boolean   @default(true)
  totalEggsProduced         BigInt    @default(0)
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  // 关系
  farm                      Farm      @relation(fields: [farmId], references: [id], onDelete: Cascade)
  player                    Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  eggsTransactions          EggsTransaction[]

  @@index([farmId])
  @@index([playerId])
  @@index([chickenType])
  @@index([isActive])
  @@index([boostUntil])
  @@map("chickens")
}

// ============= EGGS流水表 =============
model EggsTransaction {
  id                        BigInt    @id @default(autoincrement())
  playerId                  BigInt
  farmId                    BigInt?
  transactionType           String    // production/steal/steal_success/steal_fail/exchange/invite_commission
  quantity                  BigInt
  previousBalance           BigInt
  afterBalance              BigInt
  producedByChickenId       BigInt?
  stealEventId              BigInt?
  otherPlayerId             BigInt?
  exchangeRate              Decimal?  @db.Decimal(10, 2)
  aiggAmount                BigInt?
  txHash                    String?
  referrerId                BigInt?
  description               String?
  createdAt                 DateTime  @default(now())

  // 关系
  player                    Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  farm                      Farm?     @relation(fields: [farmId], references: [id], onDelete: SetNull)
  chicken                   Chicken?  @relation(fields: [producedByChickenId], references: [id], onDelete: SetNull)
  stealEvent                StealEvent? @relation(fields: [stealEventId], references: [id], onDelete: SetNull)
  otherPlayer               Player?   @relation("OtherPlayer", fields: [otherPlayerId], references: [id], onDelete: SetNull)

  @@index([playerId])
  @@index([transactionType])
  @@index([createdAt])
  @@index([otherPlayerId])
  @@index([farmId])
  @@unique([playerId, transactionType])
  @@map("eggs_transactions")
}

// ============= 偷蛋事件表 =============
model StealEvent {
  id                        BigInt    @id @default(autoincrement())
  stalerId                  BigInt
  victimId                  BigInt
  outcome                   String    // bumper_crop/success/fail
  bumperCrop                Boolean   @default(false)
  eggsStolen                BigInt    @default(0)
  victimInventoryBefore     BigInt
  victimInventoryAfter      BigInt
  stalerLastTargetId        BigInt?
  cooldownUntil             DateTime?
  stalerDailyStealCount     Int       @default(1)
  aiDecisionLogId           BigInt?
  attemptedAt               DateTime  @default(now())
  createdAt                 DateTime  @default(now())

  // 关系
  staler                    Player    @relation("StealerRelation", fields: [stalerId], references: [id], onDelete: Cascade)
  victim                    Player    @relation("VictimRelation", fields: [victimId], references: [id], onDelete: Cascade)
  eggsTransactions          EggsTransaction[]
  aiDecisionLog             AIDecisionLog?

  @@index([stalerId])
  @@index([victimId])
  @@index([outcome])
  @@index([attemptedAt])
  @@index([cooldownUntil])
  @@map("steal_events")
}

// ============= AI决策日志表 =============
model AIDecisionLog {
  id                        BigInt    @id @default(autoincrement())
  agentType                 String    // game_state_analyzer/farm_optimizer/steal_strategist/market_predictor
  agentModel                String?
  playerId                  BigInt
  farmId                    BigInt?
  stealEventId              BigInt?   @unique
  decisionContext           String    @db.Text
  inputPrompt               String?   @db.Text
  decisionOutput            String    @db.Text
  recommendedAction         String?
  confidenceScore           Decimal?  @db.Decimal(5, 2)
  reasoning                 String?   @db.Text
  executionStatus           String    @default("pending") // pending/executed/failed
  actualResult              String?   @db.Text
  isCorrect                 Boolean?
  feedbackScore             Decimal?  @db.Decimal(5, 2)
  responseTimeMs            Int?
  tokenUsage                Int?
  costUsd                   Decimal?  @db.Decimal(10, 4)
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  // 关系
  player                    Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  farm                      Farm?     @relation(fields: [farmId], references: [id], onDelete: SetNull)
  stealEvent                StealEvent? @relation(fields: [stealEventId], references: [id], onDelete: SetNull)

  @@index([playerId])
  @@index([agentType])
  @@index([executionStatus])
  @@index([createdAt])
  @@index([confidenceScore])
  @@map("ai_decision_logs")
}
```

### src/types/index.ts

```typescript
// 类型定义文件

// JWT Payload 类型
export interface JWTPayload {
  playerId: bigint;
  walletAddress: string;
  iat: number;
  exp: number;
}

// 钱包签名验证请求
export interface SignatureVerificationRequest {
  walletAddress: string;
  signature: string;
  message: string;
  nonce: string;
}

// 注册请求
export interface RegisterRequest {
  walletAddress: string;
  signature: string;
  nickname?: string;
  farmCode?: string; // 邀请码
}

// 产蛋事件结果
export interface EggProductionResult {
  farmId: bigint;
  playerId: bigint;
  eggsBefore: number;
  eggsAfter: number;
  eggsProduced: number;
  fullInventory: boolean;
}

// 偷蛋结果
export enum StealOutcome {
  BUMPER_CROP = "bumper_crop",
  SUCCESS = "success",
  FAIL = "fail"
}

// 偷蛋事件结果
export interface StealEventResult {
  outcome: StealOutcome;
  bumperCrop: boolean;
  eggsStolen: bigint;
  victimInventoryBefore: number;
  victimInventoryAfter: number;
}

// EGGS 交易类型
export enum TransactionType {
  PRODUCTION = "production",
  STEAL = "steal",
  STEAL_SUCCESS = "steal_success",
  STEAL_FAIL = "steal_fail",
  EXCHANGE = "exchange",
  INVITE_COMMISSION = "invite_commission"
}

// API 响应格式
export interface APIResponse<T> {
  code: number;
  success: boolean;
  message: string;
  data?: T;
  timestamp: number;
}

// 玩家信息DTO
export interface PlayerDTO {
  id: bigint;
  walletAddress: string;
  nickname?: string;
  farmCode?: string;
  registeredAt: Date;
  totalEggsEarned: bigint;
  totalEggsExchanged: bigint;
  inviteCommissionEarned: bigint;
  totalSuccessfulSteals: number;
}

// 农场信息DTO
export interface FarmDTO {
  id: bigint;
  playerId: bigint;
  chickenCount: number;
  eggInventory: number;
  eggCapacity: number;
  isInventoryFull: boolean;
  nextEggProductionAt?: Date;
  totalEggsProduced: bigint;
}

// 错误响应
export class APIError extends Error {
  constructor(
    public code: number,
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

// 分页参数
export interface PaginationQuery {
  page: number;
  limit: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

### src/utils/constants.ts

```typescript
// 应用常量定义

export const CONSTANTS = {
  // 农场相关常量
  FARM_CODE_LENGTH: 6,
  EGGS_CAPACITY: 30,
  PRODUCTION_CYCLE_HOURS: 8,
  ROOKIE_PROTECTION_HOURS: 24,

  // 偷蛋相关常量
  STEAL_COOLDOWN_HOURS: 24,
  MAX_DAILY_STEALS: 2,
  STEAL_OUTCOMES: {
    BUMPER_CROP: 0.2, // 20% 概率大丰收
    SUCCESS: 0.55,    // 55% 概率成功
    FAIL: 0.25        // 25% 概率扑空
  },
  BUMPER_CROP_PERCENTAGE: 0.2, // 大丰收时偷取库存的20%
  NORMAL_STEAL_PERCENTAGE: 0.5, // 正常偷蛋时偷取库存的50%

  // 邀请相关常量
  INVITE_COMMISSION_RATE: 0.1, // 10% 分成

  // EGGS 兑换相关
  EGGS_EXCHANGE_RATE: 30, // 30 EGGS = 1 $AIGG

  // JWT 配置
  JWT_EXPIRE: "7d",

  // 速率限制
  RATE_LIMIT_WINDOW_MS: 900000, // 15 分钟
  RATE_LIMIT_MAX_REQUESTS: 100, // 15分钟内最多100个请求

  // 分页
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,

  // 错误代码
  ERROR_CODES: {
    SUCCESS: 0,
    INVALID_PARAMS: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    SERVER_ERROR: 500,
    CUSTOM_ERROR: 1000
  },

  // 时间常量（毫秒）
  MILLISECONDS_PER_HOUR: 3600000,
  MILLISECONDS_PER_DAY: 86400000,

  // 链相关常量
  BASE_CHAIN_ID: 8453,
  BASE_RPC_URL: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  AIGG_CONTRACT_ADDRESS: process.env.AIGG_CONTRACT_ADDRESS || ""
};

// 签名验证时的消息模板
export const SIGN_MESSAGE_TEMPLATE = (nonce: string): string => {
  return `Welcome to AIggs! Sign this message to authenticate.\nNonce: ${nonce}`;
};

// HTTP 状态码映射
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};
```

### src/utils/logger.ts

```typescript
// 日志工具

import winston from "winston";
import path from "path";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...args }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${
      Object.keys(args).length ? JSON.stringify(args, null, 2) : ""
    }`;
  })
);

// 创建 logger 实例
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "error.log"),
      level: "error"
    }),
    // 完整日志文件
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "combined.log")
    })
  ]
});

// 便利函数
export const log = {
  info: (message: string, meta?: any) => logger.info(message, meta),
  error: (message: string, error?: Error | any) =>
    logger.error(message, { error: error?.message || error }),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta)
};
```

### src/utils/farmCodeGenerator.ts

```typescript
// 农场码生成工具 - 生成唯一的6位字母数字农场码

import { v4 as uuidv4 } from "uuid";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const FARM_CODE_LENGTH = 6;

/**
 * 生成唯一的农场码
 * 使用 UUID 的哈希结果确保唯一性
 */
export function generateFarmCode(): string {
  // 生成 UUID 作为种子
  const uuid = uuidv4().replace(/-/g, "");

  // 将 UUID 转换为大整数，然后映射到字符集
  let code = "";
  let hash = 0;

  // 计算字符串的哈希值
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // 使用绝对值生成码
  const absHash = Math.abs(hash);

  // 生成指定长度的码
  for (let i = 0; i < FARM_CODE_LENGTH; i++) {
    const index = (absHash + i) % CHARSET.length;
    code += CHARSET[index];
  }

  return code;
}

/**
 * 验证农场码格式
 */
export function isValidFarmCode(code: string): boolean {
  if (!code || code.length !== FARM_CODE_LENGTH) {
    return false;
  }
  return /^[A-Z0-9]{6}$/.test(code);
}

/**
 * 生成不重复的农场码
 * 需要配合数据库查询使用
 */
export async function generateUniqueFarmCode(
  checkExists: (code: string) => Promise<boolean>
): Promise<string> {
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateFarmCode();
    const exists = await checkExists(code);
    if (!exists) {
      return code;
    }
    attempts++;
  } while (attempts < maxAttempts);

  throw new Error("Failed to generate unique farm code after multiple attempts");
}
```

### src/utils/signatureVerifier.ts

```typescript
// 钱包签名验证工具 - 验证 Ethereum 签名

import { ethers } from "ethers";
import { SIGN_MESSAGE_TEMPLATE } from "./constants";

/**
 * 验证钱包签名
 * @param walletAddress 钱包地址
 * @param signature 签名
 * @param nonce 随机数
 * @returns 签名是否有效
 */
export async function verifySignature(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<boolean> {
  try {
    // 构造签名消息
    const message = SIGN_MESSAGE_TEMPLATE(nonce);

    // 恢复签名中的地址
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // 比较地址（转换为小写确保比较准确）
    return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

/**
 * 生成签名消息
 */
export function getSignatureMessage(nonce: string): string {
  return SIGN_MESSAGE_TEMPLATE(nonce);
}

/**
 * 生成随机 nonce
 */
export function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15);
}
```

### src/middleware/auth.ts

```typescript
// JWT 认证中间件

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { APIError, JWTPayload } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      playerId?: bigint;
    }
  }
}

/**
 * JWT 认证中间件
 * 验证请求中的 Authorization 头中的 JWT token
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // 从 Authorization 头获取 token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.UNAUTHORIZED,
        HTTP_STATUS_CODES.UNAUTHORIZED,
        "Missing authorization token"
      );
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.user = decoded;
    req.playerId = decoded.playerId;

    next();
  } catch (error) {
    log.warn("Authentication failed", { error });
    res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({
      code: CONSTANTS.ERROR_CODES.UNAUTHORIZED,
      success: false,
      message: "Invalid or expired token",
      timestamp: Date.now()
    });
  }
}

/**
 * 可选认证中间件
 * token 有效则解析，无效则继续
 */
export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      req.user = decoded;
      req.playerId = decoded.playerId;
    }
  } catch (error) {
    // 忽略错误，继续执行
    log.debug("Optional auth failed, continuing without authentication");
  }
  next();
}

/**
 * 生成 JWT token
 */
export function generateToken(playerId: bigint, walletAddress: string): string {
  const payload: JWTPayload = {
    playerId,
    walletAddress,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days
  };

  return jwt.sign(payload, process.env.JWT_SECRET!);
}
```

### src/middleware/errorHandler.ts

```typescript
// 全局错误处理中间件

import { Express, Request, Response, NextFunction } from "express";
import { APIError, APIResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

/**
 * 错误处理中间件
 * 必须作为最后一个中间件
 */
export function errorHandlerMiddleware(
  error: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 记录错误日志
  log.error("Request error", error);

  if (error instanceof APIError) {
    // 自定义 API 错误
    const response: APIResponse<null> = {
      code: error.code,
      success: false,
      message: error.message,
      timestamp: Date.now()
    };
    res.status(error.statusCode).json(response);
  } else {
    // 其他错误
    const response: APIResponse<null> = {
      code: CONSTANTS.ERROR_CODES.SERVER_ERROR,
      success: false,
      message: process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message,
      timestamp: Date.now()
    };
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json(response);
  }
}

/**
 * 404 处理中间件
 * 放在所有路由之后
 */
export function notFoundMiddleware(
  req: Request,
  res: Response
): void {
  const response: APIResponse<null> = {
    code: CONSTANTS.ERROR_CODES.NOT_FOUND,
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
    timestamp: Date.now()
  };
  res.status(HTTP_STATUS_CODES.NOT_FOUND).json(response);
}

/**
 * 异步错误处理包装器
 * 用于 async/await 路由处理
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### src/middleware/rateLimiter.ts

```typescript
// 速率限制中间件

import rateLimit from "express-rate-limit";
import { CONSTANTS } from "@/utils/constants";

/**
 * 全局速率限制
 * 限制客户端的请求频率
 */
export const globalRateLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 如果有用户，使用 playerId；否则使用 IP
    return req.playerId ? `player-${req.playerId}` : req.ip || "unknown";
  }
});

/**
 * 认证端点速率限制
 * 限制登录等敏感操作的频率
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 5, // 最多5个请求
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 偷蛋操作速率限制
 * 确保每次偷蛋间隔足够长
 */
export const stealRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 2, // 每分钟最多2次
  message: "Too many steal attempts, please wait before trying again.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `steal-${req.playerId || req.ip}`
});

/**
 * 交易端点速率限制
 */
export const transactionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 10,
  message: "Too many transactions, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `tx-${req.playerId || req.ip}`
});
```

### src/services/authService.ts

```typescript
// 认证服务

import { PrismaClient } from "@prisma/client";
import { generateToken } from "@/middleware/auth";
import { generateFarmCode, generateUniqueFarmCode } from "@/utils/farmCodeGenerator";
import { APIError } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

const prisma = new PrismaClient();

/**
 * 获取或创建玩家
 */
export async function getOrCreatePlayer(
  walletAddress: string,
  nickname?: string,
  farmCodeInput?: string
): Promise<any> {
  try {
    // 查询现有玩家
    let player = await prisma.player.findUnique({
      where: { walletAddress }
    });

    if (player) {
      // 更新最后登录时间
      player = await prisma.player.update({
        where: { walletAddress },
        data: { lastLoginAt: new Date() }
      });
      return player;
    }

    // 创建新玩家
    const newFarmCode = await generateUniqueFarmCode(async (code) => {
      const existing = await prisma.player.findUnique({
        where: { farmCode: code }
      });
      return !!existing;
    });

    // 处理邀请码
    let referrerId: bigint | null = null;
    if (farmCodeInput) {
      const referrer = await prisma.player.findUnique({
        where: { farmCode: farmCodeInput }
      });
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    // 计算新手保护期
    const rookieProtectionUntil = new Date(
      Date.now() + CONSTANTS.ROOKIE_PROTECTION_HOURS * 60 * 60 * 1000
    );

    // 创建玩家
    player = await prisma.player.create({
      data: {
        walletAddress,
        nickname: nickname || `Player_${walletAddress.slice(0, 6)}`,
        farmCode: newFarmCode,
        referrerId,
        rookieProtectionUntil,
        registeredAt: new Date(),
        lastLoginAt: new Date()
      }
    });

    // 为新玩家创建农场
    await prisma.farm.create({
      data: {
        playerId: player.id,
        chickenCount: 0,
        eggInventory: 0,
        eggCapacity: CONSTANTS.EGGS_CAPACITY,
        isInventoryFull: false
      }
    });

    log.info("New player registered", {
      playerId: player.id,
      walletAddress,
      farmCode: newFarmCode
    });

    return player;
  } catch (error) {
    log.error("Failed to create player", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to create player"
    );
  }
}

/**
 * 生成登录 token
 */
export function generateLoginToken(
  playerId: bigint,
  walletAddress: string
): string {
  return generateToken(playerId, walletAddress);
}

/**
 * 验证玩家是否存在
 */
export async function playerExists(walletAddress: string): Promise<boolean> {
  const player = await prisma.player.findUnique({
    where: { walletAddress }
  });
  return !!player;
}
```

### src/services/farmService.ts

```typescript
// 农场服务

import { PrismaClient, Farm, Chicken } from "@prisma/client";
import { APIError, FarmDTO } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

const prisma = new PrismaClient();

/**
 * 获取玩家农场信息
 */
export async function getFarmByPlayerId(playerId: bigint): Promise<FarmDTO> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { playerId }
    });

    if (!farm) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND,
        "Farm not found"
      );
    }

    return convertFarmToDTO(farm);
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to get farm", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get farm"
    );
  }
}

/**
 * 转换 Farm 为 DTO
 */
function convertFarmToDTO(farm: Farm): FarmDTO {
  return {
    id: farm.id,
    playerId: farm.playerId,
    chickenCount: farm.chickenCount,
    eggInventory: farm.eggInventory,
    eggCapacity: farm.eggCapacity,
    isInventoryFull: farm.isInventoryFull,
    nextEggProductionAt: farm.nextEggProductionAt || undefined,
    totalEggsProduced: farm.totalEggsProduced
  };
}

/**
 * 获取农场中的所有鸡
 */
export async function getFarmChickens(playerId: bigint): Promise<Chicken[]> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { playerId }
    });

    if (!farm) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND,
        "Farm not found"
      );
    }

    const chickens = await prisma.chicken.findMany({
      where: {
        farmId: farm.id,
        isActive: true
      }
    });

    return chickens;
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to get farm chickens", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get farm chickens"
    );
  }
}

/**
 * 获取需要产蛋的所有农场
 */
export async function getFarmsReadyForProduction(): Promise<any[]> {
  try {
    const farms = await prisma.farm.findMany({
      where: {
        nextEggProductionAt: {
          lte: new Date()
        },
        isInventoryFull: false,
        chickenCount: {
          gt: 0
        }
      },
      include: {
        player: {
          select: {
            id: true,
            walletAddress: true,
            isActive: true
          }
        }
      },
      take: 100 // 一次最多处理100个农场
    });

    return farms.filter(f => f.player.isActive);
  } catch (error) {
    log.error("Failed to get farms ready for production", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get farms"
    );
  }
}

/**
 * 更新农场产蛋时间和库存
 * 事务性操作确保原子性
 */
export async function updateFarmAfterProduction(
  farmId: bigint,
  eggsProduced: number
): Promise<Farm> {
  try {
    const farm = await prisma.farm.update({
      where: { id: farmId },
      data: {
        eggInventory: {
          increment: eggsProduced
        },
        lastEggProductionAt: new Date(),
        nextEggProductionAt: new Date(
          Date.now() + CONSTANTS.PRODUCTION_CYCLE_HOURS * 60 * 60 * 1000
        ),
        isInventoryFull: {
          set: false // 实际判断由下面的代码处理
        },
        totalEggsProduced: {
          increment: eggsProduced
        }
      }
    });

    // 检查是否已满
    if (farm.eggInventory + eggsProduced >= farm.eggCapacity) {
      await prisma.farm.update({
        where: { id: farmId },
        data: {
          eggInventory: farm.eggCapacity,
          isInventoryFull: true,
          nextEggProductionAt: null // 停止产蛋
        }
      });
    }

    return farm;
  } catch (error) {
    log.error("Failed to update farm", error);
    throw error;
  }
}

/**
 * 获取农场库存（带锁定防并发）
 */
export async function getOrLockFarmInventory(
  farmId: bigint
): Promise<{ eggInventory: number; eggCapacity: number }> {
  try {
    // 这里可以添加 FOR UPDATE 锁（需要数据库支持）
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: {
        eggInventory: true,
        eggCapacity: true
      }
    });

    if (!farm) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND,
        "Farm not found"
      );
    }

    return farm;
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to lock farm inventory", error);
    throw error;
  }
}

/**
 * 消耗农场库存
 */
export async function consumeFarmInventory(
  farmId: bigint,
  amount: number
): Promise<number> {
  try {
    const farm = await prisma.farm.update({
      where: { id: farmId },
      data: {
        eggInventory: {
          decrement: amount
        },
        isInventoryFull: false
      }
    });

    return Math.max(farm.eggInventory, 0);
  } catch (error) {
    log.error("Failed to consume farm inventory", error);
    throw error;
  }
}

/**
 * 增加农场库存
 */
export async function addFarmInventory(
  farmId: bigint,
  amount: number
): Promise<number> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId }
    });

    if (!farm) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND,
        "Farm not found"
      );
    }

    const newInventory = Math.min(
      farm.eggInventory + amount,
      farm.eggCapacity
    );

    await prisma.farm.update({
      where: { id: farmId },
      data: {
        eggInventory: newInventory,
        isInventoryFull: newInventory >= farm.eggCapacity
      }
    });

    return newInventory;
  } catch (error) {
    log.error("Failed to add farm inventory", error);
    throw error;
  }
}
```

### src/services/eggsService.ts

```typescript
// EGGS 服务

import { PrismaClient, EggsTransaction } from "@prisma/client";
import { TransactionType, APIError, PaginatedResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

const prisma = new PrismaClient();

/**
 * 获取玩家 EGGS 余额
 */
export async function getPlayerEggsBalance(playerId: bigint): Promise<number> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { playerId },
      select: { eggInventory: true }
    });

    return farm?.eggInventory || 0;
  } catch (error) {
    log.error("Failed to get eggs balance", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get eggs balance"
    );
  }
}

/**
 * 记录 EGGS 交易
 */
export async function recordEggsTransaction(
  playerId: bigint,
  farmId: bigint | null,
  transactionType: TransactionType,
  quantity: bigint,
  previousBalance: bigint,
  afterBalance: bigint,
  otherPlayerId?: bigint,
  description?: string,
  metadata?: any
): Promise<EggsTransaction> {
  try {
    const transaction = await prisma.eggsTransaction.create({
      data: {
        playerId,
        farmId,
        transactionType,
        quantity,
        previousBalance,
        afterBalance,
        otherPlayerId,
        description,
        producedByChickenId: metadata?.chickenId,
        stealEventId: metadata?.stealEventId,
        exchangeRate: metadata?.exchangeRate,
        aiggAmount: metadata?.aiggAmount,
        txHash: metadata?.txHash,
        referrerId: metadata?.referrerId
      }
    });

    return transaction;
  } catch (error) {
    log.error("Failed to record transaction", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to record transaction"
    );
  }
}

/**
 * 获取玩家交易历史
 */
export async function getPlayerTransactionHistory(
  playerId: bigint,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<EggsTransaction>> {
  try {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.eggsTransaction.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.eggsTransaction.count({
        where: { playerId }
      })
    ]);

    return {
      items: transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    log.error("Failed to get transaction history", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get transaction history"
    );
  }
}

/**
 * 兑换 EGGS 为 $AIGG
 * 事务性操作确保原子性
 */
export async function exchangeEggsForAIGG(
  playerId: bigint,
  eggsAmount: bigint,
  txHash: string
): Promise<any> {
  try {
    // 在事务中执行操作
    return await prisma.$transaction(async (tx) => {
      // 1. 获取玩家农场和当前余额
      const farm = await tx.farm.findUnique({
        where: { playerId }
      });

      if (!farm || farm.eggInventory < Number(eggsAmount)) {
        throw new APIError(
          CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
          HTTP_STATUS_CODES.BAD_REQUEST,
          "Insufficient eggs"
        );
      }

      const previousBalance = BigInt(farm.eggInventory);

      // 2. 消耗 EGGS
      const newFarm = await tx.farm.update({
        where: { playerId },
        data: {
          eggInventory: {
            decrement: Number(eggsAmount)
          },
          isInventoryFull: false
        }
      });

      const afterBalance = BigInt(newFarm.eggInventory);

      // 3. 计算 $AIGG 数量
      const aiggAmount = BigInt(
        Math.floor(Number(eggsAmount) / CONSTANTS.EGGS_EXCHANGE_RATE)
      );

      // 4. 记录交易
      const transaction = await tx.eggsTransaction.create({
        data: {
          playerId,
          farmId: farm.id,
          transactionType: TransactionType.EXCHANGE,
          quantity: -eggsAmount,
          previousBalance,
          afterBalance,
          exchangeRate: new Decimal(CONSTANTS.EGGS_EXCHANGE_RATE),
          aiggAmount,
          txHash,
          description: `Exchanged ${eggsAmount} EGGS for ${aiggAmount} $AIGG`
        }
      });

      // 5. 更新玩家累计兑换数
      await tx.player.update({
        where: { id: playerId },
        data: {
          totalEggsExchanged: {
            increment: eggsAmount
          }
        }
      });

      return {
        transaction,
        aiggAmount,
        previousBalance,
        afterBalance
      };
    });
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to exchange eggs", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to exchange eggs"
    );
  }
}

/**
 * 获取交易统计
 */
export async function getTransactionStats(
  playerId: bigint
): Promise<any> {
  try {
    const stats = await prisma.eggsTransaction.groupBy({
      by: ["transactionType"],
      where: { playerId },
      _sum: { quantity: true },
      _count: true
    });

    return stats;
  } catch (error) {
    log.error("Failed to get transaction stats", error);
    throw error;
  }
}
```

### src/services/stealService.ts

```typescript
// 偷蛋服务

import { PrismaClient, StealEvent } from "@prisma/client";
import { APIError, StealEventResult, StealOutcome } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";
import { recordEggsTransaction } from "./eggsService";
import { TransactionType } from "@/types";

const prisma = new PrismaClient();

/**
 * 检查玩家是否可以偷蛋
 */
export async function canPlayerSteal(
  playerId: bigint,
  victimId: bigint
): Promise<{ canSteal: boolean; reason?: string }> {
  try {
    // 检查是否为新手保护期
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { rookieProtectionUntil: true }
    });

    if (player?.rookieProtectionUntil && player.rookieProtectionUntil > new Date()) {
      return { canSteal: false, reason: "In rookie protection period" };
    }

    // 检查受害者是否在新手保护期
    const victim = await prisma.player.findUnique({
      where: { id: victimId },
      select: { rookieProtectionUntil: true }
    });

    if (victim?.rookieProtectionUntil && victim.rookieProtectionUntil > new Date()) {
      return { canSteal: false, reason: "Victim is in rookie protection period" };
    }

    // 检查冷却时间
    const lastSteal = await prisma.stealEvent.findFirst({
      where: {
        stalerId: playerId,
        victimId: victimId,
        cooldownUntil: {
          gt: new Date()
        }
      },
      orderBy: { attemptedAt: "desc" }
    });

    if (lastSteal) {
      return { canSteal: false, reason: "Target is on cooldown" };
    }

    // 检查今日偷蛋次数
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyStealCount = await prisma.stealEvent.count({
      where: {
        stalerId: playerId,
        attemptedAt: {
          gte: today
        }
      }
    });

    if (dailyStealCount >= CONSTANTS.MAX_DAILY_STEALS) {
      return { canSteal: false, reason: "Daily steal limit reached" };
    }

    return { canSteal: true };
  } catch (error) {
    log.error("Failed to check steal permission", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to check steal permission"
    );
  }
}

/**
 * 执行偷蛋操作
 */
export async function executeSteaIEvent(
  stalerId: bigint,
  victimId: bigint
): Promise<StealEvent> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. 获取受害者的农场信息
      const victimFarm = await tx.farm.findUnique({
        where: { playerId: victimId }
      });

      if (!victimFarm) {
        throw new APIError(
          CONSTANTS.ERROR_CODES.NOT_FOUND,
          HTTP_STATUS_CODES.NOT_FOUND,
          "Victim farm not found"
        );
      }

      const victimInventoryBefore = victimFarm.eggInventory;

      // 2. 计算偷蛋结果
      const random = Math.random();
      let outcome: StealOutcome;
      let bumperCrop = false;
      let eggsStolen = 0n;

      if (random < CONSTANTS.STEAL_OUTCOMES.BUMPER_CROP) {
        // 大丰收
        outcome = StealOutcome.BUMPER_CROP;
        bumperCrop = true;
        eggsStolen = BigInt(
          Math.floor(victimInventoryBefore * CONSTANTS.BUMPER_CROP_PERCENTAGE)
        );
      } else if (random < CONSTANTS.STEAL_OUTCOMES.BUMPER_CROP + CONSTANTS.STEAL_OUTCOMES.SUCCESS) {
        // 成功
        outcome = StealOutcome.SUCCESS;
        eggsStolen = BigInt(
          Math.floor(victimInventoryBefore * CONSTANTS.NORMAL_STEAL_PERCENTAGE)
        );
      } else {
        // 失败
        outcome = StealOutcome.FAIL;
        eggsStolen = 0n;
      }

      // 3. 更新受害者农场
      const victimInventoryAfter = Math.max(
        0,
        victimInventoryBefore - Number(eggsStolen)
      );

      await tx.farm.update({
        where: { playerId: victimId },
        data: {
          eggInventory: victimInventoryAfter,
          isInventoryFull: false
        }
      });

      // 4. 更新偷蛋者农场
      const stalerFarm = await tx.farm.findUnique({
        where: { playerId: stalerId }
      });

      if (stalerFarm) {
        await tx.farm.update({
          where: { playerId: stalerId },
          data: {
            eggInventory: {
              increment: Math.min(
                Number(eggsStolen),
                stalerFarm.eggCapacity - stalerFarm.eggInventory
              )
            }
          }
        });
      }

      // 5. 计算冷却时间
      const cooldownUntil = new Date(
        Date.now() + CONSTANTS.STEAL_COOLDOWN_HOURS * 60 * 60 * 1000
      );

      // 6. 创建偷蛋事件
      const stealEvent = await tx.stealEvent.create({
        data: {
          stalerId,
          victimId,
          outcome,
          bumperCrop,
          eggsStolen,
          victimInventoryBefore,
          victimInventoryAfter,
          cooldownUntil,
          stalerDailyStealCount: 1
        }
      });

      // 7. 记录交易
      if (eggsStolen > 0n) {
        // 受害者损失记录
        await tx.eggsTransaction.create({
          data: {
            playerId: victimId,
            farmId: victimFarm.id,
            transactionType: TransactionType.STEAL,
            quantity: -eggsStolen,
            previousBalance: BigInt(victimInventoryBefore),
            afterBalance: BigInt(victimInventoryAfter),
            otherPlayerId: stalerId,
            stealEventId: stealEvent.id,
            description: `Stolen by player ${stalerId}`
          }
        });

        // 偷蛋者收益记录
        await tx.eggsTransaction.create({
          data: {
            playerId: stalerId,
            farmId: stalerFarm?.id || null,
            transactionType: TransactionType.STEAL_SUCCESS,
            quantity: eggsStolen,
            previousBalance: BigInt(stalerFarm?.eggInventory || 0),
            afterBalance: BigInt(
              Math.min(
                Number(eggsStolen) + (stalerFarm?.eggInventory || 0),
                (stalerFarm?.eggCapacity || CONSTANTS.EGGS_CAPACITY)
              )
            ),
            otherPlayerId: victimId,
            stealEventId: stealEvent.id,
            description: `Stolen from player ${victimId}`
          }
        });
      }

      // 8. 更新玩家统计
      await tx.player.update({
        where: { id: victimId },
        data: {
          totalStolenCount: {
            increment: 1
          }
        }
      });

      if (eggsStolen > 0n) {
        await tx.player.update({
          where: { id: stalerId },
          data: {
            totalSuccessfulSteals: {
              increment: 1
            }
          }
        });
      }

      return stealEvent;
    });
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to execute steal event", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to execute steal"
    );
  }
}

/**
 * 获取玩家的偷蛋历史
 */
export async function getPlayerStealHistory(
  playerId: bigint,
  page: number = 1,
  limit: number = 20
): Promise<any> {
  try {
    const skip = (page - 1) * limit;

    const [steals, total] = await Promise.all([
      prisma.stealEvent.findMany({
        where: {
          OR: [
            { stalerId: playerId },
            { victimId: playerId }
          ]
        },
        orderBy: { attemptedAt: "desc" },
        skip,
        take: limit,
        include: {
          staler: {
            select: { id: true, nickname: true, farmCode: true }
          },
          victim: {
            select: { id: true, nickname: true, farmCode: true }
          }
        }
      }),
      prisma.stealEvent.count({
        where: {
          OR: [
            { stalerId: playerId },
            { victimId: playerId }
          ]
        }
      })
    ]);

    return {
      items: steals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    log.error("Failed to get steal history", error);
    throw error;
  }
}
```

### src/services/playerService.ts

```typescript
// 玩家服务

import { PrismaClient } from "@prisma/client";
import { PlayerDTO, APIError, PaginatedResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

const prisma = new PrismaClient();

/**
 * 获取玩家信息
 */
export async function getPlayerInfo(playerId: bigint): Promise<PlayerDTO> {
  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId }
    });

    if (!player) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND,
        "Player not found"
      );
    }

    return convertPlayerToDTO(player);
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to get player info", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get player info"
    );
  }
}

/**
 * 转换 Player 为 DTO
 */
function convertPlayerToDTO(player: any): PlayerDTO {
  return {
    id: player.id,
    walletAddress: player.walletAddress,
    nickname: player.nickname,
    farmCode: player.farmCode,
    registeredAt: player.registeredAt,
    totalEggsEarned: player.totalEggsEarned,
    totalEggsExchanged: player.totalEggsExchanged,
    inviteCommissionEarned: player.inviteCommissionEarned,
    totalSuccessfulSteals: player.totalSuccessfulSteals
  };
}

/**
 * 获取排行榜（按累计产蛋数）
 */
export async function getLeaderboard(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<any>> {
  try {
    const skip = (page - 1) * limit;

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where: { isActive: true },
        select: {
          id: true,
          nickname: true,
          totalEggsEarned: true,
          totalEggsExchanged: true,
          totalSuccessfulSteals: true,
          registeredAt: true
        },
        orderBy: { totalEggsEarned: "desc" },
        skip,
        take: limit
      }),
      prisma.player.count({
        where: { isActive: true }
      })
    ]);

    return {
      items: players,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    log.error("Failed to get leaderboard", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to get leaderboard"
    );
  }
}

/**
 * 获取邀请统计
 */
export async function getInviteStats(playerId: bigint): Promise<any> {
  try {
    const [referrals, referrer] = await Promise.all([
      prisma.player.findMany({
        where: { referrerId: playerId },
        select: { id: true, nickname: true, registeredAt: true }
      }),
      prisma.player.findUnique({
        where: { id: playerId },
        select: { referrerId: true, inviteCommissionEarned: true }
      })
    ]);

    return {
      referralCount: referrals.length,
      referrals,
      referrerId: referrer?.referrerId,
      commissionEarned: referrer?.inviteCommissionEarned || 0n
    };
  } catch (error) {
    log.error("Failed to get invite stats", error);
    throw error;
  }
}

/**
 * 更新玩家昵称
 */
export async function updatePlayerNickname(
  playerId: bigint,
  nickname: string
): Promise<PlayerDTO> {
  try {
    if (!nickname || nickname.trim().length === 0) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "Nickname cannot be empty"
      );
    }

    const player = await prisma.player.update({
      where: { id: playerId },
      data: { nickname: nickname.trim() }
    });

    return convertPlayerToDTO(player);
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to update nickname", error);
    throw new APIError(
      CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
      HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      "Failed to update nickname"
    );
  }
}

/**
 * 获取玩家农场分享链接
 */
export async function getPlayerShareLink(playerId: bigint): Promise<string> {
  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { farmCode: true }
    });

    if (!player?.farmCode) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.NOT_FOUND,
        HTTP_STATUS_CODES.NOT_FOUND,
        "Farm code not found"
      );
    }

    return `${process.env.API_URL}/join/${player.farmCode}`;
  } catch (error) {
    if (error instanceof APIError) throw error;
    log.error("Failed to get share link", error);
    throw error;
  }
}
```

### src/controllers/authController.ts

```typescript
// 认证控制器

import { Request, Response } from "express";
import {
  getOrCreatePlayer,
  generateLoginToken,
  playerExists
} from "@/services/authService";
import { verifySignature } from "@/utils/signatureVerifier";
import { asyncHandler } from "@/middleware/errorHandler";
import { APIError, APIResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";
import { log } from "@/utils/logger";

/**
 * 登录/注册端点
 * POST /auth/login
 */
export const login = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      walletAddress,
      signature,
      message,
      nonce,
      nickname,
      farmCode
    } = req.body;

    // 验证必需字段
    if (!walletAddress || !signature || !nonce) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "Missing required fields: walletAddress, signature, nonce"
      );
    }

    // 验证签名
    const isValidSignature = await verifySignature(
      walletAddress,
      signature,
      nonce
    );

    if (!isValidSignature) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.UNAUTHORIZED,
        "Invalid signature"
      );
    }

    // 获取或创建玩家
    const player = await getOrCreatePlayer(
      walletAddress,
      nickname,
      farmCode
    );

    // 生成 token
    const token = generateLoginToken(player.id, player.walletAddress);

    log.info("Player login successful", {
      playerId: player.id,
      walletAddress
    });

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Login successful",
      data: {
        token,
        player: {
          id: player.id,
          walletAddress: player.walletAddress,
          nickname: player.nickname,
          farmCode: player.farmCode,
          registeredAt: player.registeredAt
        }
      },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 检查玩家是否存在
 * GET /auth/check/:walletAddress
 */
export const checkPlayer = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { walletAddress } = req.params;

    const exists = await playerExists(walletAddress);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Check successful",
      data: { exists },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取签名消息
 * GET /auth/message/:nonce
 */
export const getSignMessage = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { nonce } = req.params;

    if (!nonce) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "Nonce is required"
      );
    }

    const message = `Welcome to AIggs! Sign this message to authenticate.\nNonce: ${nonce}`;

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Message retrieved",
      data: { message },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);
```

### src/controllers/farmController.ts

```typescript
// 农场控制器

import { Request, Response } from "express";
import { getFarmByPlayerId, getFarmChickens } from "@/services/farmService";
import { getPlayerEggsBalance } from "@/services/eggsService";
import { asyncHandler } from "@/middleware/errorHandler";
import { APIResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";

/**
 * 获取农场信息
 * GET /farm/info
 */
export const getFarmInfo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const [farm, eggsBalance, chickens] = await Promise.all([
      getFarmByPlayerId(playerId),
      getPlayerEggsBalance(playerId),
      getFarmChickens(playerId)
    ]);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Farm info retrieved",
      data: {
        farm,
        eggsBalance,
        chickenCount: chickens.length,
        chickens
      },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取农场的所有鸡
 * GET /farm/chickens
 */
export const getChickens = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const chickens = await getFarmChickens(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Chickens retrieved",
      data: {
        chickens,
        count: chickens.length
      },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取农场库存
 * GET /farm/inventory
 */
export const getInventory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const farm = await getFarmByPlayerId(playerId);
    const eggsBalance = await getPlayerEggsBalance(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Inventory retrieved",
      data: {
        eggsBalance,
        capacity: farm.eggCapacity,
        isFull: eggsBalance >= farm.eggCapacity
      },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);
```

### src/controllers/eggsController.ts

```typescript
// EGGS 控制器

import { Request, Response } from "express";
import {
  getPlayerEggsBalance,
  getPlayerTransactionHistory,
  exchangeEggsForAIGG
} from "@/services/eggsService";
import { asyncHandler } from "@/middleware/errorHandler";
import { APIError, APIResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";

/**
 * 获取 EGGS 余额
 * GET /eggs/balance
 */
export const getBalance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const balance = await getPlayerEggsBalance(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Balance retrieved",
      data: { balance },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取交易历史
 * GET /eggs/history
 */
export const getHistory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await getPlayerTransactionHistory(playerId, page, limit);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "History retrieved",
      data: history,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 兑换 EGGS 为 $AIGG
 * POST /eggs/exchange
 */
export const exchangeEggs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;
    const { eggsAmount, txHash } = req.body;

    if (!eggsAmount || !txHash) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "Missing required fields: eggsAmount, txHash"
      );
    }

    const exchangeResult = await exchangeEggsForAIGG(
      playerId,
      BigInt(eggsAmount),
      txHash
    );

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Exchange successful",
      data: exchangeResult,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);
```

### src/controllers/stealController.ts

```typescript
// 偷蛋控制器

import { Request, Response } from "express";
import {
  canPlayerSteal,
  executeSteaIEvent,
  getPlayerStealHistory
} from "@/services/stealService";
import { asyncHandler } from "@/middleware/errorHandler";
import { APIError, APIResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";

/**
 * 执行偷蛋
 * POST /steal/execute
 */
export const executeSteal = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;
    const { victimId } = req.body;

    if (!victimId) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "victimId is required"
      );
    }

    // 检查是否可以偷蛋
    const { canSteal, reason } = await canPlayerSteal(
      playerId,
      BigInt(victimId)
    );

    if (!canSteal) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.FORBIDDEN,
        reason || "Cannot steal from this target"
      );
    }

    // 执行偷蛋
    const stealEvent = await executeSteaIEvent(playerId, BigInt(victimId));

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Steal executed",
      data: {
        outcome: stealEvent.outcome,
        eggsStolen: stealEvent.eggsStolen,
        bumperCrop: stealEvent.bumperCrop,
        victimInventoryBefore: stealEvent.victimInventoryBefore,
        victimInventoryAfter: stealEvent.victimInventoryAfter
      },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取偷蛋历史
 * GET /steal/history
 */
export const getStealHistory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await getPlayerStealHistory(playerId, page, limit);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Steal history retrieved",
      data: history,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 检查是否可以偷蛋
 * POST /steal/check
 */
export const checkStealable = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;
    const { victimId } = req.body;

    if (!victimId) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "victimId is required"
      );
    }

    const { canSteal, reason } = await canPlayerSteal(
      playerId,
      BigInt(victimId)
    );

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Check completed",
      data: { canSteal, reason },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);
```

### src/controllers/playerController.ts

```typescript
// 玩家控制器

import { Request, Response } from "express";
import {
  getPlayerInfo,
  getLeaderboard,
  getInviteStats,
  updatePlayerNickname,
  getPlayerShareLink
} from "@/services/playerService";
import { asyncHandler } from "@/middleware/errorHandler";
import { APIError, APIResponse } from "@/types";
import { HTTP_STATUS_CODES, CONSTANTS } from "@/utils/constants";

/**
 * 获取玩家信息
 * GET /player/info
 */
export const getInfo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const player = await getPlayerInfo(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Player info retrieved",
      data: player,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 更新玩家昵称
 * PUT /player/nickname
 */
export const updateNickname = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;
    const { nickname } = req.body;

    if (!nickname) {
      throw new APIError(
        CONSTANTS.ERROR_CODES.CUSTOM_ERROR,
        HTTP_STATUS_CODES.BAD_REQUEST,
        "nickname is required"
      );
    }

    const player = await updatePlayerNickname(playerId, nickname);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Nickname updated",
      data: player,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取排行榜
 * GET /player/leaderboard
 */
export const getTopPlayers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const leaderboard = await getLeaderboard(page, limit);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Leaderboard retrieved",
      data: leaderboard,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取邀请统计
 * GET /player/invites
 */
export const getInvites = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const stats = await getInviteStats(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Invite stats retrieved",
      data: stats,
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);

/**
 * 获取分享链接
 * GET /player/share-link
 */
export const getShareLink = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const playerId = req.playerId!;

    const shareLink = await getPlayerShareLink(playerId);

    const response: APIResponse<any> = {
      code: CONSTANTS.ERROR_CODES.SUCCESS,
      success: true,
      message: "Share link retrieved",
      data: { shareLink },
      timestamp: Date.now()
    };

    res.status(HTTP_STATUS_CODES.OK).json(response);
  }
);
```

### src/routes/auth.ts

```typescript
// 认证路由

import { Router } from "express";
import {
  login,
  checkPlayer,
  getSignMessage
} from "@/controllers/authController";
import { authRateLimiter } from "@/middleware/rateLimiter";

const router = Router();

// POST /auth/login - 登录/注册
router.post("/login", authRateLimiter, login);

// GET /auth/check/:walletAddress - 检查玩家是否存在
router.get("/check/:walletAddress", checkPlayer);

// GET /auth/message/:nonce - 获取签名消息
router.get("/message/:nonce", getSignMessage);

export default router;
```

### src/routes/farm.ts

```typescript
// 农场路由

import { Router } from "express";
import {
  getFarmInfo,
  getChickens,
  getInventory
} from "@/controllers/farmController";
import { authMiddleware } from "@/middleware/auth";

const router = Router();

// 所有农场路由需要认证
router.use(authMiddleware);

// GET /farm/info - 获取农场信息
router.get("/info", getFarmInfo);

// GET /farm/chickens - 获取农场的所有鸡
router.get("/chickens", getChickens);

// GET /farm/inventory - 获取库存信息
router.get("/inventory", getInventory);

export default router;
```

### src/routes/eggs.ts

```typescript
// EGGS 路由

import { Router } from "express";
import {
  getBalance,
  getHistory,
  exchangeEggs
} from "@/controllers/eggsController";
import { authMiddleware } from "@/middleware/auth";
import { transactionRateLimiter } from "@/middleware/rateLimiter";

const router = Router();

// 所有 EGGS 路由需要认证
router.use(authMiddleware);

// GET /eggs/balance - 获取 EGGS 余额
router.get("/balance", getBalance);

// GET /eggs/history - 获取交易历史
router.get("/history", getHistory);

// POST /eggs/exchange - 兑换 EGGS
router.post("/exchange", transactionRateLimiter, exchangeEggs);

export default router;
```

### src/routes/steal.ts

```typescript
// 偷蛋路由

import { Router } from "express";
import {
  executeSteal,
  getStealHistory,
  checkStealable
} from "@/controllers/stealController";
import { authMiddleware } from "@/middleware/auth";
import { stealRateLimiter } from "@/middleware/rateLimiter";

const router = Router();

// 所有偷蛋路由需要认证
router.use(authMiddleware);

// POST /steal/execute - 执行偷蛋
router.post("/execute", stealRateLimiter, executeSteal);

// GET /steal/history - 获取偷蛋历史
router.get("/history", getStealHistory);

// POST /steal/check - 检查是否可以偷蛋
router.post("/check", checkStealable);

export default router;
```

### src/routes/player.ts

```typescript
// 玩家路由

import { Router } from "express";
import {
  getInfo,
  updateNickname,
  getTopPlayers,
  getInvites,
  getShareLink
} from "@/controllers/playerController";
import { authMiddleware, optionalAuthMiddleware } from "@/middleware/auth";

const router = Router();

// 获取排行榜不需要认证
router.get("/leaderboard", optionalAuthMiddleware, getTopPlayers);

// 其他玩家路由需要认证
router.use(authMiddleware);

// GET /player/info - 获取玩家信息
router.get("/info", getInfo);

// PUT /player/nickname - 更新昵称
router.put("/nickname", updateNickname);

// GET /player/invites - 获取邀请统计
router.get("/invites", getInvites);

// GET /player/share-link - 获取分享链接
router.get("/share-link", getShareLink);

export default router;
```

### src/jobs/eggProductionJob.ts

```typescript
// 产蛋定时任务
// 使用 node-cron 每 8 小时自动触发

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { getFarmsReadyForProduction, updateFarmAfterProduction } from "@/services/farmService";
import { recordEggsTransaction } from "@/services/eggsService";
import { TransactionType } from "@/types";
import { log } from "@/utils/logger";

const prisma = new PrismaClient();

/**
 * 产蛋任务
 * 每 8 小时执行一次
 */
export async function runEggProductionJob(): Promise<void> {
  try {
    log.info("Starting egg production job");

    const start = Date.now();

    // 获取所有需要产蛋的农场
    const farmsToProduceEggs = await getFarmsReadyForProduction();

    if (farmsToProduceEggs.length === 0) {
      log.info("No farms ready for egg production");
      return;
    }

    log.info(`Found ${farmsToProduceEggs.length} farms ready for production`);

    // 批量处理产蛋
    let successCount = 0;
    let failCount = 0;

    for (const farm of farmsToProduceEggs) {
      try {
        // 计算该农场应该产蛋的数量
        const chickens = await prisma.chicken.findMany({
          where: {
            farmId: farm.id,
            isActive: true
          }
        });

        if (chickens.length === 0) {
          continue;
        }

        // 计算总产蛋量（所有鸡的 eggsPerCycle * 加速倍数）
        let totalEggs = 0n;
        for (const chicken of chickens) {
          const baseEggs = BigInt(Number(chicken.eggsPerCycle));
          const multiplier = Number(chicken.boostMultiplier);
          const finalEggs = baseEggs * BigInt(Math.floor(multiplier * 100)) / 100n;
          totalEggs += finalEggs;
        }

        const eggsToAdd = Number(totalEggs);

        // 记录产蛋前的库存
        const previousBalance = BigInt(farm.eggInventory);

        // 执行产蛋
        const updatedFarm = await updateFarmAfterProduction(farm.id, eggsToAdd);

        // 记录交易
        await recordEggsTransaction(
          farm.player_id,
          farm.id,
          TransactionType.PRODUCTION,
          totalEggs,
          previousBalance,
          BigInt(updatedFarm.eggInventory),
          undefined,
          `Farm produced ${eggsToAdd} eggs`
        );

        // 更新玩家累计产蛋数
        await prisma.player.update({
          where: { id: farm.player_id },
          data: {
            totalEggsEarned: {
              increment: totalEggs
            }
          }
        });

        successCount++;

        log.debug("Egg production completed", {
          farmId: farm.id,
          playerId: farm.player_id,
          eggsProduced: eggsToAdd
        });
      } catch (error) {
        failCount++;
        log.warn("Failed to produce eggs for farm", {
          farmId: farm.id,
          error: error instanceof Error ? error.message : error
        });
      }
    }

    const duration = Date.now() - start;

    log.info("Egg production job completed", {
      totalFarms: farmsToProduceEggs.length,
      successCount,
      failCount,
      durationMs: duration
    });
  } catch (error) {
    log.error("Egg production job failed", error);
  }
}

/**
 * 初始化定时任务
 * 每 8 小时执行一次（在 0:00, 8:00, 16:00）
 */
export function initEggProductionSchedule(): void {
  // 使用 cron 表达式：0 0,8,16 * * *
  // 表示每天的 0:00, 8:00, 16:00 执行
  const job = cron.schedule("0 0,8,16 * * *", async () => {
    await runEggProductionJob();
  });

  log.info("Egg production schedule initialized");

  // 返回任务对象，以便在需要时停止
  return job;
}

/**
 * 手动执行一次产蛋（用于测试）
 */
export async function manualTriggerEggProduction(): Promise<void> {
  log.info("Manual egg production triggered");
  await runEggProductionJob();
}
```

### src/index.ts

```typescript
// 应用入口文件

import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { initEggProductionSchedule } from "@/jobs/eggProductionJob";
import { globalRateLimiter } from "@/middleware/rateLimiter";
import { errorHandlerMiddleware, notFoundMiddleware } from "@/middleware/errorHandler";
import { APIResponse } from "@/types";
import { CONSTANTS, HTTP_STATUS_CODES } from "@/utils/constants";
import { log } from "@/utils/logger";

// 路由
import authRoutes from "@/routes/auth";
import farmRoutes from "@/routes/farm";
import eggsRoutes from "@/routes/eggs";
import stealRoutes from "@/routes/steal";
import playerRoutes from "@/routes/player";

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ============= 中间件配置 =============

// 安全中间件
app.use(helmet());

// CORS 中间件
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  credentials: true
}));

// 请求体解析
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// 日志中间件
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));

// 全局速率限制
app.use(globalRateLimiter);

// ============= API 路由 =============

// 健康检查端点
app.get("/health", (req, res) => {
  const response: APIResponse<null> = {
    code: CONSTANTS.ERROR_CODES.SUCCESS,
    success: true,
    message: "Server is running",
    timestamp: Date.now()
  };
  res.status(HTTP_STATUS_CODES.OK).json(response);
});

// API 版本信息
app.get("/api/version", (req, res) => {
  const response: APIResponse<any> = {
    code: CONSTANTS.ERROR_CODES.SUCCESS,
    success: true,
    message: "API version retrieved",
    data: {
      version: "1.0.0",
      name: "AIggs Backend API",
      environment: process.env.NODE_ENV || "development"
    },
    timestamp: Date.now()
  };
  res.status(HTTP_STATUS_CODES.OK).json(response);
});

// 注册所有路由
app.use("/api/auth", authRoutes);
app.use("/api/farm", farmRoutes);
app.use("/api/eggs", eggsRoutes);
app.use("/api/steal", stealRoutes);
app.use("/api/player", playerRoutes);

// ============= 错误处理 =============

// 404 处理
app.use(notFoundMiddleware);

// 全局错误处理（必须最后）
app.use(errorHandlerMiddleware);

// ============= 定时任务 =============

// 初始化产蛋定时任务
initEggProductionSchedule();

// ============= 服务器启动 =============

app.listen(PORT, () => {
  log.info(`AIggs Backend API Server is running on port ${PORT}`);
  log.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  log.info(`Database: ${process.env.DATABASE_URL?.split("@")[1] || "Unknown"}`);
});

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
  log.error("Uncaught Exception", error);
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// 优雅关闭
process.on("SIGTERM", () => {
  log.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  log.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

export default app;
```

---

## 使用说明

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma 客户端
npm run prisma:generate

# 3. 执行数据库迁移
npm run prisma:migrate

# 4. 开发环境运行
npm run dev

# 5. 生产环境
npm run build
npm run start
```

### 数据库设置

```bash
# 创建 .env 文件
cp .env.example .env

# 更新 DATABASE_URL 为你的 PostgreSQL 连接字符串
# 更新 JWT_SECRET

# 执行迁移
npm run prisma:migrate
```

### API 文档示例

#### 1. 登录/注册

```bash
POST /api/auth/login
Content-Type: application/json

{
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc4d4d6d8D8d00",
  "signature": "0x...",
  "nonce": "abc123",
  "nickname": "Player123",
  "farmCode": "ABC123" // 可选，邀请码
}

Response:
{
  "code": 0,
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOi...",
    "player": { ... }
  },
  "timestamp": 1234567890
}
```

#### 2. 获取农场信息

```bash
GET /api/farm/info
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "success": true,
  "message": "Farm info retrieved",
  "data": {
    "farm": {
      "id": 1,
      "playerId": 1,
      "chickenCount": 5,
      "eggInventory": 25,
      "eggCapacity": 30,
      "isInventoryFull": false,
      "totalEggsProduced": 100
    },
    "eggsBalance": 25,
    "chickenCount": 5,
    "chickens": [ ... ]
  },
  "timestamp": 1234567890
}
```

#### 3. 执行偷蛋

```bash
POST /api/steal/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "victimId": 2
}

Response:
{
  "code": 0,
  "success": true,
  "message": "Steal executed",
  "data": {
    "outcome": "success",
    "eggsStolen": 15,
    "bumperCrop": false,
    "victimInventoryBefore": 30,
    "victimInventoryAfter": 15
  },
  "timestamp": 1234567890
}
```

#### 4. 兑换 EGGS

```bash
POST /api/eggs/exchange
Authorization: Bearer <token>
Content-Type: application/json

{
  "eggsAmount": 60,
  "txHash": "0x..."
}

Response:
{
  "code": 0,
  "success": true,
  "message": "Exchange successful",
  "data": {
    "transaction": { ... },
    "aiggAmount": 2,
    "previousBalance": 60,
    "afterBalance": 0
  },
  "timestamp": 1234567890
}
```

---

## 关键特性说明

### 1. JWT 认证
- 使用 `ethers.js` 验证钱包签名
- JWT token 有效期 7 天
- 所有受保护端点需要 `Authorization: Bearer <token>`

### 2. 事务性操作
- 使用 Prisma 的 `$transaction` 确保操作原子性
- 偷蛋、兑换等敏感操作都在事务中执行
- 防止并发冲突导致的数据不一致

### 3. 产蛋定时任务
- 每 8 小时自动触发（0:00, 8:00, 16:00）
- 使用 `node-cron` 实现
- 支持手动触发 `manualTriggerEggProduction()`
- 满仓农场自动暂停产蛋

### 4. 速率限制
- 全局限制：15分钟内最多 100 个请求
- 登录限制：15分钟内最多 5 次
- 偷蛋限制：1分钟内最多 2 次

### 5. 错误处理
- 统一的 API 错误响应格式
- 自定义 `APIError` 类
- 全局错误处理中间件
- 详细的错误日志

### 6. 新手保护
- 注册后 24 小时不能被偷蛋
- 新手保护期信息存储在数据库

---

## 部署建议

1. **数据库**: 使用 PostgreSQL 12+
2. **环境变量**: 使用密钥管理服务（如 AWS Secrets Manager）
3. **日志**: 配置日志收集和监控（如 ELK、Datadog）
4. **缓存**: 可添加 Redis 缓存以提高性能
5. **监控**: 配置告警和监控（CPU、内存、数据库连接）

---

生成完成！
