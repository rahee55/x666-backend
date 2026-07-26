# x666-backend — API Route Reference

> Static reference only. Base URL: `http://localhost:3001/api` · Updated: 2026-07-26

**Token:** `No` = no auth header · `Yes` = `Authorization: Bearer <jwt>`

**Role:** `Public` · `User` · `Admin`

**Payload notes:** `—` = no body. Query params shown as JSON under `query`. Optional fields may be omitted. Admin table/list routes use **POST** with a DataTables-style JSON body (see shared section below).

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

## Admin — DataTables (shared list payload)

All admin **list/table** endpoints use `POST` with `Content-Type: application/json`.  
Implemented by `makeDataTable()` in `services/table.service.js`.

| Route | Purpose |
|-------|---------|
| POST `/admin/users/list` | Paginated users |
| POST `/admin/review/list` | Pending top-ups + withdrawals (unified review queue) |

### Request body (all list routes)

```json
{
  "draw": 1,
  "start": 0,
  "length": 10,
  "columns": [
    { "data": "createdAt" },
    { "data": "name" },
    { "data": "email" },
    { "data": "role" },
    { "data": "status" }
  ],
  "order": [
    { "column": 0, "dir": "desc" }
  ],
  "search": {
    "value": "bilal",
    "regex": false
  },
  "filters": {
    "role": "user",
    "status": "active",
    "fromDate": "2026-07-01",
    "toDate": "2026-07-21"
  }
}
```

### Request fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `draw` | number | no | DataTables draw counter (echoed in response). Default `1`. |
| `start` | number | no | Row offset for pagination (0-based). Default `0`. |
| `length` | number | no | Rows per page. Default `10`, max `100`. |
| `columns` | array | no | Column defs; `data` = MongoDB field used for sort/search. |
| `order` | array | no | Sort: `column` = index in `columns`, `dir` = `"asc"` \| `"desc"`. |
| `search` | object | no | Global search; `search.value` searched across configured fields. |
| `filters` | object | no | Exact-match filters; empty, `null`, `""`, or `"all"` are ignored. |

### Filter rules

- **Dates:** use `filters.fromDate` and/or `filters.toDate` (ISO date strings; end date includes full day).
- **Booleans:** send `"true"` / `"false"` as strings — they are normalized server-side.
- **ObjectIds:** keys ending in `Id` or `_id` (e.g. `userId`) are cast to MongoDB ObjectId when valid.

### Response body (all list routes)

```json
{
  "success": true,
  "draw": 1,
  "recordsTotal": 842,
  "recordsFiltered": 15,
  "data": [],
  "pagination": {
    "totalItems": 15,
    "totalPages": 2,
    "currentPage": 1,
    "itemsPerPage": 10,
    "start": 0,
    "length": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Response fields

| Field | Description |
|-------|-------------|
| `draw` | Same as request `draw`. |
| `recordsTotal` | Total rows before search/filters (base query only). |
| `recordsFiltered` | Total rows after search + filters. |
| `data` | Current page rows (formatted per endpoint). |
| `pagination` | Helper object for custom UI (page number, next/prev, etc.). |

### Frontend example (DataTables `ajax`)

```javascript
ajax: {
  url: '/api/admin/users/list',
  type: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  contentType: 'application/json',
  data: (d) => JSON.stringify({
    draw: d.draw,
    start: d.start,
    length: d.length,
    columns: d.columns,
    order: d.order,
    search: d.search,
    filters: {
      role: selectedRole,       // omit or "all" to skip
      status: selectedStatus,
      fromDate: dateFrom,
      toDate: dateTo,
    },
  }),
  dataSrc: (json) => json.data,
}
```

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
    "pendingReview": {
      "topup": 8,
      "withdraw": 4,
      "total": 12
    },
    "todayRevenue": 3500.47,
    "thisMonthRevenue": 42000.12
  }
}
```

---

