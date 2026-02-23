# stripe-analytics-mcp

[![CI](https://github.com/npow/stripe-analytics-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/npow/stripe-analytics-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/stripe-analytics-mcp)](https://www.npmjs.com/package/stripe-analytics-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org/)

Ask your AI assistant "what's my MRR?" and get an accurate answer from your Stripe data.

## The problem

You check your Stripe dashboard for MRR, churn, and revenue breakdown every day. Stripe's official MCP server only does operations — create customers, send invoices. It can't tell you what your MRR is. ChartMogul and Baremetrics compute these metrics but cost $100+/month and have no MCP interface. You're switching between your editor and browser tabs just to check a number.

## Quick start

```bash
STRIPE_SECRET_KEY=sk_test_... npx stripe-analytics-mcp
```

Then ask your AI assistant:

```
What's my MRR?
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

Ask your AI assistant any of these:

**MRR** — "What's my MRR?" returns total MRR, subscription count, and status breakdown (active/trialing/past due).

**Churn** — "What's my churn rate this month?" returns customer churn %, revenue churn %, and churned MRR.

**Revenue by plan** — "Break down my revenue by plan" returns a table of plans with subscriber counts, MRR contribution, and percentage of total.

**Subscriber stats** — "How many subscribers did I gain this week?" returns active, new, churned, trialing, and past due counts.

**Recent changes** — "What happened with subscriptions this week?" lists new signups, cancellations, upgrades, downgrades, and failed payments.

## How it works

The server connects to your Stripe account (read-only) and computes metrics from live subscription data:

- **MRR**: Sums subscription items, normalizes annual/weekly to monthly, applies discounts, excludes trials
- **Churn**: Counts canceled subscriptions in the period vs. starting subscriber count
- **Plans**: Groups subscriptions by pricing plan and computes each plan's MRR share

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
