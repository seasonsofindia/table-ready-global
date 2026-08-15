# Table Ready

You are building (or rebuilding) a mobile-responsive restaurant table

ordering app called "Table Orders". The app integrates directly with

the Square API from the frontend. There is no separate backend server.

============================================================

STEP 0 — BEFORE YOU WRITE ANY CODE

============================================================

Before implementing anything, you MUST read the current Square API

documentation for every endpoint this app uses, and output a short

reference block at the top of your response containing:

  For each endpoint:

    - HTTP method + path

    - Required headers (Authorization, Square-Version, Content-Type)

    - Full request body schema (paste the relevant fields and types)

    - Full response body schema (top-level fields, nested objects)

    - Notes on required vs optional fields, and any enum values

Endpoints to read docs for (use the current versions on

developer.squareup.com — do not guess):

  1. Catalog API → ListCatalog (or BatchRetrieveCatalog) for fetching

     the menu:

     https://developer.squareup.com/reference/square/catalog-api

  2. Orders API → CreateOrder for submitting a new order:

     https://developer.squareup.com/reference/square/orders-api/create-order

  3. Orders API → SearchOrders for finding an existing OPEN order

     by table number (reference_id):

     https://developer.squareup.com/reference/square/orders-api/search-orders

  4. Orders API → UpdateOrder for adding items to an existing OPEN

     order, and for closing/transitioning an order after payment:

     https://developer.squareup.com/reference/square/orders-api/update-order

  5. Orders API → RetrieveOrder (to confirm an order was created):

     https://developer.squareup.com/reference/square/orders-api/retrieve-order

  6. Webhooks → order.updated event payload, signature verification,

     and event types:

     https://developer.squareup.com/reference/square/webhooks

Pay special attention to:

  - Valid values for Order.state (likely OPEN, COMPLETED, CANCELED —

    confirm exact set from the docs)

  - Valid values for Fulfillment.state (likely PROPOSED, RESERVED,

    PREPARED, COMPLETED, CANCELED — confirm exact set)

  - The exact filter shape for SearchOrders (it requires a `location_ids`

    array and a `query` filter object — confirm syntax)

  - How an order is "closed" after payment (is it a state change on

    the order, or a fulfillment state change, or both?)

  - Webhook signature verification (HMAC-SHA256 with your webhook

    signature key, in the `x-square-hmacsha256-signature` header)

Do not proceed to Step 1 until you have produced this reference block

and confirmed you understand the data shapes.

============================================================

STEP 1 — APP ARCHITECTURE

============================================================

Single-page React + TypeScript app (Lovable default). Frontend calls

Square REST APIs directly using fetch. No backend server.

Read configuration from import.meta.env (NEVER hardcode):

  VITE_SQUARE_ACCESS_TOKEN      — Square access token

  VITE_SQUARE_LOCATION_ID       — "L1BD20WGENNZ3"

  VITE_SQUARE_ENVIRONMENT       — "production" or "sandbox"

  VITE_SQUARE_API_BASE          — "https://connect.squareup.com" (prod)

                                  or "https://connect.squareupsandbox.com"

                                  (sandbox)

The app MUST derive the base URL from the env var, not assume one.

This is the fix for the "orders not visible in dashboard" issue

documented in the project memory.

============================================================

STEP 2 — MENU (Catalog)

============================================================

- On app load, fetch the live menu from the Catalog API.

- Use the request shape from Step 0's reference block (likely

  GET /v2/catalog/list?types=ITEM or BatchRetrieveCatalog).

- Group items by category_name.

- For each item, display: name, description, price (from default

  variation or user-selected variation), and availability.

- Items with no available variations should be hidden or greyed out.

- Cache the menu in memory for the session; allow a manual refresh.

- All data (names, prices, variation IDs) comes from the live catalog —

  do not hardcode any of it.

============================================================

STEP 3 — TABLE SELECTION

============================================================

- A dropdown labeled "Select Table" with values 1 through 16.

- No default selection — the user must choose.

- The selected number becomes part of the `reference_id` (e.g.,

  "Table-7") sent to Square.

============================================================

STEP 4 — CURRENT ORDER LOOKUP (PER TABLE)

============================================================

- After a table is selected, call SearchOrders to find any existing

  OPEN order for that table.

- Use the request shape from Step 0's reference block. The filter

  must include:

    - location_ids: [import.meta.env.VITE_SQUARE_LOCATION_ID]

    - A filter on reference_id matching "Table-{selected_number}"

    - state filter set to OPEN

- If an OPEN order is found:

    - Display the existing line items in a "Current Order" panel.

    - Show two buttons:

        a) "Add to existing order" — proceed to Step 5b

        b) "Clear and start new" — first call UpdateOrder (or

           CancelOrder if available) on the existing order, then

           proceed to Step 5a to create a new one

- If no OPEN order is found, proceed directly to Step 5a.

- If the lookup fails, show a non-blocking warning and proceed to

  Step 5a.

============================================================

STEP 5 — CART + ORDER SUBMISSION

