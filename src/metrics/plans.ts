/**
 * Revenue by plan computation module.
 * Pure function - no API calls, only computation.
 */

import type {
  SubscriptionData,
  RevenueByPlanResult,
  PlanBreakdown,
} from '../types.js';
import { normalizeToMonthlyCents } from '../types.js';

/**
 * Compute revenue breakdown by plan.
 * 
 * Rules:
 * 1. Group subscriptions by planName (from first item)
 * 2. For each plan: count active subscribers, compute MRR contribution
 * 3. Sort by MRR descending
 * 4. Compute percentOfTotal for each plan
 * 5. Only include active/past_due subscriptions
 * 
 * @param subscriptions - All subscriptions to analyze
 * @returns RevenueByPlanResult with plan breakdowns
 * @throws Error if mixed currencies detected
 */
export function computeRevenueByPlan(subscriptions: SubscriptionData[]): RevenueByPlanResult {
  // Filter to only active/past_due subscriptions
  const activeSubscriptions = subscriptions.filter(sub =>
    sub.status === 'active' || sub.status === 'past_due'
  );
  
  // Edge case: empty list
  if (activeSubscriptions.length === 0) {
    return {
      plans: [],
      totalMrrCents: 0,
      totalMrrFormatted: '$0.00',
      currency: 'usd',
    };
  }
  
  // Currency validation
  const currencies = new Set(activeSubscriptions.map(sub => sub.currency.toLowerCase()));
  if (currencies.size > 1) {
    const currencyList = Array.from(currencies)
      .map(c => c.toUpperCase())
      .sort()
      .join(', ');
    throw new Error(`Mixed currencies not supported. Found: ${currencyList}`);
  }
  const currency = activeSubscriptions[0].currency.toLowerCase();
  
  // Group subscriptions by plan
  const planMap = new Map<string, {
    planName: string;
    productName: string;
    priceFormatted: string;
    interval: string;
    activeSubscribers: number;
    mrrCents: number;
  }>();
  
  for (const sub of activeSubscriptions) {
    // Skip subscriptions with no items
    if (sub.items.length === 0) {
      continue;
    }
    
    // Use first item for plan identification
    const firstItem = sub.items[0];
    const planKey = firstItem.planName;
    
    // Compute MRR for this subscription
    let subscriptionMrr = 0;
    for (const item of sub.items) {
      const itemAmount = item.unitAmountCents * item.quantity;
      const monthlyAmount = normalizeToMonthlyCents(
        itemAmount,
        item.interval,
        item.intervalCount
      );
      subscriptionMrr += monthlyAmount;
    }
    
    // Apply discount
    if (sub.discount) {
      if (sub.discount.percentOff !== null) {
        subscriptionMrr = subscriptionMrr * (1 - sub.discount.percentOff / 100);
      } else if (sub.discount.amountOff !== null) {
        const monthlyDiscount = normalizeToMonthlyCents(
          sub.discount.amountOff,
          firstItem.interval,
          firstItem.intervalCount
        );
        subscriptionMrr = subscriptionMrr - monthlyDiscount;
      }
    }
    
    // Clamp to 0
    subscriptionMrr = Math.max(0, subscriptionMrr);
    
    // Add to plan map
    if (planMap.has(planKey)) {
      const existing = planMap.get(planKey)!;
      existing.activeSubscribers++;
      existing.mrrCents += subscriptionMrr;
    } else {
      // Format interval string
      const intervalStr = firstItem.intervalCount === 1
        ? firstItem.interval
        : `${firstItem.intervalCount} ${firstItem.interval}s`;
      
      planMap.set(planKey, {
        planName: firstItem.planName,
        productName: firstItem.productName,
        priceFormatted: formatCentsAsDollars(firstItem.unitAmountCents, currency),
        interval: intervalStr,
        activeSubscribers: 1,
        mrrCents: subscriptionMrr,
      });
    }
  }
  
  // Compute total MRR
  let totalMrrCents = 0;
  for (const plan of planMap.values()) {
    totalMrrCents += plan.mrrCents;
  }
  
  // Build plan breakdown array with percentOfTotal
  const plans: PlanBreakdown[] = Array.from(planMap.values()).map(plan => ({
    ...plan,
    mrrCents: Math.round(plan.mrrCents),
    mrrFormatted: formatCentsAsDollars(plan.mrrCents, currency),
    percentOfTotal: totalMrrCents === 0 ? 0 : (plan.mrrCents / totalMrrCents) * 100,
  }));
  
  // Sort by MRR descending
  plans.sort((a, b) => b.mrrCents - a.mrrCents);
  
  return {
    plans,
    totalMrrCents: Math.round(totalMrrCents),
    totalMrrFormatted: formatCentsAsDollars(totalMrrCents, currency),
    currency,
  };
}

/**
 * Format cents as dollar string.
 */
function formatCentsAsDollars(cents: number, currency: string): string {
  const dollars = cents / 100;
  const symbol = currency.toLowerCase() === 'usd' ? '$' : getCurrencySymbol(currency);
  return `${symbol}${dollars.toFixed(2)}`;
}

/**
 * Get currency symbol for common currencies.
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    usd: '$',
    eur: '€',
    gbp: '£',
    jpy: '¥',
    cad: 'CA$',
    aud: 'A$',
  };
  return symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
}
