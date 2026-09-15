import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

if (fs.existsSync(path.join(rootDir, '.env'))) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(path.join(rootDir, '.env'));
  }
}

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('Error: STRIPE_SECRET_KEY environment variable is not set (check .env).');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

// Default target: 21.10.2026 22:00:00 CEST (20:00:00 UTC)
const DEFAULT_NEW_TRIAL_END = 1792612800;
// Default presale_end_date: 21.09.2026 22:00:00 CEST (20:00:00 UTC)
const DEFAULT_PRESALE_END_DATE = 1790020800;

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const trialEndArg = args.find((a) => a.startsWith('--trial-end='));
const targetTrialEnd = trialEndArg ? parseInt(trialEndArg.split('=')[1], 10) : DEFAULT_NEW_TRIAL_END;
const presaleEndArg = args.find((a) => a.startsWith('--presale-end='));
const targetPresaleEnd = presaleEndArg ? parseInt(presaleEndArg.split('=')[1], 10) : DEFAULT_PRESALE_END_DATE;
const productArg = args.find((a) => a.startsWith('--product='));
const targetProductId = productArg ? productArg.split('=')[1] : 'prod_V4ow1jzxAuJj7p';

async function main() {
  console.log(`\n=== Presale Campaign & Subscription Extension Tool ===`);
  console.log(`Target Product: ${targetProductId}`);
  console.log(`Mode: ${isApply ? 'APPLY (Changes will be saved to Stripe)' : 'DRY RUN (Use --apply to execute)'}`);
  console.log(`Target presale_end_date: ${targetPresaleEnd} (${new Date(targetPresaleEnd * 1000).toISOString()})`);
  console.log(`Target trial_end: ${targetTrialEnd} (${new Date(targetTrialEnd * 1000).toISOString()})\n`);

  // Step 1: Update Product Metadata
  console.log(`--- Step 1: Product Metadata for ${targetProductId} ---`);
  const product = await stripe.products.retrieve(targetProductId);
  console.log(`Current product name: ${product.name}`);
  console.log(`Current product metadata:`, product.metadata || {});

  if (isApply) {
    const updatedProduct = await stripe.products.update(targetProductId, {
      metadata: {
        ...(product.metadata || {}),
        presale_end_date: String(targetPresaleEnd),
        billing_cycle_anchor: String(targetTrialEnd),
        trial_end: String(targetTrialEnd),
      },
    });
    console.log(`-> [SUCCESS] Updated product metadata:`, updatedProduct.metadata);
  } else {
    console.log(`-> [DRY RUN] Would update product metadata to:`, {
      ...(product.metadata || {}),
      presale_end_date: String(targetPresaleEnd),
      billing_cycle_anchor: String(targetTrialEnd),
    });
  }

  // Step 2: Update Subscriptions
  console.log(`\n--- Step 2: Existing Subscriptions for ${targetProductId} ---`);
  const subscriptions = await stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer', 'data.items.data.price'],
  });

  const candidates = subscriptions.data.filter((sub) => {
    const isTargetProduct = sub.items?.data?.some((item) => {
      const priceProduct = item.price?.product;
      const prodId = typeof priceProduct === 'string' ? priceProduct : priceProduct?.id;
      return prodId === targetProductId;
    });

    if (!isTargetProduct) return false;
    return sub.status === 'trialing' || sub.status === 'active';
  });

  if (candidates.length === 0) {
    console.log(`No active or trialing subscriptions found for product ${targetProductId}.`);
    return;
  }

  console.log(`Found ${candidates.length} candidate subscription(s) for ${targetProductId}:\n`);

  let updatedCount = 0;

  for (const sub of candidates) {
    const customer = typeof sub.customer !== 'string' ? (sub.customer) : null;
    const email = customer?.email || sub.customer;
    const currentTrialEnd = sub.trial_end;
    const currentTrialEndIso = currentTrialEnd ? new Date(currentTrialEnd * 1000).toISOString() : 'none';

    console.log(`- Sub: ${sub.id}`);
    console.log(`  Customer: ${email}`);
    console.log(`  Status: ${sub.status}`);
    console.log(`  Current trial_end: ${currentTrialEnd} (${currentTrialEndIso})`);

    if (currentTrialEnd === targetTrialEnd) {
      console.log(`  -> Already matches target timestamp. Skipping.`);
      continue;
    }

    if (isApply) {
      try {
        await stripe.subscriptions.update(sub.id, {
          trial_end: targetTrialEnd,
          proration_behavior: 'none',
        });
        console.log(`  -> [SUCCESS] Updated trial_end to ${targetTrialEnd}`);
        updatedCount++;
      } catch (err) {
        console.error(`  -> [ERROR] Failed to update ${sub.id}:`, err?.message || err);
      }
    } else {
      console.log(`  -> [DRY RUN] Would update trial_end to ${targetTrialEnd}`);
      updatedCount++;
    }
  }

  console.log(`\nDone. ${updatedCount} subscription(s) ${isApply ? 'updated' : 'would be updated'}.`);
  if (!isApply && updatedCount > 0) {
    console.log(`Run with '--apply' to perform the updates:`);
    console.log(`node scripts/extend-presale-subscriptions.mjs --apply`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
