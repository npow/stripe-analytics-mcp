#!/usr/bin/env node
/**
 * CLI entry point for stripe-analytics-mcp.
 * Parses environment variables and command-line flags, then starts the MCP server.
 */

import { runServer } from './server.js';

/**
 * Parse command-line arguments and environment variables.
 * Returns the API key or exits with error.
 */
function parseArgs(): string {
  const args = process.argv.slice(2);
  
  // Check for --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
stripe-analytics-mcp - MCP server for Stripe SaaS metrics

USAGE:
  stripe-analytics-mcp [OPTIONS]

OPTIONS:
  --key <key>    Stripe secret API key (overrides STRIPE_SECRET_KEY env var)
  --help, -h     Show this help message

ENVIRONMENT VARIABLES:
  STRIPE_SECRET_KEY    Stripe secret API key (required if --key not provided)

EXAMPLES:
  # Using environment variable
  STRIPE_SECRET_KEY=sk_test_123 stripe-analytics-mcp

  # Using command-line flag
  stripe-analytics-mcp --key sk_test_123

TOOLS:
  get_mrr                  - Compute Monthly Recurring Revenue
  get_churn                - Compute churn rates (customer & revenue)
  get_revenue_by_plan      - Break down MRR by pricing plan
  get_subscriber_stats     - Get subscriber counts and changes
  get_recent_changes       - List recent subscription events

For more information, visit: https://github.com/yourusername/stripe-analytics-mcp
`);
    process.exit(0);
  }
  
  // Check for --key flag
  let apiKey: string | undefined;
  const keyIndex = args.indexOf('--key');
  if (keyIndex !== -1 && keyIndex + 1 < args.length) {
    apiKey = args[keyIndex + 1];
  }
  
  // Fall back to environment variable
  if (!apiKey) {
    apiKey = process.env.STRIPE_SECRET_KEY;
  }
  
  // Validate API key
  if (!apiKey) {
    console.error('Error: Stripe API key is required.');
    console.error('');
    console.error('Provide it via:');
    console.error('  - STRIPE_SECRET_KEY environment variable, or');
    console.error('  - --key command-line flag');
    console.error('');
    console.error('Example:');
    console.error('  STRIPE_SECRET_KEY=sk_test_123 stripe-analytics-mcp');
    console.error('');
    console.error('Run --help for more information.');
    process.exit(1);
  }
  
  if (!apiKey.startsWith('sk_')) {
    console.error('Error: Invalid Stripe API key format.');
    console.error('Expected key starting with sk_ (e.g., sk_test_... or sk_live_...)');
    process.exit(1);
  }
  
  return apiKey;
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  try {
    const apiKey = parseArgs();
    
    // Set up graceful shutdown
    const shutdown = (): void => {
      console.error('Shutting down gracefully...');
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Start the server
    await runServer(apiKey);
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
