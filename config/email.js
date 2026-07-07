const nodemailer = require('nodemailer');

let transporterPromise;

const normalizeAppPassword = (pass) => (pass || '').replace(/\s/g, '');

const isGmail = () =>
  process.env.SMTP_HOST === 'smtp.gmail.com' ||
  (process.env.SMTP_USER || '').includes('@gmail.com');

const useEthereal = () =>
  process.env.SMTP_USE_ETHEREAL === 'true' ||
  (process.env.NODE_ENV !== 'production' && !normalizeAppPassword(process.env.SMTP_PASS));

const createGmailTransport = () => {
  const user = process.env.SMTP_USER.trim();
  const pass = normalizeAppPassword(process.env.SMTP_PASS);

  if (pass.length !== 16) {
    console.warn(
      `[Nodemailer] Gmail app password must be 16 characters (currently ${pass.length}). ` +
        'Re-copy from https://myaccount.google.com/apppasswords — paste with or without spaces.'
    );
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
};

const initTransporter = async () => {
  if (useEthereal()) {
    const testAccount = await nodemailer.createTestAccount();
    console.log('[Nodemailer] Ethereal test mode — emails viewable via preview URL in terminal');
    console.log('[Nodemailer] Ethereal user:', testAccount.user);

    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  if (!process.env.SMTP_USER || !normalizeAppPassword(process.env.SMTP_PASS)) {
    throw new Error('SMTP_USER and SMTP_PASS are required when not using Ethereal');
  }

  if (isGmail()) {
    return createGmailTransport();
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: normalizeAppPassword(process.env.SMTP_PASS),
    },
  });
};

const getTransporter = async () => {
  if (!transporterPromise) {
    transporterPromise = initTransporter();
  }
  return transporterPromise;
};

const getFromAddress = () =>
  process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@localhost';

const sendEmail = async ({ to, subject, text, html }) => {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('[Nodemailer] Preview URL:', previewUrl);
  }

  return {
    messageId: info.messageId,
    previewUrl: previewUrl || null,
    status: 'sent',
  };
};

module.exports = { sendEmail, getTransporter, getFromAddress, useEthereal };
