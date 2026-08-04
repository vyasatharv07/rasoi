# Rasoi Updates

This file records each requested product iteration and the corresponding implementation. Add future requests here so the repository keeps a readable product-change history.

## 2026-08-03 — Initial full-stack build

- Created the React/Vite client and Express/SQLite API.
- Added CLIENT and ADMIN authentication, role middleware, rotating JWT cookies, bcrypt password hashing, login rate limiting, validation, and seed accounts.
- Added menu CRUD, ordering, invoices, status management, receipts, SMTP delivery, and the daily digest scheduler.
- Built responsive client/admin interfaces and Playwright desktop/mobile coverage.
- Added `.env.example`, architecture/setup documentation, Playwright MCP configuration, and production build scripts.

## 2026-08-03 — Ordering and account workflow revision

1. **Cart animation** — Added card glow, dish hop, add-button pulse, and cart badge bump animations whenever a menu selection is added.
2. **Next-day orders** — Removed client-selected pickup times. Every new order is dated for the next calendar day, with the exact time assigned by an admin.
3. **Portions and quantities** — Added real menu option records and price snapshots for `8 oz`, `16 oz`, and `32 oz`. Curries demonstrate portion pricing; bowls, sides, drinks, and small plates demonstrate count-based quantities until the final menu arrives.
4. **Clickable logo** — The top-left Rasoi brand returns clients to Menu/Home and admins to Overview/Home. The current mark is a placeholder ready for the future custom-logo upload.
5. **Create account** — Added a Firebase email/password sign-up and sign-in flow. Firebase ID tokens are verified by the Express server before creating a CLIENT record and secure application session. Environment setup is documented in `README.md` and `.env.example`.
6. **Profile and settings** — Clicking the client name opens an editable profile with name, phone, Jain/vegetarian/vegan preferences, allergy and preparation notes, and four spice levels.
7. **Client pickup confirmation** — Ready orders show an “I’ve picked this up” action. Client confirmation marks the order Picked up and triggers receipt generation/email.
8. **Minimal sign-in** — Replaced the split-screen sign-in with a centered translucent card on a soft, faded beige background.
9. **Living documentation** — Added this update log and refreshed the main README with the revised architecture, workflow, and Firebase setup.
10. **GitHub publishing** — Prepared the application for the `vyasatharv07/rasoi` repository while preserving its initial planning commit.

## Deferred asset

- Replace the temporary Rasoi sparkle mark with the custom logo after the final asset is supplied.
- Replace temporary sample menu names, prices, and portion assignments after the final menu is supplied.
