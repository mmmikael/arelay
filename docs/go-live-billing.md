# Go-live runbook: hosted billing

Every command here runs on your machine with your own live key. Nothing in this
file needs a key to be pasted into a chat, a file, or a commit.

Do these in order. Steps 1–3 take about ten minutes; step 5 is the only one that
touches real money.

---

## 1. Create a restricted live key

Stripe Dashboard → Developers → API keys → **Create restricted key**. Name it
`arelay-billing-setup`. Grant **write** on:

- Products
- Prices
- Customers
- Checkout Sessions
- Customer portal
- Webhook endpoints

Everything else: **None**. A restricted key limits the blast radius if it leaks;
a full `sk_live_` key can do anything on the account.

Toggle the Dashboard out of test mode before creating it, so you get `rk_live_…`.

## 2. Create the live catalog

From the repo root. Reading the key into a variable rather than typing it as an
argument keeps it out of your shell history. This form works in both zsh and bash
(zsh's `read -p` means "read from a coprocess", so `-p` for a prompt is bash-only):

```bash
printf 'rk_live key: '; read -rs STRIPE_SECRET_KEY; echo; export STRIPE_SECRET_KEY
```

**Run that line by itself and wait for the prompt before pasting anything else.**
`read` takes the next line it receives as its input, so pasting this command
together with the one below makes the *command* become the key.

Check it took the key and not something else. This prints only the first 8
characters, which is just the key type:

```bash
echo "$STRIPE_SECRET_KEY" | cut -c1-8
```

Expect `rk_live_`. Anything else means the variable holds the wrong thing — re-run
the read command on its own. (The setup script also refuses to start on a value
that isn't shaped like a Stripe key.)

```bash
BILLING_WEBHOOK_URL=https://arelay.app/webhooks/stripe SITE_URL=https://arelay.app node scripts/setup-stripe-billing.mjs
```

It prints every environment variable to set. **Copy the output now** — the webhook
signing secret is shown only at creation time. The script is idempotent, so a
re-run is safe, but a re-run will not re-reveal that secret (read it from
Dashboard → Developers → Webhooks if you lose it).

Treat that `whsec_…` as a credential. It is not a payment key — it cannot move money
or read Stripe data — but anyone holding it can forge webhook events that this app
accepts as genuine, which means granting themselves a paid plan. If it is ever
pasted somewhere it should not be, roll it: Dashboard → Developers → Webhooks →
the endpoint → **Roll secret**, then update the variable.

Also check the amounts in Dashboard → Product catalogue before announcing anything:
$9.00/month, $79.00/year, $149.00 one-time. Stripe prices are immutable, so a wrong
amount is fixed by creating a new price and repointing the variable, not by editing —
re-running the script with a changed `*_CENTS` does exactly that.

Then drop the key from your shell:

```bash
unset STRIPE_SECRET_KEY
```

## 3. Set the variables on Railway

Railway → your service → **Variables**. Add:

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | your `rk_live_…` key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 2 |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_…` from step 2 |
| `STRIPE_PRICE_PRO_YEARLY` | `price_…` from step 2 |
| `STRIPE_PRICE_FOUNDING` | `price_…` from step 2 |
| `STRIPE_PORTAL_CONFIGURATION` | `bpc_…` from step 2 |
| `BILLING_FOUNDING_CAP` | `100` (optional; this is the default) |

Leave `STRIPE_AUTOMATIC_TAX` unset — see step 6.

**Check `BODY_SIZE_LIMIT` while you are in there.** `scripts/start.mjs` only defaults
it to `140M` when it is unset, so an existing service variable wins. A deployment
still pinned to the old `40M` rejects the 100 MB artifacts the Pro plan advertises,
with a 413 that looks like a bug in the upload path. Either raise it to `140M` or
delete the variable and let the default apply.

Billing stays off until all of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
the three price ids are present, so a partial paste cannot half-enable it.

Migrations need no action: `railway.toml` runs `npm run db:migrate` as its
`preDeployCommand`, so `billing_accounts` is created on deploy.

## 4. Deploy and smoke-test for free

After the deploy finishes:

1. Open `https://arelay.app/pricing`. The founding counter should read
   `100/100 left` — that alone proves billing is enabled and the
   `billing_accounts` migration ran, since the count comes from that table.
2. Sign in and open Account. The **Plan** section should show `Free` with a
   "See plans & upgrade" button.
3. Click upgrade, let Stripe Checkout load, then **abandon it**. A created-but-
   unpaid session grants nothing, so this costs nothing.

**Step 3 is the only real check of the key and price ids.** The rendered prices
cannot tell you: when a price lookup fails the page falls back to hard-coded
amounts that are identical to the live ones, so a wrong price id looks perfectly
normal. A bad id surfaces as a 502 from `/api/billing/checkout` and a
`stripe price lookup failed` warning in the deployment logs.

Confirm the webhook route is live and reachable too — this should return `400`
(invalid signature), not `404` (billing disabled):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' https://arelay.app/webhooks/stripe
```

## 5. One real end-to-end purchase

Buy your own founding license with a real card. This is the only way to prove the
live webhook path, and it is worth the fee.

1. Complete checkout at `https://arelay.app/pricing`.
2. Confirm Account shows `Founding · lifetime` and storage reads `10.0 GB`.
3. Dashboard → Developers → Webhooks → your endpoint: confirm
   `checkout.session.completed` delivered **200**.
4. Click **Manage billing** and confirm the portal opens (this is what
   `STRIPE_PORTAL_CONFIGURATION` fixes).
5. Refund yourself in the Dashboard if you want the money back. A refund does not
   revoke the plan — the code does not handle `charge.refunded` — so also clear the
   row by hand if you want to reset:
   `DELETE FROM billing_accounts WHERE user_id = '<your-user-id>';`

If the webhook shows a non-200, check that `STRIPE_WEBHOOK_SECRET` matches the
endpoint's signing secret exactly. A mismatch returns 400 and the plan never
upgrades even though the payment succeeded.

## 6. Tax — decide before volume, not after

Leave `STRIPE_AUTOMATIC_TAX` unset until registrations exist. Turning it on
without an active registration makes Stripe collect **nothing** while reporting
success, which is worse than leaving it off, because it looks handled.

What is worth knowing, mechanically:

- Hong Kong has no VAT/GST, so there is nothing to charge domestically.
- Selling digital services to consumers abroad can create obligations in the
  buyer's country. The EU in particular has no small-seller threshold for
  non-EU sellers of digital services to consumers — liability can begin at the
  first sale, registered through the non-Union OSS scheme.
- US state sales tax on SaaS varies by state and generally follows economic
  nexus thresholds, so early volume is usually below them.
- Stripe Tax computes and collects only where you have added a registration
  (Dashboard → Tax → Registrations), and its Monitoring view flags thresholds
  you are approaching.

I am not your accountant and this is not tax advice — confirm your actual
obligations with someone who does HK company cross-border digital sales before
volume grows. The practical sequence most solo founders use: launch without tax
collection, watch Stripe Tax Monitoring, register where you cross a threshold,
then flip `STRIPE_AUTOMATIC_TAX=true`. Prices are created with
`tax_behavior=exclusive`, so enabling tax later adds tax on top rather than
silently cutting your revenue.

## Rollback

To disable billing without a code change, remove `STRIPE_SECRET_KEY` from Railway
and redeploy. Every account reverts to free-plan limits, `/pricing` shows the
"not enabled on this deployment" notice, and `/api/billing/*` returns 404. Stored
plans in `billing_accounts` are untouched, so re-adding the key restores them.
