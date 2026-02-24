/**
 * Shared types for stripe-analytics-mcp.
 * ALL modules import from here. This is the single source of truth.
 */

// --- Input types (from Stripe, normalized) ---

export interface SubscriptionData {
  id: string;
  customerId: string;
  customerEmail: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: number;    // unix timestamp
  canceledAt: number | null;
  cancelAt: number | null;
  createdAt: number;
  trialEnd: number | null;
  discount: DiscountData | null;
  currency: string;
  items: SubscriptionItemData[];
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export interface SubscriptionItemData {
  priceId: string;
  productName: string;
  planName: string;
  quantity: number;
  unitAmountCents: number;     // per unit, per interval
  interval: BillingInterval;
  intervalCount: number;
}

export type BillingInterval = 'month' | 'year' | 'week' | 'day';

export interface DiscountData {
  couponId: string;
  percentOff: number | null;
  amountOff: number | null;    // in cents
}

// --- Event types (normalized from Stripe events) ---

export interface NormalizedEvent {
  id: string;
  type: string;
  created: number;
  customerId: string | null;
  customerEmail: string | null;
  subscriptionId: string | null;
  planName: string | null;
  amountCents: number | null;
  previousPlanName: string | null;
  previousAmountCents: number | null;
}

// --- Output types ---

export interface MrrResult {
  totalMrrCents: number;
  totalMrrFormatted: string;
  currency: string;
  subscriptionCount: number;
  statusBreakdown: {
    active: number;
    trialing: number;
    pastDue: number;
  };
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
  currency: string;
}

export interface PlanBreakdown {
  planName: string;
  productName: string;
  priceFormatted: string;
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
  currency: string;
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
  customerEmail: string;
  planName: string;
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

// --- Dashboard types ---

export interface DashboardResult {
  mrr: MrrResult;
  mrrMovement: MrrMovementResult;
  failedPayments: FailedPaymentInfo[];
  expiringTrials: TrialInfo[];
  quickRatio: number;  // (new + expansion) / (contraction + churn). >1 = growing
}

export interface MrrMovementResult {
  periodDays: number;
  newMrrCents: number;
  expansionMrrCents: number;
  contractionMrrCents: number;
  churnedMrrCents: number;
  netNewMrrCents: number;
  netNewMrrFormatted: string;
  currency: string;
}

export interface FailedPaymentInfo {
  customerEmail: string;
  customerId: string;
  amountCents: number;
  amountFormatted: string;
  failureReason: string;
  attemptCount: number;
  lastAttemptDate: string;
  subscriptionId: string | null;
  planName: string | null;
}

export interface FailedPaymentsResult {
  failedPayments: FailedPaymentInfo[];
  totalAtRiskCents: number;
  totalAtRiskFormatted: string;
  currency: string;
}

export interface TrialInfo {
  customerEmail: string;
  customerId: string;
  planName: string;
  trialEnd: number;
  daysRemaining: number;
  mrrIfConverted: number;
  mrrIfConvertedFormatted: string;
}

// --- Error types ---

export interface StripeClientError {
  type: 'authentication' | 'rate_limit' | 'invalid_request' | 'api_connection' | 'api_error' | 'permission' | 'unknown';
  message: string;
  retriable: boolean;
}

// --- Utility ---

/**
 * Normalize any billing interval to monthly amount in cents.
 * E.g., $120/year → $10/month; $10/week → ~$43.33/month
 */
export function normalizeToMonthlyCents(
  amountCents: number,
  interval: BillingInterval,
  intervalCount: number
): number {
  const perInterval = amountCents / intervalCount;
  switch (interval) {
    case 'month': return perInterval;
    case 'year':  return perInterval / 12;
    case 'week':  return perInterval * (52 / 12);
    case 'day':   return perInterval * (365 / 12);
  }
}
