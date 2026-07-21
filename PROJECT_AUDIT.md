# x666-backend — API Route Reference

> Static reference only. Base URL: `http://localhost:3001/api` · Updated: 2026-07-21

**Token:** `No` = no auth header · `Yes` = `Authorization: Bearer <jwt>`

**Role:** `Public` · `User` · `Admin`

**Payload notes:** `—` = no body. Query params shown as JSON under `query`. Optional fields may be omitted.

---

## Health

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/health` | No | Public | — |

---

## Auth — User app

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/auth/signup` | No | Public | JSON below |
| POST | `/auth/login` | No | Public | JSON below |
| POST | `/auth/logout` | Yes | User | — |
| POST | `/auth/forgot-password` | No | Public | JSON below |
| POST | `/auth/reset-password` | No | Public | JSON below |
| POST | `/auth/change-password` | Yes | User | JSON below |

**POST `/auth/signup`**
```json
{
  "name": "Bilal Ahmad",
  "phone": "03001234567",
  "password": "secret123",
  "confirmPassword": "secret123",
  "referralCode": "ABC12345"
}
```
Or with email (use phone **or** email, not both):
```json
{
  "name": "Bilal Ahmad",
  "email": "user@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

**POST `/auth/login`**
```json
{
  "phone": "03001234567",
  "password": "secret123"
}
```
Or:
```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

**POST `/auth/forgot-password`**
```json
{
  "email": "user@example.com"
}
```
Or:
```json
{
  "phone": "03001234567"
}
```

**POST `/auth/reset-password`**
```json
{
  "email": "user@example.com",
  "code": "482910",
  "newPassword": "newsecret123",
  "confirmPassword": "newsecret123"
}
```

**POST `/auth/change-password`**
```json
{
  "currentPassword": "secret123",
  "newPassword": "newsecret456",
  "confirmPassword": "newsecret456"
}
```

---

## Users

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/users/profile` | Yes | User | — |
| PUT | `/users/profile` | Yes | User | JSON below |
| GET | `/user/referral-link` | Yes | User | — |

**PUT `/users/profile`**
```json
{
  "name": "New Name",
  "email": "newemail@example.com"
}
```

---

## Wallet

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/wallet/payment-config` | Yes | User | — |
| GET | `/wallet/balance` | Yes | User | — |
| GET | `/wallet/transactions` | Yes | User | query JSON below |
| GET | `/wallet/bank-details` | Yes | User | — |
| POST | `/wallet/bank-details` | Yes | User | JSON below |
| PUT | `/wallet/bank-details/:id` | Yes | User | JSON below |
| DELETE | `/wallet/bank-details/:id` | Yes | User | — |
| PATCH | `/wallet/bank-details/:id/default` | Yes | User | — |
| GET | `/wallet/withdraw/methods` | Yes | User | — |
| POST | `/wallet/send-otp` | Yes | User | JSON below |
| POST | `/wallet/withdraw` | Yes | User | JSON below |
| GET | `/wallet/withdraw/status/:id` | Yes | User | — |
| GET | `/wallet/withdraw/receipt/:id` | Yes | User | — |
| GET | `/wallet/topup/receipt/:id` | Yes | User | — |

**GET `/wallet/transactions` query**
```json
{
  "limit": 50,
  "skip": 0
}
```

**POST `/wallet/bank-details` — JazzCash / EasyPaisa**
```json
{
  "gateway": "jazzcash",
  "accountNumber": "03001234567",
  "isDefault": true
}
```

**POST `/wallet/bank-details` — Bank**
```json
{
  "gateway": "bank",
  "iban": "PK00HBL0000000000000000",
  "accountTitle": "Bilal Ahmad",
  "isDefault": false
}
```

**PUT `/wallet/bank-details/:id`** — same JSON shape as POST.

**POST `/wallet/send-otp`**
```json
{
  "purpose": "withdraw"
}
```

**POST `/wallet/withdraw` — JazzCash / EasyPaisa**
```json
{
  "amount": 500,
  "gateway": "jazzcash",
  "accountNumber": "03001234567",
  "code": "482910"
}
```

**POST `/wallet/withdraw` — Bank**
```json
{
  "amount": 500,
  "gateway": "bank",
  "iban": "PK00HBL0000000000000000",
  "accountTitle": "Bilal Ahmad",
  "code": "482910"
}
```

---

## Top-up

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/topup/initiate` | Yes | User | JSON below |
| POST | `/topup/:id/submit-receipt` | Yes | User | multipart JSON below |
| GET | `/topup/requests` | Yes | User | query JSON below |
| GET | `/topup/requests/:id` | Yes | User | — |
| GET | `/topup/requests/:id/receipt` | Yes | User | — |

**POST `/topup/initiate`**
```json
{
  "amount": 500
}
```

**POST `/topup/:id/submit-receipt`** — `Content-Type: multipart/form-data` (not JSON body)
```json
{
  "screenshot": "<file: jpg or png, max 5MB>"
}
```

**GET `/topup/requests` query**
```json
{
  "limit": 50,
  "skip": 0
}
```

---

## Spin

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/spin/spin` | Yes | User | — |
| GET | `/spin/history` | Yes | User | — |
| GET | `/spin/result/:id` | Yes | User | — |

---

## Referrals

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/referrals` | Yes | User | — |
| GET | `/referrals/stats` | Yes | User | — |
| POST | `/referrals/claim-bonus` | Yes | User | — |

---

## Aviator game

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/games/aviator/start-round` | No | Public | — |
| POST | `/games/aviator/place-bet` | No | Public | JSON below |
| POST | `/games/aviator/cashout` | No | Public | JSON below |
| GET | `/games/aviator/state` | No | Public | — |

