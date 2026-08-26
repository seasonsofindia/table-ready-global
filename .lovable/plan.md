# KDS mode — kitchen display for tablets

A new `/kds` page that shows live orders as big ticket cards, sized for a tablet mounted in the kitchen. The Admin page keeps everything it has today; nothing there changes.

## What it does

- Full-screen ticket board: each open order is a card showing the source (Dining N, or Online / Other), time since it was placed, all line items with quantity, and any item notes.
- Auto-refresh every 15 seconds, plus a manual refresh button and a "last updated" stamp. No page reload needed.
- Filter tabs: All / Dining / Online.
- Cards age visually: fresh (under 10 min) neutral, 10–20 min amber, over 20 min red border, so late tickets stand out across the room.
- "Bump" button on each card marks the order done (same close action the ordering screen uses) and removes it from the board.
- Same staff PIN gate as Admin, remembered for the session so a tablet isn't re-prompted on every refresh.
- Dark, high-contrast layout with large text and big tap targets; designed for landscape tablet, still usable on a phone.

## Where it lives

- Link to KDS from the Admin header, and from the ordering screen header, so staff can reach it without typing a URL.

## Technical notes

- New route `src/routes/kds.tsx` with its own `head()` metadata.
- Reuses existing server functions: `getRecentOrders` (short window, e.g. 12h) for the feed and `closeTableOrder` for bump. No new Square endpoints.
- Board shows only `OPEN` orders; completed/canceled ones are filtered out client-side.
- `OrderSummary` gains two optional fields populated in `src/lib/square.server.ts` from the Square order: `sourceName` (`order.source.name`) and per-line `note`, so KDS can distinguish app/dining vs online orders and show kitchen notes. Existing consumers are unaffected.
- Polling via TanStack Query `refetchInterval`; PIN state kept in `sessionStorage` (read in an effect to avoid hydration mismatch).
- PIN check keeps using the existing `checkAdminPin` server function — a convenience lock, not real auth.
