/**
 * Tests for format.ts utilities.
 * Verifies edge cases: 0, negatives, NaN, various currencies, empty data.
 */

import { describe, it, expect } from 'vitest';
import {
  formatCents,
  formatPercent,
  formatDate,
  mrrToMarkdown,
  churnToMarkdown,
  planBreakdownToMarkdown,
  subscriberStatsToMarkdown,
  changesToMarkdown,
} from './format.js';
import type {
  MrrResult,
  ChurnResult,
  RevenueByPlanResult,
  SubscriberStats,
  RecentChangesResult,
} from '../types.js';

describe('formatCents', () => {
  it('formats positive cents to dollars', () => {
    expect(formatCents(1250)).toBe('$12.50');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(99)).toBe('$0.99');
  });

  it('handles zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('handles negative amounts', () => {
    expect(formatCents(-1250)).toBe('-$12.50');
    expect(formatCents(-1)).toBe('-$0.01');
  });

  it('uses correct currency symbols', () => {
    expect(formatCents(1000, 'usd')).toBe('$10.00');
    expect(formatCents(1000, 'eur')).toBe('€10.00');
    expect(formatCents(1000, 'gbp')).toBe('£10.00');
    expect(formatCents(1000, 'jpy')).toBe('¥10.00');
    expect(formatCents(1000, 'cad')).toBe('CA$10.00');
  });

  it('defaults to USD', () => {
    expect(formatCents(500)).toBe('$5.00');
  });

  it('handles unknown currency gracefully', () => {
    expect(formatCents(1000, 'xyz')).toBe('XYZ 10.00');
  });
});

