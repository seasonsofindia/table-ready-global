# KDS Update — Phased Implementation

Build a Kitchen Display Screen as the app's home screen, in 5 phases. Each phase stops for testing and approval before the next begins.

Decisions locked in: KDS lives at `/`, the ordering screen moves to `/order`, admin stays at `/admin`. Item-handoff and service state is stored in Square order metadata so it is shared across tablets. The big heading is the Square ticket name (falls back to customer name, then short order ID).

## Phase 1 — KDS as the default screen

- New `src/routes/index.tsx` = KDS. Current ordering UI moves to `src/routes/order.tsx` (`/order`), linked from a header button; `/admin` link stays.
- KDS lists recent open orders from Square only — no catalog/menu call on this screen. The menu query stays inside the ordering route, so opening the app makes exactly one Square request (order search).
- Each order card shows: order name in large text (ticket name → customer name → short ID), table number when present, elapsed time, item list, total.
- Source badge derived from the order's `source.name`: "POS" for Square Point of Sale / Square for Restaurants, "Online" for online-checkout sources, "App" for orders this app created, otherwise the raw source name. No blanket "Online" label.

Test: load `/`, confirm the KDS renders with correct names and source badges, and confirm in the network log that no catalog request fires until `/order` is opened.

## Phase 2 — Refresh control

- Toggle in the KDS header: Auto Refresh / Manual Refresh, persisted in `localStorage` (a UI preference, not app data).
- Auto mode keeps the existing polling interval; Manual mode disables refetching entirely (no interval, no refetch on focus/reconnect) and only updates when the Refresh button is pressed.

Test: switch to Manual, watch the network panel for 60+ seconds, confirm zero order requests until Refresh is pressed.

## Phase 3 — Individual item handoff

- Each order card renders its line items as a checklist with a progress line ("3 of 5 items delivered").
- Checking an item writes the delivered line-item UIDs into the order's metadata via a single `UpdateOrder` call; the order's payment/state fields are untouched.
- Checkoffs are optimistic in the UI and batched per tap, so one tap = at most one API call.

Test: check items on a POS order, reload, confirm state persists and the order's payment status in the Square Dashboard is unchanged.

## Phase 4 — Service fulfilled

- When every item is checked, a "Mark service fulfilled" button becomes enabled; it writes a `service_fulfilled` marker (plus timestamp) into the same metadata.
- It does not close, complete, or pay the order — an order can be service-fulfilled and unpaid.

Test: mark an unpaid POS order fulfilled, confirm the badge appears in the KDS and the order is still unpaid/open in Square.

## Phase 5 — Order tabs

- Tabs: **Active orders** (default; all POS/online/app orders not yet service-fulfilled) and **Service fulfilled** (marker present, including unpaid).
- Both tabs read from the same single order query — filtering is client-side, so tab switching costs no extra API calls.

Test: fulfill an order, confirm it moves tabs, still exists in Square, and the payment status is untouched.

## Technical notes

- All Square access stays in `src/lib/square.server.ts` behind server functions in `src/lib/square.functions.ts`; two new functions: `setOrderDelivery` (metadata write) and reuse of `getRecentOrders` for the KDS feed.
- Order metadata is a string→string map with a 255-char value cap, so delivered items are stored as a compact list of shortened line UIDs; if an order is unusually large the list truncates rather than failing the write.
- `listRecentOrders` gets extended to return `source`, `ticketName`, `customerName`, and `metadata` so the KDS can render without extra fetches.
- No polling changes to existing screens; no new dependencies.
