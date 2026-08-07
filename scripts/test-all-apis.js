/**
 * Full API integration tests. Run: node scripts/test-all-apis.js
 * Requires server on PORT (default 3001) with MongoDB + OTP_USE_FIXED_CODE=true for tests
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { File } = require("node:buffer");
const { Jimp, rgbaToInt } = require("jimp");

const BASE = `http://127.0.0.1:${process.env.PORT || 3001}/api`;
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "change-me-admin-password";
const OTP_CODE = process.env.OTP_DEV_FIXED_CODE || "999999";

const results = [];
let passed = 0;
let failed = 0;

const ts = Date.now();
const userEmail = `apitest.${ts}@example.com`;
const userPassword = "testpass123";

let userToken = null;
let userId = null;
let adminToken = null;
let bankDetailId = null;
let topupRequestId = null;
let topupReferenceCode = null;
let spinHistoryId = null;
let withdrawTransactionId = null;
let withdrawRejectId = null;
let adminCreatedUserId = null;
let receiptFilePath = null;

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, route, { token, body, query, formData } = {}) {
  let url = `${BASE}${route}`;
  if (query) {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null),
    );
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { ...authHeaders(token) };
  let reqBody;
  if (formData) {
    reqBody = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: reqBody });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json, ok: res.ok, headers: res.headers };
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) passed += 1;
  else failed += 1;
}

async function expectOk(name, method, route, opts = {}) {
  const expect = opts.expectStatus || [200, 201];
  try {
    const res = await request(method, route, opts);
    const ok =
      expect.includes(res.status) &&
      (opts.requireSuccess === false ? true : res.json?.success !== false);
    record(name, ok, `${res.status} ${res.json?.message || ""}`.trim());
    return { ok, res };
  } catch (err) {
    record(name, false, err.message);
    return { ok: false, res: null };
  }
}

async function expectStatus(name, method, route, status, opts = {}) {
  const { res } = await expectOk(name, method, route, {
    ...opts,
    expectStatus: [status],
    requireSuccess: false,
  });
  return { ok: res?.status === status, res };
}

async function createReceiptImage() {
  receiptFilePath = path.join(__dirname, `_receipt-${ts}.png`);
  const img = new Jimp({ width: 320, height: 120, color: 0xffffffff });
  // Unique noise so pHash does not collide with prior test uploads in the DB.
  for (let i = 0; i < 80; i += 1) {
    const x = Math.floor(Math.random() * 320);
    const y = Math.floor(Math.random() * 120);
    const shade = Math.floor(Math.random() * 200);
    img.setPixelColor(rgbaToInt(shade, shade, shade, 255), x, y);
  }
  await img.write(receiptFilePath);
  return receiptFilePath;
}

async function loginAdmin() {
  const { ok, res } = await expectOk("POST /admin/auth/login", "POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  adminToken = res?.json?.data?.token || null;
  return ok;
}

async function main() {
  console.log(`\nFull API tests → ${BASE}`);
  console.log(`OTP dev code: ${OTP_CODE}\n`);

  await createReceiptImage();

  // ── Health ──
  await expectOk("GET /health", "GET", "/health");

  // ── Admin prep: lower min withdraw for spin-only balance ──
  if (!(await loginAdmin())) {
    record("ABORT", false, "Admin login failed — check ADMIN_SEED_* in .env");
    printReport();
    process.exit(1);
  }
  await expectOk("PUT /admin/payment-config/settings (test prep)", "PUT", "/admin/payment-config/settings", {
    token: adminToken,
    body: { minWithdraw: 25, minTopup: 100 },
  });

  // ── Auth ──
  {
    const { ok, res } = await expectOk("POST /auth/signup", "POST", "/auth/signup", {
      body: {
        name: "API Test User",
        email: userEmail,
        password: userPassword,
        confirmPassword: userPassword,
      },
    });
    userToken = res?.json?.data?.token;
    userId = res?.json?.data?.user?.id || res?.json?.data?.user?._id;
    if (!ok || !userToken) {
      printReport();
      process.exit(1);
    }
  }

  await expectStatus("POST /auth/signup duplicate", "POST", "/auth/signup", 409, {
    body: { name: "Dup", email: userEmail, password: userPassword, confirmPassword: userPassword },
  });

  await expectOk("POST /auth/login", "POST", "/auth/login", {
    body: { email: userEmail, password: userPassword },
  });

  await expectStatus("POST /auth/login wrong password", "POST", "/auth/login", 401, {
    body: { email: userEmail, password: "wrong" },
  });

  await expectOk("POST /auth/logout", "POST", "/auth/logout", { token: userToken });

  {
    const { res } = await expectOk("POST /auth/login (restore)", "POST", "/auth/login", {
      body: { email: userEmail, password: userPassword },
    });
    userToken = res?.json?.data?.token;
  }

  await expectOk("POST /auth/forgot-password", "POST", "/auth/forgot-password", {
    body: { email: userEmail },
  });

  await expectOk("POST /auth/reset-password", "POST", "/auth/reset-password", {
    body: {
      email: userEmail,
      code: OTP_CODE,
      newPassword: `${userPassword}2`,
      confirmPassword: `${userPassword}2`,
    },
  });

  {
    const { res } = await expectOk("POST /auth/login (after reset)", "POST", "/auth/login", {
      body: { email: userEmail, password: `${userPassword}2` },
    });
    userToken = res?.json?.data?.token;
  }

  await expectOk("POST /auth/change-password", "POST", "/auth/change-password", {
    token: userToken,
    body: {
      currentPassword: `${userPassword}2`,
      newPassword: userPassword,
      confirmPassword: userPassword,
    },
  });

  {
    const { res } = await expectOk("POST /auth/login (final)", "POST", "/auth/login", {
      body: { email: userEmail, password: userPassword },
    });
    userToken = res?.json?.data?.token;
  }

  await expectStatus("GET /users/profile without token", "GET", "/users/profile", 401);

  // ── Users ──
  await expectOk("GET /users/profile", "GET", "/users/profile", { token: userToken });
  await expectOk("PUT /users/profile", "PUT", "/users/profile", {
    token: userToken,
    body: { name: "API Test User Updated" },
  });
  await expectOk("GET /user/referral-link", "GET", "/user/referral-link", { token: userToken });

  // ── Wallet reads ──
  await expectOk("GET /wallet/payment-config", "GET", "/wallet/payment-config", { token: userToken });
  await expectOk("GET /wallet/balance", "GET", "/wallet/balance", { token: userToken });
  await expectOk("GET /wallet/transactions", "GET", "/wallet/transactions", {
    token: userToken,
    query: { limit: 10, skip: 0 },
  });
  await expectOk("GET /wallet/withdraw/methods", "GET", "/wallet/withdraw/methods", { token: userToken });

  // ── Bank details CRUD ──
  {
    const { res } = await expectOk("POST /wallet/bank-details", "POST", "/wallet/bank-details", {
      token: userToken,
      body: { gateway: "jazzcash", accountNumber: "03009998877", isDefault: true },
    });
    bankDetailId = res?.json?.data?.bankDetail?.id || res?.json?.data?.bankDetail?._id;
  }
  await expectOk("GET /wallet/bank-details", "GET", "/wallet/bank-details", { token: userToken });
  if (bankDetailId) {
    await expectOk("PUT /wallet/bank-details/:id", "PUT", `/wallet/bank-details/${bankDetailId}`, {
      token: userToken,
      body: { gateway: "jazzcash", accountNumber: "03009998877", accountTitle: "Test", isDefault: true },
    });
    await expectOk("PATCH /wallet/bank-details/:id/default", "PATCH", `/wallet/bank-details/${bankDetailId}/default`, {
      token: userToken,
    });
  }

  // ── Spin (unlock withdraw + balance) ──
  {
    const { res } = await expectOk("POST /spin/spin", "POST", "/spin/spin", { token: userToken });
    spinHistoryId = res?.json?.data?.historyId;
  }
  await expectOk("GET /spin/history", "GET", "/spin/history", { token: userToken });
  if (spinHistoryId) {
    await expectOk("GET /spin/result/:id", "GET", `/spin/result/${spinHistoryId}`, { token: userToken });
  }

  // Seed game usage + balance so withdraw eligibility passes (min 1000 PKR wagered)
  {
    const mongoose = require("mongoose");
    const { creditWallet, debitWallet } = require("../services/walletService");
    await mongoose.connect(process.env.MONGODB_URI);
    try {
      await creditWallet(userId, 5000, "topup", { status: "success" });
      await debitWallet(userId, 1000, "game_debit", {
        gatewayRef: `TEST-BET-${Date.now()}`,
        status: "success",
      });
    } finally {
      await mongoose.disconnect();
    }
    record("seed game usage for withdraw tests", true, "credited 5000 + game_debit 1000");
  }

  // ── Withdraw (use spin balance before top-up hold affects withdrawable) ──
  await expectOk("POST /wallet/send-otp", "POST", "/wallet/send-otp", {
    token: userToken,
    body: { purpose: "withdraw" },
  });

  {
    const { ok, res } = await expectOk("POST /wallet/withdraw", "POST", "/wallet/withdraw", {
      token: userToken,
      body: {
        amount: 25,
        gateway: "jazzcash",
        accountNumber: "03009998877",
        accountTitle: "Test User",
        code: OTP_CODE,
      },
    });
    withdrawTransactionId = res?.json?.data?.transactionId;
    if (!ok) {
      record("withdraw hint", false, res?.json?.message || "withdraw failed");
    }
  }

  // Second withdraw for admin reject (still spin-only balance)
  await expectOk("POST /wallet/send-otp (reject flow)", "POST", "/wallet/send-otp", {
    token: userToken,
    body: { purpose: "withdraw" },
  });

  {
    const { ok, res } = await expectOk("POST /wallet/withdraw (for reject)", "POST", "/wallet/withdraw", {
      token: userToken,
      body: {
        amount: 25,
        gateway: "jazzcash",
        accountNumber: "03009998877",
        accountTitle: "Test User",
        code: OTP_CODE,
      },
    });
    withdrawRejectId = res?.json?.data?.transactionId;
    if (!ok) {
      record("withdraw reject setup", false, res?.json?.message || "second withdraw failed");
    }
  }

  // ── Top-up full flow ──
  {
    const { res } = await expectOk("POST /topup/initiate", "POST", "/topup/initiate", {
      token: userToken,
      body: { amount: 500 },
    });
    topupRequestId = res?.json?.data?.topupRequestId || res?.json?.data?.id;
    topupReferenceCode = res?.json?.data?.referenceCode;
  }

  await expectOk("GET /topup/requests", "GET", "/topup/requests", {
    token: userToken,
    query: { limit: 10, skip: 0 },
  });

  if (topupRequestId) {
    await expectOk("GET /topup/requests/:id", "GET", `/topup/requests/${topupRequestId}`, {
      token: userToken,
    });

    const pngBuffer = fs.readFileSync(receiptFilePath);
    const form = new FormData();
    form.append("screenshot", new File([pngBuffer], "receipt.png", { type: "image/png" }));

    const uploadRes = await request("POST", `/topup/${topupRequestId}/submit-receipt`, {
      token: userToken,
      formData: form,
    });
    record(
      "POST /topup/:id/submit-receipt",
      [200, 201].includes(uploadRes.status) && uploadRes.json?.success !== false,
      `${uploadRes.status} ${uploadRes.json?.message || ""}`,
    );
  }

  // ── Referrals ──
  await expectOk("GET /referrals", "GET", "/referrals", { token: userToken });
  await expectOk("GET /referrals/stats", "GET", "/referrals/stats", { token: userToken });
  await expectOk("POST /referrals/claim-bonus", "POST", "/referrals/claim-bonus", { token: userToken });

  // ── Aviator ──
  await expectOk("POST /games/aviator/start-round", "POST", "/games/aviator/start-round");
  await expectOk("POST /games/aviator/place-bet", "POST", "/games/aviator/place-bet", {
    body: { betAmount: 1000 },
  });
  await expectOk("POST /games/aviator/cashout", "POST", "/games/aviator/cashout", {
    body: { betAmount: 50, clientClaimedMultiplier: 1.05 },
  });
  await expectOk("GET /games/aviator/state", "GET", "/games/aviator/state");

  // ── Admin: top-up review + approve ──
  await expectStatus("GET /admin/dashboard/stats (user forbidden)", "GET", "/admin/dashboard/stats", 403, {
    token: userToken,
  });

  await expectOk("GET /admin/auth/me", "GET", "/admin/auth/me", { token: adminToken });
  await expectOk("GET /admin/dashboard/stats", "GET", "/admin/dashboard/stats", { token: adminToken });

  await expectOk("POST /admin/review/list (unified)", "POST", "/admin/review/list", {
    token: adminToken,
    body: {
      draw: 1,
      start: 0,
      length: 10,
      columns: [
        { data: "createdAt" },
        { data: "reviewType" },
        { data: "amount" },
      ],
      order: [{ column: 0, dir: "desc" }],
      search: { value: "" },
      filters: { type: "all" },
    },
  });

  if (withdrawTransactionId) {
    await expectOk("GET /wallet/withdraw/status/:id", "GET", `/wallet/withdraw/status/${withdrawTransactionId}`, {
      token: userToken,
    });

    await expectOk("POST /admin/review/list (withdraw filter)", "POST", "/admin/review/list", {
      token: adminToken,
      body: {
        draw: 1,
        start: 0,
        length: 10,
        columns: [{ data: "createdAt" }, { data: "amount" }],
        order: [{ column: 0, dir: "asc" }],
        search: { value: "" },
        filters: { type: "withdraw" },
      },
    });

    const payoutForm = new FormData();
    payoutForm.append("notes", "Paid via JazzCash — API test");
    const payoutBytes = await fs.promises.readFile(receiptFilePath);
    payoutForm.append(
      "payoutProof",
      new File([payoutBytes], "payout-proof.png", { type: "image/png" }),
    );

    await expectOk("POST /admin/review/withdraw/:id/approve", "POST", `/admin/review/withdraw/${withdrawTransactionId}/approve`, {
      token: adminToken,
      formData: payoutForm,
    });

    await expectOk("GET /wallet/withdraw/status/:id (approved)", "GET", `/wallet/withdraw/status/${withdrawTransactionId}`, {
      token: userToken,
    });

    await expectOk("GET /wallet/withdraw/receipt/:id", "GET", `/wallet/withdraw/receipt/${withdrawTransactionId}`, {
      token: userToken,
    });
  }

  if (withdrawRejectId) {
    await expectOk("POST /admin/review/withdraw/:id/reject (unified)", "POST", `/admin/review/withdraw/${withdrawRejectId}/reject`, {
      token: adminToken,
      body: { notes: "API test rejection" },
    });
  }

  await expectOk("POST /admin/review/list (topup all)", "POST", "/admin/review/list", {
    token: adminToken,
    body: {
      draw: 1,
      start: 0,
      length: 10,
      columns: [{ data: "createdAt" }, { data: "referenceCode" }, { data: "status" }],
      order: [{ column: 0, dir: "desc" }],
      search: { value: "" },
      filters: { type: "topup", status: "all" },
    },
  });

  {
    const { ok, res } = await expectOk(
      "POST /admin/review/list (topup all vs approved)",
      "POST",
      "/admin/review/list",
      {
        token: adminToken,
        body: {
          draw: 1,
          start: 0,
          length: 1,
          columns: [{ data: "createdAt" }],
          order: [{ column: 0, dir: "desc" }],
          search: { value: "" },
          filters: { type: "topup", status: "all" },
        },
      },
    );
    const allTotal = res?.json?.recordsTotal ?? 0;
    const approvedRes = await request("POST", "/admin/review/list", {
      token: adminToken,
      body: {
        draw: 1,
        start: 0,
        length: 1,
        columns: [{ data: "createdAt" }],
        order: [{ column: 0, dir: "desc" }],
        search: { value: "" },
        filters: { type: "topup", status: "approved" },
      },
    });
    const approvedTotal = approvedRes.json?.recordsTotal ?? 0;
    record(
      "topup status=all includes approved",
      ok && allTotal >= approvedTotal,
      `all=${allTotal} approved=${approvedTotal}`,
    );
  }

  await expectOk("POST /admin/review/list (topup filter)", "POST", "/admin/review/list", {
    token: adminToken,
    body: {
      draw: 1,
      start: 0,
      length: 10,
      columns: [{ data: "createdAt" }, { data: "referenceCode" }, { data: "status" }],
      order: [{ column: 0, dir: "desc" }],
      search: { value: "" },
      filters: { type: "topup" },
    },
  });

  if (topupRequestId) {
    await expectOk("GET /admin/review/topup/:id", "GET", `/admin/review/topup/${topupRequestId}`, {
      token: adminToken,
    });

    const shotRes = await request("GET", `/admin/review/topup/${topupRequestId}/screenshot`, {
      token: adminToken,
    });
    record(
      "GET /admin/review/topup/:id/screenshot",
      shotRes.status === 200,
      `${shotRes.status} ${shotRes.json?.message || "image served"}`,
    );

    await expectOk("POST /admin/review/topup/:id/approve", "POST", `/admin/review/topup/${topupRequestId}/approve`, {
      token: adminToken,
      body: { notes: "API test approval" },
    });

    await expectOk("GET /wallet/topup/receipt/:id", "GET", `/wallet/topup/receipt/${topupRequestId}`, {
      token: userToken,
    });

    const topupReceiptRes = await request("GET", `/topup/requests/${topupRequestId}/receipt`, {
      token: userToken,
    });
    record(
      "GET /topup/requests/:id/receipt",
      topupReceiptRes.status === 200 && topupReceiptRes.json?.success !== false,
      `${topupReceiptRes.status} ${topupReceiptRes.json?.message || "receipt json"}`,
    );
  }

  // ── Admin users CRUD ──
  await expectOk("GET /admin/users (POST list)", "POST", "/admin/users/list", {
    token: adminToken,
    body: {
      draw: 1,
      start: 0,
      length: 5,
      columns: [
        { data: "createdAt" },
        { data: "name" },
        { data: "email" },
        { data: "role" },
        { data: "status" },
      ],
      order: [{ column: 0, dir: "desc" }],
      search: { value: "" },
      filters: { role: "user", status: "active" },
    },
  });

  if (userId) {
    await expectOk("GET /admin/users/:id", "GET", `/admin/users/${userId}`, { token: adminToken });
    await expectOk("PUT /admin/users/:id", "PUT", `/admin/users/${userId}`, {
      token: adminToken,
      body: { name: "API Test User Admin Edit" },
    });
    await expectOk("PATCH /admin/users/:id/status", "PATCH", `/admin/users/${userId}/status`, {
      token: adminToken,
      body: { status: "active" },
    });
  }

  {
    const { res } = await expectOk("POST /admin/users", "POST", "/admin/users", {
      token: adminToken,
      body: {
        name: "Admin Created User",
        email: `admin.created.${ts}@example.com`,
        password: userPassword,
        confirmPassword: userPassword,
        role: "user",
        status: "active",
      },
      expectStatus: [200, 201],
    });
    adminCreatedUserId = res?.json?.data?.user?.id || res?.json?.data?.user?._id;
    if (adminCreatedUserId) {
      await expectOk("DELETE /admin/users/:id", "DELETE", `/admin/users/${adminCreatedUserId}`, {
        token: adminToken,
      });
    }
  }

  // ── Admin payment config ──
  await expectOk("GET /admin/payment-config/bank-accounts", "GET", "/admin/payment-config/bank-accounts", {
    token: adminToken,
  });
  await expectOk("GET /admin/payment-config/settings", "GET", "/admin/payment-config/settings", {
    token: adminToken,
  });

  let adminBankAccountId = null;
  {
    const { res } = await expectOk("POST /admin/payment-config/bank-accounts", "POST", "/admin/payment-config/bank-accounts", {
      token: adminToken,
      body: {
        bankName: "Test Bank",
        accountTitle: "API Test",
        gateway: "bank",
        iban: `PK00TEST${String(ts).slice(-12)}`,
        label: "Test Account",
        instructions: "Test only",
        isActive: true,
      },
      expectStatus: [200, 201],
    });
    adminBankAccountId = res?.json?.data?.bankAccount?.id;
    if (adminBankAccountId) {
      await expectOk("PUT /admin/payment-config/bank-accounts/:id", "PUT", `/admin/payment-config/bank-accounts/${adminBankAccountId}`, {
        token: adminToken,
        body: {
          bankName: "Test Bank",
          accountTitle: "API Test Updated",
          gateway: "bank",
          iban: `PK00TEST${String(ts).slice(-12)}`,
          label: "Test Account",
          instructions: "Updated",
          isActive: true,
        },
      });
      await expectOk("PATCH /admin/payment-config/bank-accounts/:id/toggle", "PATCH", `/admin/payment-config/bank-accounts/${adminBankAccountId}/toggle`, {
        token: adminToken,
      });
      await expectOk("DELETE /admin/payment-config/bank-accounts/:id", "DELETE", `/admin/payment-config/bank-accounts/${adminBankAccountId}`, {
        token: adminToken,
      });
    }
  }

  await expectOk("POST /admin/auth/logout", "POST", "/admin/auth/logout", { token: adminToken });

  if (bankDetailId) {
    await expectOk("DELETE /wallet/bank-details/:id", "DELETE", `/wallet/bank-details/${bankDetailId}`, {
      token: userToken,
    });
  }

  if (receiptFilePath && fs.existsSync(receiptFilePath)) {
    fs.unlinkSync(receiptFilePath);
  }

  printReport();
  if (failed > 0) process.exit(1);
}

function printReport() {
  console.log("─".repeat(72));
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
    if (r.detail) console.log(`    ${r.detail}`);
  }
  console.log("─".repeat(72));
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${results.length}\n`);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
