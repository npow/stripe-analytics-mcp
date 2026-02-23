/**
 * Tests for MRR computation module.
 * Covers: monthly/annual/weekly normalization, discounts (percent + amount),
 * mixed currency error, empty list, trialing exclusion.
 */

import { describe, it, expect } from 'vitest';
import { computeMrr } from '../src/metrics/mrr.js';
import type { SubscriptionData } from '../src/types.js';

/**
 * Helper to create a test subscription with minimal required fields.
 */
function createTestSubscription(overrides: Partial<SubscriptionData> = {}): SubscriptionData {
  return {
    id: 'sub_test123',
    customerId: 'cus_test123',
    customerEmail: 'test@example.com',
    status: 'active',
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400,
    canceledAt: null,
    cancelAt: null,
    createdAt: Math.floor(Date.now() / 1000) - 86400,
    trialEnd: null,
    discount: null,
    currency: 'usd',
    items: [],
    ...overrides,
  };
}

describe('computeMrr', () => {
  describe('empty list', () => {
    it('should return zero MRR for empty subscription list', () => {
      const result = computeMrr([]);
      
      expect(result.totalMrrCents).toBe(0);
      expect(result.totalMrrFormatted).toBe('$0.00');
      expect(result.currency).toBe('usd');
      expect(result.subscriptionCount).toBe(0);
      expect(result.statusBreakdown.active).toBe(0);
      expect(result.statusBreakdown.trialing).toBe(0);
      expect(result.statusBreakdown.pastDue).toBe(0);
    });
  });

  describe('monthly subscriptions', () => {
    it('should correctly compute MRR for monthly subscription', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000, // $20/month
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(2000);
      expect(result.totalMrrFormatted).toBe('$20.00');
      expect(result.subscriptionCount).toBe(1);
    });

    it('should handle quantity > 1', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Per Seat',
            quantity: 5,
            unitAmountCents: 1000, // $10/month per seat
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(5000); // $10 * 5 = $50
    });
  });

  describe('annual subscriptions', () => {
    it('should normalize annual subscription to monthly', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Annual Plan',
            quantity: 1,
            unitAmountCents: 12000, // $120/year
            interval: 'year',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(1000); // $120/12 = $10/month
    });

    it('should handle bi-annual subscriptions', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Bi-Annual Plan',
            quantity: 1,
            unitAmountCents: 24000, // $240/2 years
            interval: 'year',
            intervalCount: 2,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(1000); // $240/2/12 = $10/month
    });
  });

  describe('weekly subscriptions', () => {
    it('should normalize weekly subscription to monthly', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Weekly Plan',
            quantity: 1,
            unitAmountCents: 500, // $5/week
            interval: 'week',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      // $5/week * (52 weeks / 12 months) = ~$21.67/month
      expect(result.totalMrrCents).toBeCloseTo(2167, 0);
    });
  });

  describe('trialing exclusion', () => {
    it('should exclude trialing subscriptions from MRR', () => {
      const activeSubscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const trialingSubscription = createTestSubscription({
        id: 'sub_trial',
        status: 'trialing',
        items: [
          {
            priceId: 'price_456',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([activeSubscription, trialingSubscription]);
      
      expect(result.totalMrrCents).toBe(2000); // Only active subscription
      expect(result.subscriptionCount).toBe(1);
      expect(result.statusBreakdown.active).toBe(1);
      expect(result.statusBreakdown.trialing).toBe(1); // Still counted in breakdown
    });

    it('should include past_due subscriptions in MRR', () => {
      const pastDueSubscription = createTestSubscription({
        status: 'past_due',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([pastDueSubscription]);
      
      expect(result.totalMrrCents).toBe(2000);
      expect(result.subscriptionCount).toBe(1);
      expect(result.statusBreakdown.pastDue).toBe(1);
    });
  });

  describe('discounts', () => {
    it('should apply percent-off discount', () => {
      const subscription = createTestSubscription({
        status: 'active',
        discount: {
          couponId: 'coupon_20off',
          percentOff: 20,
          amountOff: null,
        },
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000, // $20/month
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(1600); // $20 * 0.8 = $16
    });

    it('should apply amount-off discount (monthly)', () => {
      const subscription = createTestSubscription({
        status: 'active',
        discount: {
          couponId: 'coupon_5off',
          percentOff: null,
          amountOff: 500, // $5 off
        },
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000, // $20/month
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(1500); // $20 - $5 = $15
    });

    it('should normalize amount-off discount for annual subscriptions', () => {
      const subscription = createTestSubscription({
        status: 'active',
        discount: {
          couponId: 'coupon_60off',
          percentOff: null,
          amountOff: 6000, // $60 off per year
        },
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Annual Plan',
            quantity: 1,
            unitAmountCents: 12000, // $120/year
            interval: 'year',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      // ($120 - $60) / 12 = $5/month
      expect(result.totalMrrCents).toBe(500);
    });

    it('should clamp negative amounts to zero', () => {
      const subscription = createTestSubscription({
        status: 'active',
        discount: {
          couponId: 'coupon_huge',
          percentOff: null,
          amountOff: 5000, // $50 off (more than price)
        },
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000, // $20/month
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(0); // Clamped to 0
    });
  });

  describe('mixed currency error', () => {
    it('should throw error for mixed currencies', () => {
      const usdSubscription = createTestSubscription({
        currency: 'usd',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'USD Plan',
            quantity: 1,
            unitAmountCents: 2000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const eurSubscription = createTestSubscription({
        id: 'sub_eur',
        currency: 'eur',
        items: [
          {
            priceId: 'price_456',
            productName: 'Test Product',
            planName: 'EUR Plan',
            quantity: 1,
            unitAmountCents: 2000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      expect(() => {
        computeMrr([usdSubscription, eurSubscription]);
      }).toThrow('Mixed currencies not supported');
    });
  });

  describe('multiple items per subscription', () => {
    it('should sum multiple items in a subscription', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Product A',
            planName: 'Plan A',
            quantity: 1,
            unitAmountCents: 1000, // $10/month
            interval: 'month',
            intervalCount: 1,
          },
          {
            priceId: 'price_456',
            productName: 'Product B',
            planName: 'Plan B',
            quantity: 2,
            unitAmountCents: 500, // $5/month each
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(2000); // $10 + ($5 * 2) = $20
    });

    it('should handle items with different intervals', () => {
      const subscription = createTestSubscription({
        status: 'active',
        items: [
          {
            priceId: 'price_123',
            productName: 'Product A',
            planName: 'Plan A',
            quantity: 1,
            unitAmountCents: 1000, // $10/month
            interval: 'month',
            intervalCount: 1,
          },
          {
            priceId: 'price_456',
            productName: 'Product B',
            planName: 'Plan B',
            quantity: 1,
            unitAmountCents: 12000, // $120/year
            interval: 'year',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([subscription]);
      
      expect(result.totalMrrCents).toBe(2000); // $10 + $10 = $20
    });
  });

  describe('multiple subscriptions', () => {
    it('should sum MRR across multiple subscriptions', () => {
      const sub1 = createTestSubscription({
        id: 'sub_1',
        items: [
          {
            priceId: 'price_123',
            productName: 'Test Product',
            planName: 'Basic Plan',
            quantity: 1,
            unitAmountCents: 2000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const sub2 = createTestSubscription({
        id: 'sub_2',
        items: [
          {
            priceId: 'price_456',
            productName: 'Test Product',
            planName: 'Pro Plan',
            quantity: 1,
            unitAmountCents: 5000,
            interval: 'month',
            intervalCount: 1,
          },
        ],
      });
      
      const result = computeMrr([sub1, sub2]);
      
      expect(result.totalMrrCents).toBe(7000); // $20 + $50 = $70
      expect(result.subscriptionCount).toBe(2);
    });
  });
});
