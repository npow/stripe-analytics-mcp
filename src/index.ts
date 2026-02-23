/**
 * Programmatic exports for stripe-analytics-mcp.
 * Use this when embedding the server in another application.
 */

// Server
export { createServer, runServer } from './server.js';

// Types
export type {
  SubscriptionData,
  SubscriptionStatus,
  SubscriptionItemData,
  BillingInterval,
  DiscountData,
  NormalizedEvent,
  MrrResult,
  ChurnResult,
  PlanBreakdown,
  RevenueByPlanResult,
  SubscriberStats,
  SubscriptionChange,
  RecentChangesResult,
  StripeClientError,
} from './types.js';

// Stripe client utilities
export {
  createStripeClient,
  fetchAllSubscriptions,
  fetchCanceledSubscriptions,
  fetchRecentEvents,
} from './stripe/client.js';

// Metric computation functions (pure functions)
export { computeMrr } from './metrics/mrr.js';
export { computeChurn } from './metrics/churn.js';
export { computeRevenueByPlan } from './metrics/plans.js';
export { computeSubscriberStats } from './metrics/subscribers.js';
export { computeRecentChanges } from './metrics/changes.js';

// Formatting utilities
export {
  formatCents,
  formatPercent,
  formatDate,
  mrrToMarkdown,
  churnToMarkdown,
  planBreakdownToMarkdown,
  subscriberStatsToMarkdown,
  changesToMarkdown,
} from './utils/format.js';

// Utility functions
export { normalizeToMonthlyCents } from './types.js';
