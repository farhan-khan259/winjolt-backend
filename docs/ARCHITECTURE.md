# Architecture and operational notes

## Runtime

```text
React customer/admin SPA
          |
          v
Express REST API ----> Stripe hosted checkout + signed webhooks
          |
          +---------> MongoDB replica set
                         |-- authoritative aggregates
                         |-- append-only audit/wallet ledgers
                         `-- durable outbox
```

The code is a modular monolith: routes/controllers own HTTP concerns; services own eligibility, reservations, payment issuance, immutable allocation, audit and draw logic; Mongoose models own persistent validation and indexes. This can be separated into services later without changing aggregate ownership.

## Entity relationships

```text
User 1--* Reservation *--1 Competition 1--* TicketSlot
                |                         |
                1                         1
                |                         |
              Order 1--* Ticket *---------+
                           | \
                           |  `--1 InstantResult --0..1 Claim
                           `-----1 Draw candidate

FreeEntry --1 Reservation --1 Ticket
User 1--* WalletEntry
User 1--* SupportCase
Competition 1--1 Draw
AuditEvent (hash-linked, references every aggregate type)
Outbox (idempotent event/handler delivery records)
```

Key unique indexes prevent duplicate emails, competition numbers, issued slots, per-ticket instant results, provider events, endpoint idempotency keys, content versions and outbox deliveries.

## Transaction boundaries

- Reservation claims every manual and sampled slot or rolls back all of them.
- Provider settlement issues all exact held tickets, commits any enabled instant outcome/inventory, updates the order and creates an outbox message in one transaction.
- Free-entry approval claims a slot, issues the ticket and commits the same instant entitlement in one transaction.
- MongoDB must be a replica set; standalone deployments are not supported for state-changing production traffic.

## Allocation and draw controls

Lucky Dip uses `crypto.randomInt` without replacement across the whole available pool. Manual numbers are never substituted. Instant results use an immutable manifest hash and monotonically consumed allocation positions; production activation remains gated on independent review of the final sealed-manifest generator and distribution evidence. The wheel is presentation only.

The main draw freezes sorted eligible ticket IDs, hashes the set and uses a CSPRNG index. Locking and execution require different actors. Independent result verification and publication remain separate operational approvals.

## Operations

- Process the outbox with an idempotent email/SMS worker.
- Run reservation expiry and payment reconciliation workers continuously.
- Alert on missing instant results, inventory conflicts, reconciliation-required orders, unresolved timely free applications and audit-chain failure.
- Back up encrypted MongoDB data and test restores against the audit chain.
- Put TLS, request logging with PII redaction, secret management and WAF/bot controls at the deployment edge.
- Use object storage with private signed access for prize/claim evidence; schema fields retain only references/hashes.
