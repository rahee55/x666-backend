const crypto = require('crypto');
const axios = require('axios');
const Safepay = require('@sfpy/node-core');
const paymentConfig = require('../config/paymentGateway');
const { WITHDRAW_METHODS } = require('../config/withdrawMethods');

const getSafepayClient = () => {
  const { secretKey, host } = paymentConfig.safepay;

  if (!secretKey) {
    throw new Error('SAFEPAY_SECRET_KEY is not configured');
  }

  return Safepay(secretKey, {
    authType: 'secret',
    host,
  });
};

const toSafepayAmount = (amount) => Math.round(Number(amount) * 100);

const fromSafepayAmount = (amount) => Number(amount) / 100;

const buildTopupOrderId = (userId) =>
  `TOPUP-${userId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

const buildWithdrawRequestId = (userId) =>
  `WITHDRAW-${userId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

const verifyRedirectSignature = (tracker, signature) => {
  const secret = paymentConfig.safepay.signatureSecret;

  if (!secret || !tracker || !signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(String(tracker)).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signature), 'utf8'));
  } catch {
    return false;
  }
};

const parseCallbackPayload = (req) => ({
  orderId: req.body?.order_id || req.body?.orderId || req.query?.order_id || req.query?.orderId,
  referenceCode:
    req.body?.reference_code ||
    req.body?.reference ||
    req.body?.ref ||
    req.query?.reference_code ||
    req.query?.reference ||
    req.query?.ref,
  tracker: req.body?.tracker || req.query?.tracker,
  signature: req.body?.signature || req.body?.sig || req.query?.signature || req.query?.sig,
});

const initiateCollection = async (amount, userId) => {
  const { merchantApiKey, environment, currency, redirectUrl, cancelUrl } = paymentConfig.safepay;

  if (!merchantApiKey) {
    throw new Error('SAFEPAY_MERCHANT_API_KEY is not configured');
  }

  if (!redirectUrl || !cancelUrl) {
    throw new Error('SAFEPAY_REDIRECT_URL and SAFEPAY_CANCEL_URL must be configured');
  }

  const safepay = getSafepayClient();
  const orderId = buildTopupOrderId(userId);

  const sessionResponse = await safepay.payments.session.setup({
    merchant_api_key: merchantApiKey,
    intent: 'CYBERSOURCE',
    mode: 'payment',
    entry_mode: 'raw',
    currency,
    amount: toSafepayAmount(amount),
    metadata: {
      order_id: orderId,
    },
    include_fees: false,
  });

  const trackerToken = sessionResponse?.data?.tracker?.token;
  if (!trackerToken) {
    throw new Error('Safepay did not return a tracker token');
  }

  const passportResponse = await safepay.client.passport.create();
  const authToken = passportResponse?.data;

  if (!authToken) {
    throw new Error('Safepay did not return an authentication token');
  }

  const checkoutUrl = safepay.checkout.createCheckoutUrl({
    env: environment,
    tbt: authToken,
    tracker: trackerToken,
    source: 'hosted',
    order_id: orderId,
    redirect_url: redirectUrl,
    cancel_url: cancelUrl,
  });

  return {
    orderId,
    tracker: trackerToken,
    authToken,
    checkoutUrl,
    amount,
    currency,
    environment,
  };
};

const fetchPaymentStatus = async (tracker) => {
  const safepay = getSafepayClient();
  const response = await safepay.reporter.payments.fetch(tracker);
  const raw = response?.data || null;
  const state = raw?.state || raw?.tracker?.state || null;

  return {
    state,
    raw,
    isPaid: isSafepayPaymentComplete(raw),
    referenceCode: raw?.charge?.capture?.token || raw?.charge?.token || null,
  };
};

const isSafepayPaymentComplete = (raw) => {
  if (!raw) return false;

  const captured =
    raw.events?.some(
      (event) => event.type === 'CAPTURE' && /successful/i.test(event.reason || '')
    ) || Boolean(raw.charge?.capture);

  if (!captured) return false;

  return raw.state === 'TRACKER_ENDED' || Boolean(raw.charge?.capture);
};

