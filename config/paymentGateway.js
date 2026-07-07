module.exports = {
  jazzCash: {
    merchantId: process.env.JAZZCASH_MERCHANT_ID,
    password: process.env.JAZZCASH_PASSWORD,
    integritySalt: process.env.JAZZCASH_INTEGRITY_SALT,
    returnUrl: process.env.JAZZCASH_RETURN_URL,
    endpoint:
      process.env.JAZZCASH_ENDPOINT ||
      'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction',
  },
  easyPaisa: {
    storeId: process.env.EASYPAISA_STORE_ID,
    hashKey: process.env.EASYPAISA_HASH_KEY,
    returnUrl: process.env.EASYPAISA_RETURN_URL,
    endpoint:
      process.env.EASYPAISA_ENDPOINT ||
      'https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction',
  },
  safepay: {
    secretKey: process.env.SAFEPAY_SECRET_KEY,
    merchantApiKey: process.env.SAFEPAY_MERCHANT_API_KEY,
    host: process.env.SAFEPAY_HOST || 'https://sandbox.api.getsafepay.com',
    environment: process.env.SAFEPAY_ENV || 'sandbox',
    currency: process.env.SAFEPAY_CURRENCY || 'PKR',
    redirectUrl: process.env.SAFEPAY_REDIRECT_URL,
    cancelUrl: process.env.SAFEPAY_CANCEL_URL,
    signatureSecret: process.env.SAFEPAY_SIGNATURE_SECRET || process.env.SAFEPAY_SECRET_KEY,
    // sandbox_auto | manual | raast
    withdrawMode:
      process.env.SAFEPAY_WITHDRAW_MODE ||
      (process.env.SAFEPAY_ENV === 'sandbox' ? 'sandbox_auto' : 'manual'),
    raast: {
      aggregatorId: process.env.SAFEPAY_AGGREGATOR_ID,
      secretKey: process.env.SAFEPAY_AGGREGATOR_SECRET_KEY,
      host: process.env.SAFEPAY_RAAST_HOST || 'https://dev.api.getsafepay.com/raastwire',
    },
    frontendSuccessPath: process.env.SAFEPAY_FRONTEND_SUCCESS_PATH || '/wallet/topup/success',
    frontendCancelPath: process.env.SAFEPAY_FRONTEND_CANCEL_PATH || '/wallet/topup/cancel',
  },
};
