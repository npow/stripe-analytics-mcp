/**
 * Formatting utilities for stripe-analytics-mcp.
 * Converts metric results to markdown for LLM consumption.
 */

import type {
  MrrResult,
  ChurnResult,
  RevenueByPlanResult,
  SubscriberStats,
  RecentChangesResult,
  DashboardResult,
  FailedPaymentsResult,
  MrrMovementResult,
} from '../types.js';

/**
 * Format cents to currency string.
 * @param cents - Amount in cents (can be negative or 0)
 * @param currency - Currency code (default "usd")
 * @returns Formatted string like "$12.50" or "-$5.00"
 */
export function formatCents(cents: number, currency: string = 'usd'): string {
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const dollars = absCents / 100;

  // Get currency symbol
  const symbol = getCurrencySymbol(currency);

  // Format with 2 decimal places and thousands separators
  const formatted = dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return isNegative ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

/**
 * Get currency symbol from currency code.
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    'usd': '$',
    'eur': '€',
    'gbp': '£',
    'jpy': '¥',
    'cad': 'CA$',
    'aud': 'A$',
  };
  return symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
}

/**
 * Format percentage value.
 * @param value - Percentage as number (e.g., 4.2 for 4.2%)
 * @returns Formatted string like "4.2%"
 */
export function formatPercent(value: number): string {
  // Handle NaN
  if (isNaN(value) || !isFinite(value)) {
    return '0.0%';
  }
  
  // Handle 0
  if (value === 0) {
    return '0.0%';
  }
  
  // Format with 1 decimal place
  return `${value.toFixed(1)}%`;
}

/**
 * Format unix timestamp to ISO date string (UTC).
 * @param timestamp - Unix timestamp in seconds
 * @returns ISO date string like "2026-02-15"
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Format MRR result as markdown.
 */
export function mrrToMarkdown(result: MrrResult): string {
  const lines = [
    '# Monthly Recurring Revenue (MRR)',
    '',
    `**Total MRR:** ${result.totalMrrFormatted}`,
    `**Currency:** ${result.currency.toUpperCase()}`,
    `**Subscriptions:** ${result.subscriptionCount}`,
    `**As of:** ${result.asOfDate}`,
    '',
    '## Status Breakdown',
    `- Active: ${result.statusBreakdown.active}`,
    `- Trialing: ${result.statusBreakdown.trialing}`,
    `- Past Due: ${result.statusBreakdown.pastDue}`,
  ];
  
  return lines.join('\n');
}

/**
 * Format churn result as markdown.
 */
export function churnToMarkdown(result: ChurnResult): string {
  const lines = [
    '# Churn Analysis',
    '',
    `**Period:** ${result.periodDays} days (${result.startDate} to ${result.endDate})`,
    '',
    '## Churn Rates',
    `- **Customer Churn Rate:** ${formatPercent(result.customerChurnRate)}`,
    `- **Revenue Churn Rate:** ${formatPercent(result.revenueChurnRate)}`,
    '',
    '## Churned Metrics',
    `- **Churned Customers:** ${result.churnedCustomers}`,
    `- **Churned MRR:** ${result.churnedMrrFormatted}`,
    '',
    '## Starting Metrics',
    `- **Starting Customers:** ${result.startingCustomers}`,
    `- **Starting MRR:** ${formatCents(result.startingMrrCents, result.currency)}`,
  ];
  
  return lines.join('\n');
}

/**
 * Format revenue by plan result as markdown table.
 */
export function planBreakdownToMarkdown(result: RevenueByPlanResult): string {
  const lines = [
    '# Revenue by Plan',
    '',
    `**Total MRR:** ${result.totalMrrFormatted}`,
    `**Currency:** ${result.currency.toUpperCase()}`,
    '',
    '| Plan | Product | Price | Interval | Subscribers | MRR | % of Total |',
    '|------|---------|-------|----------|-------------|-----|------------|',
  ];
  
  // Sort plans by MRR descending
  const sortedPlans = [...result.plans].sort((a, b) => b.mrrCents - a.mrrCents);
  
  for (const plan of sortedPlans) {
    const row = [
      plan.planName,
      plan.productName,
      plan.priceFormatted,
      plan.interval,
      plan.activeSubscribers.toString(),
      plan.mrrFormatted,
      formatPercent(plan.percentOfTotal),
    ].join(' | ');
    
    lines.push(`| ${row} |`);
  }
  
  return lines.join('\n');
}

/**
 * Format subscriber stats as markdown.
 */
export function subscriberStatsToMarkdown(result: SubscriberStats): string {
  const netChangeSign = result.netChange >= 0 ? '+' : '';
  
  const lines = [
    '# Subscriber Statistics',
    '',
    `**Period:** Last ${result.periodDays} days`,
    '',
    '## Current Status',
    `- **Total Active Subscribers:** ${result.totalActive}`,
    `- **Trialing:** ${result.trialing}`,
    `- **Past Due:** ${result.pastDue}`,
    '',
    '## Period Changes',
    `- **New Subscribers:** ${result.newThisPeriod}`,
    `- **Churned Subscribers:** ${result.churnedThisPeriod}`,
    `- **Net Change:** ${netChangeSign}${result.netChange}`,
  ];
  
  return lines.join('\n');
}

/**
 * Format recent changes as markdown list with summary.
 */
export function changesToMarkdown(result: RecentChangesResult): string {
  const lines = [
    '# Recent Subscription Changes',
    '',
    `**Period:** Last ${result.days} days`,
    '',
    '## Summary',
    `- New: ${result.summary.newCount}`,
    `- Canceled: ${result.summary.canceledCount}`,
    `- Upgraded: ${result.summary.upgradedCount}`,
    `- Downgraded: ${result.summary.downgradedCount}`,
    `- Failed Payments: ${result.summary.failedPaymentCount}`,
  ];
  
  if (result.changes.length === 0) {
    lines.push('', '_No changes in this period._');
    return lines.join('\n');
  }
  
  lines.push('', '## Recent Events');
  
  // Group changes by type for better readability
  const changesByType: Record<string, typeof result.changes> = {
    new: [],
    canceled: [],
    upgraded: [],
    downgraded: [],
    payment_failed: [],
    reactivated: [],
  };
  
  for (const change of result.changes) {
    changesByType[change.type].push(change);
  }
  
  // Format each type section
  const typeLabels: Record<string, string> = {
    new: '### New Subscriptions',
    canceled: '### Cancellations',
    upgraded: '### Upgrades',
    downgraded: '### Downgrades',
    payment_failed: '### Failed Payments',
    reactivated: '### Reactivations',
  };
  
  for (const [type, changes] of Object.entries(changesByType)) {
    if (changes.length === 0) continue;
    
    lines.push('', typeLabels[type]);
    
    for (const change of changes) {
      const email = change.customerEmail || 'No email';
      lines.push(`- **${email}** - ${change.planName} (${change.amountFormatted}) - ${change.date}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format dashboard result — the morning check.
 */
export function dashboardToMarkdown(result: DashboardResult): string {
  const lines: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  lines.push(`# Dashboard — ${today}`);
  lines.push('');
  lines.push(`**MRR:** ${result.mrr.totalMrrFormatted} (${result.mrrMovement.netNewMrrFormatted} this week)`);
  lines.push(`**Subscriptions:** ${result.mrr.subscriptionCount} active, ${result.mrr.statusBreakdown.trialing} trialing, ${result.mrr.statusBreakdown.pastDue} past due`);

  lines.push('');
  lines.push('## MRR Movement (last 7 days)');
  lines.push(`- New: +${formatCents(result.mrrMovement.newMrrCents, result.mrrMovement.currency)}`);
  lines.push(`- Expansion: +${formatCents(result.mrrMovement.expansionMrrCents, result.mrrMovement.currency)}`);
  lines.push(`- Contraction: -${formatCents(result.mrrMovement.contractionMrrCents, result.mrrMovement.currency)}`);
  lines.push(`- Churned: -${formatCents(result.mrrMovement.churnedMrrCents, result.mrrMovement.currency)}`);
  lines.push(`- **Net:** ${result.mrrMovement.netNewMrrFormatted}`);

  const qr = result.quickRatio;
  let qrLabel = 'critical';
  if (qr === Infinity) qrLabel = 'no churn';
  else if (qr >= 4) qrLabel = 'excellent';
  else if (qr >= 2) qrLabel = 'healthy';
  else if (qr >= 1) qrLabel = 'okay';
  lines.push('');
  lines.push(`**Quick Ratio:** ${qr === Infinity ? '∞' : qr.toFixed(1)} (${qrLabel})`);

  if (result.failedPayments.length > 0) {
    const totalAtRisk = result.failedPayments.reduce((sum, fp) => sum + fp.amountCents, 0);
    lines.push('');
    lines.push(`## Failed Payments (${result.failedPayments.length} — ${formatCents(totalAtRisk)} at risk)`);
    for (const fp of result.failedPayments.slice(0, 10)) {
      lines.push(`- **${fp.customerEmail}** — ${fp.amountFormatted} — ${fp.failureReason} — attempt ${fp.attemptCount}`);
    }
    if (result.failedPayments.length > 10) {
      lines.push(`- _...and ${result.failedPayments.length - 10} more_`);
    }
  } else {
    lines.push('');
    lines.push('## Failed Payments');
    lines.push('_None — all payments healthy._');
  }

  if (result.expiringTrials.length > 0) {
    const potentialMrr = result.expiringTrials.reduce((sum, t) => sum + t.mrrIfConverted, 0);
    lines.push('');
    lines.push(`## Trials Expiring Soon (${result.expiringTrials.length} — ${formatCents(potentialMrr)} potential MRR)`);
    for (const trial of result.expiringTrials) {
      lines.push(`- **${trial.customerEmail}** — ${trial.planName} — ${trial.daysRemaining} day${trial.daysRemaining !== 1 ? 's' : ''} left — ${trial.mrrIfConvertedFormatted}/mo`);
    }
  } else {
    lines.push('');
    lines.push('## Trials Expiring Soon');
    lines.push('_No trials expiring in the next 3 days._');
  }

  return lines.join('\n');
}

/**
 * Format failed payments result.
 */
export function failedPaymentsToMarkdown(result: FailedPaymentsResult): string {
  const lines: string[] = [
    '# Failed Payments',
    '',
    `**Total at risk:** ${result.totalAtRiskFormatted}`,
    `**Failed invoices:** ${result.failedPayments.length}`,
  ];

  if (result.failedPayments.length === 0) {
    lines.push('', '_No failed payments — all invoices are healthy._');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('| Customer | Amount | Reason | Attempts | Last Attempt | Plan |');
  lines.push('|----------|--------|--------|----------|--------------|------|');

  for (const fp of result.failedPayments) {
    lines.push(`| ${fp.customerEmail} | ${fp.amountFormatted} | ${fp.failureReason} | ${fp.attemptCount} | ${fp.lastAttemptDate} | ${fp.planName || '—'} |`);
  }

  return lines.join('\n');
}

/**
 * Format MRR movement result.
 */
export function mrrMovementToMarkdown(result: MrrMovementResult): string {
  return [
    '# MRR Movement',
    '',
    `**Period:** Last ${result.periodDays} days`,
    `**Net New MRR:** ${result.netNewMrrFormatted}`,
    '',
    '## Breakdown',
    `- **New MRR:** +${formatCents(result.newMrrCents, result.currency)}`,
    `- **Expansion MRR:** +${formatCents(result.expansionMrrCents, result.currency)}`,
    `- **Contraction MRR:** -${formatCents(result.contractionMrrCents, result.currency)}`,
    `- **Churned MRR:** -${formatCents(result.churnedMrrCents, result.currency)}`,
    '',
    `**Net:** ${result.netNewMrrFormatted}`,
  ].join('\n');
}
