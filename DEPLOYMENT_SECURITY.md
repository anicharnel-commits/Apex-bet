# Universal Store — deployment & security baseline

## Two spaces only
- Client
- Administrator

There is no Super-admin space in this version.

## Secrets
Never put provider/payment secrets in `index.html`, `app.js`, `store-config.js`, or any asset.
Set them only as Vercel environment variables. `SUPABASE_SERVICE_ROLE_KEY` is server-only.

The browser uses only the Supabase **publishable** key. It is not a provider secret; database access is protected by RLS.

## Required Vercel variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RECHARGE_PROVIDER`
- `RECHARGE_API_URL`
- `RECHARGE_API_KEY`
- `RECHARGE_API_SECRET`
- payment secrets when the official payment API is selected

## Recharge rule
`/api/recharge` is fail-closed until the provider's official API contract is supplied. Do not bypass CAPTCHA, anti-bot, authentication, or provider access controls.

## Order security
`/api/orders` authenticates the Supabase user, re-reads the product from the database, checks the shop/product relationship, derives the price server-side, validates the Player ID, and prevents duplicate orders for the same user/product/payment reference.

## Database
Apply `supabase_schema.sql` before production. Confirm RLS policies with the Supabase Security Advisor after the migration.
