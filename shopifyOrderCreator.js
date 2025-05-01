/**
 * ShopifyOrderCreator - A class to handle creation of orders for Shopify customers
 * Features:
 * - Custom rate limiting for orders (separate from customer rate limits)
 * - Error handling and retries
 * - Configurable order status
 * - Random product selection
 */
class ShopifyOrderCreator {
  /**
   * Constructor - Initialize the ShopifyOrderCreator with configuration
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      shopifyDomain: config.shopifyDomain,
      accessToken: config.accessToken,
      // Orders typically have stricter rate limits than customers
      apiCallsPerSecond: config.apiCallsPerSecond || 1,
      maxOrdersPerCustomer: config.maxOrdersPerCustomer || 1,
      minProductsPerOrder: config.minProductsPerOrder || 1,
      maxProductsPerOrder: config.maxProductsPerOrder || 5,
      batchSize: config.batchSize || 5,
      chunkSize: config.chunkSize || 100,
      // Order statuses
      orderStatus: config.orderStatus || 'completed',
      financialStatus: config.financialStatus || 'paid',
      fulfillmentStatus: config.fulfillmentStatus || 'fulfilled',
      // Pre-cache products to reduce API calls
      productCacheRefreshMinutes: config.productCacheRefreshMinutes || 30,
    };

    // Product cache with timeout
    this.productCache = {
      products: [],
      lastUpdated: null,
    };

    // Order tracking
    this.stats = {
      ordersCreated: 0,
      ordersFailed: 0,
      lastOrder: null,
    };

    // Log configuration for debugging
    console.log(`ShopifyOrderCreator initialized with:\n` + `- Domain: ${this.config.shopifyDomain}\n` + `- Rate limit: ${this.config.apiCallsPerSecond}/sec\n` + `- Order status: ${this.config.orderStatus}\n` + `- Financial status: ${this.config.financialStatus}\n` + `- Fulfillment status: ${this.config.fulfillmentStatus}`);
  }

  /**
   * Fetch all products from the Shopify store with caching
   * @returns {Promise<Array>} - List of products from the Shopify store
   */
  async fetchProducts() {
    // Check if cache is valid
    const cacheExpirationTime = this.productCache.lastUpdated ? new Date(this.productCache.lastUpdated.getTime() + this.config.productCacheRefreshMinutes * 60000) : new Date(0);

    if (this.productCache.products.length > 0 && new Date() < cacheExpirationTime) {
      console.log('Using cached products data');
      return this.productCache.products;
    }

    console.log('Fetching fresh products data from Shopify');
    const url = `https://${this.config.shopifyDomain}/admin/api/2023-10/products.json?limit=250`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.config.accessToken,
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        console.log(`Rate limited while fetching products. Waiting for ${retryAfter} seconds.`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return this.fetchProducts(); // Retry after wait
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

      if (!data.products || !Array.isArray(data.products)) {
        console.error('Invalid product data received:', data);
        throw new Error('Invalid product data structure from Shopify API');
      }

      // Update cache with active products that have variants
      const activeProducts = data.products.filter(product => product.variants && product.variants.length > 0 && (product.status === 'active' || product.published_at));

      if (activeProducts.length === 0) {
        console.warn('No active products found with variants. Please check your Shopify store.');

        // For testing purposes, create a dummy product
        if (process.env.USE_DUMMY_PRODUCTS === 'true') {
          console.log('Using dummy product for testing');
          activeProducts.push({
            id: 1234567890,
            title: 'Dummy Product',
            status: 'active',
            variants: [
              {
                id: 9876543210,
                price: '19.99',
                title: 'Default Variant',
              },
            ],
          });
        }
      }

      this.productCache.products = activeProducts;
      this.productCache.lastUpdated = new Date();

      console.log(`Found ${activeProducts.length} active products with variants`);
      return this.productCache.products;
    } catch (error) {
      console.error('Failed to fetch products:', error);
      // If cache exists, use it as fallback
      if (this.productCache.products.length > 0) {
        console.log('Using cached products as fallback after API error');
        return this.productCache.products;
      }

      if (process.env.USE_DUMMY_PRODUCTS === 'true') {
        console.log('Using dummy product for testing due to API error');
        return [
          {
            id: 1234567890,
            title: 'Dummy Product (Fallback)',
            status: 'active',
            variants: [
              {
                id: 9876543210,
                price: '19.99',
                title: 'Default Variant',
              },
            ],
          },
        ];
      }

      throw error;
    }
  }

