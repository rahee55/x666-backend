/**
 * Quick withdrawal limit tests. Run while server is up:
 * OTP_USE_FIXED_CODE=true OTP_DEV_FIXED_CODE=999999 node scripts/test-withdraw-limits.js
 */
require("dotenv").config();

const BASE = `http://127.0.0.1:${process.env.PORT || 3001}/api`;
const OTP_CODE = process.env.OTP_DEV_FIXED_CODE || "999999";
const ts = Date.now();
const email = `withdraw.test.${ts}@example.com`;
const password = "testpass123";

async function request(method, route, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  console.log(`Withdraw limit tests → ${BASE}\n`);

  const signup = await request("POST", "/auth/signup", {
    body: {
      name: "Withdraw Test",
      email,
      password,
      confirmPassword: password,
    },
  });
  if (!signup.json?.data?.token) {
    console.error("Signup failed:", signup.json?.message);
    process.exit(1);
  }
  const token = signup.json.data.token;
  const userId = signup.json.data.user?.id || signup.json.data.user?._id;

  await request("POST", "/spin/spin", { token });

  const mongoose = require("mongoose");
  const { creditWallet, debitWallet } = require("../services/walletService");
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await creditWallet(userId, 100000, "topup", { status: "success" });
    await debitWallet(userId, 1000, "game_debit", {
      gatewayRef: `LIMIT-TEST-${ts}`,
      status: "success",
    });
  } finally {
    await mongoose.disconnect();
  }

  const config = await request("GET", "/wallet/payment-config", { token });
  const maxPerTx = config.json?.data?.maxWithdrawPerTransaction ?? 20000;
  const maxPerDay = config.json?.data?.maxWithdrawPerDay ?? 500000;
  console.log(`Limits: per-request=${maxPerTx}, per-day=${maxPerDay}`);

  const cases = [
    {
      name: "reject over per-request limit",
      amount: maxPerTx + 1,
      expectStatus: 400,
      expectMessageIncludes: "Maximum withdrawal per request",
    },
    {
      name: "accept valid withdrawal",
      amount: 1000,
      expectStatus: 200,
    },
  ];

  let failed = 0;
  for (const testCase of cases) {
    await request("POST", "/wallet/send-otp", {
      token,
      body: { purpose: "withdraw" },
    });

    const res = await request("POST", "/wallet/withdraw", {
      token,
      body: {
        amount: testCase.amount,
        gateway: "jazzcash",
        accountNumber: "03001234567",
        accountTitle: "Test User",
        code: OTP_CODE,
      },
    });

    const ok =
      res.status === testCase.expectStatus &&
      (!testCase.expectMessageIncludes ||
        String(res.json?.message || "").includes(testCase.expectMessageIncludes));

    console.log(`${ok ? "✓" : "✗"} ${testCase.name}: ${res.status} ${res.json?.message || ""}`);
    if (!ok) failed += 1;
  }

  // Game usage gate: new user without game play
  const signup2 = await request("POST", "/auth/signup", {
    body: {
      name: "No Game User",
      email: `nogame.${ts}@example.com`,
      password,
      confirmPassword: password,
    },
  });
  const token2 = signup2.json?.data?.token;
  await request("POST", "/spin/spin", { token: token2 });
  await request("POST", "/wallet/send-otp", { token: token2, body: { purpose: "withdraw" } });
  const blocked = await request("POST", "/wallet/withdraw", {
    token: token2,
    body: {
      amount: 100,
      gateway: "jazzcash",
      accountNumber: "03001234567",
      accountTitle: "Test User",
      code: OTP_CODE,
    },
  });
  const gameGateOk =
    blocked.status === 403 &&
    String(blocked.json?.message || "").includes("1000");
  console.log(
    `${gameGateOk ? "✓" : "✗"} block withdraw without 1000 game usage: ${blocked.status} ${blocked.json?.message || ""}`,
  );
  if (!gameGateOk) failed += 1;

  console.log(`\n${failed === 0 ? "All withdrawal limit checks passed." : `${failed} check(s) failed.`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