const isRaastConfigured = () => {
  const { aggregatorId, secretKey } = paymentConfig.safepay.raast;
  return Boolean(aggregatorId && secretKey);
};

const raastRequest = async (method, path, data = null) => {
  const { aggregatorId, secretKey, host } = paymentConfig.safepay.raast;

  if (!aggregatorId || !secretKey) {
    throw new Error('SAFEPAY_AGGREGATOR_ID and SAFEPAY_AGGREGATOR_SECRET_KEY are required for Raast payouts');
  }

  const url = `${host.replace(/\/$/, '')}/v1/aggregators/${aggregatorId}${path}`;
  const response = await axios({
    method,
    url,
    headers: {
      'Content-Type': 'application/json',
      'X-SFPY-AGGREGATOR-SECRET-KEY': secretKey,
    },
    ...(data ? { data } : {}),
  });

  return response.data;
};

const validateRaastAccount = async (iban) => {
  const payload = await raastRequest('GET', `/title-fetch?iban=${encodeURIComponent(iban)}`);
  return payload?.data || payload;
};

const initiateRaastPayout = async (amount, userId, creditorIban) => {
  const requestId = buildWithdrawRequestId(userId);

  const payload = await raastRequest('POST', '/payout', {
    request_id: requestId,
    amount: String(Math.round(Number(amount))),
    creditor_iban: creditorIban,
  });

  return {
    requestId,
    token: payload?.data?.token || null,
    status: payload?.data?.status || 'P_INITIATED',
    traceReference: payload?.data?.trace_reference || null,
    raw: payload?.data || payload,
  };
};

const fetchRaastPayoutStatus = async (requestId) => {
  const payload = await raastRequest('GET', `/payments?request_id=${encodeURIComponent(requestId)}`);
  return payload?.data || payload;
};

const initiatePayout = async (amount, userId, destinationAccount, { iban, gateway } = {}) => {
  const { withdrawMode } = paymentConfig.safepay;

  if (withdrawMode === 'sandbox_auto') {
    return {
      mode: 'sandbox_auto',
      implemented: true,
      gateway,
      message: 'Sandbox: withdrawal will be processed instantly (no real bank transfer).',
      gatewayRef: buildWithdrawRequestId(userId),
    };
  }

  if (
    gateway === 'bank' &&
    (withdrawMode === 'raast' || (withdrawMode === 'manual' && isRaastConfigured() && iban))
  ) {
    const creditorIban = iban || destinationAccount;
    const payout = await initiateRaastPayout(amount, userId, creditorIban);
    return {
      mode: 'raast',
      implemented: true,
      gateway,
      ...payout,
      gatewayRef: payout.requestId,
    };
  }

  return {
    mode: 'manual',
    implemented: false,
    gateway,
    message: 'Withdrawal queued for manual admin review.',
    gatewayRef: buildWithdrawRequestId(userId),
  };
};

const getWithdrawMethods = () =>
  WITHDRAW_METHODS.map((method) => ({
    ...method,
    enabled: true,
  }));

const getPaymentConfig = () => {
  const { environment, currency, withdrawMode, host } = paymentConfig.safepay;

  return {
    provider: 'safepay',
    environment,
    currency,
    host,
    withdrawMode,
    raastEnabled: isRaastConfigured(),
    checkoutEnabled: Boolean(paymentConfig.safepay.merchantApiKey && paymentConfig.safepay.secretKey),
  };
};

module.exports = {
  initiateCollection,
  initiatePayout,
  initiateRaastPayout,
  verifyRedirectSignature,
  parseCallbackPayload,
  fetchPaymentStatus,
  fetchRaastPayoutStatus,
  validateRaastAccount,
  getPaymentConfig,
  getWithdrawMethods,
  isRaastConfigured,
  isSafepayPaymentComplete,
  toSafepayAmount,
  fromSafepayAmount,
};