describe('formatPercent', () => {
  it('formats percentage with 1 decimal', () => {
    expect(formatPercent(4.2)).toBe('4.2%');
    expect(formatPercent(12.5)).toBe('12.5%');
    expect(formatPercent(0.1)).toBe('0.1%');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('handles NaN', () => {
    expect(formatPercent(NaN)).toBe('0.0%');
  });

  it('handles Infinity', () => {
    expect(formatPercent(Infinity)).toBe('0.0%');
    expect(formatPercent(-Infinity)).toBe('0.0%');
  });

  it('handles negative percentages', () => {
    expect(formatPercent(-5.3)).toBe('-5.3%');
  });
});

describe('formatDate', () => {
  it('formats unix timestamp to ISO date', () => {
    // 2026-02-15 00:00:00 UTC
    expect(formatDate(1771113600)).toBe('2026-02-15');
  });

  it('formats epoch as 1970-01-01', () => {
    expect(formatDate(0)).toBe('1970-01-01');
  });

  it('formats current year correctly', () => {
    // 2026-01-01 00:00:00 UTC
    expect(formatDate(1767225600)).toBe('2026-01-01');
  });
});

describe('mrrToMarkdown', () => {
  it('formats complete MRR result', () => {
    const result: MrrResult = {
      totalMrrCents: 125000,
      totalMrrFormatted: '$1,250.00',
      currency: 'usd',
      subscriptionCount: 42,
      statusBreakdown: {
        active: 40,
        trialing: 1,
        pastDue: 1,
      },
      asOfDate: '2026-02-15',
    };

    const md = mrrToMarkdown(result);
    
    expect(md).toContain('# Monthly Recurring Revenue (MRR)');
    expect(md).toContain('**Total MRR:** $1,250.00');
    expect(md).toContain('**Currency:** USD');
    expect(md).toContain('**Subscriptions:** 42');
    expect(md).toContain('**As of:** 2026-02-15');
    expect(md).toContain('Active: 40');
    expect(md).toContain('Trialing: 1');
    expect(md).toContain('Past Due: 1');
  });

  it('handles zero subscriptions', () => {
    const result: MrrResult = {
      totalMrrCents: 0,
      totalMrrFormatted: '$0.00',
      currency: 'usd',
      subscriptionCount: 0,
      statusBreakdown: {
        active: 0,
        trialing: 0,
        pastDue: 0,
      },
      asOfDate: '2026-02-15',
    };

    const md = mrrToMarkdown(result);
    expect(md).toContain('**Subscriptions:** 0');
  });
});

describe('churnToMarkdown', () => {
  it('formats complete churn result', () => {
    const result: ChurnResult = {
      periodDays: 30,
      startDate: '2026-01-15',
      endDate: '2026-02-15',
      customerChurnRate: 5.2,
      revenueChurnRate: 3.8,
      churnedCustomers: 3,
      churnedMrrCents: 15000,
      churnedMrrFormatted: '$150.00',
      startingCustomers: 58,
      startingMrrCents: 395000,
      currency: 'usd',
    };

    const md = churnToMarkdown(result);
    
    expect(md).toContain('# Churn Analysis');
    expect(md).toContain('**Period:** 30 days (2026-01-15 to 2026-02-15)');
    expect(md).toContain('**Customer Churn Rate:** 5.2%');
    expect(md).toContain('**Revenue Churn Rate:** 3.8%');
    expect(md).toContain('**Churned Customers:** 3');
    expect(md).toContain('**Churned MRR:** $150.00');
    expect(md).toContain('**Starting Customers:** 58');
    expect(md).toContain('**Starting MRR:** $3,950.00');
  });

  it('handles zero churn', () => {
    const result: ChurnResult = {
      periodDays: 30,
      startDate: '2026-01-15',
      endDate: '2026-02-15',
      customerChurnRate: 0,
      revenueChurnRate: 0,
      churnedCustomers: 0,
      churnedMrrCents: 0,
      churnedMrrFormatted: '$0.00',
      startingCustomers: 50,
      startingMrrCents: 500000,
      currency: 'usd',
    };

    const md = churnToMarkdown(result);
    expect(md).toContain('**Customer Churn Rate:** 0.0%');
    expect(md).toContain('**Churned Customers:** 0');
  });
});

describe('planBreakdownToMarkdown', () => {
  it('formats plan breakdown as table', () => {
    const result: RevenueByPlanResult = {
      plans: [
        {
          planName: 'Pro',
          productName: 'SaaS Product',
          priceFormatted: '$49.00',
          interval: 'month',
          activeSubscribers: 30,
          mrrCents: 147000,
          mrrFormatted: '$1,470.00',
          percentOfTotal: 58.8,
        },
        {
          planName: 'Basic',
          productName: 'SaaS Product',
          priceFormatted: '$19.00',
          interval: 'month',
          activeSubscribers: 54,
          mrrCents: 102600,
          mrrFormatted: '$1,026.00',
          percentOfTotal: 41.2,
        },
      ],
      totalMrrCents: 249600,
      totalMrrFormatted: '$2,496.00',
      currency: 'usd',
    };

    const md = planBreakdownToMarkdown(result);
    
    expect(md).toContain('# Revenue by Plan');
    expect(md).toContain('**Total MRR:** $2,496.00');
    expect(md).toContain('| Plan | Product | Price | Interval | Subscribers | MRR | % of Total |');
    expect(md).toContain('| Pro | SaaS Product | $49.00 | month | 30 | $1,470.00 | 58.8% |');
    expect(md).toContain('| Basic | SaaS Product | $19.00 | month | 54 | $1,026.00 | 41.2% |');
  });

  it('sorts plans by MRR descending', () => {
    const result: RevenueByPlanResult = {
      plans: [
        {
          planName: 'Basic',
          productName: 'Product',
          priceFormatted: '$10.00',
          interval: 'month',
          activeSubscribers: 10,
          mrrCents: 10000,
          mrrFormatted: '$100.00',
          percentOfTotal: 33.3,
        },
        {
          planName: 'Pro',
          productName: 'Product',
          priceFormatted: '$20.00',
          interval: 'month',
          activeSubscribers: 10,
          mrrCents: 20000,
          mrrFormatted: '$200.00',
          percentOfTotal: 66.7,
        },
      ],
      totalMrrCents: 30000,
      totalMrrFormatted: '$300.00',
      currency: 'usd',
    };

    const md = planBreakdownToMarkdown(result);
    const lines = md.split('\n');
    
    // Find table rows (skip header and separator)
    const tableStart = lines.findIndex(l => l.includes('|------|'));
    const firstRow = lines[tableStart + 1];
    const secondRow = lines[tableStart + 2];
    
    // Pro (higher MRR) should come first
    expect(firstRow).toContain('Pro');
    expect(secondRow).toContain('Basic');
  });

  it('handles empty plans array', () => {
    const result: RevenueByPlanResult = {
      plans: [],
      totalMrrCents: 0,
      totalMrrFormatted: '$0.00',
      currency: 'usd',
    };

    const md = planBreakdownToMarkdown(result);
    expect(md).toContain('**Total MRR:** $0.00');
    expect(md).toContain('| Plan | Product | Price | Interval | Subscribers | MRR | % of Total |');
  });
});

describe('subscriberStatsToMarkdown', () => {
  it('formats subscriber stats', () => {
    const result: SubscriberStats = {
      periodDays: 30,
      totalActive: 100,
      newThisPeriod: 15,
      churnedThisPeriod: 5,
      netChange: 10,
      trialing: 3,
      pastDue: 2,
    };

    const md = subscriberStatsToMarkdown(result);
    
    expect(md).toContain('# Subscriber Statistics');
    expect(md).toContain('**Period:** Last 30 days');
    expect(md).toContain('**Total Active Subscribers:** 100');
    expect(md).toContain('**Trialing:** 3');
    expect(md).toContain('**Past Due:** 2');
    expect(md).toContain('**New Subscribers:** 15');
    expect(md).toContain('**Churned Subscribers:** 5');
    expect(md).toContain('**Net Change:** +10');
  });

  it('handles negative net change', () => {
    const result: SubscriberStats = {
      periodDays: 30,
      totalActive: 90,
      newThisPeriod: 5,
      churnedThisPeriod: 15,
      netChange: -10,
      trialing: 1,
      pastDue: 0,
    };

    const md = subscriberStatsToMarkdown(result);
    expect(md).toContain('**Net Change:** -10');
  });

  it('handles zero net change', () => {
    const result: SubscriberStats = {
      periodDays: 7,
      totalActive: 50,
      newThisPeriod: 5,
      churnedThisPeriod: 5,
      netChange: 0,
      trialing: 0,
      pastDue: 0,
    };

    const md = subscriberStatsToMarkdown(result);
    expect(md).toContain('**Net Change:** +0');
  });
});

describe('changesToMarkdown', () => {
  it('formats recent changes with summary', () => {
    const result: RecentChangesResult = {
      days: 7,
      changes: [
        {
          type: 'new',
          customerEmail: 'alice@example.com',
          planName: 'Pro',
          amountFormatted: '$49.00',
          date: '2026-02-20',
        },
        {
          type: 'canceled',
          customerEmail: 'bob@example.com',
          planName: 'Basic',
          amountFormatted: '$19.00',
          date: '2026-02-19',
        },
        {
          type: 'upgraded',
          customerEmail: 'charlie@example.com',
          planName: 'Enterprise',
          amountFormatted: '$199.00',
          date: '2026-02-18',
        },
      ],
      summary: {
        newCount: 1,
        canceledCount: 1,
        upgradedCount: 1,
        downgradedCount: 0,
        failedPaymentCount: 0,
      },
    };

    const md = changesToMarkdown(result);
    
    expect(md).toContain('# Recent Subscription Changes');
    expect(md).toContain('**Period:** Last 7 days');
    expect(md).toContain('- New: 1');
    expect(md).toContain('- Canceled: 1');
    expect(md).toContain('- Upgraded: 1');
    expect(md).toContain('### New Subscriptions');
    expect(md).toContain('**alice@example.com** - Pro ($49.00) - 2026-02-20');
    expect(md).toContain('### Cancellations');
    expect(md).toContain('**bob@example.com** - Basic ($19.00) - 2026-02-19');
    expect(md).toContain('### Upgrades');
    expect(md).toContain('**charlie@example.com** - Enterprise ($199.00) - 2026-02-18');
  });

  it('handles empty changes array', () => {
    const result: RecentChangesResult = {
      days: 7,
      changes: [],
      summary: {
        newCount: 0,
        canceledCount: 0,
        upgradedCount: 0,
        downgradedCount: 0,
        failedPaymentCount: 0,
      },
    };

    const md = changesToMarkdown(result);
    expect(md).toContain('_No changes in this period._');
  });

  it('handles missing email', () => {
    const result: RecentChangesResult = {
      days: 7,
      changes: [
        {
          type: 'new',
          customerEmail: '',
          planName: 'Pro',
          amountFormatted: '$49.00',
          date: '2026-02-20',
        },
      ],
      summary: {
        newCount: 1,
        canceledCount: 0,
        upgradedCount: 0,
        downgradedCount: 0,
        failedPaymentCount: 0,
      },
    };

    const md = changesToMarkdown(result);
    expect(md).toContain('**No email**');
  });

  it('groups changes by type', () => {
    const result: RecentChangesResult = {
      days: 7,
      changes: [
        {
          type: 'new',
          customerEmail: 'user1@example.com',
          planName: 'Pro',
          amountFormatted: '$49.00',
          date: '2026-02-20',
        },
        {
          type: 'new',
          customerEmail: 'user2@example.com',
          planName: 'Pro',
          amountFormatted: '$49.00',
          date: '2026-02-19',
        },
        {
          type: 'canceled',
          customerEmail: 'user3@example.com',
          planName: 'Basic',
          amountFormatted: '$19.00',
          date: '2026-02-18',
        },
      ],
      summary: {
        newCount: 2,
        canceledCount: 1,
        upgradedCount: 0,
        downgradedCount: 0,
        failedPaymentCount: 0,
      },
    };

    const md = changesToMarkdown(result);
    
    // Should have separate sections
    expect(md).toContain('### New Subscriptions');
    expect(md).toContain('### Cancellations');
    
    // Should NOT have sections for types with 0 events
    expect(md).not.toContain('### Upgrades');
    expect(md).not.toContain('### Downgrades');
    expect(md).not.toContain('### Failed Payments');
  });
});
