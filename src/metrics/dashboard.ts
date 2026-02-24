/**
 * Dashboard — the "morning check" that combines all key metrics into one response.
 */

import type {
  SubscriptionData,
  NormalizedEvent,
  DashboardResult,
  MrrMovementResult,
  FailedPaymentInfo,
  TrialInfo,
} from '../types.js';
import { normalizeToMonthlyCents } from '../types.js';
import { computeMrr } from './mrr.js';

/**
 * Compute MRR movement (waterfall) for a period.
 * New + Expansion - Contraction - Churn = Net New MRR
 */
export function computeMrrMovement(
  currentSubs: SubscriptionData[],
  canceledSubs: SubscriptionData[],
  events: NormalizedEvent[],
  periodDays: number
): MrrMovementResult {
  const cutoff = Math.floor(Date.now() / 1000) - (periodDays * 86400);
  const currencies = new Set(currentSubs.map(s => s.currency.toLowerCase()));
  const currency = currencies.size > 0 ? [...currencies][0] : 'usd';

  let newMrr = 0;
  let expansionMrr = 0;
  let contractionMrr = 0;
  let churnedMrr = 0;

  // New MRR: subscriptions created in the period that are active
  for (const sub of currentSubs) {
    if (sub.createdAt >= cutoff && (sub.status === 'active' || sub.status === 'past_due')) {
      const subMrr = computeSubscriptionMrr(sub);
      newMrr += subMrr;
    }
  }

  // Churned MRR: canceled subscriptions in the period
  for (const sub of canceledSubs) {
    if (sub.canceledAt && sub.canceledAt >= cutoff) {
      const subMrr = computeSubscriptionMrr(sub);
      churnedMrr += subMrr;
    }
  }

  // Expansion/Contraction: subscription updated events with amount changes
  for (const event of events) {
    if (event.type === 'customer.subscription.updated' &&
        event.amountCents !== null &&
        event.previousAmountCents !== null &&
        event.created >= cutoff) {
      const diff = event.amountCents - event.previousAmountCents;
      if (diff > 0) {
        expansionMrr += diff;
      } else if (diff < 0) {
        contractionMrr += Math.abs(diff);
      }
    }
  }

  const netNew = newMrr + expansionMrr - contractionMrr - churnedMrr;

  return {
    periodDays,
    newMrrCents: Math.round(newMrr),
    expansionMrrCents: Math.round(expansionMrr),
    contractionMrrCents: Math.round(contractionMrr),
    churnedMrrCents: Math.round(churnedMrr),
    netNewMrrCents: Math.round(netNew),
    netNewMrrFormatted: `${netNew >= 0 ? '+' : '-'}$${(Math.abs(netNew) / 100).toFixed(2)}`,
    currency,
  };
}

/**
 * Get trials expiring within N days.
 */
export function getExpiringTrials(
  subscriptions: SubscriptionData[],
  withinDays: number = 3
): TrialInfo[] {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now + (withinDays * 86400);

  return subscriptions
    .filter(sub =>
      sub.status === 'trialing' &&
      sub.trialEnd !== null &&
      sub.trialEnd > now &&
      sub.trialEnd <= cutoff
    )
    .map(sub => {
      const daysRemaining = Math.ceil((sub.trialEnd! - now) / 86400);
      const mrrIfConverted = computeSubscriptionMrr(sub);
      return {
        customerEmail: sub.customerEmail || 'No email',
        customerId: sub.customerId,
        planName: sub.items[0]?.planName || 'Unknown',
        trialEnd: sub.trialEnd!,
        daysRemaining,
        mrrIfConverted: Math.round(mrrIfConverted),
        mrrIfConvertedFormatted: `$${(mrrIfConverted / 100).toFixed(2)}`,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Compute the full dashboard result.
 */
export function computeDashboard(
  currentSubs: SubscriptionData[],
  canceledSubs: SubscriptionData[],
  events: NormalizedEvent[],
  failedPayments: FailedPaymentInfo[],
  periodDays: number = 7
): DashboardResult {
  const mrr = computeMrr(currentSubs);
  const mrrMovement = computeMrrMovement(currentSubs, canceledSubs, events, periodDays);
  const expiringTrials = getExpiringTrials(currentSubs, 3);

  // Quick Ratio: (new + expansion) / (contraction + churn)
  const positive = mrrMovement.newMrrCents + mrrMovement.expansionMrrCents;
  const negative = mrrMovement.contractionMrrCents + mrrMovement.churnedMrrCents;
  const quickRatio = negative > 0 ? positive / negative : positive > 0 ? Infinity : 0;

  return {
    mrr,
    mrrMovement,
    failedPayments,
    expiringTrials,
    quickRatio: Math.round(quickRatio * 10) / 10,
  };
}

/**
 * Compute MRR for a single subscription (helper).
 */
function computeSubscriptionMrr(sub: SubscriptionData): number {
  let monthlyAmount = 0;
  for (const item of sub.items) {
    const itemAmount = item.unitAmountCents * item.quantity;
    monthlyAmount += normalizeToMonthlyCents(itemAmount, item.interval, item.intervalCount);
  }

  if (sub.discount) {
    if (sub.discount.percentOff !== null) {
      monthlyAmount *= (1 - sub.discount.percentOff / 100);
    } else if (sub.discount.amountOff !== null && sub.items[0]) {
      const monthlyDiscount = normalizeToMonthlyCents(
        sub.discount.amountOff,
        sub.items[0].interval,
        sub.items[0].intervalCount
      );
      monthlyAmount -= monthlyDiscount;
    }
  }

  return Math.max(0, monthlyAmount);
}
