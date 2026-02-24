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

You'll get back:

```
Dashboard — 2026-02-24

MRR: $4,280 (+$120 this week)
Subscriptions: 42 active, 3 trialing, 1 past due

MRR Movement (last 7 days)
- New: +$198
- Expansion: +$49
- Contraction: -$0
- Churned: -$127
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

## Install

```bash
# Use directly (no install needed)
npx stripe-analytics-mcp

# Or install globally
npm install -g stripe-analytics-mcp
```

### MCP client configuration

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

## Usage

Ask your AI assistant natural questions. It picks the right tool automatically.

**Morning check** — "How's my business doing?" or "Morning check" or "What happened overnight?"
Returns everything: MRR, movement, failed payments, expiring trials, Quick Ratio.

**MRR** — "What's my MRR?"
Total MRR, subscription count, status breakdown.

**MRR movement** — "How did my MRR change this week?"
Waterfall: new + expansion - contraction - churn = net new MRR.

**Failed payments** — "Am I losing money to failed payments?"
Customer email, amount, failure reason, attempt count. This is money you can recover today.

**Churn** — "What's my churn rate this month?"
Customer churn %, revenue churn %, churned MRR.

**Revenue by plan** — "Break down my revenue by plan"
Table of plans with subscriber counts, MRR contribution, percentage of total.

**Subscriber stats** — "How many subscribers did I gain this week?"
Active, new, churned, trialing, past due counts.

**Recent changes** — "What happened with subscriptions this week?"
New signups, cancellations, upgrades, downgrades, failed payments.

## Tools

| Tool | What it answers | Inputs |
|------|----------------|--------|
| `get_dashboard` | Everything — the morning check | none |
| `get_mrr` | Current MRR snapshot | none |
| `get_mrr_movement` | How MRR changed over a period | `period_days` (default: 7) |
| `get_failed_payments` | Failed payments needing attention | `days` (default: 30) |
| `get_churn` | Churn rates for a period | `period_days` (default: 30) |
| `get_revenue_by_plan` | MRR breakdown by plan | none |
| `get_subscriber_stats` | Subscriber counts and changes | `period_days` (default: 30) |
| `get_recent_changes` | Recent subscription events | `days` (default: 7) |

## How it works

The server connects to your Stripe account (read-only) and computes metrics from live subscription data:

- **MRR**: Sums subscription items, normalizes annual/weekly to monthly, applies discounts, excludes trials
- **Movement**: Tracks new, expansion, contraction, and churn MRR from events
- **Quick Ratio**: (New + Expansion) / (Contraction + Churn) — above 1.0 means growing
- **Failed payments**: Scans open invoices with failed payment attempts
- **Trials**: Identifies trialing subscriptions expiring within 3 days

All computation is stateless — every query hits Stripe's API fresh. No data is cached or stored.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Your Stripe secret key (`sk_test_...` or `sk_live_...`). Read-only access is sufficient. |

Pass via environment variable or `--key` flag:

```bash
stripe-analytics-mcp --key sk_test_...
```

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
