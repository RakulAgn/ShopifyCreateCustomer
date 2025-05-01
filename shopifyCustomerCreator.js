require('dotenv').config();
const crypto = require('crypto');
const { US_DATA, CA_DATA } = require('./constant');
const ShopifyOrderCreator = require('./shopifyOrderCreator');

/**
 * ShopifyCustomerCreator - A class to handle bulk creation of customers for a Shopify store
 * Features:
 * - Parallel processing
 * - Batch operations
 * - Rate limiting
 * - Progress tracking
 * - Error handling and retries
 * - Token decryption
 */
class ShopifyCustomerCreator {
  /**
   * Constructor - Initialize the ShopifyCustomerCreator with configuration
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    // Handle the access token properly
    let accessToken = config.accessToken || process.env.ACCESS_TOKEN;

    // Skip decryption if requested or if token is already in Shopify format
    const skipDecryption = process.env.SKIP_TOKEN_DECRYPTION === 'true' || (accessToken && (accessToken.startsWith('shpat_') || accessToken.startsWith('shpua_')));

    if (!skipDecryption && process.env.SHOPIFY_API_SECRET) {
      try {
        accessToken = this._decryptToken(accessToken);
        console.log('Access token decrypted successfully');
      } catch (error) {
        console.error('Failed to decrypt token:', error.message);
        console.log('Using token as-is');
      }
    } else {
      console.log('Using token directly (no decryption needed)');
    }

    // Store the first few characters of the token for debugging
    const tokenPrefix = accessToken ? accessToken.substring(0, 8) : 'undefined';
    console.log(`Using token starting with: ${tokenPrefix}...`);

    this.config = {
      shopifyDomain: config.shopifyDomain || process.env.SHOPIFY_DOMAIN,
      accessToken: accessToken,
      totalCustomers: config.totalCustomers || Number(process.env.TOTAL_CUSTOMERS) || 1000000,
      batchSize: config.batchSize || Number(process.env.BATCH_SIZE) || 10,
      apiCallsPerSecond: config.apiCallsPerSecond || Number(process.env.API_CALLS_PER_SECOND) || 2,
      chunkSize: config.chunkSize || Number(process.env.CHUNK_SIZE) || 1000,
      createOrders: config.createOrders || process.env.CREATE_ORDERS === 'true',
      ordersPerCustomer: config.ordersPerCustomer || Number(process.env.ORDERS_PER_CUSTOMER) || 1,
      orderRateLimit: config.orderRateLimit || Number(process.env.ORDER_RATE_LIMIT) || 1,
      orderBatchSize: config.orderBatchSize || Number(process.env.ORDER_BATCH_SIZE) || 5,
      orderChunkSize: config.orderChunkSize || Number(process.env.ORDER_CHUNK_SIZE) || 100,
      orderStatus: config.orderStatus || process.env.ORDER_STATUS || 'completed',
      orderFinancialStatus: config.orderFinancialStatus || process.env.ORDER_FINANCIAL_STATUS || 'paid',
      orderFulfillmentStatus: config.orderFulfillmentStatus || process.env.ORDER_FULFILLMENT_STATUS || 'fulfilled',
    };

    // Validate required config
    if (!this.config.shopifyDomain || !this.config.accessToken) {
      throw new Error('Missing required configuration: shopifyDomain and accessToken are required');
    }

    // Progress tracking
    this.progress = {
      completedCount: 0,
      timestamp: new Date().toISOString(),
      successfulCustomers: [],
      failedAttempts: 0,
      successfulOrders: 0,
    };

    // Base customer data
    this.baseCustomerData = {
      tags: process.env.CUSTOMER_TAGS || 'API_Created, Bulk_Import',
      email_marketing_consent: {
        state: 'subscribed',
        opt_in_level: 'single_opt_in',
        consent_updated_at: new Date().toISOString(),
        consent_collected_from: 'API',
      },
    };

    // Initialize order creator if orders should be created
    if (this.config.createOrders) {
      this.orderCreator = new ShopifyOrderCreator({
        shopifyDomain: this.config.shopifyDomain,
        accessToken: this.config.accessToken,
        apiCallsPerSecond: this.config.orderRateLimit,
        maxOrdersPerCustomer: this.config.ordersPerCustomer,
        batchSize: this.config.orderBatchSize,
        chunkSize: this.config.orderChunkSize,
        orderStatus: this.config.orderStatus,
        financialStatus: this.config.orderFinancialStatus,
        fulfillmentStatus: this.config.orderFulfillmentStatus,
      });
    }

    console.log(`ShopifyCustomerCreator initialized with domain: ${this.config.shopifyDomain}`);
    console.log(`Order creation: ${this.config.createOrders ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Generate a random phone number for US or Canada
   * @param {string} country - Country code ('US' or 'CA')
   * @returns {string} - Formatted phone number
   */
  generateRandomPhone(country) {
    if (country === 'US' || country === 'CA') {
      const areaCode = Math.floor(100 + Math.random() * 900);
      const firstPart = Math.floor(100 + Math.random() * 900);
      const secondPart = Math.floor(1000 + Math.random() * 9000);
      return `+1${areaCode}${firstPart}${secondPart}`;
    }
    return '+15555555555'; // Default
  }

