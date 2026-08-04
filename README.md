# Rasoi Order Management

A complete next-day ordering workflow for a pickup kitchen, with distinctly designed client and admin portals. Rasoi uses React, TypeScript, Vite, Express, SQLite, Firebase Authentication, and Playwright.

## Quick start

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs on port `4000` and Vite proxies `/api` requests to it.

Demo credentials:

| Role | Email | Password |
| --- | --- | --- |
| Client | `client@rasoi.test` | `Client123!` |
| Admin | `admin@rasoi.test` | `Admin123!` |

The login page includes shortcuts that fill either demo account.

## Architecture

```text
React client (Vite, :5173) ── Firebase email/password signup
        │ /api + httpOnly cookies
        ▼
Express API (:4000)
   ├── Auth / role middleware
   ├── Orders + frozen item pricing
   ├── HTML receipt generation → email
   ├── Daily digest scheduler → email
   └── SQLite (data/rasoi.db)
```

The database initializes and runs additive migrations automatically on server startup. `npm run seed` safely upserts demo users and adds the starter menu when the menu is empty. Prices are stored as integer cents to avoid floating-point errors; each order stores an immutable name, portion, and price snapshot.

### Ordering workflow

- Clients place orders for the following calendar day; they do not select a pickup time.
- The admin assigns the exact pickup time from the order queue. Clients then see the confirmed time in order history.
- Portion-based sample dishes support independent `8 oz`, `16 oz`, and `32 oz` prices. Count-based foods use normal item quantities. These sample values can be replaced when the final menu is ready.
- The admin progresses an order through Pending, In progress, and Ready. Once Ready, the client selects **I’ve picked this up**, which marks it Picked up and creates the receipt.
- Client profiles store name, phone, dietary preference (including Jain), allergies/preparation notes, and spice level.

### Authentication flow

1. Demo/local login credentials are validated and compared to a bcrypt hash generated with 12 rounds. New client accounts use Firebase email/password authentication.
2. The server creates a 30-minute JWT access token and a seven-day refresh token. Both are sent only as `httpOnly`, `SameSite=Lax` cookies; production cookies are also `Secure`.
3. A SHA-256 hash of the refresh token is persisted. The frontend silently calls `/api/auth/refresh` once after an expired access token; refreshing rotates the stored token.
4. Server middleware validates every protected request and returns `401` for missing/expired authentication or `403` for the wrong role.
5. Firebase ID tokens are verified by the Admin SDK before the local CLIENT record/session is created. Firebase never grants ADMIN access automatically.
6. Logout revokes the refresh session and clears both cookies. Login is limited to 10 attempts per 15-minute window per IP.

For production, set strong independent JWT secrets, serve only over HTTPS, and use a production database if deploying multiple server instances.

## Receipts and email

Client confirmation of **Picked up** creates a styled, print-ready HTML receipt, stores its snapshot in SQLite, and emails it to the client. Admins retain a manual status override. The client can open/download the receipt from order history. HTML was chosen intentionally so receipt creation works without a headless-browser runtime; it can be printed to PDF from any browser.

Set the SMTP variables in `.env` to deliver mail. Without them, the server logs a safe mail preview line so all flows remain testable locally. The admin digest runs at `DIGEST_CRON` (6 PM by default) and can also be triggered from the dashboard.

## Firebase account setup

The code is complete, but account creation stays disabled until a Firebase project is connected:

1. Open the [Firebase Console](https://console.firebase.google.com), create a project, and add a Web app.
2. Under **Authentication → Sign-in method**, enable **Email/Password**.
3. Copy the Web app configuration into the four `VITE_FIREBASE_*` values in `.env`.
4. In **Project settings → Service accounts**, generate a private key. Copy its project ID, client email, and private key into the three server-side `FIREBASE_*` values. Keep `FIREBASE_PRIVATE_KEY` quoted and preserve newlines as `\\n`.
5. Restart `npm run dev`. The sign-up screen will display “Firebase enabled.”

The browser creates/signs in the Firebase user and sends the resulting ID token to `/api/auth/firebase`. The Express API verifies that token with Firebase Admin, creates a CLIENT row in the existing users table, then issues the same secure application cookies used by demo accounts. See [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth) and [server ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Tests and Playwright MCP

The project includes Playwright end-to-end tests for desktop and mobile Chromium:

```bash
npx playwright install chromium
npm test
```

`@playwright/mcp` is installed as a development dependency and [`.mcp.json`](./.mcp.json) registers it for MCP-compatible coding clients. Restart the coding client after installation if it does not detect the new server immediately.

Other useful commands:

```bash
npm run typecheck
npm run build
npm start        # serves dist/ when NODE_ENV=production
```

## API outline

- `POST /api/auth/login|refresh|logout`, `GET /api/auth/me`
- `GET /api/menu`, `POST /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/confirm-pickup`
- `GET/PUT /api/profile`
- `GET /api/receipts/:orderId`
- Admin: menu/portion CRUD, pickup-time assignment, order status updates, manual digest trigger

All writes use parameterized statements and Zod validation. Menu items referenced by historical orders cannot be deleted; admins can make them unavailable instead.
