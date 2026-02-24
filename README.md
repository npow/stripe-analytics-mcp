# stripe-analytics-mcp

[![CI](https://github.com/npow/stripe-analytics-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/npow/stripe-analytics-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/stripe-analytics-mcp)](https://www.npmjs.com/package/stripe-analytics-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org/)

Ask your AI assistant "how's my business doing?" and get your MRR, churn, failed payments, and expiring trials in one answer.

## The problem

You check your Stripe dashboard for MRR, churn, and revenue breakdown every day. Stripe's official MCP server only does operations — create customers, send invoices. It can't tell you what your MRR is. ChartMogul and Baremetrics compute these metrics but cost $100+/month and have no MCP interface. You're switching between your editor and browser tabs just to check a number.

## Quick start

```bash
STRIPE_SECRET_KEY=sk_test_... npx stripe-analytics-mcp
```

Then ask your AI assistant:

```
How's my business doing?
```

## Install

```bash
npx stripe-analytics-mcp
```

Add to your Claude Code / Cursor / Windsurf MCP config:

```json
{
  "mcpServers": {
    "stripe-analytics": {
      "command": "npx",
      "args": ["stripe-analytics-mcp"],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

## The morning check

> "How's my business doing?" / "Morning check" / "What happened overnight?"

One question, one answer, 30-second scan. Everything you'd normally check across 4 Stripe dashboard pages:

```
Dashboard — 2026-02-24

MRR: $4,280 (+$120 this week)
Subscriptions: 42 active, 3 trialing, 1 past due

MRR Movement (last 7 days)
- New: +$198 (2 new customers)
- Expansion: +$49 (1 upgrade)
- Contraction: -$0
- Churned: -$127 (1 cancellation)
- Net: +$120

Quick Ratio: 1.9 (healthy)

Failed Payments (2 — $147 at risk)
- alice@acme.com — $98 — card_declined — attempt 2
- bob@startup.io — $49 — insufficient_funds — attempt 1

Trials Expiring Soon (3 — $147 potential MRR)
- carol@bigco.com — Pro — 2 days left — $49/mo
- dave@agency.net — Basic — 1 day left — $19/mo
- eve@freelance.co — Pro — 3 days left — $49/mo
```

## Recover failed payments

> "Am I losing money to failed payments?" / "Which customers have payment issues?"

Failed payments are the easiest revenue to recover — these customers already want to pay you. Get the list with failure reasons so you can reach out today:

```
Failed Payments

Total at risk: $245.00
Failed invoices: 3

| Customer          | Amount | Reason            | Attempts | Last Attempt | Plan |
|-------------------|--------|-------------------|----------|--------------|------|
| alice@acme.com    | $98.00 | card_declined     | 2        | 2026-02-23   | Pro  |
| bob@startup.io    | $49.00 | insufficient_funds| 1        | 2026-02-22   | Pro  |
| carol@agency.net  | $98.00 | expired_card      | 3        | 2026-02-21   | Pro  |
```

## Track MRR growth

> "What's my MRR?" / "How did my MRR change this month?"

See your current MRR snapshot, or drill into the waterfall showing exactly where growth is coming from and where you're leaking:

```
MRR Movement

Period: Last 30 days
Net New MRR: +$840

Breakdown
- New MRR: +$570 (from new customers)
- Expansion MRR: +$390 (from upgrades)
- Contraction MRR: -$49 (from downgrades)
- Churned MRR: -$71 (from cancellations)

Net: +$840
```

## Watch your trial funnel

The dashboard automatically flags trials expiring within 3 days. These are customers about to decide whether to convert or leave — the highest-leverage moment to intervene.

## Understand churn

> "What's my churn rate?" / "Who churned this month?"

Get both customer churn (% of customers lost) and revenue churn (% of MRR lost) — because losing one $500/mo customer hurts more than losing five $10/mo customers:

```
Churn Analysis

Period: 30 days
Customer Churn Rate: 3.2%
Revenue Churn Rate: 1.8%
Churned Customers: 4
Churned MRR: $127.00
```

## Know which plans work

> "Break down my revenue by plan" / "Which plan makes the most money?"

See which plans carry your business and which are dead weight:

```
| Plan      | Subscribers | MRR       | % of Total |
|-----------|-------------|-----------|------------|
| Pro       | 28          | $2,744.00 | 64.1%      |
| Basic     | 35          | $665.00   | 15.5%      |
| Enterprise| 3           | $871.00   | 20.4%      |
```

## How it works

Connects to Stripe (read-only), computes metrics from live subscription data, returns markdown your AI assistant renders naturally.

- **MRR**: Sums subscription items, normalizes annual/weekly to monthly, applies discounts, excludes trials
- **Movement**: Tracks new, expansion, contraction, and churn MRR from Stripe events
- **Quick Ratio**: (New + Expansion) / (Contraction + Churn) — above 1.0 means growing
- **Failed payments**: Scans open invoices with failed attempts
- **Trials**: Identifies trialing subscriptions about to expire

Stateless — every query hits Stripe fresh. No data cached. No database. No account needed.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (`sk_test_...` or `sk_live_...`). Read-only access is sufficient. |

## Development

```bash
git clone https://github.com/npow/stripe-analytics-mcp
cd stripe-analytics-mcp
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
