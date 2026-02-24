import Stripe from 'stripe';
import { createStripeClient, fetchAllSubscriptions, fetchCanceledSubscriptions, fetchRecentEvents, fetchFailedInvoices } from '../src/stripe/client.js';
import { computeDashboard, computeMrrMovement } from '../src/metrics/dashboard.js';
import { dashboardToMarkdown, failedPaymentsToMarkdown, mrrMovementToMarkdown } from '../src/utils/format.js';
import type { FailedPaymentsResult } from '../src/types.js';

const KEY = process.env.STRIPE_SECRET_KEY!;
const stripe = createStripeClient(KEY);

async function main() {
  // Create test data
  const prod = await new Stripe(KEY).products.create({ name: 'Dashboard Test Plan' });
  const price = await new Stripe(KEY).prices.create({ product: prod.id, unit_amount: 2900, currency: 'usd', recurring: { interval: 'month' } });
  const cust = await new Stripe(KEY).customers.create({ email: 'dashboard-test@example.com', source: 'tok_visa' });
  const sub = await new Stripe(KEY).subscriptions.create({ customer: cust.id, items: [{ price: price.id }] });

  console.log('Test data created. Running dashboard...\n');
  await new Promise(r => setTimeout(r, 2000));

  // Test get_dashboard
  console.log('=== get_dashboard ===');
  const [subs, canceled, events, failed] = await Promise.all([
    fetchAllSubscriptions(stripe),
    fetchCanceledSubscriptions(stripe, 7),
    fetchRecentEvents(stripe, 7),
    fetchFailedInvoices(stripe, 30),
  ]);
  const dashboard = computeDashboard(subs, canceled, events, failed, 7);
  console.log(dashboardToMarkdown(dashboard));

  // Test get_mrr_movement
  console.log('\n=== get_mrr_movement ===');
  const movement = computeMrrMovement(subs, canceled, events, 7);
  console.log(mrrMovementToMarkdown(movement));

  // Test get_failed_payments
  console.log('\n=== get_failed_payments ===');
  const fpResult: FailedPaymentsResult = {
    failedPayments: failed,
    totalAtRiskCents: failed.reduce((s, f) => s + f.amountCents, 0),
    totalAtRiskFormatted: `$${(failed.reduce((s, f) => s + f.amountCents, 0) / 100).toFixed(2)}`,
    currency: 'usd',
  };
  console.log(failedPaymentsToMarkdown(fpResult));

  // Cleanup
  await new Stripe(KEY).subscriptions.cancel(sub.id);
  await new Stripe(KEY).customers.del(cust.id);
  await new Stripe(KEY).products.update(prod.id, { active: false });
  console.log('\nCleanup done.');
}

main().catch(console.error);
