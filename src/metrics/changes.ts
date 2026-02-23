/**
 * Recent subscription changes computation module.
 * Pure function - no API calls, only computation.
 */

import type {
  NormalizedEvent,
  RecentChangesResult,
  SubscriptionChange,
} from '../types.js';

/**
 * Compute recent subscription changes from events.
 * 
 * Rules:
 * 1. Map event types to change types:
 *    - customer.subscription.created → new
 *    - customer.subscription.deleted → canceled
 *    - customer.subscription.updated → upgraded/downgraded (compare amounts)
 *    - invoice.payment_failed → payment_failed
 * 2. Build summary counts
 * 3. Format dates and amounts
 * 
 * @param events - Array of normalized events
 * @param days - Number of days covered by the events
 * @returns RecentChangesResult with changes list and summary
 */
export function computeRecentChanges(
  events: NormalizedEvent[],
  days: number
): RecentChangesResult {
  const changes: SubscriptionChange[] = [];
  const summary = {
    newCount: 0,
    canceledCount: 0,
    upgradedCount: 0,
    downgradedCount: 0,
    failedPaymentCount: 0,
  };
  
  for (const event of events) {
    const changeType = mapEventToChangeType(event);
    
    if (!changeType) {
      continue; // Skip unmapped events
    }
    
    // Update summary
    switch (changeType) {
      case 'new':
        summary.newCount++;
        break;
      case 'canceled':
        summary.canceledCount++;
        break;
      case 'upgraded':
        summary.upgradedCount++;
        break;
      case 'downgraded':
        summary.downgradedCount++;
        break;
      case 'payment_failed':
        summary.failedPaymentCount++;
        break;
    }
    
    // Build change object
    const change: SubscriptionChange = {
      type: changeType,
      customerEmail: event.customerEmail || 'No email',
      planName: event.planName || 'Unknown Plan',
      amountFormatted: formatAmount(event.amountCents),
      date: formatDate(event.created),
    };
    
    changes.push(change);
  }
  
  // Sort changes by date descending (most recent first)
  changes.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
  
  return {
    days,
    changes,
    summary,
  };
}

/**
 * Map event type to change type.
 * Returns null if event should be ignored.
 */
function mapEventToChangeType(
  event: NormalizedEvent
): SubscriptionChange['type'] | null {
  switch (event.type) {
    case 'customer.subscription.created':
      return 'new';
    
    case 'customer.subscription.deleted':
      return 'canceled';
    
    case 'customer.subscription.updated':
      // Compare amounts to determine if upgrade or downgrade
      if (event.amountCents !== null && event.previousAmountCents !== null) {
        if (event.amountCents > event.previousAmountCents) {
          return 'upgraded';
        } else if (event.amountCents < event.previousAmountCents) {
          return 'downgraded';
        }
      }
      // If amounts are equal or missing, skip this update
      return null;
    
    case 'invoice.payment_failed':
      return 'payment_failed';
    
    default:
      return null;
  }
}

/**
 * Format amount in cents to dollar string.
 */
function formatAmount(amountCents: number | null): string {
  if (amountCents === null) {
    return '$0.00';
  }
  
  const dollars = amountCents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format unix timestamp to ISO date string.
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}