  /**
   * Select random products for an order
   * @returns {Promise<Array>} - Array of line items for order
   */
  async selectRandomProducts() {
    const products = await this.fetchProducts();

    if (!products || products.length === 0) {
      throw new Error('No products available to create an order');
    }

    // Determine number of items for this order (between min and max)
    const numberOfItems = Math.floor(this.config.minProductsPerOrder + Math.random() * (this.config.maxProductsPerOrder - this.config.minProductsPerOrder + 1));

    const lineItems = [];
    const usedProductIds = new Set();

    // Select random products (avoid duplicates if possible)
    for (let i = 0; i < numberOfItems; i++) {
      // If we've used all products, we can stop or start reusing
      if (usedProductIds.size >= products.length) {
        if (lineItems.length >= this.config.minProductsPerOrder) {
          break;
        }
        // Reset if we need more items
        usedProductIds.clear();
      }

      let randomProduct;
      let attempts = 0;

      // Try to find an unused product
      do {
        randomProduct = products[Math.floor(Math.random() * products.length)];
        attempts++;
        // If we've tried too many times, just use any product
        if (attempts > 10) break;
      } while (usedProductIds.has(randomProduct.id));

      usedProductIds.add(randomProduct.id);

      if (!randomProduct.variants || randomProduct.variants.length === 0) {
        console.warn(`Product ${randomProduct.id} has no variants, skipping`);
        continue;
      }

      const variant = randomProduct.variants[Math.floor(Math.random() * randomProduct.variants.length)];
      const quantity = Math.floor(1 + Math.random() * 3); // Random quantity (1-3)

      lineItems.push({
        variant_id: variant.id,
        quantity: quantity,
        price: variant.price,
      });
    }

    if (lineItems.length === 0) {
      throw new Error('Could not generate any valid line items for order');
    }

    return lineItems;
  }

  /**
   * Calculate tax for an order based on customer's address
   * @param {Object} address - Customer address
   * @param {number} subtotal - Order subtotal
   * @returns {number} - Tax amount
   */
  calculateTax(address, subtotal) {
    // If no address, use default tax rate
    if (!address || !address.country) {
      return parseFloat((subtotal * 0.05).toFixed(2));
    }

    // Simple tax calculation based on country
    // In real implementation, you might use tax API or more complex rules
    if (address.country === 'US') {
      // US tax varies by state
      const stateTaxRates = {
        CA: 0.0725, // California
        NY: 0.045, // New York
        TX: 0.0625, // Texas
        FL: 0.06, // Florida
        IL: 0.0625, // Illinois
        WA: 0.065, // Washington
        PA: 0.06, // Pennsylvania
        OH: 0.0575, // Ohio
      };

      const taxRate = stateTaxRates[address.province] || 0.05; // Default 5%
      return parseFloat((subtotal * taxRate).toFixed(2));
    } else if (address.country === 'CA') {
      // Canada tax varies by province
      const provinceTaxRates = {
        ON: 0.13, // Ontario (HST)
        QC: 0.14975, // Quebec (GST + QST)
        BC: 0.12, // British Columbia (GST + PST)
        AB: 0.05, // Alberta (GST only)
        MB: 0.12, // Manitoba (GST + PST)
        SK: 0.11, // Saskatchewan (GST + PST)
        NS: 0.15, // Nova Scotia (HST)
      };

      const taxRate = provinceTaxRates[address.province] || 0.05; // Default 5% (GST)
      return parseFloat((subtotal * taxRate).toFixed(2));
    }

    // Default tax rate
    return parseFloat((subtotal * 0.05).toFixed(2));
  }

