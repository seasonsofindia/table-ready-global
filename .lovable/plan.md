# Public online ordering, on this same project

No new project needed. One codebase, two audiences: a public ordering page you embed in your website, and the staff screens (kitchen display, table ordering, admin) locked to your devices.

## Why one project

The Square token, menu, order logic and kitchen display already live here and work. Splitting means two copies of the same Square code, two sets of credentials, and orders arriving from two places. Instead: add public pages, and put a gate in front of the staff pages.

## What customers get

A new public page at `/shop`, designed to sit inside your website (an `order.yoursite.com` subdomain or an embedded frame — both supported).

1. Menu from Square (the same live catalog the table app uses).
2. Cart, then a checkout step: name, phone, email, pickup or delivery, address when delivery, requested time, order notes.
3. Card details entered on the page itself (Square's own secure card fields — card numbers never touch our code or your server).
4. On pay: the order is created in Square as an online order with a pickup or delivery fulfillment, then charged. It lands in your Square POS/Dashboard like your current Square Online orders, and appears on the kitchen display.
5. Confirmation screen with order number and pickup time; a Square receipt is emailed.

Delivery is priced by a flat fee plus an optional minimum you set; no live courier integration.

## Locking the staff screens

- The kitchen display, table ordering and admin pages check for a staff pass on the device. No pass, no page and no data — the page redirects out and the underlying data calls refuse to answer.
- You hand out the pass once per device by opening a secret setup link (contains a key only you have). The device then stays signed in for months. Day to day, staff open the app and it just works — no PIN.
- Admin keeps its own PIN on top of the staff pass.
- The public shop pages stay open to everyone and never expose kitchen or order-history data.

## Edge cases handled

- Prices, taxes and totals are always taken from Square by item ID — never from whatever the browser sends.
- A payment that succeeds but a page that closes still leaves a paid order in Square; a failed card leaves no ghost order (order is created, then cancelled if payment fails).
- Double-tap on Pay can't charge twice.
- Sold-out or deleted items are re-checked at checkout, not just when the menu loaded.
- Closed hours / pickup times: orders outside your ordering window are refused with a clear message.
- Basic abuse limits on the public order and pay calls.
- Only your website domain is allowed to embed the shop; staff pages can't be embedded anywhere.
- Card fields fail to load (blocked script, bad network): checkout shows an error instead of a dead button.

## Rollout

1. Public shop + checkout in Square's sandbox, pay-later disabled, test cards only.
2. Staff gate applied to kitchen/table/admin, staff devices set up.
3. Switch to live Square credentials, embed on your website, soft launch with pickup only.
4. Turn on delivery.

## Technical notes

- New routes: `src/routes/shop/index.tsx` (menu + cart), `src/routes/shop/checkout.tsx`, `src/routes/shop/confirmation.$orderId.tsx`.
- New `src/lib/shop.functions.ts` + `shop.server.ts`: `getPublicMenu`, `quoteOrder` (server-side totals), `placeOrder` (CreateOrder with `PICKUP`/`DELIVERY` fulfillment, `source.name`, `state: OPEN`), `payOrder` (Payments API `CreatePayment` with `order_id`, `idempotency_key`, `autocomplete: true`). Order and payment run in one server call so a failed charge cancels the order.
- Card entry uses the Square Web Payments SDK loaded from Square's CDN; needs `SQUARE_APPLICATION_ID` (public, safe in code) and the existing location ID. Token is posted to `payOrder`; no PAN ever reaches the server.
- Staff gate: signed HTTP-only cookie (`HMAC(deviceId, STAFF_SECRET)`), issued by `/staff-setup?key=STAFF_SETUP_KEY`. A `requireStaff` server-fn middleware wraps `getKitchenOrders`, `updateOrderService`, `getRecentOrders`, and the table-ordering functions; `beforeLoad` on `/`, `/order`, `/admin` redirects when the cookie is absent. Admin PIN check stays as-is on top.
- New secrets: `STAFF_SECRET` (generated), `STAFF_SETUP_KEY` (generated), `SQUARE_APPLICATION_ID`.
- `Content-Security-Policy: frame-ancestors` allows your site on `/shop/*` only; `X-Frame-Options: DENY` equivalent on staff routes.
- Rate limiting is in-memory per worker (adequate at this volume); add a store-backed limiter only if abuse shows up.
- Webhook route unchanged; `payment.updated` can later auto-mark paid orders.

## What I need from you before build

- Your website domain (for the embed allowance).
- Pickup lead time and ordering hours.
- Delivery: flat fee, minimum order, and whether you want a radius/zone limit.
