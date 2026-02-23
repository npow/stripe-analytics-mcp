/**
 * Integration test: Creates real Stripe test data, runs all metric functions,
 * verifies output, then cleans up.
 *
 * Usage: STRIPE_SECRET_KEY=sk_test_... npx tsx test/integration.ts
 */
import Stripe from 'stripe';
import { createStripeClient, fetchAllSubscriptions, fetchCanceledSubscriptions, fetchRecentEvents } from '../src/stripe/client.js';
import { computeMrr } from '../src/metrics/mrr.js';
import { computeChurn } from '../src/metrics/churn.js';
import { computeRevenueByPlan } from '../src/metrics/plans.js';
import { computeSubscriberStats } from '../src/metrics/subscribers.js';
import { computeRecentChanges } from '../src/metrics/changes.js';
import { mrrToMarkdown, churnToMarkdown, planBreakdownToMarkdown, subscriberStatsToMarkdown, changesToMarkdown } from '../src/utils/format.js';

const API_KEY = process.env.STRIPE_SECRET_KEY || process.argv[2];
if (!API_KEY) {
  console.error('Usage: STRIPE_SECRET_KEY=sk_test_... npx tsx test/integration.ts');
  process.exit(1);
}

const stripe = new Stripe(API_KEY);

// Track created resources for cleanup
const cleanup: { customers: string[]; products: string[]; subscriptions: string[] } = {
  customers: [],
  products: [],
  subscriptions: [],
};

async function createTestData() {
  console.log('--- Creating test data in Stripe ---\n');

  // Create 2 products with prices
  const basicProduct = await stripe.products.create({ name: 'Basic Plan (test)' });
  cleanup.products.push(basicProduct.id);
  const basicPrice = await stripe.prices.create({
    product: basicProduct.id,
    unit_amount: 1900, // $19/mo
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log(`Created: Basic Plan @ $19/mo (${basicPrice.id})`);

  const proProduct = await stripe.products.create({ name: 'Pro Plan (test)' });
  cleanup.products.push(proProduct.id);
  const proPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 4900, // $49/mo
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log(`Created: Pro Plan @ $49/mo (${proPrice.id})`);

  // Annual price for testing normalization
  const annualPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 49900, // $499/yr
    currency: 'usd',
    recurring: { interval: 'year' },
  });
  console.log(`Created: Pro Annual @ $499/yr (${annualPrice.id})`);

  // Create customers + subscriptions
  // Customer 1: Active basic monthly
  const cust1 = await stripe.customers.create({
    email: 'alice-test@example.com',
    name: 'Alice (integration test)',
    source: 'tok_visa',
  });
  cleanup.customers.push(cust1.id);
  const sub1 = await stripe.subscriptions.create({
    customer: cust1.id,
    items: [{ price: basicPrice.id }],
  });
  cleanup.subscriptions.push(sub1.id);
  console.log(`Created: Alice on Basic ($19/mo) - ${sub1.status}`);

  // Customer 2: Active pro monthly
  const cust2 = await stripe.customers.create({
    email: 'bob-test@example.com',
    name: 'Bob (integration test)',
    source: 'tok_visa',
  });
  cleanup.customers.push(cust2.id);
  const sub2 = await stripe.subscriptions.create({
    customer: cust2.id,
    items: [{ price: proPrice.id }],
  });
  cleanup.subscriptions.push(sub2.id);
  console.log(`Created: Bob on Pro ($49/mo) - ${sub2.status}`);

  // Customer 3: Active pro annual
  const cust3 = await stripe.customers.create({
    email: 'carol-test@example.com',
    name: 'Carol (integration test)',
    source: 'tok_visa',
  });
  cleanup.customers.push(cust3.id);
  const sub3 = await stripe.subscriptions.create({
    customer: cust3.id,
    items: [{ price: annualPrice.id }],
  });
  cleanup.subscriptions.push(sub3.id);
  console.log(`Created: Carol on Pro Annual ($499/yr) - ${sub3.status}`);

  // Customer 4: Trialing basic (should be excluded from MRR)
  const cust4 = await stripe.customers.create({
    email: 'dave-test@example.com',
    name: 'Dave (integration test)',
    source: 'tok_visa',
  });
  cleanup.customers.push(cust4.id);
  const sub4 = await stripe.subscriptions.create({
    customer: cust4.id,
    items: [{ price: basicPrice.id }],
    trial_period_days: 14,
  });
  cleanup.subscriptions.push(sub4.id);
  console.log(`Created: Dave on Basic (14-day trial) - ${sub4.status}`);

  // Customer 5: Create then cancel (for churn testing)
  const cust5 = await stripe.customers.create({
    email: 'eve-test@example.com',
    name: 'Eve (integration test)',
    source: 'tok_visa',
  });
  cleanup.customers.push(cust5.id);
  const sub5 = await stripe.subscriptions.create({
    customer: cust5.id,
    items: [{ price: basicPrice.id }],
  });
  cleanup.subscriptions.push(sub5.id);
  // Cancel immediately
  await stripe.subscriptions.cancel(sub5.id);
  console.log(`Created: Eve on Basic then CANCELED - canceled`);

  console.log('\n--- Test data created ---\n');

  return { basicPrice, proPrice, annualPrice };
}