  /**
   * Create an order for a customer with random products
   * @param {Object} customerData - Customer data
   * @param {number} retries - Number of retry attempts
   * @returns {Promise<Object>} - Created order data
   */
  async createOrderForCustomer(customerData, retries = 3) {
    try {
      if (!customerData || !customerData.id) {
        throw new Error('Invalid customer data. Must include id property.');
      }

      // Ensure customer has at least one address
      const address = customerData.addresses && customerData.addresses.length > 0 ? customerData.addresses[0] : null;

      // Get random products
      const lineItems = await this.selectRandomProducts();

      // Calculate financials
      const subtotal = lineItems.reduce((total, item) => total + parseFloat(item.price) * item.quantity, 0);
      const tax = this.calculateTax(address, subtotal);
      const total = parseFloat((subtotal + tax).toFixed(2));

      // Generate a random date within the last 90 days
      const randomDaysAgo = Math.floor(Math.random() * 90);
      const randomDate = new Date();
      randomDate.setDate(randomDate.getDate() - randomDaysAgo);

      // Create order data object
      const orderData = {
        order: {
          line_items: lineItems,
          customer: {
            id: customerData.id,
          },
          email: customerData.email || `customer-${customerData.id}@example.com`,
          financial_status: this.config.financialStatus,
          fulfillment_status: this.config.fulfillmentStatus,
          processed_at: randomDate.toISOString(),
          tags: 'API_Created, Bulk_Import',
          subtotal_price: subtotal.toFixed(2),
          total_tax: tax.toFixed(2),
          total_price: total.toFixed(2),
          currency: 'USD',
          // Set order status from config
          status: this.config.orderStatus,
          note: 'Bulk created order via API',
        },
      };

      // Add addresses if available
      if (address) {
        orderData.order.shipping_address = address;
        orderData.order.billing_address = address;
      }

      // Create the order
      return await this._createOrder(orderData, retries);
    } catch (error) {
      console.error(`Error creating order for customer ${customerData.id}:`, error.message);
      this.stats.ordersFailed++;
      throw error;
    }
  }

