
# Sagarmatha Store – Full E‑commerce (Express + SQLite)

A production‑ready, single‑repo Node.js app with:

- Admin panel: categories, products, orders
- Cart & checkout with delivery fees:
  - NPR 100 Inside Kathmandu Valley
  - NPR 180 Outside Kathmandu Valley
- Payment methods:
  - Cash on Delivery (always available)
  - Card via Stripe Checkout (optional; provide keys)
- Order notification email to **sagarmathaonstore@gmail.com** (configure SMTP in `.env`)
- SQLite database (file-based, zero setup)

## Quick Start

```bash
# 1) Create .env from example and edit values
cp .env.example .env

# 2) Install deps
npm install

# 3) Run dev server
npm run dev
# or production
npm start
```

Open: http://localhost:3000

### Default Admin
- Email: `admin@example.com`
- Password: `admin123`
> To change password, update `ADMIN_PASSWORD_HASH` in `.env` (generate with https://bcrypt-generator.com or run a small script).

## Deploy
- Any Node host (PM2, Render, Railway, VPS). Requires Node 18+.
- Set env vars, ensure `BASE_URL` is your live domain (e.g. `https://yourdomain.com`).

## Stripe (Optional)
- Add `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in `.env`
- On checkout, select "Card" to be redirected to Stripe Checkout.
- Success/Cancel URLs are handled by the app.

## SMTP / Emails
- Use your SMTP provider credentials in `.env`.
- Each successful order sends a detailed email to `ORDER_EMAIL_TO` (default: sagarmathaonstore@gmail.com).

## File Uploads
- Product images are accepted as URL or uploaded file (stored under `/public/uploads`).

## Notes
- Database auto-migrates on first run.
- If you migrate from another platform, you can import products via Admin -> Products -> Add Product.
