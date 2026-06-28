const { getModels } = require('../models');

const PLAN_DAYS = {
  premium_monthly: 30,
  premium_yearly: 365,
  lifetime: null
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function verifyAndroidPurchase(user, { productId, purchaseToken, packageName }) {
  const pkg = packageName || process.env.CANOPY_PACKAGE_NAME || 'com.canopy.treeid';
  const mock = String(process.env.CANOPY_BILLING_MOCK || 'true').toLowerCase() === 'true';

  let raw = { mock, productId, packageName: pkg };
  let status = 'active';
  let expiresAt = null;

  if (mock) {
    const days = PLAN_DAYS[productId];
    if (productId === 'lifetime') {
      expiresAt = null;
    } else if (days) {
      expiresAt = addDays(new Date(), days);
    } else {
      expiresAt = addDays(new Date(), 30);
    }
    raw.verified = true;
  } else {
    const verified = await verifyWithGooglePlay({ productId, purchaseToken, packageName: pkg });
    raw = verified.raw;
    status = verified.status;
    expiresAt = verified.expiresAt;
  }

  const { Subscription } = getModels();
  await Subscription.create({
    userId: user.id,
    productId,
    purchaseToken,
    status,
    expiresAt,
    rawGoogleResponse: raw
  });

  const plan = productId.replace('premium_', '') || productId;
  await user.update({
    isPremium: true,
    premiumPlan: plan,
    premiumExpiresAt: expiresAt
  });

  return {
    isPremium: true,
    premiumPlan: plan,
    premiumExpiresAt: expiresAt,
    status
  };
}

async function verifyWithGooglePlay({ productId, purchaseToken, packageName }) {
  const saPath = process.env.CANOPY_GOOGLE_PLAY_SA_PATH;
  if (!saPath) {
    const err = new Error('Google Play service account not configured');
    err.code = 'BILLING_CONFIG';
    throw err;
  }
  const err = new Error('Google Play verification not implemented in this build — set CANOPY_BILLING_MOCK=true');
  err.code = 'BILLING_NOT_READY';
  throw err;
}

async function getSubscription(user) {
  const { Subscription } = getModels();
  const latest = await Subscription.findOne({
    where: { userId: user.id },
    order: [['updatedAt', 'DESC']]
  });
  return {
    isPremium: user.isPremium && (!user.premiumExpiresAt || new Date(user.premiumExpiresAt) > new Date()),
    premiumPlan: user.premiumPlan,
    premiumExpiresAt: user.premiumExpiresAt,
    latestPurchase: latest
      ? {
          productId: latest.productId,
          status: latest.status,
          expiresAt: latest.expiresAt,
          updatedAt: latest.updatedAt
        }
      : null
  };
}

module.exports = { verifyAndroidPurchase, getSubscription };