  /**
   * Generate a random US ZIP code
   * @returns {string} - 5-digit ZIP code
   */
  generateRandomZipCode() {
    return String(Math.floor(10000 + Math.random() * 90000));
  }

  /**
   * Generate a random Canadian postal code
   * @returns {string} - Formatted postal code (e.g., A1B 2C3)
   */
  generateRandomPostalCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';

    return `${letters[Math.floor(Math.random() * letters.length)]}${digits[Math.floor(Math.random() * digits.length)]}${letters[Math.floor(Math.random() * letters.length)]} ${digits[Math.floor(Math.random() * digits.length)]}${letters[Math.floor(Math.random() * letters.length)]}${digits[Math.floor(Math.random() * digits.length)]}`;
  }

  /**
   * Generate a random street address
   * @param {string} country - Country code ('US' or 'CA')
   * @returns {string} - Formatted street address
   */
  generateRandomStreetAddress(country) {
    const number = Math.floor(1 + Math.random() * 9999);
    let streetName, streetType;

    if (country === 'US') {
      streetName = US_DATA.streetNames[Math.floor(Math.random() * US_DATA.streetNames.length)];
      streetType = US_DATA.streetTypes[Math.floor(Math.random() * US_DATA.streetTypes.length)];
    } else {
      streetName = CA_DATA.streetNames[Math.floor(Math.random() * CA_DATA.streetNames.length)];
      streetType = CA_DATA.streetTypes[Math.floor(Math.random() * CA_DATA.streetTypes.length)];
    }

    return `${number} ${streetName} ${streetType}`;
  }

  /**
   * Generate a random address for US or Canada
   * @param {Object} existingAddress - Optional existing address data
   * @returns {Object} - Address object for Shopify
   */
  generateRandomAddressOnlyUSandCA(existingAddress = null) {
    const keepName = existingAddress
      ? {
          first_name: existingAddress.first_name,
          last_name: existingAddress.last_name,
        }
      : {};

    const country = Math.random() < 0.5 ? 'US' : 'CA';

    if (country === 'US') {
      const state = US_DATA.states[Math.floor(Math.random() * US_DATA.states.length)];
      const city = state.cities[Math.floor(Math.random() * state.cities.length)];

      return {
        ...keepName,
        address1: this.generateRandomStreetAddress('US'),
        city: city,
        province: state.abbr,
        phone: this.generateRandomPhone('US'),
        zip: this.generateRandomZipCode(),
        country: 'US',
      };
    } else {
      const province = CA_DATA.provinces[Math.floor(Math.random() * CA_DATA.provinces.length)];
      const city = province.cities[Math.floor(Math.random() * province.cities.length)];

      return {
        ...keepName,
        address1: this.generateRandomStreetAddress('CA'),
        city: city,
        province: province.abbr,
        phone: this.generateRandomPhone('CA'),
        zip: this.generateRandomPostalCode(),
        country: 'CA',
      };
    }
  }

  /**
   * Generate a random string of specified length
   * @param {number} length - Desired string length
   * @returns {string} - Random alphanumeric string
   */
  generateRandomString(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  /**
   * Generate a random email address
   * @returns {string} - Random email address
   */
  generateRandomEmail() {
    return `${this.generateRandomString(8)}${Math.floor(Math.random() * 1000)}@example.com`;
  }

  /**
   * Generate a random first name
   * @returns {string} - Random first name
   */
  generateRandomFirstName() {
    const firstNames = ['John', 'Jane', 'Alex', 'Chris', 'Katie', 'Michael', 'Sarah', 'David', 'Emma', 'Daniel'];
    return firstNames[Math.floor(Math.random() * firstNames.length)];
  }

  /**
   * Generate complete customer data
   * @param {number} index - Customer index (for uniqueness)
   * @param {Object} customBaseData - Additional base data to include
   * @returns {Object} - Complete customer data object for Shopify API
   */
  generateCustomerData(index, customBaseData = {}) {
    return {
      first_name: `${this.generateRandomFirstName()}${index}`,
      last_name: `${this.generateRandomFirstName()}${index}`,
      email: this.generateRandomEmail(),
      verified_email: true,
      addresses: [
        {
          ...this.generateRandomAddressOnlyUSandCA(),
        },
      ],
      ...this.baseCustomerData,
      ...customBaseData,
    };
  }

  /**
   * Create a single customer in Shopify with error handling and retries
   * @param {Object} customerData - Customer data to create
   * @param {number} retries - Number of retry attempts
   * @returns {Promise<Object>} - Created customer data
   */
  async createCustomer(customerData, retries = 3) {
    const url = `https://${this.config.shopifyDomain}/admin/api/2023-10/customers.json`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        console.log(`Creating customer... (attempt ${attempt + 1}/${retries})`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.config.accessToken,
          },
          body: JSON.stringify({ customer: customerData }),
        });

        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
          console.log(`Rate limited. Waiting for ${retryAfter} seconds before retry.`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText };
          }
          throw new Error(`Shopify API error (${response.status}): ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();

        if (!data.customer || !data.customer.id) {
          console.error('Invalid customer response from Shopify:', data);
          throw new Error('Invalid customer data structure from Shopify API');
        }

        console.log(`Customer created successfully with ID: ${data.customer.id}`);
        return data;
      } catch (error) {
        if (attempt === retries - 1) {
          throw error;
        }

        console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
        console.error('Retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); // Exponential backoff
      }
    }
  }

  /**
   * Save current progress to console
   */
  saveProgress() {
    this.progress.timestamp = new Date().toISOString();
    console.log(`Progress saved: ${this.progress.completedCount} customers created.`);
    console.log(`Successful: ${this.progress.successfulCustomers.length}, Failed: ${this.progress.failedAttempts}`);

    if (this.config.createOrders) {
      console.log(`Orders created: ${this.progress.successfulOrders}`);
    }
  }

  /**
   * Process a batch of customer creations in parallel
   * @param {number} startIndex - Starting index for this batch
   * @param {number} batchSize - Number of customers to process in this batch
   * @param {Object} customBaseData - Custom base data to include
   * @returns {Promise<Array>} - Processed customers
   */
  async processBatch(startIndex, batchSize, customBaseData = {}) {
    const customers = [];

    // Process customers sequentially to better handle rate limits
    for (let i = 0; i < batchSize; i++) {
      const customerIndex = startIndex + i;
      if (customerIndex >= this.config.totalCustomers) break;

      try {
        const customerData = this.generateCustomerData(customerIndex, customBaseData);
        console.log(`Processing customer ${customerIndex + 1}/${this.config.totalCustomers}...`);

        const result = await this.createCustomer(customerData);

        if (result && result.customer) {
          customers.push(result.customer);
          this.progress.successfulCustomers.push(result.customer.id);
        } else {
          throw new Error('Invalid response structure');
        }
      } catch (error) {
        console.error(`Failed to create customer ${customerIndex}:`, error.message);
        this.progress.failedAttempts++;
      }

      // Brief delay between API calls to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000 / this.config.apiCallsPerSecond));
    }

    return customers;
  }

  // Update the createCustomersInBatches method to create orders after each batch
  async createCustomersInBatches(customBaseData = {}) {
    const startTime = new Date();
    const createdResults = [];

    console.log(`Starting customer creation process for ${this.config.totalCustomers - this.progress.completedCount} remaining customers...`);

    // Process in chunks to allow for manual stopping/resuming if needed
    for (let chunk = 0; chunk < Math.ceil(this.config.totalCustomers / this.config.chunkSize); chunk++) {
      const chunkStart = chunk * this.config.chunkSize;
      const chunkEnd = Math.min((chunk + 1) * this.config.chunkSize, this.config.totalCustomers);

      console.log(`Starting chunk ${chunk + 1}/${Math.ceil(this.config.totalCustomers / this.config.chunkSize)} (customers ${chunkStart}-${chunkEnd - 1})`);

      for (let i = chunkStart; i < chunkEnd; i += this.config.batchSize) {
        const batchStartTime = new Date();
        const batchNumber = Math.floor(i / this.config.batchSize) + 1;
        const totalBatches = Math.ceil(this.config.totalCustomers / this.config.batchSize);
        console.log(`Processing batch ${batchNumber}/${totalBatches} (${((batchNumber / totalBatches) * 100).toFixed(2)}% complete)`);

        try {
          // Step 1: Create customers in this batch
          const batchCustomers = await this.processBatch(i, this.config.batchSize, customBaseData);

          // Step 2: Create orders for these customers immediately if enabled
          let batchResults = [];
          if (this.config.createOrders && batchCustomers.length > 0 && this.orderCreator) {
            console.log(`Creating orders for ${batchCustomers.length} customers in current batch...`);
            const orderData = await this.orderCreator.createBulkOrders(batchCustomers);

            // Update order stats
            this.progress.successfulOrders += orderData.totalOrders;

            // Combine customer and order data
            batchResults = batchCustomers.map(customer => {
              const customerOrders = orderData.results.find(r => r.customer && r.customer.id === customer.id)?.orders || [];

              return {
                customer,
                orders: customerOrders,
              };
            });
          } else {
            // Just wrap customers without orders
            batchResults = batchCustomers.map(customer => ({ customer, orders: [] }));
          }

          // Add results to main collection
          createdResults.push(...batchResults);

          // Update progress
          this.progress.successfulCustomers.push(...batchCustomers.map(c => c.id));
          this.progress.completedCount = Math.min(i + this.config.batchSize, this.config.totalCustomers);

          // Save progress at intervals
          this.saveProgress();

          const batchEndTime = new Date();
          const batchDuration = (batchEndTime - batchStartTime) / 1000;

          // Count orders in this batch
          const ordersInBatch = batchResults.reduce((sum, r) => sum + (r.orders ? r.orders.length : 0), 0);

          console.log(`Batch completed. Created ${batchCustomers.length} customers and ${ordersInBatch} orders in ${batchDuration.toFixed(2)} seconds.`);
          console.log(`Progress: ${this.progress.completedCount}/${this.config.totalCustomers} (${((this.progress.completedCount / this.config.totalCustomers) * 100).toFixed(2)}%)`);

          // Calculate ETA
          const elapsedSeconds = (batchEndTime - startTime) / 1000;
          const customersPerSecond = this.progress.completedCount / elapsedSeconds || 0.01;
          const remainingCustomers = this.config.totalCustomers - this.progress.completedCount;
          const estimatedRemainingSeconds = remainingCustomers / customersPerSecond;

          const hours = Math.floor(estimatedRemainingSeconds / 3600);
          const minutes = Math.floor((estimatedRemainingSeconds % 3600) / 60);
          const seconds = Math.floor(estimatedRemainingSeconds % 60);

          console.log(`Estimated completion in: ${hours}h ${minutes}m ${seconds}s (${customersPerSecond.toFixed(2)} customers/sec)`);

          // Brief pause between batches to let system recover
          if (i + this.config.batchSize < chunkEnd) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`Error processing batch starting at ${i}:`, error);
          // Save progress before continuing
          this.saveProgress();
        }
      }

      console.log(`Completed chunk ${chunk + 1}. Progress: ${this.progress.completedCount}/${this.config.totalCustomers}`);

      // Pause between chunks for a break
      if (chunk < Math.ceil(this.config.totalCustomers / this.config.chunkSize) - 1) {
        console.log('Taking a brief pause between chunks...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const endTime = new Date();
    const totalDuration = (endTime - startTime) / 1000;
    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    const seconds = Math.floor(totalDuration % 60);

    // Count actual customers and orders
    const customers = createdResults.map(r => r.customer);
    const totalOrders = createdResults.reduce((sum, r) => sum + (r.orders ? r.orders.length : 0), 0);

    console.log(`All done! Created ${customers.length} customers and ${totalOrders} orders in ${hours}h ${minutes}m ${seconds}s`);
    console.log(`Average speed: ${(customers.length / totalDuration).toFixed(2)} customers per second`);

    if (this.config.createOrders) {
      console.log(`Orders average: ${(totalOrders / totalDuration).toFixed(2)} orders per second`);
    }

    return createdResults;
  }

  /**
   * Create orders for customers after they have been created
   * @param {Array} customers - Array of created customers
   * @returns {Promise<Array>} - Processed order results
   */
  async createOrdersForCustomers(customers) {
    if (!this.config.createOrders || !this.orderCreator || customers.length === 0) {
      return [];
    }

    console.log(`\nStarting order creation for ${customers.length} customers...`);
    console.log(`Order settings: ${this.config.ordersPerCustomer} orders per customer, status: ${this.config.orderStatus}`);

    const orderResults = await this.orderCreator.createBulkOrders(customers);

    // Update progress with order count
    this.progress.successfulOrders = orderResults.totalOrders;

    return orderResults.results;
  }

  /**
   * Main method to run the customer creation process
   * @param {Object} customBaseData - Custom base data to include
   * @returns {Promise<Array>} - Created customers with their orders
   */
  async run(customBaseData = {}) {
    try {
      console.log('Starting optimized bulk customer creation...');
      console.log(`Target: ${this.config.totalCustomers} customers with batch size ${this.config.batchSize}`);

      if (this.config.createOrders) {
        console.log(`Order creation: Enabled (${this.config.ordersPerCustomer} per customer)`);
        console.log(`Order status: ${this.config.orderStatus}`);
        console.log(`Order rate limit: ${this.config.orderRateLimit} per second`);
      } else {
        console.log('Order creation: Disabled');
      }

      // Create customers in batches and orders immediately after each batch
      const results = await this.createCustomersInBatches(customBaseData);

      // Count final stats
      const customers = results.map(r => r.customer);
      const totalOrders = results.reduce((sum, r => sum + (r.orders ? r.orders.length : 0)), 0);

      console.log(`Process complete! Created ${customers.length} customers and ${totalOrders} orders`);

      return results;
    } catch (error) {
      console.error('Error in main function:', error);
      throw error;
    }
  }

  /**
   * Configure the creator with new settings
   * @param {Object} newConfig - New configuration parameters
   */
  configure(newConfig = {}) {
    this.config = {
      ...this.config,
      ...newConfig,
    };

    // Re-initialize order creator if needed
    if (this.config.createOrders && (!this.orderCreator || newConfig.accessToken || newConfig.shopifyDomain)) {
      this.orderCreator = new ShopifyOrderCreator({
        shopifyDomain: this.config.shopifyDomain,
        accessToken: this.config.accessToken,
        apiCallsPerSecond: this.config.orderRateLimit,
        maxOrdersPerCustomer: this.config.ordersPerCustomer,
        batchSize: this.config.orderBatchSize,
        chunkSize: this.config.orderChunkSize,
        orderStatus: this.config.orderStatus,
        financialStatus: this.config.orderFinancialStatus,
        fulfillmentStatus: this.config.orderFulfillmentStatus,
      });
    }

    return this;
  }

  /**
   * Reset progress tracking
   */
  resetProgress() {
    this.progress = {
      completedCount: 0,
      timestamp: new Date().toISOString(),
      successfulCustomers: [],
      failedAttempts: 0,
      successfulOrders: 0,
    };
    return this;
  }

  /**
   * Decrypt an encrypted token using the Shopify API secret
   * @param {string} token - Encrypted token in hex format
   * @returns {string} - Decrypted token
   */
  decryptToken(token) {
    return this._decryptToken(token);
  }

  /**
   * Internal method to decrypt an encrypted token
   * Used by the constructor and public decryptToken method
   * @param {string} token - Encrypted token in hex format
   * @returns {string} - Decrypted token
   * @private
   */
  _decryptToken(token) {
    try {
      // Get the API secret
      const key = process.env.SHOPIFY_API_SECRET;
      if (!key) {
        throw new Error('SHOPIFY_API_SECRET environment variable is not set');
      }

      // If token is already in Shopify format, return as-is
      if (token.startsWith('shpat_') || token.startsWith('shpua_')) {
        return token;
      }

      // First try modern method with createDecipheriv
      try {
        const algorithm = 'aes256';
        const decipher = crypto.createDecipher(algorithm, key);
        let dec = decipher.update(token, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
      } catch (modernError) {
        console.warn('Modern decryption failed, trying legacy method:', modernError.message);
      }
    } catch (error) {
      console.error('Failed to decrypt token:', error.message);
      // Return token as-is if decryption fails
      return token;
    }
  }
}

module.exports = ShopifyCustomerCreator;
