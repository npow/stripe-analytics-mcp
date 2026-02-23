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

import { createStripeClient, fetchAllSubscriptions, fetchCanceledSubscriptions, fetchRecentEvents } from './stripe/client.js';
import { computeMrr } from './metrics/mrr.js';
import { computeChurn } from './metrics/churn.js';
import { computeRevenueByPlan } from './metrics/plans.js';
import { computeSubscriberStats } from './metrics/subscribers.js';
import { computeRecentChanges } from './metrics/changes.js';
import {
  mrrToMarkdown,
  churnToMarkdown,
  planBreakdownToMarkdown,
  subscriberStatsToMarkdown,
  changesToMarkdown,
} from './utils/format.js';

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
