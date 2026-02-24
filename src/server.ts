/**
 * MCP server implementation for stripe-analytics-mcp.
 * Registers 5 tools for computing Stripe SaaS metrics.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import Stripe from 'stripe';

import { createStripeClient, fetchAllSubscriptions, fetchCanceledSubscriptions, fetchRecentEvents, fetchFailedInvoices } from './stripe/client.js';
import { computeMrr } from './metrics/mrr.js';
import { computeChurn } from './metrics/churn.js';
import { computeRevenueByPlan } from './metrics/plans.js';
import { computeSubscriberStats } from './metrics/subscribers.js';
import { computeRecentChanges } from './metrics/changes.js';
import { computeDashboard, computeMrrMovement } from './metrics/dashboard.js';
import {
  mrrToMarkdown,
  churnToMarkdown,
  planBreakdownToMarkdown,
  subscriberStatsToMarkdown,
  changesToMarkdown,
  dashboardToMarkdown,
  failedPaymentsToMarkdown,
  mrrMovementToMarkdown,
} from './utils/format.js';
import type { FailedPaymentsResult } from './types.js';

/**
 * Create and configure the MCP server.
 * 
 * @param apiKey - Stripe secret API key
 * @returns Configured MCP Server instance
 */
export function createServer(apiKey: string): Server {
  const server = new Server(
    {
      name: 'stripe-analytics-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Create Stripe client
  let stripe: Stripe;
  try {
    stripe = createStripeClient(apiKey);
  } catch (error) {
    throw new Error(`Failed to initialize Stripe client: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_mrr',
          description: 'Compute current Monthly Recurring Revenue (MRR) from active Stripe subscriptions. Normalizes annual/weekly/daily subscriptions to monthly amounts, applies discounts, and excludes trials. Returns total MRR, subscription count, and status breakdown.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_churn',
          description: 'Compute customer churn rate and revenue churn rate for a given period. Returns percentage of customers lost, percentage of revenue lost, counts of churned customers, and churned MRR amount.',
          inputSchema: {
            type: 'object',
            properties: {
              period_days: {
                type: 'number',
                description: 'Number of days to analyze (default: 30, min: 1, max: 365)',
                minimum: 1,
                maximum: 365,
              },
            },
            required: [],
          },
        },
        {
          name: 'get_revenue_by_plan',
          description: 'Break down MRR by pricing plan/product. Returns a table showing each plan with subscriber count, MRR contribution, and percentage of total revenue.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_subscriber_stats',
          description: 'Get subscriber statistics for a given period. Returns total active subscribers, new subscribers, churned subscribers, net change, trial count, and past due count.',
          inputSchema: {
            type: 'object',
            properties: {
              period_days: {
                type: 'number',
                description: 'Number of days to analyze (default: 30, min: 1, max: 365)',
                minimum: 1,
                maximum: 365,
              },
            },
            required: [],
          },
        },
        {
          name: 'get_recent_changes',
          description: 'List recent subscription changes including new subscriptions, cancellations, upgrades, downgrades, and failed payments. Returns detailed event list with customer info and summary counts.',
          inputSchema: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Number of days to look back (default: 7, min: 1, max: 90)',
                minimum: 1,
                maximum: 90,
              },
            },
            required: [],
          },
        },
        {
          name: 'get_dashboard',
          description: 'The morning check — get everything important in one call. Returns: current MRR with week-over-week change, MRR movement breakdown (new/expansion/contraction/churn), failed payments needing attention, trials expiring in 3 days, and Quick Ratio. Use this when someone asks "how\'s my business doing?" or "morning check" or "what happened overnight?"',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_failed_payments',
          description: 'Get all failed payment attempts with customer email, amount, failure reason, attempt count, and plan. These are recoverable revenue — money you can get back by reaching out to customers. Shows total revenue at risk.',
          inputSchema: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Number of days to look back (default: 30, min: 1, max: 90)',
                minimum: 1,
                maximum: 90,
              },
            },
            required: [],
          },
        },
        {
          name: 'get_mrr_movement',
          description: 'MRR waterfall showing how MRR changed over a period: new MRR from new customers, expansion from upgrades, contraction from downgrades, and churn from cancellations. Answers "how did my MRR change this week/month?"',
          inputSchema: {
            type: 'object',
            properties: {
              period_days: {
                type: 'number',
                description: 'Number of days to analyze (default: 7, min: 1, max: 90)',
                minimum: 1,
                maximum: 90,
              },
            },
            required: [],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_mrr': {
          // Fetch all subscriptions
          const subscriptions = await fetchAllSubscriptions(stripe);
          
          // Compute MRR
          const result = computeMrr(subscriptions);
          
          // Format as markdown
          const markdown = mrrToMarkdown(result);
          
          return {
            content: [
              {
                type: 'text',
                text: markdown,
              },
            ],
          };
        }

        case 'get_churn': {
          // Validate and parse arguments
          const schema = z.object({
            period_days: z.number().min(1).max(365).optional().default(30),
          });
          const { period_days } = schema.parse(args || {});
          
          // Fetch all subscriptions and canceled subscriptions
          const [allSubs, canceledSubs] = await Promise.all([
            fetchAllSubscriptions(stripe),
            fetchCanceledSubscriptions(stripe, period_days),
          ]);
          
          // Compute churn
          const result = computeChurn(allSubs, canceledSubs, period_days);
          
          // Format as markdown
          const markdown = churnToMarkdown(result);
          
          return {
            content: [
              {
                type: 'text',
                text: markdown,
              },
            ],
          };
        }

        case 'get_revenue_by_plan': {
          // Fetch all subscriptions
          const subscriptions = await fetchAllSubscriptions(stripe);
          
          // Compute revenue by plan
          const result = computeRevenueByPlan(subscriptions);
          
          // Format as markdown
          const markdown = planBreakdownToMarkdown(result);
          
          return {
            content: [
              {
                type: 'text',
                text: markdown,
              },
            ],
          };
        }

        case 'get_subscriber_stats': {
          // Validate and parse arguments
          const schema = z.object({
            period_days: z.number().min(1).max(365).optional().default(30),
          });
          const { period_days } = schema.parse(args || {});
          
          // Fetch all subscriptions (including canceled for churn calculation)
          const allStatuses = ['active', 'trialing', 'past_due', 'canceled'] as const;
          const subscriptions = await fetchAllSubscriptions(stripe, allStatuses as any);
          
          // Compute subscriber stats
          const result = computeSubscriberStats(subscriptions, period_days);
          
          // Format as markdown
          const markdown = subscriberStatsToMarkdown(result);
          
          return {
            content: [
              {
                type: 'text',
                text: markdown,
              },
            ],
          };
        }

        case 'get_recent_changes': {
          // Validate and parse arguments
          const schema = z.object({
            days: z.number().min(1).max(90).optional().default(7),
          });
          const { days } = schema.parse(args || {});
          
          // Fetch recent events
          const events = await fetchRecentEvents(stripe, days);
          
          // Compute recent changes
          const result = computeRecentChanges(events, days);
          
          // Format as markdown
          const markdown = changesToMarkdown(result);
          
          return {
            content: [
              {
                type: 'text',
                text: markdown,
              },
            ],
          };
        }

        case 'get_dashboard': {
          const [subs, canceled, events, failed] = await Promise.all([
            fetchAllSubscriptions(stripe),
            fetchCanceledSubscriptions(stripe, 7),
            fetchRecentEvents(stripe, 7),
            fetchFailedInvoices(stripe, 30),
          ]);
          const result = computeDashboard(subs, canceled, events, failed, 7);
          return {
            content: [{ type: 'text', text: dashboardToMarkdown(result) }],
          };
        }

        case 'get_failed_payments': {
          const schema = z.object({
            days: z.number().min(1).max(90).optional().default(30),
          });
          const { days } = schema.parse(args || {});
          const failedPayments = await fetchFailedInvoices(stripe, days);
          const totalAtRisk = failedPayments.reduce((sum, fp) => sum + fp.amountCents, 0);
          const result: FailedPaymentsResult = {
            failedPayments,
            totalAtRiskCents: totalAtRisk,
            totalAtRiskFormatted: `$${(totalAtRisk / 100).toFixed(2)}`,
            currency: 'usd',
          };
          return {
            content: [{ type: 'text', text: failedPaymentsToMarkdown(result) }],
          };
        }

        case 'get_mrr_movement': {
          const schema = z.object({
            period_days: z.number().min(1).max(90).optional().default(7),
          });
          const { period_days } = schema.parse(args || {});
          const [subs, canceled, events] = await Promise.all([
            fetchAllSubscriptions(stripe),
            fetchCanceledSubscriptions(stripe, period_days),
            fetchRecentEvents(stripe, period_days),
          ]);
          const result = computeMrrMovement(subs, canceled, events, period_days);
          return {
            content: [{ type: 'text', text: mrrMovementToMarkdown(result) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      // Return friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run the server with stdio transport.
 * 
 * @param apiKey - Stripe secret API key
 */
export async function runServer(apiKey: string): Promise<void> {
  const server = createServer(apiKey);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('Stripe Analytics MCP server running on stdio');
}
