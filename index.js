require('dotenv').config();
const axios = require('axios');

const SHOP = process.env.SHOPIFY_DOMAIN;
const TOKEN = process.env.ACCESS_TOKEN;
const API_BASE = `https://${SHOP}/admin/api/2023-10`;

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': TOKEN,
};

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function getAllProductVariants() {
  const res = await axios.get(`${API_BASE}/products.json?limit=250`, { headers });
  return res.data.products.flatMap(p => p.variants.map(v => ({ variant: v, product: p })));
}

async function createOrder(variantObj, index) {
  const { variant, product } = variantObj;
  const emailRand = Math.floor(Math.random() * 1000000);

  const order = {
    order: {
      line_items: [{ variant_id: variant.id, quantity: 1 }],
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      customer: {
        first_name: 'Test',
        last_name: `User${index}`,
        email: `testuser${emailRand}@example.com`,
        email_marketing_consent: {
          state: 'subscribed',
          opt_in_level: 'single_opt_in',
          consent_updated_at: new Date().toISOString(),
        },
        accepts_marketing: true,
      },
      shipping_address: {
        first_name: 'Test',
        last_name: `User${index}`,
        address1: '123 Automation Lane',
        city: 'Cityville',
        province: 'CA',
        country: 'US',
        zip: '90001',
      },
    },
  };

  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      await axios.post(`${API_BASE}/orders.json`, order, { headers });
      console.log(`✅ Order #${index + 1} created for ${product.title}`);
      return;
    } catch (err) {
      const isRateLimit = err.response?.status === 429 || /rate limit/i.test(err.response?.data?.errors || '');

      if (isRateLimit) {
        console.warn(`⚠️ Rate limit hit on Order #${index + 1}, retrying in 60s...`);
        await sleep(60000); // wait 60s before retry
        retries++;
      } else {
        console.error(`❌ Order #${index + 1} failed:`, err.response?.data || err.message);
        return;
      }
    }
  }

  console.error(`❌ Order #${index + 1} failed after ${maxRetries} retries`);
}

async function run() {
  const variants = await getAllProductVariants();
  const totalOrders = 5000;

  for (let i = 0; i < totalOrders; i++) {
    const variant = variants[i % variants.length];
    await createOrder(variant, i);
    await sleep(2000); // space requests to 1 every 2s for safety
  }

  console.log('🎉 Finished creating all orders safely');
}

run();
