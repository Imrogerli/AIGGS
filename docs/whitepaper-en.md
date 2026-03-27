# AIggs Whitepaper

## The First AI-Native Onchain Chicken Farm

**Version 1.0 · March 2026**
**aiggs.xyz · Base · $AIGG**

---

> *"Every egg costs something to produce. Every token is backed by real eggs. Zero air, zero rug."*

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [The Problem](#2-the-problem)
3. [The AIggs Solution](#3-the-aiggs-solution)
4. [Core Mechanics](#4-core-mechanics)
5. [Steal Mechanics & Game Theory](#5-steal-mechanics--game-theory)
6. [Token Economics](#6-token-economics)
7. [Supplier Network & Real-World Assets](#7-supplier-network--real-world-assets)
8. [AI-Native Architecture](#8-ai-native-architecture)
9. [Technical Stack](#9-technical-stack)
10. [Roadmap](#10-roadmap)
11. [Risk Factors](#11-risk-factors)
12. [Conclusion](#12-conclusion)

---

## 1. Abstract

AIggs is the first blockchain game designed to be played entirely through AI tools. Players never open an app or visit a website — their AI assistant (Claude, GPT, or any MCP-compatible tool) joins the farm, checks production, executes raids, and manages token conversions on their behalf.

The game is simple: hens produce EGGS automatically every 8 hours. EGGS convert to `$AIGG` on Base. `$AIGG` redeems for real eggs through a global supplier network — or trades on open markets.

Three properties make AIggs structurally different from prior blockchain games:

1. **AI-native distribution.** The game is accessed through AI tool ecosystems, not app stores. The addressable distribution channel is every Claude and ChatGPT user globally.
2. **Real-world value anchoring.** `$AIGG` has a hard price floor enforced by physical egg redemption. As long as eggs have market value, `$AIGG` cannot reach zero.
3. **Protocol-owned liquidity.** 60% of all fiat revenue is deployed as permanent liquidity. LP tokens are burned to `0x000...`. The treasury cannot drain.

---

## 2. The Problem

### 2.1 Blockchain Games Have a Trust Deficit

The play-to-earn cycle of 2021–2022 left a structural scar on Web3 gaming. The pattern was consistent: token launches with no real demand, treasury controlled by founders, liquidity withdrawn at peak, community left holding worthless assets.

The result: experienced Web3 users now treat any "play-to-earn" claim as a red flag. Rebuilding trust requires not just better promises, but different architecture.

### 2.2 AI Tools Have No Economic Layer

Hundreds of millions of people interact with AI tools daily — writing, coding, researching. These interactions generate no persistent economic value for the user. The AI executes tasks and the session ends.

There is no mechanism for an AI tool to manage ongoing assets, participate in markets, or generate returns across sessions. Users extract utility; they don't accumulate value.

### 2.3 Real-World Asset Games Don't Exist at Consumer Scale

"RWA" (real-world assets) is a dominant narrative in DeFi, but existing implementations target institutional capital: tokenized treasuries, real estate, commodities funds. No consumer product has successfully bridged a digital game economy to physical goods redemption at scale.

The addressable market is enormous. Global egg consumption exceeds $320 billion annually. A tokenized layer connecting digital game activity to this supply chain has never been built.

---

## 3. The AIggs Solution

AIggs addresses all three problems simultaneously through a single integrated design:

| Problem | AIggs Solution |
|---|---|
| Trust deficit in blockchain games | Protocol-owned permanent liquidity; immutable contracts; no team wallet control |
| AI tools have no economic layer | Farm state persists across AI sessions; AI agent manages real on-chain assets |
| RWA games don't exist at consumer scale | Supplier network enables physical egg redemption; price floor enforced by arbitrage |

### 3.1 One-Sentence Summary

> **养鸡产蛋，偷蛋致富，蛋可换钱。**
> *Farm eggs. Steal eggs. Redeem for real.*

### 3.2 The Core Loop

```
Join via AI Tool
      ↓
Hen produces EGGS (every 8h, server-side)
      ↓
EGGS accumulate in warehouse
      ↓
Convert EGGS → $AIGG (30:1 base rate)
      ↓
$AIGG → Real eggs via suppliers  OR  Trade on market
      ↓
Steal from neighbours → more EGGS → repeat
```

---

## 4. Core Mechanics

### 4.1 Farm & Production

Every new player receives one free hen upon registration. No wallet required to start.

| Parameter | Value | Notes |
|---|---|---|
| Initial hens | 1 (free) | No wallet, no payment required |
| Production rate | 1 EGGS / 8h per hen | 3 EGGS per hen per day |
| Hen lifespan | 30 days | Must be replaced to maintain output |
| Warehouse capacity | 30 EGGS (initial) | Expands with upgrades |
| Warehouse overflow | Production pauses | EGGS never destroyed |
| Daily exchange cap | 2 `$AIGG` (initial) | Scales with account level |

**Design principle — warehouse overflow vs. burn:**
When a warehouse is full, production pauses rather than destroying eggs. This creates a "come back and harvest" pull behaviour rather than punishing absent players. The psychological framing — *"I need to collect my eggs"* versus *"my eggs rotted"* — is materially different and drives healthier retention patterns.

### 4.2 Farm Identity: The Farm Code System

Each player receives a unique farm code upon registration (e.g., `farm-x7k2-9p3m`). This code is stored in the AI tool's memory and auto-attached to every subsequent command.

```
User → AI Tool:  "Join AIggs"
AI Tool → API:   POST /join
API → AI Tool:   { farm_code: "farm-x7k2-9p3m", name: "Dawn Farm" }
AI Tool → User:  "Your farm is ready. Farm code saved."
```

From this point forward, the user never manages a private key, wallet address, or login credential to play. The AI handles all identity resolution.

High-value operations (converting to `$AIGG`, physical redemption) require an additional phone number verification step, introduced at Week 3 of the launch roadmap.

### 4.3 Morning Report

Every day, the AI tool delivers a structured morning report:

```
🌅 Dawn Farm · Day 14
──────────────────────
Yesterday's harvest:    +3 EGGS (1 hen × 3 cycles)
⚠  Stolen overnight:   -6 EGGS (Night Farm · 22:47)
Current balance:        24 / 30 EGGS
Today's rate:           30 EGGS = 1 $AIGG
$AIGG reference price:  $0.10 U
──────────────────────
Unlock progress: [████████░░] 24/30 → Steal access
```

The morning report is the primary retention surface. The inclusion of specific theft details — farm name, timestamp, amount — is intentional. Named opponents with timestamps generate concrete emotional responses (rivalry, motivation to retaliate) that abstract loss notifications do not.

---

## 5. Steal Mechanics & Game Theory

Stealing is the social engine of AIggs. It converts a passive idle game into an active competitive one and is the primary driver of daily retention.

### 5.1 Basic Rules

| Rule | Value |
|---|---|
| Daily steal attempts | 2 per player |
| New player protection | 24 hours post-registration |
| Minimum target balance | 15 EGGS (below this: protected) |
| Same-target cooldown | 24 hours after successful steal |
| Failure penalty | None — failed attempts only cost the attempt |

### 5.2 Outcome Distribution

| Result | Probability | Outcome | Player Effect |
|---|---|---|---|
| 🎉 Big Haul | 15% | Steal 20–25% of target warehouse | Excitement; share-worthy |
| ✅ Success | 45% | Steal 10–15% of target warehouse | Satisfaction; continue playing |
| 😅 Empty Hands | 40% | Nothing stolen; target unaware | Mild disappointment; retry |

The 40% empty-hand rate is deliberately high. A lower failure rate would make stealing feel mechanical; a higher rate would discourage attempts. The asymmetric information (target doesn't know about failed attempts) reduces griefing dynamics.

### 5.3 Rival System

When two players steal from each other three or more times, the system automatically tags them as **Rivals**. Rival status is:

- Permanent (cannot be cleared)
- Visible in both players' morning reports
- A named reference in daily AI briefings: *"Your rival Night Farm last raided you 18 hours ago."*

Rivalries are the social graph of AIggs. They create persistent reasons to return — not to complete a quest, but to settle a score.

### 5.4 Retention Model

The steal mechanic is engineered around one observation: **getting robbed creates emotion; emotion drives return visits.**

The causal chain:

```
Player is robbed overnight
        ↓
Morning report: specific thief name + time + amount
        ↓
Emotional response (frustration, competitive drive)
        ↓
Player logs in to retaliate or defend
        ↓
Engagement event recorded
```

Internal target: >50% of robbed players return within the same day. This metric is the primary Week 3–4 validation gate.

---

## 6. Token Economics

### 6.1 The Two-Asset System

AIggs operates two distinct assets:

| Asset | Type | Location | Function |
|---|---|---|---|
| EGGS | Off-chain points | Game server | In-game currency; non-transferable |
| `$AIGG` | ERC-20 token | Base | On-chain value; tradeable; redeemable |

EGGS are not a token. They cannot be transferred between wallets or traded externally. This separation eliminates the early liquidity attack vector common in P2E games and ensures `$AIGG` scarcity is preserved.

### 6.2 EGGS Flow

**Sources:**

| Source | Rate | Notes |
|---|---|---|
| Hen production | 3 EGGS/day (base) | Server-side; no user action required |
| Daily check-in bonus | +1 EGGS | First query of the day |
| Referral income | 10% of referee's production | Permanent; introduced Week 5 |
| Successful steal | Variable | Attacker gain = defender loss |

**Sinks:**

| Consumption | Cost | Notes |
|---|---|---|
| Convert to `$AIGG` | 30 EGGS = 1 `$AIGG` | Primary exit |
| Hatch new hen | 6 EGGS/hen | Expand production capacity |
| Purchase guard (basic) | 5 EGGS/day | Introduced Week 5 |

### 6.3 `$AIGG` Supply & Distribution

**Total Supply: 1,000,000,000 `$AIGG`**

| Allocation | % | Amount | Vesting |
|---|---|---|---|
| Players (farm-to-earn) | 75% | 750,000,000 | Earned through gameplay |
| Team | 20% | 200,000,000 | 2yr lock; quarterly vest |
| Airdrop (first 10k users) | 5% | 50,000,000 | TGE unlock |

### 6.4 Revenue Distribution

All fiat and crypto purchases flow through a fixed on-chain split. The contract is immutable after deployment.

```
User Payment (fiat or crypto)
         │
    ┌────┴────┐
   60%       40%
Permanent    Treasury
Liquidity        │
    │       ┌───┴───────┐
50% $AIGG  45% Ops    30% Reserve Fund
+ 50% USDT  15% Ecosystem
→ LP Token  10% Team
→ Burned to
  0x000...
```

**The 60% permanent liquidity rule** is the core trust mechanism. Every purchase deepens the `$AIGG/USDC` liquidity pool permanently. LP tokens are sent to the burn address at transaction time. No team member, governance vote, or emergency mechanism can retrieve them.

### 6.5 Price Floor Mechanics

`$AIGG` has a soft price floor anchored to physical egg redemption value:

> **1 `$AIGG` ≈ 10 real eggs**

This floor is not enforced by the team — it is enforced by arbitrage. If `$AIGG` trades below its redemption value, any holder can profitably redeem tokens for eggs and sell the eggs at market rates. This self-correcting mechanism operates automatically and requires no team intervention.

Additional deflationary pressure comes from:

- **Item purchases:** Every in-game purchase (hens, guards, upgrades) burns `$AIGG` permanently
- **Liquidity lock:** 60% of fiat revenue continuously buys and locks `$AIGG`
- **Supply cap:** Fixed 1B supply; no mint function after TGE

### 6.6 Exchange Rate Mechanics

| Phase | Rate | Mechanism |
|---|---|---|
| Week 1–6 | 30 EGGS = 1 `$AIGG` (fixed) | Simple; easy to communicate |
| Week 7+ | Dynamic (±10 EGGS/day max) | Supply/demand ratio driven |

The daily rate is published in every player's morning report, enabling players to plan conversions around favourable rate windows. Rate history will be available on-chain after the Web dashboard launches.

---

## 7. Supplier Network & Real-World Assets

The supplier network is what separates `$AIGG` from every prior blockchain game token. It creates persistent real-world demand that is independent of speculative activity.

### 7.1 How It Works

Suppliers stake `$AIGG` to join the network. Players who wish to redeem tokens submit orders. Suppliers fulfil orders (physical egg delivery) and earn fees. The protocol coordinates matching and dispute resolution.

### 7.2 Supplier Tiers

| Tier | Stake Required | Fee Rate | Access |
|---|---|---|---|
| Entry | 500 `$AIGG` | 8% | Local fulfilment |
| Standard | 2,000 `$AIGG` | 6% | Regional fulfilment |
| Certified | 8,000 `$AIGG` | 5% | National fulfilment |
| Flagship | 30,000 `$AIGG` | 4% | Brand partnership eligible |

Staked `$AIGG` is locked for the duration of supplier participation. This creates substantial structural demand for the token that scales with network growth.

### 7.3 Brand Partnership Roadmap

| Phase | Timeline | Target Partners |
|---|---|---|
| Validation | Month 1–3 | Regional artisan egg brands; first redemptions |
| Expansion | Month 4–6 | Viral food brands; limited-edition collabs |
| Scale | Month 7–12 | Chain restaurant partners; national coverage |
| Mass market | Year 1+ | QSR giants; Golden Egg Festival activations |

The long-term vision is a brand partnership layer where `$AIGG` becomes a loyalty currency redeemable across a food ecosystem — beginning with eggs and expanding to proteins, restaurants, and food delivery.

---

## 8. AI-Native Architecture

### 8.1 Why AI-Native Matters

Most blockchain games treat AI as a feature — a chatbot for support, or generative content for assets. AIggs inverts this relationship: **the AI tool is the primary interface.** The game was designed from the ground up to be played through conversational AI.

This creates a distribution advantage that is structurally difficult to replicate. AIggs does not compete for app store placement or ad inventory. It spreads through AI tool ecosystems — skills, MCP servers, and system prompt adoption.

### 8.2 MCP Integration

AIggs ships as a native MCP (Model Context Protocol) server. Any MCP-compatible AI tool can install the AIggs server and immediately gain access to all game functions as native tools:

```json
{
  "tools": [
    "aiggs_join",
    "aiggs_status",
    "aiggs_morning_report",
    "aiggs_steal",
    "aiggs_convert",
    "aiggs_neighbors"
  ]
}
```

Once installed, the AI tool automatically:
- Persists the farm code across sessions
- Delivers morning reports proactively
- Suggests steal opportunities when optimal
- Alerts when warehouse approaches capacity

### 8.3 Multi-Platform Compatibility

| Platform | Integration Method | Farm Persistence |
|---|---|---|
| Claude (Anthropic) | Cowork Skill / MCP Server | Saved in skill config |
| ChatGPT (OpenAI) | Custom GPT + Actions | Saved in GPT memory |
| 文心一言 (Baidu) | Plugin API | Server-side by phone |
| Any MCP client | Native MCP Server | MCP config file |

Different AI platforms maintain independent farms. One user on Claude and the same user on ChatGPT operate separate farms, each earning independently.

### 8.4 The Agent Economy Thesis

AIggs is an early instantiation of a broader shift: **AI agents managing real economic assets on behalf of users.**

Today: AI tools execute tasks (write, code, search).
Near future: AI tools maintain persistent assets (farms, portfolios, positions).
AIggs: First consumer product where your AI agent owns and grows an on-chain asset.

---

## 9. Technical Stack

All technology choices prioritise speed-to-market over architectural elegance. The principle: use the most boring tools that work.

| Layer | Technology | Rationale |
|---|---|---|
| Backend API | Node.js + Express | Fast prototype; large ecosystem |
| Database | PostgreSQL (Supabase) | Managed hosting; free tier covers 1k users |
| Scheduled tasks | Supabase Edge Functions | No self-managed scheduler needed |
| Smart contracts | Solidity → Base | EVM-compatible; sub-cent gas fees |
| Contract interaction | ethers.js / viem | Industry standard; complete docs |
| Push notifications | Telegram Bot API | Fastest path to proactive AI→user push |
| Error monitoring | Sentry | Free tier; zero config |
| Metrics | Grafana | Free tier; sufficient for MVP |

**MVP infrastructure cost: $0–50/month** (Supabase + Vercel free tiers cover the first 1,000 users)

### 9.1 Smart Contract Properties

- Deployed on Base (Coinbase L2): EVM-compatible, gas < $0.01/tx
- Liquidity pool: `$AIGG/USDC` on Uniswap V3 (Base)
- LP tokens sent to `0x0000000000000000000000000000000000000000` at creation
- No admin keys, no pause function, no upgrade proxy after TGE
- Revenue split executed on-chain at point of payment

---

## 10. Roadmap

### Phase 1 — Core Loop (Week 1–4)

| Week | Milestone | Validation Gate |
|---|---|---|
| 1–2 | Production live · EGGS → `$AIGG` conversion · Farm code system | 10 internal users; all see EGGS growing; 1 successful conversion |
| 3–4 | Steal mechanic · Phone verification · Morning report v2 | Robbed-player same-day return rate > 50% |

### Phase 2 — Growth Layer (Week 5–8)

| Week | Milestone | Validation Gate |
|---|---|---|
| 5–6 | Buy hens · Guard dog defence · Referral system · `$AIGG` mainnet | 5 users buy 2nd hen; 3 users refer a friend |
| 7–8 | Coop upgrades · Dynamic exchange rate · Batch conversion | Daily report open rate > 55%; 2 coop upgrades completed |

### Phase 3 — Social & Viral (Week 9–12)

| Week | Milestone | Validation Gate |
|---|---|---|
| 9–10 | Scout system · Rival tags · Leaderboard · Extended guard options | Weekly DAU +15% post-leaderboard launch |
| 11–12 | Premium hens · Server-wide events · Share cards | 1,000+ registered users; 7-day retention > 35%; 100 referred via share card |

### Phase 4 — Ecosystem (Month 4+)

| Milestone | Target |
|---|---|
| Supplier network launch | First physical redemptions completed |
| 10,000 registered users | Monthly active rate > 50% |
| `$AIGG` price stabilisation | Price supported by redemption arbitrage |
| Brand partnership (Tier 1) | First named food brand integration |

### Scale Targets

| Milestone | Timeline | Key Metric |
|---|---|---|
| Internal test | Week 2 | 10 users, all EGGS growing |
| Public launch | Week 4 | 100 users, steal live |
| Retention validated | Week 8 | 500 users, 7-day retention > 40% |
| Viral loop active | Week 12 | 1,000–3,000 users, K-factor > 0.3 |
| Supplier live | Month 4 | 10,000 users, first redemptions |

---

## 11. Risk Factors

AIggs discloses the following material risks. This section is not exhaustive.

### 11.1 Platform Dependency Risk (High)

The AI-native distribution model depends on policies of third-party AI platforms (Anthropic, OpenAI, Baidu). These platforms may at any time modify API access terms, restrict game-type integrations, or disable memory persistence features.

**Mitigation:** Telegram Bot as a platform-independent fallback channel; Web interface planned for Month 4+; MCP server protocol is open standard and not controlled by any single vendor.

### 11.2 Token Value Risk (Medium)

`$AIGG` price is subject to market forces. The physical redemption floor provides a soft lower bound, but speculative activity may cause prices to trade below fundamental value during market downturns.

**Mitigation:** 60% permanent LP prevents liquidity withdrawal; fixed supply cap prevents dilution; real-world demand grows proportionally with supplier network.

### 11.3 Anti-Cheat / Sybil Risk (Medium)

The low barrier to creating farms (no wallet required initially) may enable one user to operate multiple farms for outsized EGGS accumulation. Phone number verification (Week 3) adds friction but does not eliminate this risk entirely.

**Mitigation:** Rate limits on conversions; on-chain analytics to detect abnormal accumulation patterns; escalating KYC requirements at high conversion volumes.

### 11.4 Regulatory Risk (High)

The EGGS → `$AIGG` → fiat pathway may constitute a virtual currency exchange in certain jurisdictions. Compliance status varies by country. Players and investors should consult local legal advice.

**Mitigation:** Geo-restrictions enforced at the API layer for jurisdictions with explicit prohibitions; legal counsel engaged prior to mainnet launch.

### 11.5 Supplier Network Execution Risk (High)

The physical egg redemption mechanism requires a functioning supplier network. Supplier onboarding, fulfilment quality, and logistics vary significantly by geography.

**Mitigation:** Supplier staking requirement ensures skin-in-the-game; phased rollout by region; fulfilment disputes handled by protocol escrow.

---

## 12. Conclusion

AIggs is not a blockchain game with AI features. It is an AI-native economic protocol with a game as its interface.

The game solves the distribution problem of blockchain: it spreads through AI tool ecosystems that already have hundreds of millions of users. It solves the trust problem of P2E: permanent protocol-owned liquidity that no team can touch. It solves the value problem of crypto games: tokens redeemable for a physical commodity with $320B annual global demand.

The mechanics — hens, eggs, stealing, rivals — are deliberately simple. Simplicity is not a constraint; it is the feature. Every element of the design passes one test: *can you explain it in one sentence?*

> **Raise chickens. Steal eggs. Cash out in real eggs or crypto.**

That is the whole game. The rest is architecture.

---

## Appendix A — Key Metrics Reference

| Metric | Definition | Healthy | Intervention Required |
|---|---|---|---|
| Daily report open rate | Users querying report / total registered | > 50% | < 30% |
| Day-1 retention | Users active on Day 2 / Day 1 registrations | > 60% | < 40% |
| Robbed return rate | Robbed users returning same day | > 50% | < 30% |
| Weekly pay conversion | Users spending `$AIGG` at least once / week | > 5% | < 2% |

## Appendix B — Glossary

| Term | Definition |
|---|---|
| EGGS | Off-chain game points; non-transferable; produced by hens |
| `$AIGG` | ERC-20 token on Base; tradeable; redeemable for real eggs |
| Farm Code | Unique player identifier (e.g., `farm-x7k2-9p3m`); stored in AI tool memory |
| Permanent LP | Liquidity pool tokens burned to zero address; cannot be retrieved |
| Morning Report | Daily AI-delivered farm summary; primary retention surface |
| Rival | Auto-assigned when two players steal from each other 3+ times |
| MCP | Model Context Protocol; open standard for AI tool integrations |
| Supplier | Entity staking `$AIGG` to fulfil physical egg redemption orders |
| Warehouse Cap | Maximum EGGS storable; production pauses (not burns) at cap |

---

*AIggs Whitepaper v1.0 · aiggs.xyz*
*This document is for informational purposes only and does not constitute financial advice or an offer of securities.*
