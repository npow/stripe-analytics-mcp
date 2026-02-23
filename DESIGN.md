# Design: stripe-analytics-mcp

## File Tree
```
stripe-analytics-mcp/
  src/
    cli.ts              # CLI entry point (stdio transport, arg parsing)
    server.ts           # McpServer tool registration
    types.ts            # Shared types and interfaces
    stripe/
      client.ts         # Stripe API wrapper (list subscriptions, invoices, events)
    metrics/
      mrr.ts            # MRR computation engine
      churn.ts          # Churn rate computation
      plans.ts          # Revenue-by-plan breakdown
      subscribers.ts    # Subscriber statistics
      changes.ts        # Recent subscription changes
    utils/
      format.ts         # Markdown formatting helpers
  test/
    mrr.test.ts
    churn.test.ts
    plans.test.ts
    subscribers.test.ts
    changes.test.ts
  package.json
  tsconfig.json
  SPEC.md
  DESIGN.md
  README.md
```

## Shared Types (types.ts)

```typescript
// Stripe data types used across modules

export interface SubscriptionData {
  id: string;
  customerId: string;
  customerEmail: string | null;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid';
  planId: string;
  planName: string;
  productName: string;
  interval: 'month' | 'year' | 'week' | 'day';
  intervalCount: number;
  amount: number;           // in cents, per interval
  currency: string;
  discount: DiscountData | null;
  trialEnd: number | null;  // unix timestamp
  canceledAt: number | null;
  cancelAt: number | null;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  createdAt: number;
  items: SubscriptionItemData[];
}

export interface SubscriptionItemData {
  id: string;
  priceId: string;
  quantity: number;
  amount: number;          // unit_amount * quantity, in cents
  interval: 'month' | 'year' | 'week' | 'day';
  intervalCount: number;
}

export interface DiscountData {
  couponId: string;
  percentOff: number | null;
  amountOff: number | null;
}

// Output types returned by metric functions

export interface MrrResult {
  totalMrrCents: number;
  totalMrrFormatted: string;
  components: {
    newMrrCents: number;
    expansionMrrCents: number;
    contractionMrrCents: number;
    churnMrrCents: number;
    reactivationMrrCents: number;
  };
  subscriptionCount: number;
  asOfDate: string;
}

export interface ChurnResult {
  periodDays: number;
  startDate: string;
  endDate: string;
  customerChurnRate: number;    // 0-100 percentage
  revenueChurnRate: number;     // 0-100 percentage
  churnedCustomers: number;
  churnedMrrCents: number;
  churnedMrrFormatted: string;
  startingCustomers: number;
  startingMrrCents: number;
}

export interface PlanBreakdown {
  planId: string;
  planName: string;
  productName: string;
  price: string;
  interval: string;
  activeSubscribers: number;
  mrrCents: number;
  mrrFormatted: string;
  percentOfTotal: number;
}

export interface RevenueByPlanResult {
  plans: PlanBreakdown[];
  totalMrrCents: number;
  totalMrrFormatted: string;
}

export interface SubscriberStats {
  periodDays: number;
  totalActive: number;
  newThisPeriod: number;
  churnedThisPeriod: number;
  netChange: number;
  trialing: number;
  pastDue: number;
}

export interface SubscriptionChange {
  type: 'new' | 'canceled' | 'upgraded' | 'downgraded' | 'payment_failed' | 'reactivated';
  customerEmail: string | null;
  planName: string;
  amountCents: number;
  amountFormatted: string;
  date: string;
}

export interface RecentChangesResult {
  days: number;
  changes: SubscriptionChange[];
  summary: {
    newCount: number;
    canceledCount: number;
    upgradedCount: number;
    downgradedCount: number;
    failedPaymentCount: number;
  };
}
```

## Module: stripe/client

**Responsibility**: Wrap Stripe API calls, handle pagination, normalize raw Stripe objects into our SubscriptionData type.

**Public API**:
  - `createStripeClient(apiKey: string): StripeClient` — Initialize Stripe SDK
  - `fetchAllSubscriptions(client: StripeClient): Promise<SubscriptionData[]>` — Fetch all subscriptions (active, trialing, past_due, canceled) with auto-pagination
  - `fetchRecentEvents(client: StripeClient, days: number): Promise<Stripe.Event[]>` — Fetch subscription-related events from the last N days
  - `fetchCanceledSubscriptions(client: StripeClient, since: number): Promise<SubscriptionData[]>` — Fetch subscriptions canceled since a given unix timestamp

**Dependencies**: types.ts, `stripe` npm package
**Error handling**: Throws with descriptive message if Stripe API key is invalid (AuthenticationError) or rate-limited (RateLimitError). Wraps all Stripe errors in a standardized error with the original message.

## Module: metrics/mrr

**Responsibility**: Compute MRR from subscription data. Handles monthly/annual normalization, discounts, quantity-based pricing.

**Public API**:
  - `computeMrr(subscriptions: SubscriptionData[]): MrrResult` — Pure function: takes subscriptions, returns MRR breakdown

**Dependencies**: types.ts only (pure computation, no API calls)
**Error handling**: Returns 0 MRR for empty subscription list. Ignores subscriptions with status 'canceled' or 'incomplete'.

