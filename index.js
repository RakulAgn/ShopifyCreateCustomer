require('dotenv').config();

/**
 * Optimized function to add 1 million (10 lakh) customers to a Shopify store
 * Uses parallel processing, batch operations, and proper rate limiting
 */

// Your address data for US and Canada stays the same
const US_DATA = {
  states: [
    { name: 'California', abbr: 'CA', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose'] },
    { name: 'New York', abbr: 'NY', cities: ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse'] },
    { name: 'Texas', abbr: 'TX', cities: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'] },
    { name: 'Florida', abbr: 'FL', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'] },
    { name: 'Illinois', abbr: 'IL', cities: ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford'] },
    { name: 'Washington', abbr: 'WA', cities: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue'] },
    { name: 'Pennsylvania', abbr: 'PA', cities: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'] },
    { name: 'Ohio', abbr: 'OH', cities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'] },
  ],
  streetTypes: ['St', 'Ave', 'Blvd', 'Dr', 'Rd', 'Ct', 'Way', 'Pl', 'Ln'],
  streetNames: ['Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Park', 'Lake', 'Hill', 'Sunset', 'Meadow', 'River', 'Forest', 'Garden', 'Spring', 'Valley', 'Ridge', 'First', 'Second', 'Third', 'Fourth', 'Fifth'],
};

const CA_DATA = {
  provinces: [
    { name: 'Ontario', abbr: 'ON', cities: ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton'] },
    { name: 'Quebec', abbr: 'QC', cities: ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil'] },
    { name: 'British Columbia', abbr: 'BC', cities: ['Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'Abbotsford'] },
    { name: 'Alberta', abbr: 'AB', cities: ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'] },
    { name: 'Manitoba', abbr: 'MB', cities: ['Winnipeg', 'Brandon', 'Steinbach', 'Thompson', 'Portage la Prairie'] },
    { name: 'Saskatchewan', abbr: 'SK', cities: ['Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw', 'Yorkton'] },
    { name: 'Nova Scotia', abbr: 'NS', cities: ['Halifax', 'Dartmouth', 'Sydney', 'Truro', 'New Glasgow'] },
  ],
  streetTypes: ['St', 'Ave', 'Blvd', 'Dr', 'Rd', 'Crt', 'Way', 'Cres', 'Ln', 'Pl'],
  streetNames: ['Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'King', 'Queen', 'Wellington', 'Bay', 'Yonge', 'Dundas', 'College', 'University', 'Bloor', 'Eglinton', 'Lakeshore', 'Richmond', 'Front', 'Parliament'],
};

// Configuration - fill in your shop details
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // Your shop's domain (e.g. your-store.myshopify.com)
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // Private app access token with customer write permissions
const TOTAL_CUSTOMERS = Number(process.env.TOTAL_CUSTOMERS); // 10 lakh customers
const BATCH_SIZE = Number(process.env.BATCH_SIZE); // Reduced batch size to prevent rate limiting
const API_CALLS_PER_SECOND = Number(process.env.API_CALLS_PER_SECOND); // More conservative rate limit
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE); // Process in chunks of 1000 customers

// Helper functions - keeping your original functions
function generateRandomPhone(country) {
  if (country === 'US' || country === 'CA') {
    const areaCode = Math.floor(100 + Math.random() * 900);
    const firstPart = Math.floor(100 + Math.random() * 900);
    const secondPart = Math.floor(1000 + Math.random() * 9000);
    return `+1${areaCode}${firstPart}${secondPart}`;
  }
  return '+15555555555'; // Default
}

function generateRandomZipCode() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function generateRandomPostalCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  return `${letters[Math.floor(Math.random() * letters.length)]}${digits[Math.floor(Math.random() * digits.length)]}${letters[Math.floor(Math.random() * letters.length)]} ${digits[Math.floor(Math.random() * digits.length)]}${letters[Math.floor(Math.random() * letters.length)]}${digits[Math.floor(Math.random() * digits.length)]}`;
}

function generateRandomStreetAddress(country) {
  const number = Math.floor(1 + Math.random() * 9999);
  const streetName = country === 'US' ? US_DATA.streetNames[Math.floor(Math.random() * US_DATA.streetNames.length)] : CA_DATA.streetNames[Math.floor(Math.random() * CA_DATA.streetNames.length)];
  const streetType = country === 'US' ? US_DATA.streetTypes[Math.floor(Math.random() * US_DATA.streetTypes.length)] : CA_DATA.streetTypes[Math.floor(Math.random() * CA_DATA.streetTypes.length)];

  return `${number} ${streetName} ${streetType}`;
}

function generateRandomAddressOnlyUSandCA(existingAddress = null) {
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
      address1: generateRandomStreetAddress('US'),
      city: city,
      province: state.abbr,
      phone: generateRandomPhone('US'),
      zip: generateRandomZipCode(),
      country: 'US',
    };
  } else {
    const province = CA_DATA.provinces[Math.floor(Math.random() * CA_DATA.provinces.length)];
    const city = province.cities[Math.floor(Math.random() * province.cities.length)];

    return {
      ...keepName,
      address1: generateRandomStreetAddress('CA'),
      city: city,
      province: province.abbr,
      phone: generateRandomPhone('CA'),
      zip: generateRandomPostalCode(),
      country: 'CA',
    };
  }
}

function generateRandomString(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function generateRandomEmail() {
  return `${generateRandomString(8)}${Math.floor(Math.random() * 1000)}@gmail.com`;
}

function generateRandomFirstName() {
  const firstNames = ['John', 'Jane', 'Alex', 'Chris', 'Katie', 'Michael', 'Sarah', 'David', 'Emma', 'Daniel'];
  return firstNames[Math.floor(Math.random() * firstNames.length)];
}

// Optimized for performance
function generateCustomerData(index, baseCustomerData = {}) {
  return {
    first_name: `${generateRandomFirstName()}${index}`,
    last_name: `${generateRandomFirstName()}${index}`,
    email: generateRandomEmail(),
    verified_email: true,
    addresses: [
      {
        ...generateRandomAddressOnlyUSandCA(),
      },
    ],
    ...baseCustomerData,
  };
}

// In-memory progress tracking (since fs is not available)
let progressData = {
  completedCount: 0,
  timestamp: new Date().toISOString(),
  successfulCustomers: [],
  failedAttempts: 0,
};

// Create a single customer in Shopify with proper error handling and retries
async function createCustomer(customerData, retries = 3) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/customers.json`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN,
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
      return data;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }

      console.error(`Attempt ${attempt + 1} failed. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); // Exponential backoff
    }
  }
}

// Helper function to save progress
function saveProgress() {
  progressData.timestamp = new Date().toISOString();
  console.log(`Progress saved: ${progressData.completedCount} customers created.`);
  console.log(`Successful: ${progressData.successfulCustomers.length}, Failed: ${progressData.failedAttempts}`);
}

/**
 * Process a batch of customer creations in parallel
 * @param {number} startIndex - Starting index for this batch
 * @param {number} batchSize - Number of customers to process in this batch
 * @param {Object} baseCustomerData - Base customer data
 * @returns {Promise<Array>} Processed customers
 */
async function processBatch(startIndex, batchSize, baseCustomerData) {
  const promises = [];

  for (let i = 0; i < batchSize; i++) {
    const customerIndex = startIndex + i;
    if (customerIndex >= TOTAL_CUSTOMERS) break;

    const customerData = generateCustomerData(customerIndex, baseCustomerData);
    const promise = createCustomer(customerData)
      .then(result => {
        if (result && result.customer) {
          return result.customer;
        }
        throw new Error('Invalid response structure');
      })
      .catch(error => {
        console.error(`Failed to create customer ${customerIndex}:`, error.message);
        progressData.failedAttempts++;
        return null;
      });

    promises.push(promise);

    // Brief delay between API calls to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000 / API_CALLS_PER_SECOND));
  }

  const results = await Promise.all(promises);
  return results.filter(result => result !== null);
}

/**
 * Create customers in batches with proper throttling and progress tracking
 */
async function createCustomersInBatches() {
  const startTime = new Date();
  const createdCustomers = [];

  // Base customer data
  const baseCustomerData = {
    tags: 'API_Created, Bulk_Import',
    email_marketing_consent: {
      state: 'subscribed',
      opt_in_level: 'single_opt_in',
      consent_updated_at: new Date().toISOString(),
      consent_collected_from: 'API',
    },
  };

  console.log(`Starting customer creation process for ${TOTAL_CUSTOMERS - progressData.completedCount} remaining customers...`);

  // Process in chunks to allow for manual stopping/resuming if needed
  for (let chunk = 0; chunk < Math.ceil(TOTAL_CUSTOMERS / CHUNK_SIZE); chunk++) {
    const chunkStart = chunk * CHUNK_SIZE;
    const chunkEnd = Math.min((chunk + 1) * CHUNK_SIZE, TOTAL_CUSTOMERS);

    console.log(`Starting chunk ${chunk + 1}/${Math.ceil(TOTAL_CUSTOMERS / CHUNK_SIZE)} (customers ${chunkStart}-${chunkEnd - 1})`);

    for (let i = chunkStart; i < chunkEnd; i += BATCH_SIZE) {
      const batchStartTime = new Date();
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(TOTAL_CUSTOMERS / BATCH_SIZE);
      console.log(`Processing batch ${batchNumber}/${totalBatches} (${((batchNumber / totalBatches) * 100).toFixed(2)}% complete)`);

      try {
        const batchCustomers = await processBatch(i, BATCH_SIZE, baseCustomerData);
        createdCustomers.push(...batchCustomers);
        progressData.successfulCustomers.push(...batchCustomers.map(c => c.id));

        progressData.completedCount = Math.min(i + BATCH_SIZE, TOTAL_CUSTOMERS);

        // Save progress at intervals
        saveProgress();

        const batchEndTime = new Date();
        const batchDuration = (batchEndTime - batchStartTime) / 1000;

        console.log(`Batch completed. Created ${batchCustomers.length} customers in ${batchDuration.toFixed(2)} seconds.`);
        console.log(`Progress: ${progressData.completedCount}/${TOTAL_CUSTOMERS} (${((progressData.completedCount / TOTAL_CUSTOMERS) * 100).toFixed(2)}%)`);

        // Calculate ETA
        const elapsedSeconds = (batchEndTime - startTime) / 1000;
        const customersPerSecond = progressData.completedCount / elapsedSeconds;
        const remainingCustomers = TOTAL_CUSTOMERS - progressData.completedCount;
        const estimatedRemainingSeconds = remainingCustomers / customersPerSecond;

        const hours = Math.floor(estimatedRemainingSeconds / 3600);
        const minutes = Math.floor((estimatedRemainingSeconds % 3600) / 60);
        const seconds = Math.floor(estimatedRemainingSeconds % 60);

        console.log(`Estimated completion in: ${hours}h ${minutes}m ${seconds}s (${customersPerSecond.toFixed(2)} customers/sec)`);

        // Brief pause between batches to let system recover
        if (i + BATCH_SIZE < chunkEnd) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error processing batch starting at ${i}:`, error);
        // Save progress before continuing
        saveProgress();
      }
    }

    console.log(`Completed chunk ${chunk + 1}. Progress: ${progressData.completedCount}/${TOTAL_CUSTOMERS}`);

    // Pause between chunks for a break
    if (chunk < Math.ceil(TOTAL_CUSTOMERS / CHUNK_SIZE) - 1) {
      console.log('Taking a brief pause between chunks...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  const endTime = new Date();
  const totalDuration = (endTime - startTime) / 1000;
  const hours = Math.floor(totalDuration / 3600);
  const minutes = Math.floor((totalDuration % 3600) / 60);
  const seconds = Math.floor(totalDuration % 60);

  console.log(`All done! Created ${createdCustomers.length} customers in ${hours}h ${minutes}m ${seconds}s`);
  console.log(`Average speed: ${(createdCustomers.length / totalDuration).toFixed(2)} customers per second`);

  return createdCustomers;
}

// Main function
async function main() {
  try {
    console.log('Starting optimized bulk customer creation...');
    console.log(`Target: ${TOTAL_CUSTOMERS} customers with batch size ${BATCH_SIZE}`);

    const customers = await createCustomersInBatches();

    console.log(`Successfully finished creating ${customers.length} customers`);
    return customers;
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the main function
main();
