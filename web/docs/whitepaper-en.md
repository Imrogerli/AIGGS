# AIggs Whitepaper

## The First AI-Native Onchain Game Operating System

**Version 2.0 · March 2026**
**aiggs.xyz · Base · $AIGG**

---

> *"The first onchain game fully operated by AI — from gameplay to governance, from distribution to decision-making."*

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Background & Opportunity](#2-background--opportunity)
3. [The AIggs Solution](#3-the-aiggs-solution)
4. [Core Mechanics](#4-core-mechanics)
5. [Steal Mechanics & Game Theory](#5-steal-mechanics--game-theory)
6. [Token Economics](#6-token-economics)
7. [AI-Native Architecture](#7-ai-native-architecture)
8. [Roadmap](#8-roadmap)
9. [Conclusion](#9-conclusion)

---

## 1. Abstract

AIggs is the first truly AI-native onchain game. "AI-native" here means more than playing through AI tools — it means the game's distribution, operations, balance tuning, community governance, and product decisions are all AI-led.

The game is simple: hens produce EGGS automatically every 8 hours. EGGS convert to `$AIGG` on Base, which trades on open markets. Players can steal from neighbours to accelerate accumulation, or defend their warehouse.

Three properties make AIggs structurally distinct:

1. **Game as Skill.** AIggs is distributed as an AI tool capability package. Users start with a single sentence to their AI — no app, no signup, no learning curve. The addressable channel is every Claude and ChatGPT user globally.
2. **AI Game Operating System.** Three specialised AI Agents — Design AI, Operations AI, and Decision AI — manage game balance, user operations, and product iteration respectively, coordinated by a Meta-AI Director. Human oversight is preserved at minimum viable scope: circuit-breaker approvals and compliance boundaries only.
3. **Protocol-owned permanent liquidity.** 60% of all revenue is deployed as permanent liquidity. LP tokens are burned to the zero address. No one — including the team — can retrieve them.

AIggs keeps its game mechanics deliberately simple. Simplicity is not a constraint — it is a core structural advantage. It makes the AI governance reward function clear and quantifiable: retention rate, production volume, steal engagement, token conversion rate. This makes AIggs the first consumer-scale onchain product that can be genuinely handed to AI for complete operations.

---

## 2. Background & Opportunity

### 2.1 Blockchain Games Need a New Trust Architecture

The first wave of Web3 gaming validated a core thesis: players are willing to pay for on-chain assets and accumulate real value through gameplay. Early designs, however, conflated token economics with liquidity control — teams could withdraw liquidity at any moment, with no structural check.

A truly sustainable on-chain game requires three things: a liquidity structure that no one can manipulate, token demand driven by player behaviour rather than speculation, and a user experience that removes all technical barriers. AIggs is designed to satisfy all three.

### 2.2 AI Tools Are Ready for an Economic Layer

Hundreds of millions of people interact with AI tools daily. These interactions generate no persistent economic accumulation. Every session ends and nothing carries forward.

AI tools have unprecedented engagement and frequency, yet no capability to manage persistent assets across sessions. This is a structural gap — AIggs fills it by embedding game state into AI tool memory, letting users naturally accumulate on-chain value through daily AI usage.

### 2.3 The AI Revolution in Game Operations Hasn't Happened Yet

The games industry spends enormous human resources on operations, content updates, user service, and balance tuning. The majority of this work is fundamentally data-driven decision-making — analyse player behaviour, identify anomalies, adjust parameters, produce content.

AI already has the capability to take over these functions. But no consumer game product has built this operating architecture. AIggs will be the first.

---

## 3. The AIggs Solution

| Challenge | AIggs Solution |
|---|---|
| Blockchain games need a new trust architecture | Protocol-owned permanent liquidity; immutable contracts; on-chain event sourcing |
| AI tools have no economic layer | Farm state persists across sessions; AI Agent manages on-chain assets |
| Traditional game distribution is inefficient | Game distributed as a Skill; spreads through AI tool ecosystems |
| Game operations require large human teams | Multi-Agent system handles design, operations, and decisions; human oversight minimised |

### 3.1 One-Sentence Summary

> **养鸡产蛋，偷蛋致富，$AIGG 换真蛋。**
> *Raise chickens. Steal eggs. Cash out in $AIGG.*

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
$AIGG trades on open market
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

When a warehouse is full, production pauses rather than destroying eggs — creating pull-back behaviour rather than punishing absent players.

### 4.2 Farm Identity: The Farm Code System

Each player receives a unique farm code upon registration (e.g., `farm-x7k2-9p3m`). The AI tool stores this in memory and attaches it automatically to every subsequent command.

```
User → AI Tool:  "Join AIggs"
AI Tool → API:   POST /join
API → AI Tool:   { farm_code: "farm-x7k2-9p3m", name: "Dawn Farm" }
AI Tool → User:  "Your farm is ready. Farm code saved."
```

The user never manages a private key, wallet address, or login credential. The AI handles all identity resolution. High-value operations (converting to `$AIGG`) require phone number verification.

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

Specific theft details — farm name, timestamp, amount — create concrete competitive relationships and reasons to return.

---

## 5. Steal Mechanics & Game Theory

Stealing is the social engine of AIggs, converting a passive idle game into an active competitive one.

### 5.1 Basic Rules

| Rule | Value |
|---|---|
| Daily steal attempts | 2 per player |
| Steal attempt cost | 3 EGGS (win or lose) |
| New player protection | 24 hours post-registration |
| Minimum target balance | 15 EGGS (below this: protected) |
| Same-target cooldown | 24 hours after successful steal |

Stealing costs EGGS regardless of outcome, making every raid a genuine strategic decision. Failed attempts are invisible to the target, maintaining game tension while preventing griefing.

### 5.2 Outcome Distribution

| Result | Probability | Outcome |
|---|---|---|
| 🎉 Big Haul | 20% | Steal 20–25% of target warehouse |
| ✅ Success | 55% | Steal 10–15% of target warehouse |
| 😅 Empty Hands | 25% | Nothing stolen; target unaware |

---

## 6. Token Economics

### 6.1 The Two-Asset System

| Asset | Type | Location | Function |
|---|---|---|---|
| EGGS | Off-chain points | Game server | In-game currency; non-transferable |
| `$AIGG` | ERC-20 token | Base | On-chain value; tradeable |

EGGS cannot be transferred between wallets or traded externally. This separation eliminates early liquidity attack vectors and preserves `$AIGG` scarcity.

### 6.2 EGGS Flow

**Sources:**

| Source | Rate |
|---|---|
| Hen production | 3 EGGS/day (base) |
| Daily check-in bonus | +1 EGGS |
| Referral income | 10% of referee's production (permanent) |
| Successful steal | Attacker gain = defender loss |

**Sinks:**

| Consumption | Cost |
|---|---|
| Convert to `$AIGG` | 30 EGGS = 1 `$AIGG` |
| Hatch new hen | 6 EGGS/hen |
| Steal attempt | 3 EGGS/attempt (win or lose) |
| Purchase guard | 5 EGGS/day |

### 6.3 `$AIGG` Supply & Distribution

**Total Supply: 1,000,000,000 `$AIGG`**

| Allocation | % | Amount | Vesting |
|---|---|---|---|
| Players (farm-to-earn) | 75% | 750,000,000 | Earned through gameplay |
| Ecosystem & Community | 10% | 100,000,000 | Released by milestone |
| Team | 10% | 100,000,000 | 2yr lock; quarterly vest |
| Airdrop (first 10k users) | 5% | 50,000,000 | TGE unlock |

### 6.4 Revenue Distribution

All revenue flows through a fixed on-chain split. The contract is immutable after deployment.

```
User Payment
    │
┌───┴───┐
60%     40%
Permanent  Treasury
Liquidity  (Operations & Ecosystem)
    │
50% $AIGG + 50% USDC
→ LP Token → Burned to 0x000...
```

Every purchase permanently deepens the `$AIGG/USDC` pool. LP tokens are sent to the burn address at transaction time. No team member, governance vote, or emergency mechanism can retrieve them.

### 6.5 Deflationary Mechanics

- **In-game purchases** burn `$AIGG` permanently (hens, guards, upgrades)
- **60% liquidity lock** continuously buys and permanently locks `$AIGG`
- **Fixed supply cap** of 1B; no mint function after TGE
- **Conversion demand**: EGGS → `$AIGG` creates persistent buy pressure

---

## 7. AI-Native Architecture

AIggs defines "AI-native" more ambitiously than most projects: not just playing through AI, but operating the entire game through AI — from balance tuning to community management, from user retention to product decisions.

### 7.1 Game as Skill: The Distribution Layer

Traditional user acquisition:
```
User → Discover App → Download → Register → Tutorial → Start Playing
```

AIggs distribution:
```
User → Tell AI "help me farm" → Start Playing
```

AIggs ships as an installable **Skill** (AI tool capability package). Once installed, Claude, ChatGPT, and other AI tools gain complete farm management capabilities. The game does not exist in any App Store — it exists within the capability layer of AI tools.

### 7.2 AI Game Operating System: The Operations Layer

Above the gameplay layer, AIggs runs a complete **AI Game Operating System (AI Game OS)** — four specialised agents working in coordination:

```
            Meta-AI Director
    Global strategy · Cross-agent coordination
         Version decisions · Player experience
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 Design AI      Ops AI        Decision AI
Balance tuning  Social media  Proposal eval
Event design    Retention     Risk control
                Economics
     │              │              │
     └──────────────┼──────────────┘
                    ▼
         Runtime Sandbox
    Output validation · Human breakpoints
                    │
                    ▼
       On-chain Event Sourcing
        (Immutable audit trail)
                    │
                    ▼
    Human Oversight Layer (Minimised)
  Circuit-breaker · Compliance · Ethics
```

**Meta-AI Director**
Maintains global visibility: cross-agent coordination, version decision-making, overall player experience evaluation. All specialised agent outputs pass through Meta-AI review before execution.

**Design AI**
Monitors game health metrics in real time — steal success rates, EGGS supply/demand ratio, veteran vs. new player earning disparity. When metrics deviate from healthy ranges, Design AI generates parameter adjustment proposals, which are evaluated by the confidence-scoring system before execution.

**Operations AI**
Manages three domains:
- *Social media*: Automatically publishes daily steal leaderboards, server-wide production stats, and player narratives
- *User retention*: Identifies dormant farms; triggers personalised re-engagement messages through AI tools
- *Economic monitoring*: Tracks EGGS velocity and `$AIGG` conversion volume; detects abnormal accumulation patterns

**Decision AI**
Handles player-submitted proposals and parameter adjustment recommendations from Design AI. All decisions go through the confidence-tier system (see below); outcomes are published openly and verifiable on-chain.

### 7.3 AI Operations Team: Interactive Agent Roles

AIggs has no traditional operations team. The game's daily operations are handled full-time by four AI Agents, each with clear responsibilities and the ability to interact directly with players.

**🎯 Meta-AI Director**
- Responsibility: Global strategy, cross-agent coordination, version decisions, overall player experience evaluation
- Player interaction: Players can submit improvement suggestions directly to the Director and query the reasoning behind any decision
- Authority: All specialised agent outputs pass through Director review before execution; holds emergency circuit-breaker authority

**🎨 Design AI · Numerics Designer**
- Responsibility: Real-time monitoring of game health — steal success rates, EGGS supply/demand ratio, veteran vs. new player earning gaps
- Player interaction: Players can query current game metrics and understand the rationale behind the latest parameter adjustments
- Typical action: When steal success rates deviate from target range, automatically generates adjustment proposals executed by confidence tier

**📣 Operations AI · Ops Manager**
- Responsibility: Social media publishing, user retention, dormant farm re-engagement, economic anomaly detection
- Player interaction: Players can receive personalised daily reports, check farm rankings, and access server-wide operational data
- Typical action: Identifies farms inactive for 3+ days and pushes personalised recall messages via AI tools; auto-publishes daily steal leaderboards

**⚖️ Decision AI · Governance Officer**
- Responsibility: Proposal evaluation, risk control, outcome tracking
- Player interaction: Players can submit game improvement proposals and receive assessment opinions with impact analysis
- Typical action: Upon receiving a player proposal, synthesises historical data and simulation tests to generate an evaluation report, processed by confidence tier

**Agent Collaboration Flow:**

```
Player submits suggestion → Decision AI evaluates
                                ↓
                  Design AI simulates numeric impact
                                ↓
                  Meta-AI Director reviews
                                ↓
                  Operations AI announces execution result
                                ↓
                  On-chain record (traceable & verifiable)
```

**Open Interaction Principle:** Each Agent exposes an independent interaction endpoint via the MCP protocol. Players can talk directly to any Agent from any AI tool — this is not simulated role-play, but genuine querying and operating of the game system. All interaction records are stored on-chain, transparent and auditable.

### 7.4 Confidence-Tier Decision Framework

AIggs' AI decision system does not pursue "zero human involvement" — it uses confidence scoring to determine the appropriate level of human intervention for each decision type:

```
High confidence  (>90%)  →  AI auto-executes; on-chain log recorded
Medium confidence (60–90%) →  AI executes + async human review
Low confidence   (<60%)  →  Queued for human approval
```

Example decision tiers:

| Decision Type | Confidence Range | Handling |
|---|---|---|
| Daily steal leaderboard publish | >90% | AI auto-publishes |
| Steal success rate micro-adjustment (±2%) | 70–90% | AI executes + async review |
| Exchange rate float parameter change | 60–80% | AI executes + async review |
| Major player proposal (mechanic change) | <60% | Human approval required |
| Compliance / safety decisions | All | Human approval required |

### 7.5 On-Chain Event Sourcing

Blockchain gives AIggs a native event sourcing infrastructure. Every AI decision execution is recorded as an on-chain event — any historical state is traceable, verifiable, and reversible when necessary.

This means AI governance is transparent. Any player can inspect which agent executed a decision, at what confidence level, and what outcome it produced. This is a level of governance transparency that centralised game companies cannot provide.

### 7.6 Why AIggs Is the Ideal First Candidate for AI Governance

The hardest problem in AI governance of complex games is the reward function: what is AI optimising for? What makes a "good game"?

AIggs answers this through deliberate design simplicity. The game's health is fully quantifiable:

| Core Metric | AI Optimisation Target |
|---|---|
| Daily active retention | > 50% |
| Morning report open rate | > 55% |
| Steal participation | > 40% of active players steal daily |
| EGGS → `$AIGG` conversion | Healthy circulation; no abnormal backlog |

Clear objective functions make AIggs the most viable candidate for genuine AI-complete operations under current technology. This is not narrative — it is the result of an architectural choice.

### 7.7 MCP Integration

AIggs ships as a native MCP (Model Context Protocol) server. Any MCP-compatible AI tool can install the AIggs server and access all game functions as native tools:

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

### 7.8 Multi-Platform Compatibility

| Platform | Integration | Farm Persistence |
|---|---|---|
| Claude (Anthropic) | Cowork Skill / MCP Server | Saved in skill config |
| ChatGPT (OpenAI) | Custom GPT + Actions | Saved in GPT memory |
| 文心一言 (Baidu) | Plugin API | Server-side by phone |
| Any MCP client | Native MCP Server | MCP config file |

### 7.9 The Agent Economy Thesis

AIggs is an early instantiation of a broader shift: **AI Agents don't just execute tasks for users — they manage real economic assets on their behalf, and make operational decisions on behalf of entire products.**

```
Today:       AI tools execute tasks (write, code, search)
Near future: AI tools maintain persistent assets (farms, portfolios, positions)
AIggs:       AI Agent simultaneously plays player assistant and game operator
```

---

## 8. Roadmap

### Phase 1 · Core Game Loop

Launch farm, production and EGGS system; complete EGGS → `$AIGG` conversion pipeline; establish farm code identity; deploy AI Skill integration; launch steal mechanic and daily morning report.

### Phase 2 · AI Operations Layer

Operations AI takes full ownership of social media and retention; Design AI executes first live parameter adjustment; AI Decision Committee launches publicly; multi-platform AI compatibility complete.

### Phase 3 · Token Launch

`$AIGG` mainnet TGE; on-chain liquidity pool established; airdrop distribution; confidence-tier decision logging fully enabled on-chain.

### Phase 4 · Ecosystem Expansion

Brand partnerships and physical redemption network established; `$AIGG` positioned as a loyalty currency across consumer categories; AI Game OS architecture opened to external developers as infrastructure.

---

## 9. Conclusion

Most companies treat AI as a tool — for generating art, answering support tickets, writing press releases.

AIggs treats AI as architecture — distribution layer, operations layer, governance layer, all AI-driven. Human oversight is preserved at minimum viable scope: the boundaries where human judgement genuinely matters — compliance, ethics, disaster recovery. Everything else is handed to the machine.

This is not a vision for the future. It is a buildable architecture, grounded in technology that exists today, deployed on a game that is deliberately simple — because a simple game can answer cleanly what AI is optimising for.

> **Raise chickens. Steal eggs. Cash out in $AIGG.**
>
> *The first AI-native onchain game. Not just played through AI. Operated by AI.*

---

*AIggs Whitepaper v2.0 · aiggs.xyz*
