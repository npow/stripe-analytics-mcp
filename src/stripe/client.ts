/**
 * Stripe API client wrapper for stripe-analytics-mcp.
 * Handles API calls, pagination, normalization, and error handling.
 */

import Stripe from 'stripe';
import type {
  SubscriptionData,
  NormalizedEvent,
  StripeClientError,
  SubscriptionStatus,
  BillingInterval,
  SubscriptionItemData,
  DiscountData
} from '../types.js';

/**
 * Create and configure a Stripe client instance.
 * 
 * @param apiKey - Stripe secret API key (sk_test_... or sk_live_...)
 * @returns Configured Stripe instance
 * @throws Error if apiKey is invalid format
 */
export function createStripeClient(apiKey: string): Stripe {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk_')) {
    throw new Error('Invalid Stripe API key format. Expected key starting with sk_');
  }

  return new Stripe(apiKey, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
    maxNetworkRetries: 2,
  });
}

/**
 * Fetch all subscriptions with auto-pagination and normalize to SubscriptionData.
 * 
 * @param stripe - Stripe client instance
 * @param statuses - Array of subscription statuses to filter by. Default: ['active', 'trialing', 'past_due']
 * @returns Array of normalized subscription data
 * @throws StripeClientError on API errors
 */
export async function fetchAllSubscriptions(
  stripe: Stripe,
  statuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due']
): Promise<SubscriptionData[]> {
  try {
    const subscriptions: SubscriptionData[] = [];
    const productIds = new Set<string>();

    // Fetch subscriptions with auto-pagination
    for await (const subscription of stripe.subscriptions.list({
      status: 'all', // We filter manually to support multiple statuses
      expand: ['data.customer', 'data.discount.coupon'],
      limit: 100,
    })) {
      // Filter by requested statuses
      if (!statuses.includes(subscription.status as SubscriptionStatus)) {
        continue;
      }

      try {
        const normalized = normalizeSubscription(subscription);
        // Collect product IDs for later resolution
        for (const item of subscription.items.data) {
          const prodId = typeof item.price.product === 'string'
            ? item.price.product
            : item.price.product?.id;
          if (prodId) productIds.add(prodId);
        }
        subscriptions.push(normalized);
      } catch (error) {
        console.error(`Failed to normalize subscription ${subscription.id}:`, error);
      }
    }

    // Resolve product names in a batch
    if (productIds.size > 0) {
      const productNames = await fetchProductNames(stripe, productIds);
      for (const sub of subscriptions) {
        for (const item of sub.items) {
          const resolved = productNames.get(item.productName) || productNames.get(item.priceId);
          if (resolved) {
            item.productName = resolved;
            // Regenerate planName from resolved product name
            item.planName = `${resolved} (${item.interval}${item.intervalCount > 1 ? ` x${item.intervalCount}` : ''})`;
          }
        }
      }
    }

    return subscriptions;
  } catch (error) {
    throw mapStripeError(error);
  }
}

/**
 * Fetch subscriptions canceled in the last N days.
 * 
 * @param stripe - Stripe client instance
 * @param sinceDaysAgo - Number of days to look back
 * @returns Array of normalized subscription data for canceled subscriptions
 * @throws StripeClientError on API errors
 */
export async function fetchCanceledSubscriptions(
  stripe: Stripe,
  sinceDaysAgo: number
): Promise<SubscriptionData[]> {
  try {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (sinceDaysAgo * 24 * 60 * 60);
    const subscriptions: SubscriptionData[] = [];
    const productIds = new Set<string>();

    for await (const subscription of stripe.subscriptions.list({
      status: 'canceled',
      expand: ['data.customer', 'data.discount.coupon'],
      limit: 100,
    })) {
      if (subscription.canceled_at && subscription.canceled_at >= cutoffTimestamp) {
        try {
          const normalized = normalizeSubscription(subscription);
          for (const item of subscription.items.data) {
            const prodId = typeof item.price.product === 'string'
              ? item.price.product
              : item.price.product?.id;
            if (prodId) productIds.add(prodId);
          }
          subscriptions.push(normalized);
        } catch (error) {
          console.error(`Failed to normalize canceled subscription ${subscription.id}:`, error);
        }
      }
    }

    // Resolve product names
    if (productIds.size > 0) {
      const productNames = await fetchProductNames(stripe, productIds);
      for (const sub of subscriptions) {
        for (const item of sub.items) {
          const resolved = productNames.get(item.productName);
          if (resolved) {
            item.productName = resolved;
            item.planName = `${resolved} (${item.interval}${item.intervalCount > 1 ? ` x${item.intervalCount}` : ''})`;
          }
        }
      }
    }

    return subscriptions;
  } catch (error) {
    throw mapStripeError(error);
  }
}

/**
 * Batch-fetch product names by ID.
 */
