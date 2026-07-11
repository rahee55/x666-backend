# x666-backend — Project Audit

> Readable reference for the trimmed codebase.  
> Updated: 2026-07-11 · Base URL: `http://localhost:3001/api`

---

## What this app does

Referral-driven **spin & wallet** backend:

1. **Signup** → three steps — (1) submit **name + email or phone + password**, server sends OTP, (2) verify OTP, (3) **login** separately
2. **Login** → JWT token · **Logout** → clear session, client discards JWT
3. **Spin** → **one spin per user (lifetime)**; weighted wheel — only **50 (85%)** or **100 (15%)** can win
4. **Referrals** → share link; 50 qualifying referrals → **1000 PKR** bonus
5. **Wallet** → Safepay top-up (OTP + auto-reconcile on poll); Safepay withdraw via **bank / JazzCash / EasyPaisa** (OTP + first spin required)

**OTP policy:** OTP is required for **signup**, **top-up**, **withdraw**, and **forgot / reset password**. Delivery channel matches the user’s registered contact:
- **Email** → Nodemailer (SMTP / Ethereal in dev)
- **Phone** → Twilio SMS

**Withdraw rule:** User must complete their **first (lifetime) spin** before withdraw is allowed.

**Top-up rule:** Request OTP via `POST /wallet/send-otp`, then submit top-up with `code`. No manual confirm — poll `GET /wallet/topup/status/:orderId` or refresh balance/transactions after Safepay checkout.

---

## Response format

Every endpoint returns JSON in one of these shapes:

**Success**
```json
{
  "success": true,
  "message": "Optional human-readable message",
  "data": { }
}
```

**Error**
```json
{
  "success": false,
  "message": "What went wrong"
}
```

**Auth header** (protected routes):
```
Authorization: Bearer <jwt_token>
```

---

## API endpoints

### Health

#### `GET /api/health`

No auth. No body.

**Response 200**
```json
{
  "success": true,
  "message": "API is running"
}
```

---

### Auth

> File: `routes/authRoutes.js` → `controllers/authController.js`

#### `POST /api/auth/signup`

Rate limit: `authLimiter` (20 / 15 min). **Step 1 of signup** — submit registration details; server saves a pending signup and **sends OTP** to the email or phone provided.

**Request — phone signup**
```json
{
  "name": "Bilal Ahmad",
  "phone": "03001234567",
  "password": "secret123",
  "confirmPassword": "secret123",
  "referralCode": "ABC12345"
}
```