  /**
   * Improved order creation method with stricter rate limiting
   * @param {Object} orderData - Order data to create
   * @param {number} retries - Number of retry attempts
   * @returns {Promise<Object>} - Created order data
   * @private
   */
  async _createOrder(orderData, retries = 3) {
    const url = `https://${this.config.shopifyDomain}/admin/api/2023-10/orders.json`;

    // Force a minimum delay between order creations (at least 2 seconds)
    const minDelayBetweenOrders = Math.max(2000, 1000 / this.config.apiCallsPerSecond);

    // Add a longer initial delay for the very first order or if we previously hit rate limits
    if (this.stats.ordersCreated === 0 || this._lastRateLimitHit) {
      const initialDelay = this._lastRateLimitHit ? 5000 : 1000;
      console.log(`Starting order creation with initial delay of ${initialDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      this._lastRateLimitHit = false;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Always apply rate limiting, even for retries
        if (this.stats.lastOrder) {
          const timeSinceLastOrder = new Date() - this.stats.lastOrder;

          if (timeSinceLastOrder < minDelayBetweenOrders) {
            const waitTime = minDelayBetweenOrders - timeSinceLastOrder;
            console.log(`Rate limiting: waiting ${Math.round(waitTime)}ms before order creation`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }

        // Log order creation attempt
        console.log(`Creating order for customer ${orderData.order.customer.id}... (attempt ${attempt + 1}/${retries})`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.config.accessToken,
          },
          body: JSON.stringify(orderData),
        });

        // Check for rate limiting
        if (response.status === 429) {
          this._lastRateLimitHit = true;
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
          console.log(`Rate limited! Waiting for ${retryAfter} seconds before retry.`);

          // Increase wait time by 1 second extra to be safe
          const waitTime = (retryAfter + 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // Reduce the rate limit for future requests
          this.config.apiCallsPerSecond = Math.max(0.1, this.config.apiCallsPerSecond * 0.75);
          console.log(`Reduced rate limit to ${this.config.apiCallsPerSecond.toFixed(2)} calls/second`);

          continue;
        }

        // Handle other error responses
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

        // Validate order data
        if (!data.order || !data.order.id) {
          console.error('Invalid order response from Shopify:', data);
          throw new Error('Invalid order data structure from Shopify API');
        }

        // Success! Update stats and return data
        this.stats.ordersCreated++;
        this.stats.lastOrder = new Date();
        console.log(`Order ${data.order.id} created successfully for customer ${orderData.order.customer.id}`);

        // If successful and we had reduced the rate, slowly increase it back (but not too quickly)
        if (this.config.apiCallsPerSecond < 0.5) {
          this.config.apiCallsPerSecond = Math.min(0.5, this.config.apiCallsPerSecond * 1.05);
        }

        return data;
      } catch (error) {
        if (attempt === retries - 1) {
          this.stats.ordersFailed++;
          throw error;
        }

        // Exponential backoff with longer delays
        const delay = Math.pow(2, attempt + 1) * 1000; // Start with 2 seconds, then 4, 8, etc.
        console.error(`Attempt ${attempt + 1} failed. Retrying after ${delay / 1000}s...`);
        console.error(`Error details: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Ensure rate limits are respected
   * @private
   */
  async _respectRateLimit() {
    // Calculate time since last order
    const now = new Date();
    const minTimeBetweenCalls = 1000 / this.config.apiCallsPerSecond;

    if (this.stats.lastOrder) {
      const timeSinceLastOrder = now - this.stats.lastOrder;

      if (timeSinceLastOrder < minTimeBetweenCalls) {
        const waitTime = minTimeBetweenCalls - timeSinceLastOrder;
        console.log(`Rate limiting: waiting ${Math.round(waitTime)}ms before next API call`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Get order creation statistics
   * @returns {Object} - Order stats
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset order statistics
   */
  resetStats() {
    this.stats = {
      ordersCreated: 0,
      ordersFailed: 0,
      lastOrder: null,
    };
  }

  /**
   * Create multiple orders for a single customer
   * @param {Object} customerData - Customer data
   * @param {number} count - Number of orders to create
   * @returns {Promise<Array>} - Created orders
   */
  async createMultipleOrdersForCustomer(customerData, count = 1) {
    const actualCount = Math.min(count, this.config.maxOrdersPerCustomer);
    const orders = [];

    for (let i = 0; i < actualCount; i++) {
      try {
        const order = await this.createOrderForCustomer(customerData);
        if (order && order.order) {
          orders.push(order);
        } else {
          console.error(`Invalid order response for customer ${customerData.id}`);
        }
      } catch (error) {
        console.error(`Failed to create order ${i + 1}/${actualCount} for customer ${customerData.id}:`, error.message);
      }
    }

    return orders;
  }

  /**
   * Process a batch of orders in parallel
   * @param {Array} customers - Array of customers
   * @param {number} startIndex - Starting index for this batch
   * @param {number} batchSize - Number of customers to process in this batch
   * @returns {Promise<Array>} - Created orders
   */
  async processBatch(customers, startIndex, batchSize) {
    // Validate inputs
    if (!Array.isArray(customers)) {
      throw new Error('customers must be an array');
    }

    if (startIndex < 0 || startIndex >= customers.length) {
      console.warn(`Invalid startIndex ${startIndex} for customers array of length ${customers.length}`);
      return [];
    }

    if (batchSize <= 0) {
      console.warn(`Invalid batchSize ${batchSize}, must be positive`);
      return [];
    }

    // Process each customer sequentially to respect rate limits more effectively
    const results = [];
    const endIndex = Math.min(startIndex + batchSize, customers.length);

    console.log(`Processing batch of ${endIndex - startIndex} customers (${startIndex} to ${endIndex - 1})`);

    for (let i = startIndex; i < endIndex; i++) {
      const customer = customers[i];

      if (!customer || !customer.id) {
        console.warn(`Invalid customer at index ${i}, skipping`);
        results.push({ customer: customer || { id: `unknown-${i}` }, orders: [] });
        continue;
      }

      try {
        console.log(`Creating orders for customer ${customer.id} (${i + 1}/${endIndex})...`);
        const orders = await this.createMultipleOrdersForCustomer(customer, this.config.maxOrdersPerCustomer);
        results.push({ customer, orders });
      } catch (error) {
        console.error(`Failed to create orders for customer ${customer.id}:`, error.message);
        results.push({ customer, orders: [] });
      }

      // Brief delay between customers to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000 / this.config.apiCallsPerSecond));
    }

    return results;
  }

  /**
   * Create orders in bulk for multiple customers
   * @param {Array} customers - Array of customer data
   * @returns {Promise<Object>} - Order creation results
   */
  async createBulkOrders(customers) {
    if (!Array.isArray(customers) || customers.length === 0) {
      console.warn('No customers provided for bulk order creation');
      return {
        totalCustomers: 0,
        successfulCustomers: 0,
        failedCustomers: 0,
        totalOrders: 0,
        duration: 0,
        ordersPerSecond: 0,
        results: [],
      };
    }

    console.log(`Starting bulk order creation for ${customers.length} customers (${this.config.maxOrdersPerCustomer} orders each)`);
    const startTime = new Date();

    const results = [];

    // Process in chunks
    for (let chunk = 0; chunk < Math.ceil(customers.length / this.config.chunkSize); chunk++) {
      const chunkStart = chunk * this.config.chunkSize;
      const chunkEnd = Math.min((chunk + 1) * this.config.chunkSize, customers.length);
      const chunkCustomers = customers.slice(chunkStart, chunkEnd);

      console.log(`Processing chunk ${chunk + 1}/${Math.ceil(customers.length / this.config.chunkSize)} (customers ${chunkStart + 1}-${chunkEnd})`);

      // Process in batches
      for (let i = 0; i < chunkCustomers.length; i += this.config.batchSize) {
        const batchStart = i;
        const batchSize = Math.min(this.config.batchSize, chunkCustomers.length - i);

        console.log(`Processing batch: ${batchStart + 1}-${batchStart + batchSize} of current chunk`);

        try {
          const batchResults = await this.processBatch(chunkCustomers, batchStart, batchSize);
          results.push(...batchResults);

          const batchOrders = batchResults.reduce((sum, r) => sum + (r.orders ? r.orders.length : 0), 0);
          console.log(`Batch completed. Created ${batchOrders} orders for ${batchResults.length} customers.`);

          // Calculate progress
          const totalProcessed = chunkStart + i + batchSize;
          const percentComplete = ((totalProcessed / customers.length) * 100).toFixed(2);
          console.log(`Progress: ${totalProcessed}/${customers.length} customers (${percentComplete}%)`);
        } catch (error) {
          console.error(`Error processing batch at index ${i}:`, error);
        }
      }

      // Pause between chunks
      if (chunk < Math.ceil(customers.length / this.config.chunkSize) - 1) {
        console.log('Taking a brief pause between chunks...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const endTime = new Date();
    const durationSeconds = (endTime - startTime) / 1000;

    // Count successfully created orders
    const totalOrders = results.reduce((sum, r) => sum + (r.orders ? r.orders.length : 0), 0);
    const successfulCustomers = results.filter(r => r.orders && r.orders.length > 0).length;
    const ordersPerSecond = totalOrders / durationSeconds || 0;

    console.log(`Bulk order creation completed in ${durationSeconds.toFixed(2)} seconds`);
    console.log(`Created ${totalOrders} orders for ${successfulCustomers}/${customers.length} customers`);
    console.log(`Performance: ${ordersPerSecond.toFixed(2)} orders per second`);

    return {
      totalCustomers: customers.length,
      successfulCustomers,
      failedCustomers: customers.length - successfulCustomers,
      totalOrders,
      duration: durationSeconds,
      ordersPerSecond: ordersPerSecond,
      results,
    };
  }
}

module.exports = ShopifyOrderCreator;
