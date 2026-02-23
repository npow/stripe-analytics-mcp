# stripe-analytics-mcp

## Problem
SaaS founders need to know their MRR, churn, and revenue breakdown daily. Stripe's official MCP server only does operations (create customer, send invoice). ChartMogul ($100+/mo) and Baremetrics ($108+/mo) compute these metrics but have no MCP interface. There is no way to ask your AI assistant "what's my MRR?" and get an accurate, computed answer.

## Target User
SaaS founders and indie hackers with <$50K MRR who check business metrics daily from their AI coding assistant (Claude Code, Cursor, Windsurf).

## Core Features (MVP)
1. `get_mrr` — Compute current Monthly Recurring Revenue from active subscriptions, normalizing annual/weekly/daily to monthly, applying discounts, excluding trials
2. `get_churn` — Compute customer churn rate and revenue churn rate for a given period (default: last 30 days)
3. `get_revenue_by_plan` — Break down MRR by pricing plan/product, showing subscriber count and revenue per plan
4. `get_subscriber_stats` — Return total active subscribers, new this period, churned this period, net change, and trial count
5. `get_recent_changes` — List significant recent events: new subscriptions, cancellations, upgrades, downgrades, and failed payments in the last N days

## Non-Goals (explicitly out of scope for MVP)
- Web dashboard or UI (this is a CLI/MCP server only)
- Historical trend storage or time-series database
- Cohort analysis or LTV calculation
- Multi-currency normalization (MVP assumes single currency; errors on mixed currencies)
- Webhook-based real-time updates (MVP queries Stripe API on demand)
- User accounts, authentication beyond Stripe API key
- MRR movement components (new/expansion/contraction/churn) — requires historical comparison, deferred to v0.2

## Tech Stack
- Language: TypeScript (ESM)
- MCP SDK: `@modelcontextprotocol/sdk` (^1.12.1)
- Stripe: `stripe` npm package (^17.0.0)
- Testing: `vitest`
- Transport: stdio (local, `npx stripe-analytics-mcp`)
- Deployment: npm package

## Success Criteria
- [ ] `get_mrr` returns a dollar amount computed from subscription items, normalized to monthly, with discounts applied, excluding trialing subscriptions
- [ ] `get_churn` correctly identifies customers who canceled in the given period and computes both customer churn % and revenue churn %
- [ ] `get_revenue_by_plan` sums to within 1% of `get_mrr` total
- [ ] All 5 tools return structured markdown output usable by an LLM
- [ ] Project builds, tests pass, and runs from `npx stripe-analytics-mcp` with a `STRIPE_SECRET_KEY` env var
- [ ] Mixed currencies produce a clear error, not silent incorrect sums
- [ ] Invalid Stripe API keys produce a helpful error message, not a stack trace

## API / Tool Interface

| Tool | Inputs | Output |
|------|--------|--------|
| `get_mrr` | (none) | Current MRR in cents, formatted dollar amount, currency, subscription count, active/trialing/past_due breakdown |
| `get_churn` | `period_days: number` (default 30, min 1, max 365) | Customer churn rate %, revenue churn rate %, count of churned customers, churned MRR amount |
| `get_revenue_by_plan` | (none) | Table of plans: plan name, price, interval, active subscribers, MRR contribution, % of total |
| `get_subscriber_stats` | `period_days: number` (default 30, min 1, max 365) | Total active, new, churned, net change, trialing, past_due counts |
| `get_recent_changes` | `days: number` (default 7, min 1, max 90) | List of events: type (new/cancel/upgrade/downgrade/payment_failed), customer email or "No email", plan, amount, date |
