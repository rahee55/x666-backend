const twilio = require('twilio');

let client = null;

const isConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );

const getClient = () => {
  if (!isConfigured()) {
    return null;
  }

  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  return client;
};

const sendSms = async (to, body) => {
  const twilioClient = getClient();

  if (!twilioClient) {
    throw new Error('Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
  }

  const message = await twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });

  return {
    sid: message.sid,
    status: message.status,
  };
};

module.exports = { sendSms, isConfigured };
