# Hosted billing (Stripe)

Agent Relay is MIT-licensed and fully self-hostable — **billing is optional and off by
default**. Without billing configuration, every account runs on the free plan and the
app makes no Stripe calls. Paid plans exist to fund development and run the hosted
service at [arelay.app](https://arelay.app).

## Plans

| Plan | Price | Storage | Per artifact |
| --- | --- | --- | --- |
| Free | $0 | 500 MB | 25 MB |
| Pro | $9/mo or $79/yr | 10 GB | 100 MB |
| Founding | $79 once (first 100) | 10 GB | 100 MB |

Founding is a lifetime license: Pro entitlements with `plan_source = 'lifetime'`,
never downgraded by subscription lifecycle events.

Entitlements are enforced server-side in `src/lib/billing/plans.ts` (limits) and
`src/lib/server/storage-quota.ts` (checks). The plan lives in the `billing_accounts`
table, written only by the Stripe webhook handler.

## Enabling billing on a deployment

1. **Create the catalog** (idempotent — safe to re-run; run against a test/sandbox
   key first):

   ```bash
   STRIPE_SECRET_KEY=rk_test_... \
   BILLING_WEBHOOK_URL=https://your-domain/webhooks/stripe \
   node scripts/setup-stripe-billing.mjs
   ```

   Use a [restricted API key](https://docs.stripe.com/keys/restricted-api-keys) with
   write access to Customers, Checkout Sessions, Billing Portal, Products, Prices,
   and Webhook Endpoints. The script prints every env var to set.

2. **Set the env vars** on the deployment: `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`,
   `STRIPE_PRICE_FOUNDING`. Billing turns on only when all five are present.
   Also set `STRIPE_PORTAL_CONFIGURATION` (see below).

3. **Run migrations** — adds the `billing_accounts` table. On Railway this happens
   automatically via `preDeployCommand` in `railway.toml`; elsewhere run
   `npm run db:migrate`.

4. **Taxes**: `STRIPE_AUTOMATIC_TAX=true` enables Stripe Tax on checkout, but only
   enable it **after** adding a tax registration in Stripe — with no active
   registration Stripe calculates and collects nothing, silently.

## Customer Portal configuration

"Manage billing" opens a Stripe Customer Portal session. When no configuration is
passed, Stripe falls back to the account's *default* configuration — which does not
exist until it has been saved in the Dashboard. Test mode papers over this, so the
failure shows up only against a live key.

The setup script therefore creates a configuration over the API and prints
`STRIPE_PORTAL_CONFIGURATION=bpc_...`, which the portal route passes explicitly. It
enables invoice history, payment-method updates, email/address/tax-id updates, and
cancellation at period end (so a cancelling customer keeps Pro until the period they
paid for ends; the downgrade lands when Stripe sends `subscription.deleted`).

Re-running the script reuses the existing configuration, matched on
`metadata[arelay_managed]=true`. To change the portal's features, edit
`ensurePortalConfiguration` in the script, deactivate the old configuration
(`active=false`), and re-run.

Known limitation: self-service monthly ↔ yearly switching is not enabled. The API
accepts `features[subscription_update][products]` but neither stores nor returns it,
which would leave price switching enabled with no prices to switch to. Customers
change interval by cancelling and re-subscribing.

## How it flows

- `POST /api/billing/checkout` (session-authenticated) creates or reuses the Stripe
  customer, then redirects to Stripe Checkout (subscription mode for Pro, payment
  mode for Founding).
- `POST /webhooks/stripe` (signature-verified, outside `/api` so it skips session
  auth) maps events to plan changes: `checkout.session.completed`,
  `customer.subscription.created/updated/deleted`. `past_due` keeps Pro during
  dunning; `canceled`/`unpaid` downgrade to free. Lifetime plans never downgrade.
- `POST /api/billing/portal` opens the Stripe Customer Portal for upgrades,
  cancellation, invoices, and payment-method changes.

## Local testing

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET
```

Use test card `4242 4242 4242 4242`. The founding cap can be lowered for testing
with `BILLING_FOUNDING_CAP=2`.
