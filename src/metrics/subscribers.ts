/**
 * Subscriber statistics computation module.
 * PURE FUNCTION: no side effects, deterministic output.
 */

import type { SubscriptionData, SubscriberStats } from '../types.js';

/**
 * Compute subscriber statistics for a given period.
 * 
 * Logic:
 * - totalActive: subscriptions with status 'active' OR 'past_due'
 * - trialing: subscriptions with status 'trialing'
 * - pastDue: subscriptions with status 'past_due'
 * - newThisPeriod: subscriptions created within periodDays AND status is active/trialing/past_due
 * - churnedThisPeriod: subscriptions canceled within periodDays
 * - netChange: newThisPeriod - churnedThisPeriod
 * 
 * Edge cases:
 * - Empty list → all zeros
 * - periodDays = 0 → treat as 1 day
 * 
 * @param allSubscriptions - All subscriptions to analyze
 * @param periodDays - Number of days to look back for new/churned calculations
 * @returns Computed subscriber statistics
 */
export function computeSubscriberStats(
  allSubscriptions: SubscriptionData[],
  periodDays: number
): SubscriberStats {
  // Normalize periodDays: treat 0 as 1
  const normalizedPeriodDays = periodDays <= 0 ? 1 : periodDays;
  
  // Calculate the period cutoff timestamp (in seconds, matching Stripe's unix timestamps)
  const nowSeconds = Math.floor(Date.now() / 1000);
  const periodCutoffSeconds = nowSeconds - (normalizedPeriodDays * 24 * 60 * 60);
  
  // Initialize counters
  let totalActive = 0;
  let trialing = 0;
  let pastDue = 0;
  let newThisPeriod = 0;
  let churnedThisPeriod = 0;
  
  // Single pass through all subscriptions
  for (const sub of allSubscriptions) {
    const status = sub.status;
    
    // Count totalActive: 'active' OR 'past_due'
    if (status === 'active' || status === 'past_due') {
      totalActive++;
    }
    
    // Count trialing
    if (status === 'trialing') {
      trialing++;
    }
    
    // Count pastDue
    if (status === 'past_due') {
      pastDue++;
    }
    
    // Count newThisPeriod: created within period AND status is active/trialing/past_due
    if (sub.createdAt >= periodCutoffSeconds) {
      if (status === 'active' || status === 'trialing' || status === 'past_due') {
        newThisPeriod++;
      }
    }
    
    // Count churnedThisPeriod: canceledAt within period
    if (sub.canceledAt !== null && sub.canceledAt >= periodCutoffSeconds) {
      churnedThisPeriod++;
    }
  }
  
  // Compute net change
  const netChange = newThisPeriod - churnedThisPeriod;
  
  return {
    periodDays: normalizedPeriodDays,
    totalActive,
    newThisPeriod,
    churnedThisPeriod,
    netChange,
    trialing,
    pastDue,
  };
}