**Request — email signup**
```json
{
  "name": "Bilal Ahmad",
  "email": "user@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | min 2 chars |
| `phone` | one of phone/email | unique; OTP sent here |
| `email` | one of phone/email | unique; OTP sent here |
| `password` | yes | min 6 chars |
| `confirmPassword` | yes | must match password |
| `referralCode` | no | must exist if provided |

**Response 200**
```json
{
  "success": true,
  "message": "Signup details saved. OTP sent to your email.",
  "data": {
    "channel": "email",
    "identifier": "user@example.com",
    "expiresAt": "2026-07-11T07:43:00.000Z"
  }
}
```

**Errors:** `400` validation · `409` phone/email already registered · `429` OTP rate limit

**Next step:** `POST /api/auth/verify-signup-otp` with the same email/phone + OTP `code`.

---

#### `POST /api/auth/resend-signup-otp`

Rate limit: `otpLimiter` (5 / min). Resend signup OTP if step 1 was already submitted.

**Request**
```json
{
  "email": "user@example.com"
}
```

**Errors:** `404` no pending signup for this identifier

---

#### `POST /api/auth/verify-signup-otp`

Rate limit: `authLimiter` (20 / 15 min). **Step 2 of signup** — verify OTP only (no password in this request). Creates account + wallet. **Does not return a JWT**.

**Request — phone**
```json
{
  "phone": "03001234567",
  "code": "482910"
}
```

**Request — email**
```json
{
  "email": "user@example.com",
  "code": "482910"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `phone` | one of phone/email | same as step 1 |
| `email` | one of phone/email | same as step 1 |
| `code` | yes | OTP received after signup |

**Response 201**
```json
{
  "success": true,
  "message": "OTP verified and account created successfully. Please login to continue.",
  "data": {
    "channel": "email",
    "identifier": "user@example.com",
    "user": {
      "id": "665a1b2c3d4e5f6789012345",
      "name": "Bilal Ahmad",
      "phone": null,
      "email": "user@example.com",
      "isPhoneVerified": false,
      "isEmailVerified": true,
      "referralCode": "A1B2C3D4",
      "totalReferrals": 0,
      "kycStatus": "pending"
    }
  }
}
```

**Errors:** `400` bad OTP · `404` pending signup expired · `409` phone/email taken · `429` too many verify attempts

**Next step:** `POST /api/auth/login` with the same phone/email + password from step 1.

---

#### `POST /api/auth/login`

Rate limit: `authLimiter`. **Step 3 of signup** — obtain JWT after account is created via `verify-signup-otp`.

**Request** — phone **or** email (one required):
```json
{
  "phone": "03001234567",
  "password": "secret123"
}
```
```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

**Response 200**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { }
  }
}
```

**Errors:** `400` missing phone/email · `401` invalid credentials

---

#### `POST /api/auth/logout`

Requires JWT.

**Request:** no body

**Response 200**
```json
{
  "success": true,
  "message": "Logged out successfully. Discard the JWT on the client."
}
```

Destroys server session if present. Client must delete the stored JWT — tokens remain valid until expiry (stateless JWT).

**Errors:** `401` missing or invalid token

---

#### `POST /api/auth/forgot-password`

Rate limit: `otpLimiter` (5 / min)

**Request** — phone **or** email (one required):
```json
{
  "email": "user@example.com"
}
```
```json
{
  "phone": "03001234567"
}
```

**Response 200** (always generic — does not reveal if account exists)
```json
{
  "success": true,
  "message": "If an account exists, an OTP has been sent to your email.",
  "data": {
    "channel": "email",
    "identifier": "user@example.com"
  }
}
```

OTP is sent via **email (Nodemailer)** or **SMS (Twilio)** depending on the identifier provided.

---

#### `POST /api/auth/reset-password`

Requires OTP from forgot-password flow.

**Request** — phone **or** email (same identifier used in forgot-password):
```json
{
  "email": "user@example.com",
  "code": "482910",
  "newPassword": "newsecret123",
  "confirmPassword": "newsecret123"
}
```
```json
{
  "phone": "03001234567",
  "code": "482910",
  "newPassword": "newsecret123",
  "confirmPassword": "newsecret123"
}
```

**Response 200**
```json
{
  "success": true,
  "message": "Password reset successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { }
  }
}
```

**Errors:** `400` bad OTP · `404` user not found · `429` too many verify attempts

---

#### `POST /api/auth/change-password`

Requires JWT. Changes password for the logged-in user (no OTP — uses current password).

**Request**
```json
{
  "currentPassword": "secret123",
  "newPassword": "newsecret456",
  "confirmPassword": "newsecret456"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `currentPassword` | yes | must match existing password |
| `newPassword` | yes | min 6 chars, must differ from current |
| `confirmPassword` | yes | must match newPassword |

**Response 200**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Errors:** `400` validation · `401` wrong current password or missing JWT

---

### Users

> File: `routes/userRoutes.js` → `controllers/userController.js`  
> All routes require JWT.

#### `GET /api/users/profile`

**Response 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "name": "Bilal Ahmad",
      "phone": "03001234567",
      "email": "user@example.com",
      "referralCode": "A1B2C3D4",
      "totalReferrals": 3,
      "referredBy": {
        "_id": "...",
        "name": "Referrer Name",
        "referralCode": "XYZ98765"
      }
    }
  }
}
```

---

#### `PUT /api/users/profile`

**Request**
```json
{
  "name": "New Name",
  "email": "newemail@example.com"
}
```

Both fields optional.

**Response 200**
```json
{
  "success": true,
  "message": "Profile updated",
  "data": { "user": { } }
}
```

---

### Referral link

> File: `routes/index.js` → `controllers/userController.getReferralLink`  
> Requires JWT.

#### `GET /api/user/referral-link`

**Response 200**
```json
{
  "success": true,
  "data": {
    "referralCode": "A1B2C3D4",
    "referralLink": "http://localhost:3000/signup?ref=A1B2C3D4",
    "shareableUrl": "http://localhost:3000/signup?ref=A1B2C3D4",
    "totalReferrals": 12
  }
}
```

Uses `APP_BASE_URL` (frontend URL, not API port).

---

### Wallet

> File: `routes/walletRoutes.js` → `controllers/walletController.js`

#### `GET /api/wallet/topup/callback` · `POST /api/wallet/topup/callback`

**No JWT** — Safepay redirect after checkout. Also supports HTML redirect to frontend when `Accept: text/html`.

**Request** (form or JSON)
```json
{
  "order_id": "TOPUP-665a-1234567890",
  "tracker": "safepay_tracker_token",
  "signature": "hmac_signature",
  "reference_code": "optional_ref"
}
```

Also accepts: `orderId`, `sig`, `reference`, `ref`

**Response 200**
```json
{
  "success": true,
  "message": "Top-up successful",
  "data": {
    "orderId": "TOPUP-665a-1234567890",
    "referenceCode": "REF123",
    "tracker": "...",
    "balance": 1500,
    "transactionId": "665a..."
  }
}
```

**Errors:** `400` missing fields · `403` bad signature · `402` payment incomplete · `404` order not found · `409` already processed

---

#### `GET /api/wallet/topup/cancel` · `POST /api/wallet/topup/cancel`

**No JWT** — user cancelled Safepay checkout. Marks pending top-up as `failed` if `order_id` provided.

**Response 200**
```json
{
  "success": true,
  "message": "Top-up cancelled",
  "data": { "orderId": "TOPUP-...", "status": "cancelled" }
}
```

---

#### `GET /api/wallet/payment-config`

Requires JWT.

**Response 200**
```json
{
  "success": true,
  "data": {
    "provider": "safepay",
    "environment": "sandbox",
    "currency": "PKR",
    "withdrawMode": "sandbox_auto",
    "raastEnabled": false,
    "checkoutEnabled": true,
    "minTopup": 100,
    "minWithdraw": 100,
    "canWithdraw": true,
    "firstSpinRequired": false,
    "withdrawMethods": [
      { "id": "bank", "provider": "safepay", "enabled": true },
      { "id": "jazzcash", "provider": "safepay", "enabled": true },
      { "id": "easypaisa", "provider": "safepay", "enabled": true }
    ]
  }
}
```

---

#### `GET /api/wallet/withdraw/methods`

Requires JWT. Lists Safepay payout options. Methods are `enabled: false` until first spin is done.

**Response 200**
```json
{
  "success": true,
  "data": {
    "provider": "safepay",
    "minWithdraw": 100,
    "withdrawMode": "sandbox_auto",
    "canWithdraw": true,
    "firstSpinRequired": false,
    "message": null,
    "methods": [
      {
        "id": "bank",
        "label": "Bank Transfer",
        "provider": "safepay",
        "payoutChannel": "raast",
        "requiredFields": ["iban"],
        "optionalFields": ["accountTitle"],
        "enabled": true
      },
      {
        "id": "jazzcash",
        "label": "JazzCash",
        "provider": "safepay",
        "payoutChannel": "mobile_wallet",
        "requiredFields": ["accountNumber"],
        "enabled": true
      },
      {
        "id": "easypaisa",
        "label": "EasyPaisa",
        "provider": "safepay",
        "payoutChannel": "mobile_wallet",
        "requiredFields": ["accountNumber"],
        "enabled": true
      }
    ]
  }
}
```

**Errors:** `403` if `firstSpinRequired: true` on withdraw POST (not on this GET)

---

#### `GET /api/wallet/balance`

Requires JWT. **Auto-reconciles** pending Safepay top-ups before returning balance.

**Response 200**
```json
{
  "success": true,
  "data": {
    "balance": 1500,
    "lockedBalance": 200
  }
}
```

---

#### `GET /api/wallet/transactions`

Requires JWT. **Auto-reconciles** pending top-ups. Top-up rows with DB status `success` are returned as `"status": "paid"`.

**Query:** `?limit=50&skip=0` (limit max 100)

**Response 200**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "...",
        "type": "topup",
        "amount": 500,
        "status": "paid",
        "accountUsed": "safepay",
        "createdAt": "2026-07-07T10:00:00.000Z"
      }
    ],
    "total": 15,
    "limit": 50,
    "skip": 0
  }
}
```

---

#### `POST /api/wallet/send-otp`

Requires JWT · Rate limit: `otpLimiter` (5 / min)

Sends OTP to the user’s **verified signup channel** (email or phone).

**Request**
```json
{
  "purpose": "topup"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `purpose` | yes | `topup` or `withdraw` |

**Response 200**
```json
{
  "success": true,
  "message": "OTP sent to your phone number.",
  "data": {
    "purpose": "topup",
    "channel": "sms",
    "identifier": "+923001234567",
    "expiresAt": "2026-07-11T07:43:00.000Z"
  }
}
```

**Errors:** `400` invalid purpose · `429` OTP rate limit

---

#### `POST /api/wallet/topup`

Requires JWT · **OTP required**. Creates Safepay checkout after OTP verification.

**Flow:** `POST /wallet/send-otp` with `"purpose": "topup"` → then top-up with `code`.

**Request**
```json
{
  "amount": 500,
  "code": "482910"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `amount` | yes | min `100` (`MIN_TOPUP`) |
| `code` | yes | OTP from `send-otp` |

Minimum: `100` (`MIN_TOPUP`)

**Response 200**
```json
{
  "success": true,
  "message": "Safepay checkout session created",
  "data": {
    "orderId": "TOPUP-665a-1234567890",
    "tracker": "safepay_tracker",
    "checkoutUrl": "https://sandbox.api.getsafepay.com/checkout/...",
    "transactionId": "665a...",
    "amount": 500,
    "currency": "PKR",
    "environment": "sandbox"
  }
}
```

Redirect user to `checkoutUrl`. After payment, poll status (callback optional in local dev).

**Safepay test card (sandbox):** `5200 0000 0000 1096`

---

#### `GET /api/wallet/topup/status/:orderId`

Requires JWT. **Auto-reconciles** — if Safepay reports paid, credits wallet and returns `"status": "paid"`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "orderId": "TOPUP-665a-1234567890",
    "transactionId": "665a...",
    "amount": 500,
    "status": "paid",
    "safepayTracker": "track_...",
    "safepayState": "TRACKER_ENDED",
    "safepayPaid": true,
    "balance": 1500
  }
}
```

Poll after checkout until `status === "paid"`. No `POST /topup/confirm` endpoint.

---

#### `GET /api/wallet/topup/transaction/:id`

Requires JWT. Same response shape as `topup/status/:orderId`, keyed by MongoDB transaction `_id`.

---

#### `POST /api/wallet/withdraw`

Requires JWT · **OTP required** · **requires first spin completed**

**Flow:** `POST /wallet/send-otp` with `"purpose": "withdraw"` → then withdraw with `code`.

**Request — JazzCash / EasyPaisa**
```json
{
  "amount": 500,
  "gateway": "jazzcash",
  "accountNumber": "03001234567",
  "code": "482910"
}
```

**Request — Bank (Safepay Raast)**
```json
{
  "amount": 500,
  "gateway": "bank",
  "iban": "PK00XXXX0000000000000000",
  "accountTitle": "Bilal Ahmad",
  "code": "482910"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `amount` | yes | min `100` |
| `gateway` | yes | `bank` · `jazzcash` · `easypaisa` |
| `code` | yes | OTP from `send-otp` |
| `accountNumber` | for wallets | JazzCash / EasyPaisa mobile number |
| `iban` | for bank | Pakistani IBAN |
| `accountTitle` | no | optional bank account name |

**Response 200** (sandbox — instant)
```json
{
  "success": true,
  "message": "Safepay sandbox withdrawal processed via jazzcash",
  "data": {
    "amount": 500,
    "gateway": "jazzcash",
    "destinationAccount": "03001234567",
    "balance": 500,
    "lockedBalance": 0,
    "transactionId": "665a...",
    "status": "success",
    "withdrawMode": "sandbox_auto"
  }
}
```

**Response 200** (production manual — JazzCash / EasyPaisa / bank without Raast)
```json
{
  "success": true,
  "message": "Withdrawal queued for manual admin review",
  "data": {
    "balance": 500,
    "lockedBalance": 500,
    "status": "pending_manual_review",
    "withdrawMode": "manual"
  }
}
```

**Response 200** (production bank via Raast)
```json
{
  "success": true,
  "message": "Raast payout initiated — processing",
  "data": {
    "gateway": "bank",
    "status": "pending",
    "withdrawMode": "raast",
    "payoutStatus": "P_INITIATED"
  }
}
```

**Errors:** `402` insufficient balance · `403` first spin not done

---

#### `GET /api/wallet/withdraw/status/:id`

Requires JWT. Poll Raast payout; auto-completes if `P_SETTLED` in sandbox.

**Response 200**
```json
{
  "success": true,
  "data": {
    "transactionId": "665a...",
    "amount": 500,
    "status": "success",
    "gatewayRef": "WITHDRAW-...",
    "destinationAccount": "03001234567",
    "payoutStatus": null,
    "balance": 500,
    "lockedBalance": 0
  }
}
```

---

### Spin

> File: `routes/spinRoutes.js` → `controllers/spinController.js`  
> All routes require JWT.

#### `POST /api/spin/spin`

Rate limit: `spinLimiter` (10 / min) · **One spin per user, ever** (`SPIN_LIFETIME_LIMIT: 1`)

No request body.

**Response 200** (first and only spin)
```json
{
  "success": true,
  "message": "Spin completed",
  "data": {
    "amountWon": 50,
    "spinSlotShown": 50,
    "spinCost": 0,
    "balance": 550,
    "historyId": "665a...",
    "spinsRemaining": 0,
    "canSpin": false,
    "canWithdraw": true,
    "firstSpinRequired": false,
    "referredUser": true,
    "qualifyingSpinMarked": true,
    "referrerBonusPaid": false
  }
}
```

**Response 403** (already spun)
```json
{
  "success": false,
  "message": "You have already used your one-time spin"
}
```

**Errors:** `402` if `SPIN_COST > 0` and low balance · `403` already used lifetime spin · `401` unauthorized

> After the first spin, `canWithdraw: true` unlocks Safepay withdraw (bank / JazzCash / EasyPaisa).

---

#### `GET /api/spin/history`

**Response 200**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "_id": "...",
        "amountWon": 100,
        "spinSlotShown": 100,
        "createdAt": "2026-07-07T10:00:00.000Z"
      }
    ],
    "spinsRemaining": 0,
    "canSpin": false
  }
}
```

---

#### `GET /api/spin/result/:id`

**Response 200**
```json
{
  "success": true,
  "data": {
    "result": {
      "_id": "...",
      "userId": "...",
      "amountWon": 50,
      "spinSlotShown": 50,
      "createdAt": "..."
    }
  }
}
```

**Errors:** `404` not found or not owned by user

---

### Referrals

> File: `routes/referralRoutes.js` → `controllers/referralController.js`  
> All routes require JWT.

#### `GET /api/referrals/`

**Response 200**
```json
{
  "success": true,
  "data": {
    "referrals": [
      {
        "_id": "...",
        "referrerId": "...",
        "referredUserId": {
          "_id": "...",
          "name": "Referred User",
          "phone": "03009998888",
          "createdAt": "..."
        },
        "qualifyingSpinDone": true,
        "bonusEligible": true,
        "bonusPaidAt": null,
        "referredUserSignedUpAt": "..."
      }
    ],
    "count": 5
  }
}
```

---

#### `GET /api/referrals/stats`

**Response 200**
```json
{
  "success": true,
  "data": {
    "total": 55,
    "qualifyingSpinDone": 48,
    "bonusEligible": 3,
    "bonusPaid": 50
  }
}
```

---

#### `POST /api/referrals/claim-bonus`

No body. Pays when ≥ 50 qualifying referrals are eligible.

**Response 200** (bonus paid)
```json
{
  "success": true,
  "message": "Referral bonus credited",
  "data": {
    "balance": 2500,
    "amount": 1000,
    "referralsPaid": 50
  }
}
```

**Response 200** (not yet eligible)
```json
{
  "success": true,
  "message": "Bonus threshold not reached yet",
  "data": {
    "balance": null,
    "amount": null,
    "referralsPaid": null
  }
}
```

---

## Database models

### User — `models/Users.js`

```json
{
  "name": "string",
  "phone": "string (unique, sparse) — E.164 when set",
  "email": "string (unique, sparse, lowercase) — when set",
  "password": "hashed, hidden from queries",
  "isPhoneVerified": "true if signed up via phone OTP",
  "isEmailVerified": "true if signed up via email OTP",
  "referralCode": "auto-generated, unique",
  "referredBy": "ObjectId → User",
  "totalReferrals": 0,
  "kycStatus": "pending | submitted | approved | rejected",
  "createdAt": "Date"
}
```

At least **one** of `phone` or `email` is required. Signup accepts only one identifier; the matching verification flag is set to `true`.

### PendingSignup — `models/PendingSignup.js`

Temporary storage between `POST /auth/signup` and `POST /auth/verify-signup-otp`. Auto-deleted after 15 minutes or when account is created.

```json
{
  "identifier": "email or E.164 phone (unique)",
  "channel": "email | sms",
  "name": "string",
  "password": "plain text until User.create (select: false)",
  "referralCode": "string | null",
  "referredBy": "ObjectId → User | null",
  "expiresAt": "15 min TTL"
}
```

### Wallet — `models/Wallet.js`

```json
{
  "userId": "ObjectId → User (unique)",
  "balance": 0,
  "lockedBalance": 0,
  "updatedAt": "Date"
}
```

### Transaction — `models/Transaction.js`

```json
{
  "userId": "ObjectId",
  "type": "topup | withdraw | spin_win | referral_bonus | game_debit | game_credit",
  "amount": 500,
  "status": "pending | success | failed | pending_manual_review",
  "gatewayRef": "order id",
  "safepayTracker": "string",
  "safepayReference": "string",
  "destinationAccount": "for withdraws",
  "accountUsed": "jazzcash | easypaisa | bank | safepay | other",
  "createdAt": "Date"
}
```

### OTP — `models/OTP.js`

```json
{
  "identifier": "email address or E.164 phone",
  "code": "hashed",
  "purpose": "signup | reset_password | topup | withdraw",
  "expiresAt": "10 min TTL",
  "attempts": 0,
  "verified": false
}
```

OTP delivery: email → Nodemailer · phone → Twilio SMS.

### SpinHistory — `models/SpinHistory.js`

```json
{
  "userId": "ObjectId",
  "amountWon": 50,
  "spinSlotShown": 50,
  "createdAt": "Date"
}
```

### Referral — `models/Referral.js`

```json
{
  "referrerId": "ObjectId → User",
  "referredUserId": "ObjectId → User (unique)",
  "referredUserSignedUpAt": "Date",
  "qualifyingSpinDone": false,
  "bonusEligible": true,
  "bonusPaidAt": null,
  "createdAt": "Date"
}
```

---

## Config & environment

### Game rules — `config/constants.js`

| Setting | Value | Meaning |
|---------|-------|---------|
| `SPIN_SLOTS` | `[50, 100, 500, 1000, 10000]` | Wheel display values |
| `SPIN_WEIGHTS` | `[85, 15, 0, 0, 0]` | Win % — only 50 & 100 today |
| `SPIN_COST` | `0` | Cost per spin (0 = free) |
| `SPIN_LIFETIME_LIMIT` | `1` | Max spins per user (lifetime — one-time only) |
| `MIN_TOPUP` | `100` | Minimum top-up (PKR) |
| `MIN_WITHDRAW` | `100` | Minimum withdrawal (PKR) |
| `REFERRAL_COUNT_FOR_BONUS` | `50` | Referrals needed for bonus |
| `REFERRAL_BONUS_AMOUNT` | `1000` | Bonus amount (PKR) |

### Rate limits — `middleware/rateLimiter.js`

| Limiter | Window | Max | Used on |
|---------|--------|-----|---------|
| `authLimiter` | 15 min | 20 | signup, verify-signup-otp, login |
| `otpLimiter` | 1 min | 5 | `POST /auth/resend-signup-otp`, `POST /auth/forgot-password`, `POST /wallet/send-otp` |
| `spinLimiter` | 1 min | 10 | POST /spin/spin |

OTP verify (wrong-code attempts) is capped inside `otpService` (5 tries per OTP record).

**OTP limit response (429)**:
```json
{
  "message": "Too many OTP requests. Please try again in 10 minutes."
}
```

### Safepay env vars

| Variable | Purpose |
|----------|---------|
| `SAFEPAY_MERCHANT_API_KEY` | Checkout session setup |
| `SAFEPAY_SECRET_KEY` | API auth + signature fallback |
| `SAFEPAY_HOST` | `https://sandbox.api.getsafepay.com` |
| `SAFEPAY_ENV` | `sandbox` or `production` |
| `SAFEPAY_CURRENCY` | `PKR` |
| `SAFEPAY_REDIRECT_URL` | Top-up success callback (public URL; use ngrok in local dev) |
| `SAFEPAY_CANCEL_URL` | Top-up cancel redirect |
| `SAFEPAY_WITHDRAW_MODE` | `sandbox_auto` (default in sandbox) · `manual` · `raast` |
| `SAFEPAY_AGGREGATOR_ID` | Raast bank payouts (optional) |
| `SAFEPAY_AGGREGATOR_SECRET_KEY` | Raast aggregator secret |
| `SAFEPAY_FRONTEND_SUCCESS_PATH` | Frontend path after top-up success |
| `SAFEPAY_FRONTEND_CANCEL_PATH` | Frontend path after top-up cancel |

### Email (Nodemailer) env vars

| Variable | Purpose |
|----------|---------|
| `SMTP_USE_ETHEREAL` | `true` = dev test inbox with preview URL; `false` = real SMTP |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `465` |
| `SMTP_SECURE` | `true` for port 465 |
| `SMTP_USER` | Gmail address or SMTP username |
| `SMTP_PASS` | Gmail App Password (16 chars, no spaces) |
| `SMTP_FROM` | Sender display, e.g. `x666 <you@gmail.com>` |

### Twilio (SMS OTP) env vars

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Sender number in E.164, e.g. `+14155551234` |

If Twilio is not configured in **development**, phone OTP codes are logged to the console. In **production**, Twilio must be configured or phone OTP will fail.

Copy `.env.example` to `.env` and fill in values for local setup.

---

## File guide

Every active file in the trimmed project and what it does.

### Root

| File | Purpose |
|------|---------|
| `app.js` | Express entry: CORS, JSON parser, session, mounts `/api` routes, global error handler |
| `.env.example` | Template env vars (copy to `.env` for local setup) |
| `dev-memory.js` | Local dev helper — spins up in-memory MongoDB and sets `MONGODB_URI` |
| `package.json` | Dependencies: express, mongoose, jwt, bcrypt, nodemailer, twilio, `@sfpy/node-core`, rate-limit |
| `docker-compose.yml` | Optional MongoDB container for local dev |
| `nodemon.json` | Watches `.env` and source folders for auto-restart |

### Config — `config/`

| File | Purpose |
|------|---------|
| `constants.js` | Spin slots/weights, lifetime spin limit, min top-up/withdraw, referral bonus rules |
| `paymentGateway.js` | Safepay + JazzCash/EasyPaisa credential placeholders |
| `withdrawMethods.js` | Safepay withdraw method definitions (bank, jazzcash, easypaisa) |
| `mongoose.js` | Connects to MongoDB via `MONGODB_URI` |
| `email.js` | Nodemailer — Gmail SMTP or Ethereal dev test inbox |
| `twilio.js` | Twilio SMS client for phone OTP |
| `session.js` | Express session config using `SESSION_SECRET` |

### Routes — `routes/`

| File | Purpose |
|------|---------|
| `index.js` | Main router — mounts auth, users, wallet, spin, referrals + health + referral-link |
| `authRoutes.js` | Signup (sends OTP), resend signup OTP, verify signup OTP, login, logout, forgot/reset/change password |
| `userRoutes.js` | GET/PUT profile |
| `walletRoutes.js` | Balance, transactions, send-otp, topup/withdraw (OTP), Safepay callbacks, payment-config |
| `spinRoutes.js` | Spin, history, result by id |
| `referralRoutes.js` | List referrals, stats, claim bonus |

### Controllers — `controllers/`

| File | Purpose |
|------|---------|
| `authController.js` | Signup + OTP send, verify signup OTP (no JWT), login JWT, logout, forgot/reset/change password |
| `userController.js` | Profile CRUD, referral link generation |
| `walletController.js` | Wallet send-otp; top-up → Safepay checkout → auto-reconcile; Safepay withdraw (bank/wallets) |
| `spinController.js` | Execute spin, record history, referral qualifying spin, expose `canWithdraw` |
| `referralController.js` | List referrals, stats, claim 50-referral bonus |

### Middleware — `middleware/`

| File | Purpose |
|------|---------|
| `VerifyToken.js` | Validates `Authorization: Bearer <token>`, sets `req.user` |
| `auth.js` | Re-exports `VerifyToken.js` |
| `rateLimiter.js` | `authLimiter`, `otpLimiter`, `spinLimiter` |
| `session.js` | Re-exports session middleware from config |

### Models — `models/`

| File | Purpose |
|------|---------|
| `Users.js` | User account (email **or** phone), password hashing, referral code auto-gen |
| `Wallet.js` | Balance + locked balance per user |
| `Transaction.js` | Ledger: topup, withdraw, spin, referral bonus |
| `PendingSignup.js` | Temporary signup data (name, password) until OTP verified — 15 min TTL |
| `OTP.js` | Hashed OTP records — purposes: signup, reset_password, topup, withdraw |
| `SpinHistory.js` | Per-spin results; used to enforce one-time lifetime spin limit |
| `Referral.js` | Referrer ↔ referred user link and bonus eligibility |

### Services — `services/`

| File | Purpose |
|------|---------|
| `otpService.js` | Generate, hash, send (email + Twilio SMS), verify OTP for all purposes |
| `walletService.js` | Atomic credit/debit, complete topup, auto-reconcile pending topups, withdraw queues |
| `spinService.js` | Weighted slot picker, lifetime spin limit, first-spin withdraw gate |
| `referralService.js` | Track referrals, mark qualifying spin, pay 50-referral bonus |
| `paymentService.js` | Safepay collection, status/reconcile, Raast payout, withdraw method config |
| `validationSchema.js` | Request body validation for auth and wallet endpoints |
| `helper.js` | `asyncHandler`, `sendSuccess`, `sendError`, referral code generator |
| `encryptionService.js` | AES encrypt/decrypt — **not used anywhere** |

---

## What's done vs what's missing

### Fully working

- Three-step signup: submit details → OTP sent → verify OTP + create account (**no auto-login**) → login for JWT
- JWT login, **logout**, forgot/reset password (**email or phone OTP**)
- **Change password** (logged in, current password required)
- OTP rate limit on send endpoints (5 / min)
- Profile + referral share link
- Weighted spin with **one-time lifetime limit**; unlocks withdraw (`canWithdraw`)
- Referral chain + 50-referral bonus payout
- Wallet **send-otp** + OTP-gated top-up and withdraw
- Safepay top-up with signed callback + **auto-reconcile** on poll/balance/transactions
- Top-up API returns `"status": "paid"` when complete (no manual confirm)
- Safepay withdraw via **bank (IBAN)**, **JazzCash**, **EasyPaisa**
- Sandbox instant withdraw (`SAFEPAY_WITHDRAW_MODE=sandbox_auto`)
- Manual-review queue + locked balance in production manual mode
- Raast bank payout when aggregator creds configured
- Transaction ledger
- Nodemailer email delivery (Gmail or Ethereal dev mode)
- Twilio SMS OTP (console fallback in dev when Twilio unset)

### Stubbed / incomplete

| Item | Detail |
|------|--------|
| Twilio in production | Must set `TWILIO_*` env vars; dev falls back to console |
| JazzCash / EasyPaisa live API | Config exists; payouts use Safepay sandbox or manual queue |
| Admin withdraw | No route to approve/reject `pending_manual_review` |
| KYC | Field on User model only — no workflow |
| Local Safepay callback | Use ngrok for `SAFEPAY_REDIRECT_URL` or poll top-up status |
| Tests | No test files or test script |
| `encryptionService.js` | Orphaned — never imported |

---

## OTP flows (2026-07-11)

| Action | Endpoints | Notes |
|--------|-----------|-------|
| Signup | `POST /auth/signup` → `POST /auth/verify-signup-otp` → `POST /auth/login` | Signup sends OTP; verify creates account; login returns JWT |
| Top-up | `POST /wallet/send-otp` (`purpose: topup`) → `POST /wallet/topup` | OTP sent to signup channel |
| Withdraw | `POST /wallet/send-otp` (`purpose: withdraw`) → `POST /wallet/withdraw` | OTP + first spin required |
| Forgot password | `POST /auth/forgot-password` → `POST /auth/reset-password` | Email or phone OTP |
| Change password | `POST /auth/change-password` | JWT + current password (no OTP) |

**Removed (2026-07-10, superseded):** `POST /auth/verify-otp`, `POST /wallet/topup/verify`, `POST /wallet/withdraw/verify`, `POST /wallet/topup/confirm`

---

*End of audit.*
