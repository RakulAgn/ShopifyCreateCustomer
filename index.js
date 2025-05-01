/**
 * Shopify Bulk Import Tool
 * Main entry file for creating customers and orders in Shopify
 */
require('dotenv').config();
const ShopifyCustomerCreator = require('./shopifyCustomerCreator');
const crypto = require('crypto');

async function main() {
  try {
    console.log('Shopify Bulk Import Tool - Started');
    console.log('-----------------------------------');

    // Validate token before proceeding
    validateTokenSettings();

    // Get configuration from environment variables
    const customerSettings = {
      totalCustomers: Number(process.env.TOTAL_CUSTOMERS) || 1000000,
      batchSize: Number(process.env.BATCH_SIZE) || 10,
      apiCallsPerSecond: Number(process.env.API_CALLS_PER_SECOND) || 2,
      chunkSize: Number(process.env.CHUNK_SIZE) || 1000,
    };

    // Order creation settings
    const createOrders = process.env.CREATE_ORDERS === 'true';
    const orderSettings = {
      ordersPerCustomer: Number(process.env.ORDERS_PER_CUSTOMER) || 1,
      orderRateLimit: Number(process.env.ORDER_RATE_LIMIT) || 1,
      orderBatchSize: Number(process.env.ORDER_BATCH_SIZE) || 5,
      orderChunkSize: Number(process.env.ORDER_CHUNK_SIZE) || 100,
      orderStatus: process.env.ORDER_STATUS || 'completed',
      orderFinancialStatus: process.env.ORDER_FINANCIAL_STATUS || 'paid',
      orderFulfillmentStatus: process.env.ORDER_FULFILLMENT_STATUS || 'fulfilled',
    };

    // Customer tags from environment
    const customerTags = process.env.CUSTOMER_TAGS || 'API_Created, Bulk_Import';

    // Log configuration
    console.log('Configuration from environment variables:');
    console.log('\nCustomer Creation Settings:');
    console.log(`- Total Customers: ${customerSettings.totalCustomers}`);
    console.log(`- Batch Size: ${customerSettings.batchSize}`);
    console.log(`- API Rate Limit: ${customerSettings.apiCallsPerSecond} calls/second`);
    console.log(`- Chunk Size: ${customerSettings.chunkSize}`);
    console.log(`- Customer Tags: ${customerTags}`);

    console.log('\nOrder Creation Settings:');
    console.log(`- Order Creation: ${createOrders ? 'Enabled' : 'Disabled'}`);

    if (createOrders) {
      console.log(`- Orders Per Customer: ${orderSettings.ordersPerCustomer}`);
      console.log(`- Order API Rate Limit: ${orderSettings.orderRateLimit} calls/second`);
      console.log(`- Order Batch Size: ${orderSettings.orderBatchSize}`);
      console.log(`- Order Chunk Size: ${orderSettings.orderChunkSize}`);
      console.log(`- Order Status: ${orderSettings.orderStatus}`);
      console.log(`- Financial Status: ${orderSettings.orderFinancialStatus}`);
      console.log(`- Fulfillment Status: ${orderSettings.orderFulfillmentStatus}`);
    }

    // Verify required environment variables are set
    const requiredEnvVars = ['SHOPIFY_DOMAIN', 'ACCESS_TOKEN'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Get the access token (might be pre-decrypted or not depending on validateTokenSettings)
    const accessToken = process.env.SHOPIFY_TOKEN_DECRYPTED || process.env.ACCESS_TOKEN;

    // Create instance with appropriate config from environment
    const creator = new ShopifyCustomerCreator({
      shopifyDomain: process.env.SHOPIFY_DOMAIN,
      accessToken: accessToken,
      // Customer settings
      totalCustomers: customerSettings.totalCustomers,
      batchSize: customerSettings.batchSize,
      apiCallsPerSecond: customerSettings.apiCallsPerSecond,
      chunkSize: customerSettings.chunkSize,
      // Order settings
      createOrders: createOrders,
      ordersPerCustomer: orderSettings.ordersPerCustomer,
      orderRateLimit: orderSettings.orderRateLimit,
      orderBatchSize: orderSettings.orderBatchSize,
      orderChunkSize: orderSettings.orderChunkSize,
      orderStatus: orderSettings.orderStatus,
      orderFinancialStatus: orderSettings.orderFinancialStatus,
      orderFulfillmentStatus: orderSettings.orderFulfillmentStatus,
    });

    // Add custom data from environment variables
    const customData = {
      tags: customerTags,
      // Any additional custom fields
    };

    console.log('\nInitiating bulk creation process...');
    const results = await creator.run(customData);

    // Summary
    const customers = results.map(r => r.customer);
    const orders = results.reduce((sum, r) => sum + (r.orders ? r.orders.length : 0), 0);

    console.log('\n=== SUMMARY ===');
    console.log(`Customers created: ${customers.length}`);
    if (createOrders) {
      console.log(`Orders created: ${orders}`);
      console.log(`Average orders per customer: ${(orders / Math.max(1, customers.length)).toFixed(2)}`);
    }
    console.log('===============\n');

    console.log('Process completed successfully.');
  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    console.error('Process terminated with errors.');
    process.exit(1);
  }
}

/**
 * Check and validate token settings
 * This will try to detect if the token needs decryption and handle it accordingly
 */
function validateTokenSettings() {
  const token = process.env.ACCESS_TOKEN;

  if (!token) {
    console.error('No ACCESS_TOKEN provided in environment variables');
    return;
  }

  console.log(`Access token found (${token.length} characters)`);

  // Detect if this is a Shopify token (they start with shpat_ or shpua_)
  if (token.startsWith('shpat_') || token.startsWith('shpua_')) {
    console.log('Detected native Shopify token format - no decryption needed');
    process.env.SKIP_TOKEN_DECRYPTION = 'true';
    process.env.SHOPIFY_TOKEN_DECRYPTED = token;
    return;
  }

  // Check if decryption should be skipped
  if (process.env.SKIP_TOKEN_DECRYPTION === 'true') {
    console.log('Token decryption skipped due to SKIP_TOKEN_DECRYPTION=true');
    process.env.SHOPIFY_TOKEN_DECRYPTED = token;
    return;
  }

  // If we need to decrypt, check for the secret
  if (!process.env.SHOPIFY_API_SECRET) {
    console.warn('SHOPIFY_API_SECRET not provided, but token appears encrypted. Decryption may fail.');
    return;
  }

  // Try to decrypt the token and save it for use
  try {
    const decryptedToken = decryptToken(token, process.env.SHOPIFY_API_SECRET);
    if (decryptedToken && (decryptedToken.startsWith('shpat_') || decryptedToken.startsWith('shpua_'))) {
      console.log('Token successfully decrypted to Shopify format');
      process.env.SHOPIFY_TOKEN_DECRYPTED = decryptedToken;
    } else {
      console.warn('Token was decrypted but does not match expected Shopify format');
      process.env.SHOPIFY_TOKEN_DECRYPTED = decryptedToken;
    }
  } catch (error) {
    console.error('Failed to decrypt token:', error.message);
    console.warn('Will attempt to use the token as-is');
    process.env.SHOPIFY_TOKEN_DECRYPTED = token;
  }
}

/**
 * Try to decrypt a token using both modern and legacy methods
 * @param {string} token - The encrypted token
 * @param {string} secret - The secret key for decryption
 * @returns {string} - The decrypted token
 */
function decryptToken(token, secret) {
  try {
    const algorithm = 'aes256';
    const decipher = crypto.createDecipher(algorithm, secret);
    let dec = decipher.update(token, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (legacyError) {
    console.error('Legacy decryption also failed:', legacyError.message);
    // Return token as-is if both methods fail
    return token;
  }
}

// Add support for command-line testing
if (process.env.USE_TEST_TOKEN === 'true') {
  process.env.ACCESS_TOKEN = process.env.TEST_TOKEN || process.env.ACCESS_TOKEN;
  process.env.SKIP_TOKEN_DECRYPTION = 'true';
  console.log('Using test token from environment');
}

// Support for testing with dummy products when needed
if (process.env.USE_DUMMY_PRODUCTS !== 'true' && process.argv.includes('--dummy-products')) {
  process.env.USE_DUMMY_PRODUCTS = 'true';
  console.log('Using dummy products for testing (from command line)');
}

// Run the main function
main();
