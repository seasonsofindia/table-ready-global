export interface MenuVariation {
  id: string;
  name: string;
  /** Price in minor units (cents). Null when the variation has variable pricing. */
  amount: number | null;
  currency: string;
  available: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string;
  variations: MenuVariation[];
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface Menu {
  categories: MenuCategory[];
  fetchedAt: string;
}

export interface CartItem {
  variationId: string;
  itemId: string;
  itemName: string;
  variationName: string;
  amount: number | null;
  currency: string;
  quantity: number;
}

export interface OrderLine {
  uid: string | null;
  name: string;
  quantity: string;
  catalogObjectId: string | null;
  totalAmount: number | null;
  currency: string;
  /** Menu category name, resolved from the catalog (cached server-side). */
  categoryName?: string | null;
  /** Variation, modifier and note text shown under the item. */
  modifiers?: string[];
}


export type OrderState = "OPEN" | "COMPLETED" | "CANCELED" | "DRAFT";

export type OrderSourceKind = "POS" | "ONLINE" | "APP" | "OTHER";

export interface OrderSummary {
  id: string;
  state: OrderState;
  version: number;
  referenceId: string | null;
  tableNumber: number | null;
  totalAmount: number | null;
  currency: string;
  createdAt: string | null;
  updatedAt: string | null;
  lineItems: OrderLine[];
  ticketName: string | null;
  customerName: string | null;
  sourceName: string | null;
  metadata: Record<string, string>;
}

export const APP_SOURCE_NAME = "Table Ordering";

export function orderSourceKind(order: OrderSummary): OrderSourceKind {
  const source = (order.sourceName ?? "").toLowerCase();
  if (!source) return "OTHER";
  if (source === APP_SOURCE_NAME.toLowerCase()) return "APP";
  if (source.includes("point of sale") || source.includes("restaurants") || source === "square")
    return "POS";
  if (
    source.includes("online") ||
    source.includes("checkout") ||
    source.includes("website") ||
    source.includes("ecom") ||
    source.includes("delivery")
  )
    return "ONLINE";
  return "OTHER";
}

export function orderSourceLabel(order: OrderSummary): string {
  const kind = orderSourceKind(order);
  if (kind === "POS") return "POS";
  if (kind === "ONLINE") return "Online";
  if (kind === "APP") return "App";
  return order.sourceName ?? "Other";
}

export function orderDisplayName(order: OrderSummary): string {
  if (order.ticketName) return order.ticketName;
  if (order.customerName) return order.customerName;
  if (order.tableNumber !== null) return `Table ${order.tableNumber}`;
  return `#${order.id.slice(-5).toUpperCase()}`;
}


/* ------------------------- KDS service state ---------------------------- */

export const SERVED_META_PREFIX = "kds_served_";
export const SERVED_META_CHUNKS = 4;
export const FULFILLED_META_KEY = "kds_fulfilled_at";
/** Square rejects empty metadata values, so cleared keys use this sentinel. */
export const EMPTY_META_VALUE = "-";

/** Compact, stable token for a line item so many fit in a 255-char value. */
export function lineToken(line: OrderLine, index: number): string {
  return line.uid ? line.uid.slice(0, 8) : `i${index}`;
}

export function parseServedTokens(metadata: Record<string, string>): Set<string> {
  const parts: string[] = [];
  for (let i = 1; i <= SERVED_META_CHUNKS; i += 1) {
    const value = metadata[`${SERVED_META_PREFIX}${i}`];
    if (value) parts.push(value);
  }
  return new Set(parts.join(",").split(",").filter((t) => t && t !== EMPTY_META_VALUE));
}

/** Splits tokens into 255-char metadata chunks; extra tokens are dropped. */
export function serializeServedTokens(tokens: string[]): Record<string, string> {
  const chunks: string[] = [];
  let current = "";
  for (const token of tokens) {
    const next = current ? `${current},${token}` : token;
    if (next.length > 255) {
      if (chunks.length + 1 >= SERVED_META_CHUNKS && current) {
        chunks.push(current);
        current = "";
        break;
      }
      chunks.push(current);
      current = token;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  const out: Record<string, string> = {};
  for (let i = 1; i <= SERVED_META_CHUNKS; i += 1) {
    out[`${SERVED_META_PREFIX}${i}`] = chunks[i - 1] ?? EMPTY_META_VALUE;
  }
  return out;
}

export type ServiceStatus = "NEW" | "PARTIAL" | "SERVED";

export function servedCount(order: OrderSummary): number {
  const served = parseServedTokens(order.metadata);
  return order.lineItems.filter((line, index) => served.has(lineToken(line, index))).length;
}

export function isServiceFulfilled(order: OrderSummary): boolean {
  const value = order.metadata[FULFILLED_META_KEY];
  return Boolean(value) && value !== EMPTY_META_VALUE;
}

export function serviceStatus(order: OrderSummary): ServiceStatus {
  if (isServiceFulfilled(order)) return "SERVED";
  return servedCount(order) > 0 ? "PARTIAL" : "NEW";
}

export interface OrderResponse {
  order: OrderSummary;
}

export interface OrderPayloadLine {
  catalogObjectId: string;
  quantity: number;
  name: string;
}

export interface OrderPayload {
  tableNumber: number;
  lines: OrderPayloadLine[];
}

export const TABLE_NUMBERS = Array.from({ length: 16 }, (_, i) => i + 1);

export function tableReferenceId(tableNumber: number): string {
  return `Dining-${tableNumber}`;
}

export function parseTableNumber(referenceId: string | null | undefined): number | null {
  if (!referenceId) return null;
  const match = /^(?:Table|Dining)-(\d+)$/.exec(referenceId);
  return match ? Number(match[1]) : null;
}

export function formatMoney(amount: number | null, currency = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}
