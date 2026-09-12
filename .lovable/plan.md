# Public online ordering: same project vs. new project

## Current situation

- This project is already published and **public** on the Free plan.
- `/` (kitchen display), `/order` (table ordering) and `/admin` are reachable by anyone who knows or guesses the URL.
- Right now they are not gated, so the whole staff tool is exposed to the internet.
- Your Free plan does not let us make the published site private.

Because of that, **putting both the customer shop and the staff tools in this one public project is risky**. A bug in the gate, a leaked route, or an SSR data leak could expose live orders, customer details and the admin panel.

## Recommended architecture: two projects

Keep this project as the **internal staff tool** and create a new Lovable project as the **public ordering site**.

| | Staff project (this one) | Public ordering project (new) |
|---|---|---|
| Audience | Kitchen, servers, managers | Customers on your website |
| Routes | `/` KDS, `/order` table ordering, `/admin` | `/` menu, `/checkout`, `/confirmation/:id` |
| Publishing | Keep unpublished, or upgrade and set private | Publish publicly and embed in your site |
| Square access | Read/write orders, update service state, view recent orders | Read catalog, create orders, take payments |
| Leak risk | URL is not public (or is private) — much lower | No staff routes or data exist to leak |
| Menu sync | Automatic — both read the same Square catalog | Automatic — both read the same Square catalog |

Both projects talk to the same Square location, so the menu, prices, taxes and orders stay in sync. The public project never has the functions that list kitchen orders, close orders or view order history.

## What we build in the new public project

1. **Menu page** — browse categories/items from Square, add to cart.
2. **Checkout page** — name, phone, email, pickup or delivery, address (if delivery), requested time, notes.
3. **Payment** — Square Web Payments SDK card fields on your own page; token goes to our server function, which charges via Square Payments API.
4. **Order creation** — order is created in Square as an online order with `PICKUP` or `DELIVERY` fulfillment and `source.name: "Online"` so it appears in Square Dashboard the same way Square Online orders do.
5. **Confirmation** — order number, pickup time, receipt email from Square.
6. **Operational guardrails** — open/close hours, lead time, delivery fee/minimum, sold-out re-check, double-submit prevention, abuse limits.
7. **Embedding support** — `X-Frame-Options` / CSP `frame-ancestors` allow only your website domain.

## What happens to this project

1. Add a **staff gate** so `/`, `/order` and `/admin` require a staff session.
2. Keep `/admin` behind its existing PIN **and** the staff gate.
3. Remove or redirect any public-facing accidental entry points.
4. Optionally leave this project **unpublished** and access it via the preview/dev URL, or upgrade to a paid plan and set it to private.

## Edge cases covered

- Prices, tax and totals are recomputed server-side from Square by catalog object ID — the browser cannot set its own price.
- Order is created only after the payment succeeds, or created then immediately cancelled if payment fails — no orphan unpaid orders.
- Idempotency keys prevent double charges if the customer clicks Pay twice.
- Sold-out/deleted items are re-checked at checkout against live Square catalog.
- Card fields fail to load (network, blocker): checkout shows a clear error instead of a broken button.
- Delivery address validation plus a configurable radius/zone limit.
- Abuse rate limits on public order/pay endpoints.

## Alternative: one project with a strong gate

We can add the public shop to this same project and lock the staff routes with an encrypted staff session. It is faster and costs one project, but the residual risk is higher because staff data and customer data live in the same deployed app. I would only choose this if you want to launch this week and accept the trade-off.

## What I need before building

- Your website domain for the embed allow-list.
- Pickup hours, lead time, and whether you want delivery now or later.
- Delivery fee, minimum order, and any zone/radius limit.
- Whether you want to create the new project now and build the public site there, or start by gating this project and add the shop here first.