async function fetchProductNames(
  stripe: Stripe,
  productIds: Set<string>
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const id of productIds) {
    try {
      const product = await stripe.products.retrieve(id);
      names.set(id, product.name);
    } catch {
      // Product may have been deleted — skip
    }
  }
  return names;
}

/**
 * Batch-fetch customer emails by ID.
 */
async function fetchCustomerEmails(
  stripe: Stripe,
  customerIds: Set<string>
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (const id of customerIds) {
    try {
      const customer = await stripe.customers.retrieve(id);
      if ('email' in customer && customer.email) {
        emails.set(id, customer.email);
      }
    } catch {
      // Customer may have been deleted — skip
    }
  }
  return emails;
}

/**
 * Fetch subscription-related events from the last N days.
 * 
 * @param stripe - Stripe client instance
 * @param days - Number of days to look back
 * @returns Array of normalized events
 * @throws StripeClientError on API errors
 */
export async function fetchRecentEvents(
  stripe: Stripe,
  days: number
): Promise<NormalizedEvent[]> {
  try {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    const events: NormalizedEvent[] = [];
    const customerIdsToResolve = new Set<string>();

    const relevantEventTypes = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
    ];

    for await (const event of stripe.events.list({
      created: { gte: cutoffTimestamp },
      limit: 100,
    })) {
      if (relevantEventTypes.includes(event.type)) {
        try {
          const normalized = normalizeEvent(event);
          events.push(normalized);
          if (!normalized.customerEmail && normalized.customerId) {
            customerIdsToResolve.add(normalized.customerId);
          }
        } catch (error) {
          console.error(`Failed to normalize event ${event.id}:`, error);
        }
      }
    }

    // Resolve customer emails for events that didn't have them expanded
    if (customerIdsToResolve.size > 0) {
      const customerEmails = await fetchCustomerEmails(stripe, customerIdsToResolve);
      for (const evt of events) {
        if (!evt.customerEmail && evt.customerId) {
          evt.customerEmail = customerEmails.get(evt.customerId) || null;
        }
      }
    }

    return events;
  } catch (error) {
    throw mapStripeError(error);
  }
}

/**
 * Normalize a Stripe subscription to our SubscriptionData type.
 * 
 * @param subscription - Raw Stripe subscription object
 * @returns Normalized subscription data
 * @throws Error if required fields are missing or invalid
 */
function normalizeSubscription(subscription: Stripe.Subscription): SubscriptionData {
  // Extract customer email
  let customerEmail: string | null = null;
  if (typeof subscription.customer === 'object' && subscription.customer !== null) {
    const customer = subscription.customer as Stripe.Customer | Stripe.DeletedCustomer;
    if ('email' in customer) {
      customerEmail = customer.email || null;
    }
  }

  // Extract and normalize discount
  let discount: DiscountData | null = null;
  if (subscription.discount) {
    const coupon = subscription.discount.coupon;
    discount = {
      couponId: coupon.id,
      percentOff: coupon.percent_off || null,
      amountOff: coupon.amount_off || null,
    };
  }

  // Normalize subscription items
  const items: SubscriptionItemData[] = subscription.items.data.map((item) => {
    const price = item.price;
    
    // Extract product information
    let productName = 'Unknown Product';
    let planName = 'Unknown Plan';

    if (typeof price.product === 'object' && price.product !== null) {
      const product = price.product as Stripe.Product | Stripe.DeletedProduct;
      if ('name' in product) {
        productName = product.name || productName;
      }
    } else if (typeof price.product === 'string') {
      // Product not expanded — use the ID as a fallback name
      productName = price.product;
    }

    // Use price nickname if available, otherwise construct from product + interval
    planName = price.nickname || `${productName} (${price.recurring?.interval || 'one-time'})`;

    return {
      priceId: price.id,
      productName,
      planName,
      quantity: item.quantity || 1,
      unitAmountCents: price.unit_amount || 0,
      interval: (price.recurring?.interval as BillingInterval) || 'month',
      intervalCount: price.recurring?.interval_count || 1,
    };
  });

  return {
    id: subscription.id,
    customerId: typeof subscription.customer === 'string' 
      ? subscription.customer 
      : subscription.customer.id,
    customerEmail,
    status: subscription.status as SubscriptionStatus,
    currentPeriodEnd: subscription.current_period_end,
    canceledAt: subscription.canceled_at,
    cancelAt: subscription.cancel_at,
    createdAt: subscription.created,
    trialEnd: subscription.trial_end,
    discount,
    currency: subscription.currency,
    items,
  };
}

/**
 * Normalize a Stripe event to our NormalizedEvent type.
 * 
 * @param event - Raw Stripe event object
 * @returns Normalized event data
 */
