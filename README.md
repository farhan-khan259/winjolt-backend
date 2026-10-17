# WinJolt backend

For Render deployment, see [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md).

Production-oriented Express/MongoDB API for the WinJolt customer and staff applications. It implements customer/staff authentication, server-side DOB gating, campaign release gates, finite ticket pools, manual and CSPRNG Lucky Dip reservations, provider-authoritative order issuance, paid/free route parity, immutable instant outcomes, draw locking/execution, claims, wallet journals, support/complaints, CMS versions, reporting and a tamper-evident audit chain.

## Important release status

The supplied V3.3/V3.4 specifications explicitly leave legal structure, the exact free-entry policy, payment-provider approval, independent randomness review, stronger age assurance and wallet redemption unresolved. Defaults therefore keep entry intake, payments, free entry and wallet redemption disabled. This is an intentional production safety gate, not a mock implementation.

Do not make a campaign live until the responsible operator has recorded all required approvals and evidence. The code is not a legal opinion or independent randomness audit.

## Requirements

- Node.js 20+
- MongoDB 7+ configured as a replica set (transactions are mandatory for reservations, ticket issuance, instant allocation and free-entry approval)
- An approved Stripe account if `PAYMENT_PROVIDER=stripe`

## Setup

1. Copy `.env.example` to `.env` and replace every secret/default.
2. Start MongoDB as a replica set. For local development, initiate a single-node set named `rs0`.
3. Run `npm install`.
4. Set `ADMIN_PASSWORD`, then run `npm run seed`.
5. Run `npm run dev` and, in another process, `npm run worker`.
6. In `winjolt-frontend`, copy `.env.example` to `.env`, run `npm install`, then `npm start`.

The seed command is deliberately safe: it creates one staff account and four **DRAFT** campaign records. It never publishes them.

## Stripe

Set `PAYMENT_PROVIDER=stripe`, configure the Stripe secret and webhook secret, and register:

`POST https://your-api.example/api/v1/provider/webhooks/stripe`

Subscribe at minimum to `checkout.session.completed`, `checkout.session.expired`, and `payment_intent.payment_failed`. Browser redirects never issue tickets. Only a verified webhook can move an order through provider confirmation and atomic ticket issuance. Raw card data is collected by Stripe Checkout and never reaches this application.

## Security model

- Short-lived JWTs; staff sessions have a shorter expiry than customer sessions.
- API-enforced permissions and separation of duties.
- Passwords hashed with bcrypt cost 12.
- Helmet, restricted CORS, input/body limits and endpoint rate limits.
- Integer pence for all money values.
- Idempotency keys on reservations, orders, free applications and provider events.
- Append-only audit and wallet records.
- Campaign material rules lock after approval.
- Draw lock and draw execution require different staff actors.

JWT bearer storage in the current React client uses session storage to preserve the existing SPA architecture. For a hardened same-origin deployment, use an API gateway/BFF to exchange this for Secure, HttpOnly, SameSite cookies plus CSRF protection.

## Commands

- `npm test` — age-boundary, secure-sampling and eligibility/feature-gate unit tests.
- `npm run check` — server syntax check.
- `npm run seed` — safe initial staff/draft campaign data.
- `npm run worker` — idempotent SMTP outbox delivery with retry/backoff.
- `npm start` — production process (use a supervisor and TLS reverse proxy).

## Documentation

- [OpenAPI contract](docs/openapi.yaml)
- [Architecture, ERD and operations](docs/ARCHITECTURE.md)

## External verification still required

Full settlement/webhook, email delivery, concurrency/load, backup/restore and independent randomness tests require configured external services and a MongoDB replica set. Before launch, execute every acceptance case in the V3.3/V3.4 documents and retain signed evidence. The included tests are not a substitute for that test pack.
# winjolt-backend
