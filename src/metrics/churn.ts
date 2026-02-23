/**
 * Churn computation module.
 * Pure function - no API calls, only computation.
 */

import type {
  SubscriptionData,
  ChurnResult,
  normalizeToMonthlyCents,
} from '../types.js';
import { normalizeToMonthlyCents as normalizeFn } from '../types.js';

/**
 * Compute churn metrics for a given period.
 * 
 * Rules:
 * 1. customerChurnRate = (churnedCustomers / startingCustomers) * 100
 * 2. revenueChurnRate = (churnedMRR / startingMRR) * 100
 * 3. startingCustomers = active/past_due subs that existed BEFORE the period
 * 4. churnedCustomers = count of subscriptions in canceledSubs
 * 5. startingMRR = sum of MRR from subscriptions that existed before the period
 * 6. churnedMRR = sum of MRR from canceled subscriptions
 * 7. Handle edge: 0 starting customers = 0% churn
 * 
 * @param allSubs - All current subscriptions (active, trialing, past_due)
 * @param canceledSubs - Subscriptions canceled in the period
 * @param periodDays - Number of days for the period
 * @returns ChurnResult with churn rates and metrics
 * @throws Error if mixed currencies detected
 */
export function computeChurn(
  allSubs: SubscriptionData[],
  canceledSubs: SubscriptionData[],
  periodDays: number
): ChurnResult {
  // Normalize periodDays
  const normalizedPeriodDays = periodDays <= 0 ? 1 : periodDays;
  
  // Calculate period boundaries (in seconds)
  const nowSeconds = Math.floor(Date.now() / 1000);
  const periodStartSeconds = nowSeconds - (normalizedPeriodDays * 24 * 60 * 60);
  
  // Format dates for output
  const endDate = new Date(nowSeconds * 1000).toISOString().split('T')[0];
  const startDate = new Date(periodStartSeconds * 1000).toISOString().split('T')[0];
  
  // Currency validation: ensure all subscriptions have same currency
  const allSubscriptions = [...allSubs, ...canceledSubs];
  if (allSubscriptions.length === 0) {
    return {
      periodDays: normalizedPeriodDays,
      startDate,
      endDate,
      customerChurnRate: 0,
      revenueChurnRate: 0,
      churnedCustomers: 0,
      churnedMrrCents: 0,
      churnedMrrFormatted: '$0.00',
      startingCustomers: 0,
      startingMrrCents: 0,
      currency: 'usd',
    };
  }
  
  const currencies = new Set(allSubscriptions.map(sub => sub.currency.toLowerCase()));
  if (currencies.size > 1) {
    const currencyList = Array.from(currencies)
      .map(c => c.toUpperCase())
      .sort()
      .join(', ');
    throw new Error(`Mixed currencies not supported. Found: ${currencyList}`);
  }
  const currency = allSubscriptions[0].currency.toLowerCase();
  
  // Compute starting customers: active/past_due subs that existed BEFORE the period
  // This means subscriptions created before periodStartSeconds
  const startingSubscriptions = allSubs.filter(sub => {
    const isRelevantStatus = sub.status === 'active' || sub.status === 'past_due';
    const existedBeforePeriod = sub.createdAt < periodStartSeconds;
    return isRelevantStatus && existedBeforePeriod;
  });
  
  const startingCustomers = startingSubscriptions.length;
  
  // Compute starting MRR
  const startingMrrCents = computeTotalMrr(startingSubscriptions);
  
  // Compute churned metrics
  const churnedCustomers = canceledSubs.length;
  const churnedMrrCents = computeTotalMrr(canceledSubs);
  
  // Compute churn rates
  // Edge case: 0 starting customers = 0% churn
  const customerChurnRate = startingCustomers === 0 ? 0 : (churnedCustomers / startingCustomers) * 100;
  const revenueChurnRate = startingMrrCents === 0 ? 0 : (churnedMrrCents / startingMrrCents) * 100;
  
  // Format churned MRR
  const churnedMrrFormatted = formatCentsAsDollars(churnedMrrCents, currency);
  
  return {
    periodDays: normalizedPeriodDays,
    startDate,
    endDate,
    customerChurnRate,
    revenueChurnRate,
    churnedCustomers,
    churnedMrrCents: Math.round(churnedMrrCents),
    churnedMrrFormatted,
    startingCustomers,
    startingMrrCents: Math.round(startingMrrCents),
    currency,
  };
}

/**
 * Compute total MRR for a set of subscriptions.
 * Same logic as computeMrr but returns just the cents value.
 */
function computeTotalMrr(subscriptions: SubscriptionData[]): number {
  return subscriptions.reduce((total, subscription) => {
    // Skip subscriptions with no items
    if (subscription.items.length === 0) {
      return total;
    }
    
    // Normalize each item to monthly, then sum
    let monthlyAmount = subscription.items.reduce((itemTotal, item) => {
      const itemAmount = item.unitAmountCents * item.quantity;
      const monthlyItemAmount = normalizeFn(
        itemAmount,
        item.interval,
        item.intervalCount
      );
      return itemTotal + monthlyItemAmount;
    }, 0);
    
    // Apply discount AFTER normalization
    if (subscription.discount) {
      if (subscription.discount.percentOff !== null) {
        monthlyAmount = monthlyAmount * (1 - subscription.discount.percentOff / 100);
      } else if (subscription.discount.amountOff !== null) {
        const referenceInterval = subscription.items[0].interval;
        const referenceIntervalCount = subscription.items[0].intervalCount;
        const monthlyDiscount = normalizeFn(
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
