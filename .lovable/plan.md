# Table Orders — Square-powered table ordering app

## Square API reference (Square-Version 2025-xx, verified against docs during build)

All calls: `Authorization: Bearer <token>`, `Square-Version: <pinned date>`, `Content-Type: application/json`.
Base URL from env: `https://connect.squareup.com` (production) or `https://connect.squareupsandbox.com`.

**1. ListCatalog** — `GET /v2/catalog/list?types=ITEM,CATEGORY,ITEM_VARIATION`
- Response: `{ objects: CatalogObject[], cursor?, errors? }`
- `CatalogObject`: `id`, `type` (`ITEM` | `ITEM_VARIATION` | `CATEGORY` | ...), `updated_at`, `version`, `is_deleted`, `present_at_all_locations`, `present_at_location_ids`, plus a typed payload field.
- `item_data`: `name`, `description`, `category_id` (legacy) / `categories: [{id}]`, `variations: CatalogObject[]`, `product_type`.
- `item_variation_data`: `item_id`, `name`, `sku`, `pricing_type` (`FIXED_PRICING` | `VARIABLE_PRICING`), `price_money: { amount (int, minor units), currency }`, `location_overrides`, `available_for_pickup`.
- `category_data`: `name`.
- Pagination via `cursor`. Category names come from `CATEGORY` objects joined by id.

**2. CreateOrder** — `POST /v2/orders`
- Body: `{ idempotency_key (required, <=192 chars), order: Order }`
- `Order`: `location_id` (required), `reference_id` (<=40 chars), `source: { name }`, `line_items[]`, `fulfillments[]`, `state` (`OPEN` | `COMPLETED` | `CANCELED` | `DRAFT`; server default OPEN).
- `OrderLineItem`: `quantity` (required, string integer), `catalog_object_id` (variation id), `name`, `note`, `modifiers`, `base_price_money` (required only when no catalog id).
- `Fulfillment`: `type` (`PICKUP` | `SHIPMENT` | `DELIVERY`), `state` (`PROPOSED`, `RESERVED`, `PREPARED`, `COMPLETED`, `CANCELED`, `FAILED`), `pickup_details: { recipient: { display_name }, schedule_type: ASAP | SCHEDULED, pickup_at (RFC3339) }`.
- Response: `{ order: Order, errors? }` with `id`, `state`, `total_money`, `net_amounts`, `line_items[].uid`, `version`, `created_at`.

**3. SearchOrders** — `POST /v2/orders/search`
- Body: `{ location_ids: string[] (required), query: { filter: { state_filter: { states: ["OPEN"] }, date_time_filter, fulfillment_filter, customer_filter }, sort: { sort_field: "CREATED_AT" | "UPDATED_AT" | "CLOSED_AT", sort_order: "ASC"|"DESC" } }, limit, cursor, return_entries }`
- Note: there is **no** `reference_id` filter. Reference-id matching is done client-side after filtering on `state_filter.states = ["OPEN"]` + a recent `date_time_filter`. Sorting on `UPDATED_AT`/`CLOSED_AT` requires the matching date filter field.
- Response: `{ orders: Order[] } | { order_entries: [{ order_id, location_id, version }] }`, `cursor`, `errors`.

**4. UpdateOrder** — `PUT /v2/orders/{order_id}`
- Body: `{ idempotency_key, order: { version (required, from the latest read), location_id, line_items?, state? }, fields_to_clear?: string[] }`
- Adding items: send only the new `line_items` (no `uid`) — they are appended. Removing: `fields_to_clear: ["line_items[<uid>]"]`.
- Version mismatch → `409 VERSION_MISMATCH`; always re-retrieve before updating.
- Closing: set `order.state = "COMPLETED"` (only allowed when the order is fully paid) or `"CANCELED"` (only when unpaid). Fulfillment completion is separate: `line_items`-style update to `fulfillments[uid].state = "COMPLETED"`. Practical rule for this app: try `COMPLETED`, fall back to `CANCELED` on the "cannot complete unpaid order" error, and always advance the fulfillment state.

**5. RetrieveOrder** — `GET /v2/orders/{order_id}` → `{ order, errors? }`.

