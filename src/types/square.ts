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
  note?: string | null;
}

export type OrderState = "OPEN" | "COMPLETED" | "CANCELED" | "DRAFT";

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
  sourceName?: string | null;
  lineItems: OrderLine[];
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