async function runTools() {
  console.log('=== Running all 5 MCP tools against real Stripe data ===\n');

  const client = createStripeClient(API_KEY);
  let allPassed = true;

  // Tool 1: get_mrr
  console.log('--- Tool 1: get_mrr ---');
  try {
    const subs = await fetchAllSubscriptions(client);
    console.log(`Fetched ${subs.length} subscriptions`);
    const mrr = computeMrr(subs);
    console.log(mrrToMarkdown(mrr));

    // Verify: MRR should be ~$19 + $49 + $499/12 = ~$109.58
    // (Dave is trialing, Eve is canceled — both excluded)
    const expectedApprox = 1900 + 4900 + Math.round(49900 / 12);
    const diff = Math.abs(mrr.totalMrrCents - expectedApprox);
    const pctDiff = (diff / expectedApprox) * 100;
    if (pctDiff > 5) {
      console.error(`FAIL: MRR ${mrr.totalMrrCents} cents differs from expected ~${expectedApprox} by ${pctDiff.toFixed(1)}%`);
      allPassed = false;
    } else {
      console.log(`PASS: MRR ${mrr.totalMrrCents} cents is within 5% of expected ~${expectedApprox} (diff: ${pctDiff.toFixed(1)}%)`);
    }

    // Verify status breakdown
    if (mrr.statusBreakdown.trialing < 1) {
      console.error('FAIL: Expected at least 1 trialing subscription');
      allPassed = false;
    } else {
      console.log(`PASS: ${mrr.statusBreakdown.trialing} trialing subscription(s) found`);
    }
  } catch (e: any) {
    console.error(`FAIL: get_mrr threw: ${e.message}`);
    allPassed = false;
  }

  // Tool 2: get_churn
  console.log('\n--- Tool 2: get_churn ---');
  try {
    const subs = await fetchAllSubscriptions(client);
    const canceled = await fetchCanceledSubscriptions(client, 30);
    console.log(`Fetched ${canceled.length} canceled subscriptions`);
    const churn = computeChurn(subs, canceled, 30);
    console.log(churnToMarkdown(churn));

    if (churn.churnedCustomers < 1) {
      console.error('FAIL: Expected at least 1 churned customer (Eve)');
      allPassed = false;
    } else {
      console.log(`PASS: ${churn.churnedCustomers} churned customer(s) found`);
    }
  } catch (e: any) {
    console.error(`FAIL: get_churn threw: ${e.message}`);
    allPassed = false;
  }

  // Tool 3: get_revenue_by_plan
  console.log('\n--- Tool 3: get_revenue_by_plan ---');
  try {
    const subs = await fetchAllSubscriptions(client);
    const plans = computeRevenueByPlan(subs);
    console.log(planBreakdownToMarkdown(plans));

    if (plans.plans.length < 2) {
      console.error(`FAIL: Expected at least 2 plans, got ${plans.plans.length}`);
      allPassed = false;
    } else {
      console.log(`PASS: ${plans.plans.length} plans found`);
    }
  } catch (e: any) {
    console.error(`FAIL: get_revenue_by_plan threw: ${e.message}`);
    allPassed = false;
  }

  // Tool 4: get_subscriber_stats
  console.log('\n--- Tool 4: get_subscriber_stats ---');
  try {
    const subs = await fetchAllSubscriptions(client);
    const stats = computeSubscriberStats(subs, 30);
    console.log(subscriberStatsToMarkdown(stats));

    // Should have 3 active (Alice, Bob, Carol) + 1 trialing (Dave)
    if (stats.totalActive < 3) {
      console.error(`FAIL: Expected at least 3 active subscribers, got ${stats.totalActive}`);
      allPassed = false;
    } else {
      console.log(`PASS: ${stats.totalActive} active subscriber(s)`);
    }
    if (stats.trialing < 1) {
      console.error('FAIL: Expected at least 1 trialing subscriber');
      allPassed = false;
    } else {
      console.log(`PASS: ${stats.trialing} trialing subscriber(s)`);
    }
  } catch (e: any) {
    console.error(`FAIL: get_subscriber_stats threw: ${e.message}`);
    allPassed = false;
  }

  // Tool 5: get_recent_changes
  console.log('\n--- Tool 5: get_recent_changes ---');
  try {
    const events = await fetchRecentEvents(client, 7);
    console.log(`Fetched ${events.length} events`);
    const changes = computeRecentChanges(events, 7);
    console.log(changesToMarkdown(changes));

    // Should have at least some events from creating/canceling subscriptions
    if (changes.changes.length === 0) {
      console.log('WARN: No recent changes found (events may not be immediate in test mode)');
    } else {
      console.log(`PASS: ${changes.changes.length} recent change(s) found`);
    }
  } catch (e: any) {
    console.error(`FAIL: get_recent_changes threw: ${e.message}`);
    allPassed = false;
  }

  return allPassed;
}

async function cleanupTestData() {
  console.log('\n--- Cleaning up test data ---');

  // Cancel active subscriptions first
  for (const subId of cleanup.subscriptions) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      if (sub.status !== 'canceled') {
        await stripe.subscriptions.cancel(subId);
      }
    } catch { /* already canceled or deleted */ }
  }

  // Delete customers (cascades to subscriptions)
  for (const custId of cleanup.customers) {
    try {
      await stripe.customers.del(custId);
    } catch { /* already deleted */ }
  }

  // Archive products
  for (const prodId of cleanup.products) {
    try {
      await stripe.products.update(prodId, { active: false });
    } catch { /* already archived */ }
  }

  console.log(`Cleaned up: ${cleanup.customers.length} customers, ${cleanup.products.length} products, ${cleanup.subscriptions.length} subscriptions`);
}

async function main() {
  let passed = false;
  try {
    await createTestData();

    // Small delay for Stripe to process
    console.log('Waiting 2s for Stripe to process...\n');
    await new Promise(r => setTimeout(r, 2000));

    passed = await runTools();
  } finally {
    await cleanupTestData();
  }

  console.log('\n========================================');
  if (passed) {
    console.log('INTEGRATION TEST: ALL PASSED');
  } else {
    console.log('INTEGRATION TEST: SOME FAILURES (see above)');
  }
  console.log('========================================\n');

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  cleanupTestData().then(() => process.exit(1));
});