## Admin — Users

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/admin/users/list` | Yes | Admin | DataTables JSON (shared section) |
| POST | `/admin/users` | Yes | Admin | JSON below |
| GET | `/admin/users/:id` | Yes | Admin | — |
| PUT | `/admin/users/:id` | Yes | Admin | JSON below |
| PATCH | `/admin/users/:id/status` | Yes | Admin | JSON below |
| DELETE | `/admin/users/:id` | Yes | Admin | — |

**POST `/admin/users/list`** — use shared DataTables body. Supported **filters:** `role`, `status`, `fromDate`, `toDate`. **Search fields:** `name`, `email`, `phone`, `referralCode`. **Sort columns:** any User model field in `columns[].data` (e.g. `createdAt`, `name`, `email`, `role`, `status`).

Example **filters** only:
```json
{
  "draw": 1,
  "start": 0,
  "length": 10,
  "columns": [
    { "data": "createdAt" },
    { "data": "name" },
    { "data": "email" },
    { "data": "role" },
    { "data": "status" }
  ],
  "order": [{ "column": 0, "dir": "desc" }],
  "search": { "value": "bilal" },
  "filters": {
    "role": "user",
    "status": "active",
    "fromDate": "2026-07-01",
    "toDate": "2026-07-21"
  }
}
```

Example **response** `data` row:
```json
{
  "id": "665a1b2c3d4e5f6789012345",
  "name": "Bilal Ahmad",
  "phone": null,
  "email": "user@example.com",
  "role": "user",
  "status": "active",
  "referralCode": "A1B2C3D4",
  "kycStatus": "pending",
  "createdAt": "2026-07-01T10:00:00.000Z"
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

**PUT `/admin/users/:id`** — all fields optional; password is **not** accepted on this route.
```json
{
  "name": "Updated Name",
  "phone": "03001234567",
  "email": "updated@example.com",
  "role": "user",
  "status": "active",
  "kycStatus": "approved",
  "isPhoneVerified": true,
  "isEmailVerified": true
}
```

**PATCH `/admin/users/:id/status`**
```json
{
  "status": "suspended"
}
```

---

## ⭐ Admin — Review (top-up & withdraw)

> **Single admin inbox** for pending top-ups and withdrawals.

| Method | Route | Token | Role | Payload |
|--------|-------|-------|------|---------|
| POST | `/admin/review/list` | Yes | Admin | DataTables JSON (shared section) |
| GET | `/admin/review/topup/:id` | Yes | Admin | — |
| GET | `/admin/review/topup/:id/screenshot` | Yes | Admin | — (receipt image file) |
| POST | `/admin/review/topup/:id/approve` | Yes | Admin | JSON below · **credits wallet** |
| POST | `/admin/review/topup/:id/reject` | Yes | Admin | JSON below · no wallet change |
| POST | `/admin/review/withdraw/:id/approve` | Yes | Admin | JSON below · **finalizes payout** |
| POST | `/admin/review/withdraw/:id/reject` | Yes | Admin | JSON below · **refunds wallet** |

Dashboard: `GET /admin/dashboard/stats` → `pendingReviewCount` (total) and `pendingReview: { topup, withdraw, total }`.

### POST `/admin/review/list`

Same DataTables body as other admin list routes, plus optional **`filters.type`:**

| `filters.type` | Result |
|----------------|--------|
| omitted or `"all"` | Pending top-ups (`under_review`) **+** pending withdrawals (`pending_manual_review`), merged by `createdAt` |
| `"topup"` | Top-ups only |
| `"withdraw"` | Withdrawals only |

Also supports **`filters.userId`**, **`filters.fromDate`**, **`filters.toDate`**, and global **`search.value`** (matches reference, gateway ref, account, status).

Example request (combined inbox):
```json
{
  "draw": 1,
  "start": 0,
  "length": 10,
  "columns": [
    { "data": "createdAt" },
    { "data": "reviewType" },
    { "data": "amount" },
    { "data": "status" }
  ],
  "order": [{ "column": 0, "dir": "desc" }],
  "search": { "value": "" },
  "filters": {
    "type": "all",
    "fromDate": "2026-07-01",
    "toDate": "2026-07-21"
  }
}
```

Example **response** rows (mixed types):
```json
{
  "success": true,
  "draw": 1,
  "recordsTotal": 18,
  "recordsFiltered": 18,
  "data": [
    {
      "reviewType": "topup",
      "id": "665a1b2c3d4e5f6789012345",
      "referenceCode": "TOPUP-A1B2C3",
      "requestedAmount": 500,
      "expectedAmount": 500.47,
      "amount": 500.47,
      "status": "under_review",
      "receiptImageUrl": "uploads/receipts/...",
      "createdAt": "2026-07-21T10:00:00.000Z",
      "user": { "_id": "...", "name": "Bilal Ahmad", "email": "user@example.com", "phone": null }
    },
    {
      "reviewType": "withdraw",
      "id": "665a1b2c3d4e5f6789012346",
      "transactionId": "665a1b2c3d4e5f6789012346",
      "amount": 500,
      "status": "pending_manual_review",
      "destinationAccount": "03001234567",
      "accountUsed": "jazzcash",
      "gatewayRef": "WD-1720000000000",
      "createdAt": "2026-07-21T09:30:00.000Z",
      "user": { "_id": "...", "name": "Bilal Ahmad", "email": "user@example.com", "phone": "03001234567" }
    }
  ],
  "pagination": { "totalItems": 18, "currentPage": 1, "hasNextPage": true }
}
```

### GET `/admin/review/topup/:id`

Top-up detail (includes OCR data, reviewer, user).

### Approve / reject

Use **`id`** and **`reviewType`** from the list row.

**Approve top-up** — `POST /admin/review/topup/:id/approve` (only when `status` is `under_review`)
```json
{ "notes": "Verified against bank statement" }
```

**Approve top-up response** — wallet credited with `expectedAmount`:
```json
{
  "success": true,
  "message": "Top-up approved and wallet credited",
  "data": {
    "topupRequest": {
      "id": "665a1b2c3d4e5f6789012345",
      "referenceCode": "TOPUP-A1B2C3",
      "expectedAmount": 500.47,
      "status": "approved"
    },
    "transactionId": "665a1b2c3d4e5f6789012347",
    "balance": 1500.47,
    "receipt": {
      "receiptNumber": "RCPT-A1B2C3D4-XYZ",
      "creditedAmount": 500.47,
      "currency": "PKR"
    }
  }
}
```

**Reject top-up** — `POST /admin/review/topup/:id/reject`
```json
{ "reason": "Amount on receipt does not match" }
```
(`notes` accepted as alias for `reason`.)

**Approve withdraw** — `POST /admin/review/withdraw/:id/approve` (`:id` = `Transaction._id` from list)
```json
{ "notes": "Paid via JazzCash" }
```

**Approve withdraw response**:
```json
{
  "success": true,
  "message": "Withdrawal approved",
  "data": {
    "transactionId": "665a1b2c3d4e5f6789012345",
    "status": "success",
    "balance": 1000,
    "lockedBalance": 0
  }
}
```

**Reject withdraw** — `POST /admin/review/withdraw/:id/reject`
```json
{ "notes": "Invalid account number" }
```
(`reason` accepted as alias for `notes`.)

**Reject withdraw response** — amount refunded to `balance`:
```json
{
  "success": true,
  "message": "Withdrawal rejected and funds returned",
  "data": {
    "transactionId": "665a1b2c3d4e5f6789012345",
    "status": "rejected",
    "balance": 1500,
    "lockedBalance": 0
  }
}
```

### Wallet balance effects

| Admin action | User `balance` | User `lockedBalance` | Notes |
|--------------|----------------|----------------------|-------|
| **Approve top-up** | **+`expectedAmount`** | unchanged | Creates `Transaction` type `topup` · funds on hold until `withdrawHoldHours` |
| **Reject top-up** | unchanged | unchanged | Request → `rejected` · no wallet movement |
| **Approve withdraw** | unchanged | **−amount** | Payout confirmed · `Transaction` → `success` |
| **Reject withdraw** | **+amount** (refund) | **−amount** | Funds returned from lock · `Transaction` → `rejected` |

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
