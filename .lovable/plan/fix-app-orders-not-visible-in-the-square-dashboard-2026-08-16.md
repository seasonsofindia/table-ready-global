# Fix: app orders not visible in the Square Dashboard

## What's happening

Our orders are created with a `PICKUP` fulfillment in state `PROPOSED`. Square's
Dashboard/POS order lists only surface orders whose fulfillment has been accepted
(`RESERVED` or later); `PROPOSED` fulfillments sit in an "unconfirmed" bucket that
the Orders screen filters out. That matches the symptom: the orders exist (our
admin view reads them straight from SearchOrders) but never appear in Square.

This is stated as the likely cause, not a confirmed one — step 1 below verifies it
against your real data before any code changes.

## Plan

1. **Verify (1 read-only API call, no order created):** pull one recent order that
   *does* show in your Square Dashboard and one of ours, and diff the fulfillment
   block — `type`, `state`, `pickup_details`, and `source.name`. Whatever the
   working order has, we copy.
2. **Match the payload** in `createOrder` (`src/lib/square.server.ts`):
   - set the fulfillment `state` to the value the working order uses (expected
     `RESERVED`),
   - keep `type: PICKUP`, `schedule_type: ASAP`, `pickup_at` = now,
   - keep `recipient.display_name = "Table {n}"` so staff can identify the table,
   - carry over any other field the diff shows as required.
3. **Backfill helper (optional, only if you want it):** an admin action that
   advances existing `PROPOSED` fulfillments on still-open orders to `RESERVED`
   so today's orders appear too.
4. **Confirm:** place one live test order from the app, then check it appears in
   the Square Dashboard Orders list. If it still doesn't, fall back to the diff
   from step 1 and adjust the remaining mismatched field.

## Technical notes

- Only `createOrder` in `src/lib/square.server.ts` changes; `closeOrder` already
  completes fulfillments, and the COMPLETED → CANCELED fallback stays as is.
- `appendLinesToOrder` doesn't touch fulfillments, so it needs no change.
- Cost: one verification call plus one live test order — no bulk API scans.
