# New project: public online ordering site (Square)

Build this as a **separate project** from the staff app. This one is public and lives on your domain; the staff app (KDS, table ordering, admin) stays internal. Both read and write the same Square location, so menu, prices and orders stay in sync automatically.

## Why separate

- The public site has no kitchen, admin or order-history code at all, so there is nothing to leak.
- The staff app can stay unpublished/private without affecting customers.
- Different release cadence: you can redeploy the shop without touching the kitchen screen mid-service.

## Customer flow

1. **Menu** — categories and items from the live Square catalog, with item images, descriptions, sold-out state, and modifiers/variations.
2. **Cart** — quantities, per-item options and notes, running subtotal (indicative only).
3. **Checkout** — name, phone, email; pickup or delivery; address for delivery; requested time; order note.
4. **Server-side quote** — the real totals (item prices, taxes, service charge, delivery fee, discounts) come back from Square, never from the browser.
5. **Payment** — Square card fields hosted by Square's Web Payments SDK on your own checkout page; also Apple Pay / Google Pay / Cash App Pay.
6. **Confirmation** — order number, ETA, Square receipt emailed to the customer.
7. **Kitchen** — the order lands in Square Dashboard/POS as an online order and appears on your existing kitchen display.

## Square APIs used

| Purpose | API / endpoint |
|---|---|
| Menu, categories, modifiers, images | Catalog — `SearchCatalogObjects`, `BatchRetrieveCatalogObjects` |
| Sold-out / stock | Inventory — `BatchRetrieveInventoryCounts` |
| Store hours, currency, timezone | Locations — `RetrieveLocation` |
| Price/tax/fee calculation before paying | Orders — `CalculateOrder` |
| Create the order | Orders — `CreateOrder` (with `PICKUP` or `DELIVERY` fulfillment) |
| Card form, digital wallets | Web Payments SDK (browser) |
| Charge the card | Payments — `CreatePayment` (with `order_id`, `idempotency_key`) |
| Repeat customers, saved profile | Customers — `SearchCustomers`, `CreateCustomer` (optional) |
| Discount / promo codes | Orders discounts, or Loyalty API (optional) |
| Gift cards | Gift Cards + Gift Card Activities (optional) |
| Refunds from admin | Refunds — `RefundPayment` (optional) |
| Live status: paid / ready / picked up | Webhooks — `payment.updated`, `order.fulfillment.updated`, `order.updated` |

Digital wallets need domain verification with Apple; Square provides the file to host.

## Hard-won lessons from the staff app (build these in from day one)

These cost real debugging time on the existing app. Do not rediscover them.

1. **Fulfillments are mandatory for the order to show up properly.** An order without a fulfillment does not route to the POS/printer and looks invisible in the Dashboard. Create `PICKUP`/`DELIVERY` with `state: PROPOSED`, then immediately `UpdateOrder` it to `RESERVED`. Square rejects `RESERVED` at creation time, and rejects `IN_STORE` fulfillment for third-party apps.
2. **`ticket_name` and `source.name`** must be set at creation — that is what the kitchen and the Dashboard display. Without them every order looks anonymous and gets mislabelled.
3. **Order metadata cannot hold empty strings.** Square rejects them, and `fields_to_clear` returned a 500. Use a sentinel value (`"-"`) for a cleared field.
4. **Every write needs `version`** from a fresh read; a stale version fails the update. Always retrieve, then write, then use the returned order.
5. **Completed/paid orders cannot be updated.** Anything you want to change after payment must be decided before it, or stored outside Square.
6. **Idempotency keys on every create/update/payment** — Square requires them and they are your only protection against a double charge on a double click.
7. **Category names are not on the item you fetch.** They require a second `BatchRetrieveCatalogObjects` for the category IDs, and related objects do not include category rows. Cache the lookup in memory; never refetch per render.
8. **Catalog is paginated** — always loop the cursor, or half your menu silently disappears.
9. **Location filtering matters.** Items can be absent at a location or sold out only at that location (`location_overrides`). Filter with `present_at_all_locations`, `present_at_location_ids`, `absent_at_location_ids`.
10. **Only `FIXED_PRICING` variations are orderable.** Variable-price items must be hidden or handled explicitly.
11. **Sandbox vs production tokens are not interchangeable** — a mismatch gives a bare 401. Derive the base URL from the environment variable, never hardcode it.
12. **Read credentials inside the handler, not at module load** — env is injected per request on the hosting runtime, so module-level reads are `undefined` in production.
13. **Pin the `Square-Version` header** so an API upgrade cannot silently change the response shape.
14. **Search is time-filtered.** `SearchOrders` needs a `date_time_filter`; without it you get unpredictable result sets.
15. **Surface Square's error `detail`, `code` and `field`** — the generic message hides which field was wrong and turns a one-minute fix into an hour.
16. **Webhook signature is HMAC over `notificationUrl + rawBody`**, read the raw body before parsing, and reject when the key is absent rather than trusting the call.

## Public-site edge cases

- Price tampering: recompute with `CalculateOrder` from catalog IDs; never trust browser amounts.
- Payment succeeds but the browser closes: the order is already paid in Square; confirmation is recoverable by order ID.
- Payment fails: cancel the order so no unpaid ghost tickets reach the kitchen.
- Item sells out between menu load and pay: re-check stock at checkout and tell the customer which item dropped.
- Closed hours / too-soon pickup time: block with a clear message, using the location's timezone, not the browser's.
- Delivery: minimum order, flat fee, and a radius or postcode allow-list.
- Rate limiting and a honeypot field on the public order endpoint.
- `frame-ancestors` limited to your domain if you embed; otherwise serve at `order.yourdomain.com`.
- Accessibility and mobile-first layout — most traffic will be phones.
- No card data ever touches our code; only Square's tokenized nonce.

## Secrets for the new project

`SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, `SQUARE_LOCATION_ID`, `SQUARE_APPLICATION_ID` (public, used by the card form), `SQUARE_WEBHOOK_SIGNATURE_KEY`.

## Build order

1. Menu + cart against sandbox.
2. Checkout form + `CalculateOrder` quote.
3. `CreateOrder` with fulfillment, verify it appears correctly in the Square sandbox Dashboard and on the kitchen display.
4. Web Payments SDK card field + `CreatePayment`, including failure/cancel path.
5. Hours, lead time, delivery rules.
6. Webhooks for live status.
7. Switch to production credentials, connect your domain, soft launch pickup-only.

## What I need from you

- Your domain (and whether the shop is embedded in the site or on `order.yourdomain.com`).
- Pickup hours and lead time.
- Delivery: on at launch or later, fee, minimum, zone.
- Whether you want digital wallets (Apple/Google Pay) at launch.
- Tipping at checkout: yes or no.