**6. Webhooks** — `order.updated`
- Payload: `{ merchant_id, type: "order.updated", event_id, created_at, data: { type: "order", id, object: { order_updated: { order_id, version, location_id, state, created_at, updated_at } } } }` (note: `order.updated` carries a slim `order_updated` object, not the full order — a RetrieveOrder call is required for details).
- Signature: header `x-square-hmacsha256-signature`, base64 HMAC-SHA256 over `notificationUrl + rawRequestBody` using the webhook signature key. Compare timing-safe; reject on mismatch.

These shapes are re-verified against developer.squareup.com at build time before the code is written; any deviation is corrected there.

## What gets built

Frontend calls go through thin TanStack Start server functions instead of the browser hitting Square directly. Reason: an access token in `VITE_*` is readable by anyone who opens the app, and Square's API does not allow browser CORS calls anyway — the direct-fetch version would not work in production. There is still no separate backend server; these run in the same app.

Config:
- `SQUARE_ACCESS_TOKEN` (secret), `SQUARE_WEBHOOK_SIGNATURE_KEY` (secret)
- `SQUARE_LOCATION_ID` = `L1BD20WGENNZ3`, `SQUARE_ENVIRONMENT` = `production`, `SQUARE_API_BASE` derived from environment (never hardcoded at the call sites)

### Screens
1. **Order screen (`/`)** — table selector (1–16, no default), menu grouped by category, cart, current-order panel.
2. **Admin (`/admin`)** — PIN gate, recent orders with state, cleanup mode toggle (Manual / Auto), analytics (orders per table, popular items).

### Flow
- Menu: fetched once per session via ListCatalog, cached in TanStack Query, manual refresh button. Items with no fixed-price/available variation are greyed out. Nothing hardcoded.
- Table select → SearchOrders (OPEN + last 24h) filtered to `reference_id === "Table-{n}"`. Found → Current Order panel with "Add to existing order" and "Clear and start new". Lookup failure → non-blocking warning, treat as new order.
- Cart → CreateOrder with `reference_id: "Table-{n}"`, `source.name: "Table Ordering"`, PICKUP/PROPOSED fulfillment, `pickup_at = new Date().toISOString()` computed at submit time (fixes the future-date bug).
- Add-to-existing → RetrieveOrder for the current `version`, then UpdateOrder with fresh idempotency key. Items already on the order prompt a quantity-change confirmation instead of silently duplicating.
- Success → order id + "Order sent to kitchen". Failure → Square's error `detail` shown, cart preserved.

### Cleanup
- **Manual (default):** "Mark as Paid" on the Current Order panel → UpdateOrder completing fulfillment and order state, with the COMPLETED→CANCELED fallback described above.
- **Auto (optional):** `POST /api/public/square-webhook` verifies the HMAC signature, retrieves the order, and when it is no longer OPEN broadcasts an invalidation so the active-orders view drops it. No webhook configured → manual mode still works unchanged.

## Technical notes
- `src/lib/square.server.ts` — fetch wrapper (base URL from env, version header, error normalisation), read env inside handlers only.
- `src/lib/square.functions.ts` — `listMenu`, `findOpenOrderForTable`, `createTableOrder`, `addToOrder`, `closeOrder`, `listRecentOrders`; thin `createServerFn` wrappers with Zod validation.
- `src/types/square.ts` — `MenuItem`, `MenuVariation`, `CartItem`, `OrderPayload`, `OrderResponse`.
- Components: `TableSelector`, `MenuList`/`MenuItemCard`, `Cart`, `CurrentOrderPanel`, `AdminPanel`.
- Mobile-first, large tap targets, sonner toasts, custom warm restaurant theme (no default purple/Inter look).
- Admin PIN is a client-side convenience gate over an env-configured PIN, not real authentication — noted in the UI.

## Delivery order
1. Verify the six Square doc pages, correct the reference block if anything differs.
2. Types + server layer + theme.
3. Menu + table selector working end-to-end against production — **stop here for your confirmation**.
4. Cart, create/update order, confirmation.
5. Manual cleanup, then webhook route.
6. Admin view: recent orders, analytics, PIN.

## Needed from you
The `SQUARE_ACCESS_TOKEN` and (for auto-clear) `SQUARE_WEBHOOK_SIGNATURE_KEY` — I will prompt for these as secrets once you approve.