============================================================

5a. CREATE NEW ORDER

- POST {baseUrl}/v2/orders

- Body shape (verified from Step 0 reference block):

    {

      "idempotency_key": "<uuid>",

      "order": {

        "location_id": "<from env>",

        "reference_id": "Table-{n}",

        "state": "OPEN",

        "source": { "name": "Table Ordering" },

        "line_items": [

          {

            "catalog_object_id": "<variation_id from menu>",

            "quantity": "<stringified int>",

            "name": "<item name>"

          }

        ],

        "fulfillments": [

          {

            "type": "PICKUP",

            "state": "PROPOSED",

            "pickup_details": {

              "recipient": { "display_name": "Table {n}" },

              "schedule_type": "ASAP",

              "pickup_at": "<new Date().toISOString() — must be NOW>"

            }

          }

        ]

      }

    }

5b. ADD TO EXISTING ORDER

- Use the UpdateOrder endpoint per Step 0's reference block.

- Append new line items to the existing order (do not duplicate

  items already on it — let the user confirm quantity changes

  instead of double-adding).

- Generate a fresh idempotency_key for the update call.

5c. CONFIRMATION

- On success, display the returned order ID and a "Order sent to

  kitchen" message.

- On failure, surface the Square error message and keep the cart

  intact so nothing is lost.

- Payment is NOT collected in this app — it happens at the Square

  POS terminal.

============================================================

STEP 6 — ORDER CLEANUP (POST-PAYMENT)

============================================================

The app must support two cleanup modes, switchable via a simple

admin setting (default: Manual clear):

A) MANUAL CLEAR

- A "Mark as Paid" or "Clear Order" button on the Current Order

  panel (staff use).

- On click, call UpdateOrder to transition the order state and/or

  fulfillments to indicate completion. Use the exact valid state

  values from Step 0's reference block.

- This is the primary mode — must work without any webhook setup.

B) AUTO-CLEAR VIA WEBHOOK (optional enhancement)

- A webhook endpoint in the app receives order.updated events from

  Square.

- When an order's state changes to COMPLETED (or whatever the docs

  say indicates payment accepted + fulfillment done), the app

  removes it from the active-orders view.

- Must verify the HMAC-SHA256 signature using the webhook signature

  key (per Step 0's reference block).

- If webhooks are not configured, the app gracefully falls back to

  Manual clear.

The app must never display a stale OPEN order after payment is taken

at the POS.

============================================================

STEP 7 — KNOWN ISSUES FROM PROJECT MEMORY (FIX THESE)

============================================================

1. pickup_at MUST be the current real timestamp (new Date().toISOString()).

   The previous build generated future dates (e.g., 2026) which caused

   Square to hide orders from the default date filter.

2. The API base URL MUST come from VITE_SQUARE_API_BASE. Do not

   hardcode connect.squareup.com. This is how production vs sandbox

   got mixed up before.

3. Use real catalog_object_id values from the live menu. Never

   hardcode or guess variation IDs (e.g., do not use "abc123").

============================================================

STEP 8 — EFFICIENCY + UX

============================================================

- Mobile-first responsive design, large tap targets, fast load.

- TypeScript types: MenuItem, MenuVariation, CartItem, OrderPayload,

  OrderResponse — based on the schemas you documented in Step 0.

- Minimize API calls: fetch the menu once per session, cache in

  memory, allow manual refresh.

- Clean component structure: separate concerns for menu, cart,

  table selector, current order, and admin/cleanup controls.

============================================================

STEP 9 — SAMPLE DATA FROM PROJECT MEMORY (USE FOR REFERENCE)

============================================================

These are verified working samples from the project's own testing:

  Sample created order response (real, from this project's tests):

    {

      "order": {

        "id": "FDjQREPiZR7uokvi01XHs76I6gIZY",

        "location_id": "L1BD20WGENNZ3",

        "reference_id": "Table-1",

        "state": "OPEN",

        "total_money": { "amount": 449, "currency": "USD" },

        "source": { "name": "Table Ordering" },

        "created_at": "2026-08-14T03:18:44.015Z"  ← BUG: future date

        ...

      }

    }

  Known working variation IDs (from live menu):

    NQIFOVD33TE5XXAGFQEFHAJR  — Mango Chutney — 4 Oz ($2.49)

    4WMRRBISR5WATDGJN7XGQRCC  — Onion Salad ($2.00)

Treat the `created_at` as a bug to fix, not a reference value.

============================================================

STEP 10 — DELIVERY ORDER

============================================================

1. Output the Step 0 reference block first (the API schemas).

2. Then output the file structure you plan to create.

3. Then implement, file by file.

4. Stop and ask for confirmation after the menu + table selector

   work end-to-end in sandbox, before moving to order submission.

============================================================

STRETCH GOALS (after core works)

============================================================

- Small admin view: list of recent orders with their state.

- Analytics: orders per table, popular items.

- Staff PIN authentication for the admin/cleanup view.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ff869011-62ce-47d3-b225-0e7cdd431160).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
