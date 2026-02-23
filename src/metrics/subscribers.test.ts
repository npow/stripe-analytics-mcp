/**
 * Verification suite for computeSubscriberStats.
 * Multiple independent verification paths to ensure correctness.
 */

import { describe, it, expect } from 'vitest';
import { computeSubscriberStats } from './subscribers.js';
import type { SubscriptionData } from '../types.js';

// Helper to create test subscription data
function createSubscription(
  overrides: Partial<SubscriptionData> & { id: string }
): SubscriptionData {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    id: overrides.id,
    customerId: overrides.customerId || 'cus_test',
    customerEmail: overrides.customerEmail || 'test@example.com',
    status: overrides.status || 'active',
    currentPeriodEnd: overrides.currentPeriodEnd || nowSeconds + 2592000,
    canceledAt: overrides.canceledAt !== undefined ? overrides.canceledAt : null,
    cancelAt: overrides.cancelAt !== undefined ? overrides.cancelAt : null,
    createdAt: overrides.createdAt || nowSeconds - 7776000, // 90 days ago
    trialEnd: overrides.trialEnd !== undefined ? overrides.trialEnd : null,
    discount: overrides.discount !== undefined ? overrides.discount : null,
    currency: overrides.currency || 'usd',
    items: overrides.items || [
      {
        priceId: 'price_test',
        productName: 'Test Product',
        planName: 'Test Plan',
        quantity: 1,
        unitAmountCents: 1000,
        interval: 'month',
        intervalCount: 1,
      },
    ],
  };
}

