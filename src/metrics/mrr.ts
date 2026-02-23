/**
 * MRR (Monthly Recurring Revenue) computation module.
 * Pure function - no API calls, only computation.
 */

import {
  SubscriptionData,
  MrrResult,
  normalizeToMonthlyCents,
} from '../types.js';

/**
 * Compute Monthly Recurring Revenue from subscription data.
 * 
 * Rules:
 * 1. Only include 'active' or 'past_due' subscriptions in MRR
 * 2. EXCLUDE 'trialing' subscriptions (not yet paid)
 * 3. Sum all items per subscription: unitAmountCents * quantity
 * 4. Normalize to monthly using normalizeToMonthlyCents
 * 5. Apply discounts AFTER normalization
 * 6. All subscriptions must have same currency (throw on mismatch)
 * 7. Return status breakdown for ALL subscriptions (including trialing)
 * 
 * @param subscriptions - Array of subscription data
 * @returns MrrResult with total MRR, formatted amount, and breakdowns
 * @throws Error if mixed currencies detected
 */
export function computeMrr(subscriptions: SubscriptionData[]): MrrResult {
  // Edge case: empty list
  if (subscriptions.length === 0) {
    return {
      totalMrrCents: 0,
      totalMrrFormatted: '$0.00',
      currency: 'usd',
      subscriptionCount: 0,
      statusBreakdown: {
        active: 0,
        trialing: 0,
        pastDue: 0,
      },
      asOfDate: new Date().toISOString(),
    };
  }

  // Currency validation: ensure all subscriptions have same currency
  const currencies = new Set(subscriptions.map(sub => sub.currency.toLowerCase()));
  if (currencies.size > 1) {
    const currencyList = Array.from(currencies)
      .map(c => c.toUpperCase())
      .sort()
      .join(', ');
    throw new Error(`Mixed currencies not supported. Found: ${currencyList}`);
  }
  const currency = subscriptions[0].currency.toLowerCase();

  // Status breakdown: count ALL subscriptions by status
  const statusBreakdown = {
    active: subscriptions.filter(sub => sub.status === 'active').length,
    trialing: subscriptions.filter(sub => sub.status === 'trialing').length,
    pastDue: subscriptions.filter(sub => sub.status === 'past_due').length,
  };

  // Filter subscriptions that contribute to MRR
  const mrrSubscriptions = subscriptions.filter(sub =>
    sub.status === 'active' || sub.status === 'past_due'
  );

  // Compute MRR for each subscription
  const totalMrrCents = mrrSubscriptions.reduce((total, subscription) => {
    // Skip subscriptions with no items
    if (subscription.items.length === 0) {
      return total;
    }

    // Normalize each item to monthly, then sum
    // This is correct because items can have different intervals
    let monthlyAmount = subscription.items.reduce((itemTotal, item) => {
      const itemAmount = item.unitAmountCents * item.quantity;
      const monthlyItemAmount = normalizeToMonthlyCents(
        itemAmount,
        item.interval,
        item.intervalCount
      );
      return itemTotal + monthlyItemAmount;
    }, 0);

    // Apply discount AFTER normalization
    if (subscription.discount) {
      if (subscription.discount.percentOff !== null) {
        // Percentage discount: multiply by (1 - percentOff/100)
        monthlyAmount = monthlyAmount * (1 - subscription.discount.percentOff / 100);
      } else if (subscription.discount.amountOff !== null) {
        // Amount discount: subtract the monthly-normalized amount
        // Use the first item's interval as a representative normalization
        // (Stripe coupons are typically per-invoice, applied at subscription level)
        const referenceInterval = subscription.items[0].interval;
        const referenceIntervalCount = subscription.items[0].intervalCount;
        const monthlyDiscount = normalizeToMonthlyCents(
          subscription.discount.amountOff,
          referenceInterval,
          referenceIntervalCount
        );
        monthlyAmount = monthlyAmount - monthlyDiscount;
      }
    }

    // Clamp negative amounts to 0
    monthlyAmount = Math.max(0, monthlyAmount);

    return total + monthlyAmount;
  }, 0);

  // Format as dollar amount
  const totalMrrFormatted = formatCentsAsDollars(totalMrrCents, currency);

  return {
    totalMrrCents: Math.round(totalMrrCents),
    totalMrrFormatted,
    currency,
    subscriptionCount: mrrSubscriptions.length,
    statusBreakdown,
    asOfDate: new Date().toISOString(),
  };
}

/**
 * Format cents as dollar string.
 * @param cents - Amount in cents
 * @param currency - Currency code
 * @returns Formatted string like "$123.45"
 */
function formatCentsAsDollars(cents: number, currency: string): string {
  const dollars = cents / 100;
  const symbol = currency.toLowerCase() === 'usd' ? '$' : getCurrencySymbol(currency);
  return `${symbol}${dollars.toFixed(2)}`;
}

/**
 * Get currency symbol for common currencies.
 * @param currency - Currency code
 * @returns Currency symbol
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