**POST `/games/aviator/place-bet`**
```json
{
  "betAmount": 100
}
```

**POST `/games/aviator/cashout`**
```json
{
  "betAmount": 100,
  "clientClaimedMultiplier": 2.5
}
```

---

## Admin — Auth

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/admin/auth/login` | No | Public | JSON below (admin account only) |
| POST | `/admin/auth/logout` | Yes | Admin | — |
| GET | `/admin/auth/me` | Yes | Admin | — |

**POST `/admin/auth/login`**
```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

> All admin routes below: Token **Yes**, Role **Admin**.

---

## Admin — Dashboard

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/admin/dashboard/stats` | Yes | Admin | — |

**GET `/admin/dashboard/stats` response**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 125000.47,
    "profit": 125000.47,
    "profitNote": "No platform cost/fees schema yet — profit equals totalRevenue until cost tracking is added.",
    "totalUsers": 842,
    "totalPayments": 310,
    "totalWithdrawals": {
      "count": 45,
      "amount": 22000
    },
    "totalGames": null,
    "totalGamesNote": "No Game model in codebase.",
    "pendingReviewCount": 12,
    "todayRevenue": 3500.47,
    "thisMonthRevenue": 42000.12
  }
}
```

---

## Admin — Users

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/admin/users` | Yes | Admin | query JSON below |
| POST | `/admin/users` | Yes | Admin | JSON below |
| GET | `/admin/users/:id` | Yes | Admin | — |
| PUT | `/admin/users/:id` | Yes | Admin | JSON below |
| PATCH | `/admin/users/:id/status` | Yes | Admin | JSON below |
| DELETE | `/admin/users/:id` | Yes | Admin | — |

**GET `/admin/users` query**
```json
{
  "page": 1,
  "limit": 10,
  "search": "",
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "role": "user",
  "status": "active",
  "fromDate": "2026-07-01",
  "toDate": "2026-07-21"
}
```

**POST `/admin/users`**
```json
{
  "name": "New User",
  "email": "user@example.com",
  "password": "secret123",
  "confirmPassword": "secret123",
  "role": "user",
  "status": "active"
}
```

**PUT `/admin/users/:id`**
```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "role": "user",
  "kycStatus": "pending"
}
```

**PATCH `/admin/users/:id/status`**
```json
{
  "status": "suspended"
}
```

---

## Admin — Transactions (top-up review)

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/admin/transactions` | Yes | Admin | query JSON below |
| GET | `/admin/transactions/:id` | Yes | Admin | — |
| GET | `/admin/transactions/:id/screenshot` | Yes | Admin | — (image file) |
| PATCH | `/admin/transactions/:id/approve` | Yes | Admin | JSON below |
| PATCH | `/admin/transactions/:id/reject` | Yes | Admin | JSON below |

**GET `/admin/transactions` query**
```json
{
  "page": 1,
  "limit": 10,
  "search": "TOPUP-A1B2C3",
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "status": "under_review",
  "userId": "665a1b2c3d4e5f6789012345",
  "fromDate": "2026-07-01",
  "toDate": "2026-07-21"
}
```

**PATCH `/admin/transactions/:id/approve`**
```json
{
  "notes": "Verified against bank statement"
}
```

**PATCH `/admin/transactions/:id/reject`**
```json
{
  "reason": "Amount on receipt does not match expected transfer"
}
```

---

## Admin — Withdrawals

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/admin/withdrawals/pending` | Yes | Admin | query JSON below |
| POST | `/admin/withdrawals/:id/approve` | Yes | Admin | JSON below |
| POST | `/admin/withdrawals/:id/reject` | Yes | Admin | JSON below |

**GET `/admin/withdrawals/pending` query**
```json
{
  "page": 1,
  "limit": 10,
  "search": "",
  "sortBy": "createdAt",
  "sortOrder": "asc"
}
```

**POST `/admin/withdrawals/:id/approve`**
```json
{
  "notes": "Paid via JazzCash"
}
```

**POST `/admin/withdrawals/:id/reject`**
```json
{
  "notes": "Invalid account number"
}
```

---

## Admin — Payment config

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| GET | `/admin/payment-config/bank-accounts` | Yes | Admin | — |
| POST | `/admin/payment-config/bank-accounts` | Yes | Admin | JSON below |
| PUT | `/admin/payment-config/bank-accounts/:id` | Yes | Admin | JSON below |
| PATCH | `/admin/payment-config/bank-accounts/:id/toggle` | Yes | Admin | — |
| GET | `/admin/payment-config/settings` | Yes | Admin | — |
| PUT | `/admin/payment-config/settings` | Yes | Admin | JSON below |

**POST `/admin/payment-config/bank-accounts`**
```json
{
  "bankName": "HBL",
  "accountTitle": "x666 Official",
  "gateway": "bank",
  "iban": "PK00HBL0000000000000000",
  "accountNumber": null,
  "label": "HBL Bank Transfer",
  "instructions": "Include TOPUP reference in transfer note.",
  "isActive": true
}
```

**PUT `/admin/payment-config/bank-accounts/:id`** — same JSON shape as POST.

**PUT `/admin/payment-config/settings`**
```json
{
  "currency": "PKR",
  "minTopup": 100,
  "minWithdraw": 100,
  "maxTopupPerTransaction": 50000,
  "maxTopupPerDay": 100000,
  "maxTopupPerDayNewUser": 10000,
  "newUserDays": 7,
  "maxPendingTopupsPerUser": 5,
  "topupRequestTtlHours": 24,
  "withdrawHoldHours": 48
}
```

---

*End of route reference.*