describe('computeSubscriberStats', () => {
  describe('EDGE CASE: Empty list', () => {
    it('returns all zeros for empty subscription list', () => {
      const result = computeSubscriberStats([], 30);
      expect(result).toEqual({
        periodDays: 30,
        totalActive: 0,
        newThisPeriod: 0,
        churnedThisPeriod: 0,
        netChange: 0,
        trialing: 0,
        pastDue: 0,
      });
    });
  });

  describe('EDGE CASE: periodDays = 0', () => {
    it('treats periodDays = 0 as 1 day', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 3600, // 1 hour ago (within 1 day)
        }),
      ];
      
      const result = computeSubscriberStats(subscriptions, 0);
      expect(result.periodDays).toBe(1);
      expect(result.newThisPeriod).toBe(1);
    });
  });

  describe('EDGE CASE: Negative periodDays', () => {
    it('treats negative periodDays as 1 day', () => {
      const result = computeSubscriberStats([], -10);
      expect(result.periodDays).toBe(1);
    });
  });

  describe('totalActive counting', () => {
    it('counts active subscriptions', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'active' }),
        createSubscription({ id: 'sub_2', status: 'active' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.totalActive).toBe(2);
    });

    it('counts past_due as active', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'active' }),
        createSubscription({ id: 'sub_2', status: 'past_due' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.totalActive).toBe(2);
    });

    it('excludes trialing from active count', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'active' }),
        createSubscription({ id: 'sub_2', status: 'trialing' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.totalActive).toBe(1);
      expect(result.trialing).toBe(1);
    });

    it('excludes canceled from active count', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'active' }),
        createSubscription({ id: 'sub_2', status: 'canceled' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.totalActive).toBe(1);
    });

    it('excludes incomplete, incomplete_expired, unpaid, paused', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'active' }),
        createSubscription({ id: 'sub_2', status: 'incomplete' }),
        createSubscription({ id: 'sub_3', status: 'incomplete_expired' }),
        createSubscription({ id: 'sub_4', status: 'unpaid' }),
        createSubscription({ id: 'sub_5', status: 'paused' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.totalActive).toBe(1);
    });
  });

  describe('trialing counting', () => {
    it('counts trialing subscriptions', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'trialing' }),
        createSubscription({ id: 'sub_2', status: 'trialing' }),
        createSubscription({ id: 'sub_3', status: 'active' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.trialing).toBe(2);
    });
  });

  describe('pastDue counting', () => {
    it('counts past_due subscriptions', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'past_due' }),
        createSubscription({ id: 'sub_2', status: 'past_due' }),
        createSubscription({ id: 'sub_3', status: 'active' }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.pastDue).toBe(2);
    });
  });

  describe('newThisPeriod counting', () => {
    it('counts new active subscriptions within period', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 86400, // 1 day ago
        }),
        createSubscription({
          id: 'sub_2',
          status: 'active',
          createdAt: nowSeconds - 2592000, // 30 days ago
        }),
        createSubscription({
          id: 'sub_3',
          status: 'active',
          createdAt: nowSeconds - 2678400, // 31 days ago
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(2); // Only first two are within 30 days
    });

    it('counts new trialing subscriptions within period', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'trialing',
          createdAt: nowSeconds - 86400, // 1 day ago
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(1);
    });

    it('counts new past_due subscriptions within period', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'past_due',
          createdAt: nowSeconds - 86400, // 1 day ago
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(1);
    });

    it('excludes new canceled subscriptions from newThisPeriod', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'canceled',
          createdAt: nowSeconds - 86400, // 1 day ago
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(0);
    });

    it('handles boundary case: created exactly at period cutoff', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const periodCutoffSeconds = nowSeconds - (30 * 24 * 60 * 60);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: periodCutoffSeconds, // Exactly at cutoff (should be included via >=)
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(1);
    });
  });

  describe('churnedThisPeriod counting', () => {
    it('counts subscriptions canceled within period', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'canceled',
          canceledAt: nowSeconds - 86400, // 1 day ago
        }),
        createSubscription({
          id: 'sub_2',
          status: 'canceled',
          canceledAt: nowSeconds - 2592000, // 30 days ago
        }),
        createSubscription({
          id: 'sub_3',
          status: 'canceled',
          canceledAt: nowSeconds - 2678400, // 31 days ago
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.churnedThisPeriod).toBe(2); // Only first two
    });

    it('handles boundary case: canceled exactly at period cutoff', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const periodCutoffSeconds = nowSeconds - (30 * 24 * 60 * 60);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'canceled',
          canceledAt: periodCutoffSeconds, // Exactly at cutoff
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.churnedThisPeriod).toBe(1);
    });

    it('ignores null canceledAt', () => {
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          canceledAt: null,
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.churnedThisPeriod).toBe(0);
    });
  });

  describe('netChange calculation', () => {
    it('computes positive net change when new > churned', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 86400, // new
        }),
        createSubscription({
          id: 'sub_2',
          status: 'active',
          createdAt: nowSeconds - 86400, // new
        }),
        createSubscription({
          id: 'sub_3',
          status: 'canceled',
          createdAt: nowSeconds - 2678400, // old
          canceledAt: nowSeconds - 86400, // churned
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(2);
      expect(result.churnedThisPeriod).toBe(1);
      expect(result.netChange).toBe(1);
    });

    it('computes negative net change when churned > new', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 86400, // new
        }),
        createSubscription({
          id: 'sub_2',
          status: 'canceled',
          createdAt: nowSeconds - 2678400, // old
          canceledAt: nowSeconds - 86400, // churned
        }),
        createSubscription({
          id: 'sub_3',
          status: 'canceled',
          createdAt: nowSeconds - 2678400, // old
          canceledAt: nowSeconds - 172800, // churned
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(1);
      expect(result.churnedThisPeriod).toBe(2);
      expect(result.netChange).toBe(-1);
    });

    it('computes zero net change when new = churned', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 86400, // new
        }),
        createSubscription({
          id: 'sub_2',
          status: 'canceled',
          createdAt: nowSeconds - 2678400, // old
          canceledAt: nowSeconds - 86400, // churned
        }),
      ];
      const result = computeSubscriberStats(subscriptions, 30);
      expect(result.newThisPeriod).toBe(1);
      expect(result.churnedThisPeriod).toBe(1);
      expect(result.netChange).toBe(0);
    });
  });

  describe('INTEGRATION: Complex scenario', () => {
    it('handles mixed subscription states correctly', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        // Active subscriptions (old)
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 7776000, // 90 days ago
        }),
        createSubscription({
          id: 'sub_2',
          status: 'active',
          createdAt: nowSeconds - 7776000,
        }),
        // Active subscriptions (new)
        createSubscription({
          id: 'sub_3',
          status: 'active',
          createdAt: nowSeconds - 86400, // 1 day ago
        }),
        // Past due (old)
        createSubscription({
          id: 'sub_4',
          status: 'past_due',
          createdAt: nowSeconds - 7776000,
        }),
        // Past due (new)
        createSubscription({
          id: 'sub_5',
          status: 'past_due',
          createdAt: nowSeconds - 172800, // 2 days ago
        }),
        // Trialing (new)
        createSubscription({
          id: 'sub_6',
          status: 'trialing',
          createdAt: nowSeconds - 259200, // 3 days ago
        }),
        // Canceled recently
        createSubscription({
          id: 'sub_7',
          status: 'canceled',
          createdAt: nowSeconds - 7776000,
          canceledAt: nowSeconds - 432000, // 5 days ago
        }),
        createSubscription({
          id: 'sub_8',
          status: 'canceled',
          createdAt: nowSeconds - 7776000,
          canceledAt: nowSeconds - 604800, // 7 days ago
        }),
        // Canceled long ago
        createSubscription({
          id: 'sub_9',
          status: 'canceled',
          createdAt: nowSeconds - 7776000,
          canceledAt: nowSeconds - 5184000, // 60 days ago
        }),
      ];
      
      const result = computeSubscriberStats(subscriptions, 30);

      // Verify each component
      expect(result.totalActive).toBe(5); // sub_1, sub_2, sub_3 (active) + sub_4, sub_5 (past_due)
      expect(result.trialing).toBe(1); // sub_6
      expect(result.pastDue).toBe(2); // sub_4, sub_5
      expect(result.newThisPeriod).toBe(3); // sub_3 (active), sub_5 (past_due), sub_6 (trialing)
      expect(result.churnedThisPeriod).toBe(2); // sub_7, sub_8
      expect(result.netChange).toBe(1); // 3 new - 2 churned
    });
  });

  describe('VERIFICATION: Alternative calculation method', () => {
    it('matches filter-based computation', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const periodDays = 30;
      const periodCutoffSeconds = nowSeconds - (periodDays * 24 * 60 * 60);
      
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 86400,
        }),
        createSubscription({
          id: 'sub_2',
          status: 'past_due',
          createdAt: nowSeconds - 172800,
        }),
        createSubscription({
          id: 'sub_3',
          status: 'trialing',
          createdAt: nowSeconds - 259200,
        }),
        createSubscription({
          id: 'sub_4',
          status: 'canceled',
          createdAt: nowSeconds - 7776000,
          canceledAt: nowSeconds - 432000,
        }),
      ];
      
      // Method 1: Use the function
      const result = computeSubscriberStats(subscriptions, periodDays);
      
      // Method 2: Independent calculation using filters
      const totalActiveExpected = subscriptions.filter(
        s => s.status === 'active' || s.status === 'past_due'
      ).length;
      
      const trialingExpected = subscriptions.filter(
        s => s.status === 'trialing'
      ).length;
      
      const pastDueExpected = subscriptions.filter(
        s => s.status === 'past_due'
      ).length;
      
      const newThisPeriodExpected = subscriptions.filter(
        s => s.createdAt >= periodCutoffSeconds &&
          (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
      ).length;
      
      const churnedThisPeriodExpected = subscriptions.filter(
        s => s.canceledAt !== null && s.canceledAt >= periodCutoffSeconds
      ).length;
      
      const netChangeExpected = newThisPeriodExpected - churnedThisPeriodExpected;
      
      // Verify convergence
      expect(result.totalActive).toBe(totalActiveExpected);
      expect(result.trialing).toBe(trialingExpected);
      expect(result.pastDue).toBe(pastDueExpected);
      expect(result.newThisPeriod).toBe(newThisPeriodExpected);
      expect(result.churnedThisPeriod).toBe(churnedThisPeriodExpected);
      expect(result.netChange).toBe(netChangeExpected);
    });
  });

  describe('INVARIANT: Mathematical consistency', () => {
    it('ensures pastDue is subset of totalActive', () => {
      const subscriptions = [
        createSubscription({ id: 'sub_1', status: 'active' }),
        createSubscription({ id: 'sub_2', status: 'past_due' }),
        createSubscription({ id: 'sub_3', status: 'past_due' }),
      ];
      
      const result = computeSubscriberStats(subscriptions, 30);
      
      // Invariant: pastDue <= totalActive (since pastDue is counted in totalActive)
      expect(result.pastDue).toBeLessThanOrEqual(result.totalActive);
    });

    it('ensures netChange = newThisPeriod - churnedThisPeriod', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const subscriptions = [
        createSubscription({
          id: 'sub_1',
          status: 'active',
          createdAt: nowSeconds - 86400,
        }),
        createSubscription({
          id: 'sub_2',
          status: 'canceled',
          createdAt: nowSeconds - 7776000,
          canceledAt: nowSeconds - 86400,
        }),
      ];
      
      const result = computeSubscriberStats(subscriptions, 30);
      
      // Invariant: netChange must equal newThisPeriod - churnedThisPeriod
      expect(result.netChange).toBe(result.newThisPeriod - result.churnedThisPeriod);
    });
  });
});
