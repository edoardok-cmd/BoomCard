require('dotenv').config({ path: '.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testStripePrices() {
  console.log('🔍 Testing Stripe Price Configuration...\n');

  const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  const platinumPriceId = process.env.STRIPE_PLATINUM_PRICE_ID;

  if (!premiumPriceId || premiumPriceId === 'price_PREMIUM') {
    console.log('❌ STRIPE_PREMIUM_PRICE_ID not set in .env');
  } else {
    try {
      const price = await stripe.prices.retrieve(premiumPriceId);
      console.log('✅ PREMIUM Price Found:');
      console.log(`   ID: ${price.id}`);
      console.log(`   Amount: ${price.unit_amount / 100} ${price.currency.toUpperCase()}`);
      console.log(`   Interval: ${price.recurring.interval}`);
      console.log(`   Product: ${price.product}`);
    } catch (error) {
      console.log(`❌ PREMIUM Price Error: ${error.message}`);
    }
  }

  console.log('');

  if (!platinumPriceId || platinumPriceId === 'price_PLATINUM') {
    console.log('❌ STRIPE_PLATINUM_PRICE_ID not set in .env');
  } else {
    try {
      const price = await stripe.prices.retrieve(platinumPriceId);
      console.log('✅ PLATINUM Price Found:');
      console.log(`   ID: ${price.id}`);
      console.log(`   Amount: ${price.unit_amount / 100} ${price.currency.toUpperCase()}`);
      console.log(`   Interval: ${price.recurring.interval}`);
      console.log(`   Product: ${price.product}`);
    } catch (error) {
      console.log(`❌ PLATINUM Price Error: ${error.message}`);
    }
  }

  console.log('\n📋 Configuration Summary:');
  console.log(`   Premium Price ID: ${premiumPriceId || 'NOT SET'}`);
  console.log(`   Platinum Price ID: ${platinumPriceId || 'NOT SET'}`);
}

testStripePrices().catch(console.error);