## Module: metrics/churn

**Responsibility**: Compute customer churn rate and revenue churn rate for a period.

**Public API**:
  - `computeChurn(allSubscriptions: SubscriptionData[], canceledSubscriptions: SubscriptionData[], periodDays: number): ChurnResult` — Pure function

**Dependencies**: types.ts, metrics/mrr (for normalizeToMonthly helper)
**Error handling**: Returns 0% churn if no customers existed at period start.

## Module: metrics/plans

**Responsibility**: Break down MRR by plan/product.

**Public API**:
  - `computeRevenueByPlan(subscriptions: SubscriptionData[]): RevenueByPlanResult` — Pure function

**Dependencies**: types.ts, metrics/mrr (for normalizeToMonthly helper)
**Error handling**: Returns empty plans array if no active subscriptions.

## Module: metrics/subscribers

**Responsibility**: Count subscriber statistics.

**Public API**:
  - `computeSubscriberStats(allSubscriptions: SubscriptionData[], periodDays: number): SubscriberStats` — Pure function

**Dependencies**: types.ts
**Error handling**: Returns all-zero stats if no subscriptions.

## Module: metrics/changes

**Responsibility**: Parse Stripe events into human-readable subscription changes.

**Public API**:
  - `computeRecentChanges(events: Stripe.Event[], days: number): RecentChangesResult` — Transforms raw Stripe events into structured changes

**Dependencies**: types.ts, `stripe` (for Stripe.Event type)
**Error handling**: Silently skips events it doesn't recognize. Returns empty changes if no relevant events.

## Module: utils/format

**Responsibility**: Format monetary amounts and generate markdown output.

**Public API**:
  - `formatCents(cents: number, currency?: string): string` — "$12.50" from 1250
  - `formatPercent(value: number): string` — "4.2%" from 4.2
  - `formatDate(timestamp: number): string` — "2026-02-15" from unix ts
  - `mrrToMarkdown(result: MrrResult): string` — Markdown report for get_mrr
  - `churnToMarkdown(result: ChurnResult): string` — Markdown report for get_churn
  - `planBreakdownToMarkdown(result: RevenueByPlanResult): string` — Markdown table
  - `subscriberStatsToMarkdown(result: SubscriberStats): string` — Markdown report
  - `changesToMarkdown(result: RecentChangesResult): string` — Markdown list

**Dependencies**: types.ts
**Error handling**: None — pure formatting.

## Module: server.ts

**Responsibility**: Register MCP tools, wire tools to metric functions.

**Public API**:
  - `createServer(stripeApiKey: string): McpServer` — Create configured MCP server

**Dependencies**: types.ts, all metrics modules, stripe/client, utils/format
**Error handling**: Each tool call catches errors and returns formatted error messages (not stack traces).

## Module: cli.ts

**Responsibility**: Parse CLI args (--help, STRIPE_SECRET_KEY from env), start stdio transport.

**Public API**: None (entry point)
**Dependencies**: server.ts

## Data Flow

```
User asks: "What's my MRR?"
  → Claude calls get_mrr tool
    → server.ts handles tool call
      → stripe/client.ts fetches all subscriptions from Stripe API
      → metrics/mrr.ts computes MRR from subscription data (pure function)
      → utils/format.ts formats result as markdown
    → Returns markdown to Claude
  → Claude presents formatted MRR to user
```

Error path:
```
Stripe API key invalid
  → stripe/client.ts throws AuthenticationError
    → server.ts catches, returns "Error: Invalid Stripe API key. Set STRIPE_SECRET_KEY."
```

## Build Dependency Graph

```
types.ts          → (no deps — written during design)
utils/format.ts   → types.ts
stripe/client.ts  → types.ts, stripe
metrics/mrr.ts    → types.ts
metrics/churn.ts  → types.ts, metrics/mrr (normalizeToMonthly)
metrics/plans.ts  → types.ts, metrics/mrr (normalizeToMonthly)
metrics/subscribers.ts → types.ts
metrics/changes.ts → types.ts, stripe
server.ts         → types.ts, stripe/client, all metrics/*, utils/format
cli.ts            → server.ts
```

**Wave 1** (parallel): utils/format, stripe/client, metrics/mrr, metrics/subscribers
**Wave 2** (parallel, after mrr): metrics/churn, metrics/plans, metrics/changes
**Wave 3** (sequential): server.ts
**Wave 4** (sequential): cli.ts

## External Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server framework |
| `stripe` | ^17.0.0 | Stripe API client |
| `zod` | ^4.0.0 | Schema validation (MCP SDK peer dep) |
| `vitest` | ^4.0.0 | Test framework (dev dep) |

## Security Considerations

- Stripe API key comes from `STRIPE_SECRET_KEY` environment variable only — never from tool call arguments, never logged, never included in error messages
- All Stripe API calls use the official `stripe` SDK which handles TLS, retries, and idempotency
- Tool inputs are validated via zod schemas (period_days must be positive integer, capped at 365)
- No data is stored or cached — every tool call queries Stripe fresh (stateless)