function normalizeEvent(event: Stripe.Event): NormalizedEvent {
  const data = event.data.object as any;

  let customerId: string | null = null;
  let customerEmail: string | null = null;
  let subscriptionId: string | null = null;
  let planName: string | null = null;
  let amountCents: number | null = null;
  let previousPlanName: string | null = null;
  let previousAmountCents: number | null = null;

  // Extract event-specific data
  if (event.type.startsWith('customer.subscription')) {
    const subscription = data as Stripe.Subscription;
    subscriptionId = subscription.id;

    // Extract customer ID and email
    if (typeof subscription.customer === 'string') {
      customerId = subscription.customer;
    } else if (subscription.customer !== null) {
      customerId = subscription.customer.id;
      const customer = subscription.customer as Stripe.Customer | Stripe.DeletedCustomer;
      if ('email' in customer) {
        customerEmail = customer.email || null;
      }
    }
    
    // Extract plan information from first item
    if (subscription.items?.data?.[0]) {
      const item = subscription.items.data[0];
      const price = item.price;
      planName = price.nickname || price.id;
      amountCents = (price.unit_amount || 0) * (item.quantity || 1);
    }

    // For updated events, check previous attributes
    if (event.type === 'customer.subscription.updated' && event.data.previous_attributes) {
      const prev = event.data.previous_attributes as any;
      if (prev.items?.data?.[0]) {
        const prevItem = prev.items.data[0];
        const prevPrice = prevItem.price;
        previousPlanName = prevPrice.nickname || prevPrice.id;
        previousAmountCents = (prevPrice.unit_amount || 0) * (prevItem.quantity || 1);
      }
    }
  } else if (event.type === 'invoice.payment_failed') {
    const invoice = data as Stripe.Invoice;

    // Extract customer ID and email
    if (typeof invoice.customer === 'string') {
      customerId = invoice.customer;
    } else if (invoice.customer !== null) {
      customerId = invoice.customer.id;
      const customer = invoice.customer as Stripe.Customer | Stripe.DeletedCustomer;
      if ('email' in customer) {
        customerEmail = customer.email || null;
      }
    }
    
    subscriptionId = typeof invoice.subscription === 'string' 
      ? invoice.subscription 
      : invoice.subscription?.id || null;
    
    amountCents = invoice.amount_due;
    
    // Extract plan name from invoice lines
    if (invoice.lines?.data?.[0]) {
      const line = invoice.lines.data[0];
      planName = line.description || line.price?.nickname || null;
    }
  }

  return {
    id: event.id,
    type: event.type,
    created: event.created,
    customerId,
    customerEmail,
    subscriptionId,
    planName,
    amountCents,
    previousPlanName,
    previousAmountCents,
  };
}

/**
 * Map Stripe SDK errors to our StripeClientError type.
 * 
 * @param error - Error from Stripe SDK
 * @returns Structured StripeClientError
 */
function mapStripeError(error: unknown): StripeClientError {
  // Handle Stripe SDK errors - they inherit from Error and have a 'type' property
  if (error instanceof Error) {
    const errorType = (error as any).type as string | undefined;
    const errorCode = (error as any).code as string | undefined;
    const errorMessage = error.message;

    // Authentication errors
    if (errorType === 'authentication_error' || errorCode === 'authentication_error') {
      return {
        type: 'authentication',
        message: `Authentication failed: ${errorMessage || 'Invalid API key'}`,
        retriable: false,
      };
    }

    // Rate limit errors
    if (errorType === 'rate_limit' || errorCode === 'rate_limit') {
      return {
        type: 'rate_limit',
        message: `Rate limit exceeded: ${errorMessage || 'Too many requests'}`,
        retriable: true,
      };
    }

    // Connection errors (network issues)
    if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT' || errorCode === 'ENOTFOUND') {
      return {
        type: 'api_connection',
        message: `Connection error: ${errorMessage || 'Failed to connect to Stripe'}`,
        retriable: true,
      };
    }

    // Permission errors (detected by message content)
    if (errorType === 'invalid_request_error' && errorMessage.toLowerCase().includes('permission')) {
      return {
        type: 'permission',
        message: `Permission denied: ${errorMessage}`,
        retriable: false,
      };
    }

    // Invalid request errors
    if (errorType === 'invalid_request_error') {
      return {
        type: 'invalid_request',
        message: `Invalid request: ${errorMessage}`,
        retriable: false,
      };
    }

    // API errors
    if (errorType === 'api_error') {
      return {
        type: 'api_error',
        message: `Stripe API error: ${errorMessage}`,
        retriable: true,
      };
    }

    // Generic error fallback
    return {
      type: 'unknown',
      message: errorMessage,
      retriable: false,
    };
  }

  // Fallback for unknown error types
  return {
    type: 'unknown',
    message: 'An unknown error occurred',
    retriable: false,
  };
}
