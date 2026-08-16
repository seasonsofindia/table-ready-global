import type { Menu, MenuCategory, MenuItem, MenuVariation, OrderSummary } from "@/types/square";
import { parseTableNumber, tableReferenceId } from "@/types/square";

export const SQUARE_VERSION = "2025-07-16";

export interface SquareConfig {
  accessToken: string;
  baseUrl: string;
  locationId: string;
  environment: string;
}

/** Reads config at call time — env is injected per request on the worker runtime. */
export function getSquareConfig(): SquareConfig {
  const accessToken = process.env["SQUARE_ACCESS_TOKEN"];
  if (!accessToken) {
    throw new Error("SQUARE_ACCESS_TOKEN is not configured.");
  }
  const environment = (process.env["SQUARE_ENVIRONMENT"] ?? "production").toLowerCase();
  const fallbackBase =
    environment === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";
  const baseUrl = (process.env["SQUARE_API_BASE"] ?? fallbackBase).replace(/\/+$/, "");
  const locationId = process.env["SQUARE_LOCATION_ID"] ?? "L1BD20WGENNZ3";
  return { accessToken, baseUrl, locationId, environment };
}

interface SquareError {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
}

export class SquareApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SquareApiError";
    this.status = status;
    this.code = code;
  }
}

export async function squareFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const config = getSquareConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const errors = (payload["errors"] as SquareError[] | undefined) ?? [];
    const first = errors[0];
    throw new SquareApiError(
      first?.detail ?? `Square request failed (${response.status})`,
      response.status,
      first?.code,
    );
  }
  return payload as T;
}

/* ------------------------------- Catalog -------------------------------- */

interface CatalogMoney {
  amount?: number;
  currency?: string;
}

interface CatalogObject {
  id: string;
  type: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  category_data?: { name?: string };
  item_data?: {
    name?: string;
    description?: string;
    description_plaintext?: string;
    category_id?: string;
    categories?: { id?: string }[];
    reporting_category?: { id?: string };
    variations?: CatalogObject[];
  };
  item_variation_data?: {
    item_id?: string;
    name?: string;
    pricing_type?: string;
    price_money?: CatalogMoney;
    available_for_pickup?: boolean;
    location_overrides?: {
      location_id?: string;
      price_money?: CatalogMoney;
      track_inventory?: boolean;
      sold_out?: boolean;
    }[];
  };
}

function presentAtLocation(object: CatalogObject, locationId: string): boolean {
  if (object.absent_at_location_ids?.includes(locationId)) return false;
  if (object.present_at_all_locations !== false) return true;
  return object.present_at_location_ids?.includes(locationId) ?? false;
}

function toVariation(object: CatalogObject, locationId: string): MenuVariation {
  const data = object.item_variation_data ?? {};
  const override = data.location_overrides?.find((o) => o.location_id === locationId);
  const money = override?.price_money ?? data.price_money;
  const amount = typeof money?.amount === "number" ? money.amount : null;
  const soldOut = override?.sold_out === true;
  return {
    id: object.id,
    name: data.name?.trim() || "Regular",
    amount,
    currency: money?.currency ?? "USD",
    available:
      !object.is_deleted &&
      !soldOut &&
      presentAtLocation(object, locationId) &&
      data.pricing_type === "FIXED_PRICING" &&
      amount !== null,
  };
}

export async function fetchMenu(): Promise<Menu> {
  const { locationId } = getSquareConfig();
  const objects: CatalogObject[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ types: "ITEM,CATEGORY" });
    if (cursor) params.set("cursor", cursor);
    const page = await squareFetch<{ objects?: CatalogObject[]; cursor?: string }>(
      `/v2/catalog/list?${params.toString()}`,
    );
    objects.push(...(page.objects ?? []));
    cursor = page.cursor;
  } while (cursor);

  const categoryNames = new Map<string, string>();
  for (const object of objects) {
    if (object.type === "CATEGORY" && !object.is_deleted) {
      categoryNames.set(object.id, object.category_data?.name?.trim() || "Uncategorized");
    }
  }

  const items: MenuItem[] = [];
  for (const object of objects) {
    if (object.type !== "ITEM" || object.is_deleted) continue;
    if (!presentAtLocation(object, locationId)) continue;

    const data = object.item_data ?? {};
    const categoryId =
      data.reporting_category?.id ?? data.categories?.[0]?.id ?? data.category_id ?? null;
    const variations = (data.variations ?? []).map((v) => toVariation(v, locationId));

    items.push({
      id: object.id,
      name: data.name?.trim() || "Unnamed item",
      description: data.description_plaintext?.trim() || data.description?.trim() || null,
      categoryId,
      categoryName: (categoryId && categoryNames.get(categoryId)) || "Other",
      variations,
      available: variations.some((v) => v.available),
    });
  }

  const grouped = new Map<string, MenuCategory>();
  for (const item of items) {
    const key = item.categoryId ?? `name:${item.categoryName}`;
    let category = grouped.get(key);
    if (!category) {
      category = { id: key, name: item.categoryName, items: [] };
      grouped.set(key, category);
    }
    category.items.push(item);
  }

  const categories = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const category of categories) {
    category.items.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { categories, fetchedAt: new Date().toISOString() };
}

/* -------------------------------- Orders -------------------------------- */

interface SquareOrder {
  id: string;
  state?: string;
  version?: number;
  reference_id?: string;
  location_id?: string;
  created_at?: string;
  updated_at?: string;
  total_money?: CatalogMoney;
  line_items?: {
    uid?: string;
    name?: string;
    quantity?: string;
    catalog_object_id?: string;
    total_money?: CatalogMoney;
  }[];
  fulfillments?: { uid?: string; state?: string; type?: string }[];
}

export function toOrderSummary(order: SquareOrder): OrderSummary {
  return {
    id: order.id,
    state: (order.state as OrderSummary["state"]) ?? "OPEN",
    version: order.version ?? 0,
    referenceId: order.reference_id ?? null,
    tableNumber: parseTableNumber(order.reference_id),
    totalAmount: typeof order.total_money?.amount === "number" ? order.total_money.amount : null,
    currency: order.total_money?.currency ?? "USD",
    createdAt: order.created_at ?? null,
    updatedAt: order.updated_at ?? null,
    lineItems: (order.line_items ?? []).map((line) => ({
      uid: line.uid ?? null,
      name: line.name ?? "Item",
      quantity: line.quantity ?? "1",
      catalogObjectId: line.catalog_object_id ?? null,
      totalAmount: typeof line.total_money?.amount === "number" ? line.total_money.amount : null,
      currency: line.total_money?.currency ?? "USD",
    })),
  };
}

export async function searchOrders(options: {
  states: string[];
  sinceHours: number;
  limit?: number;
}): Promise<SquareOrder[]> {
  const { locationId } = getSquareConfig();
  const startAt = new Date(Date.now() - options.sinceHours * 60 * 60 * 1000).toISOString();
  const result = await squareFetch<{ orders?: SquareOrder[] }>("/v2/orders/search", {
    method: "POST",
    body: {
      location_ids: [locationId],
      limit: options.limit ?? 200,
      query: {
        filter: {
          state_filter: { states: options.states },
          date_time_filter: { updated_at: { start_at: startAt } },
        },
        sort: { sort_field: "UPDATED_AT", sort_order: "DESC" },
      },
    },
  });
  return result.orders ?? [];
}

export async function retrieveOrder(orderId: string): Promise<SquareOrder> {
  const result = await squareFetch<{ order: SquareOrder }>(
    `/v2/orders/${encodeURIComponent(orderId)}`,
  );
  return result.order;
}

export async function findOpenOrderForTable(tableNumber: number): Promise<OrderSummary | null> {
  const reference = tableReferenceId(tableNumber);
  const orders = await searchOrders({ states: ["OPEN"], sinceHours: 24 });
  const match = orders.find((order) => order.reference_id === reference);
  return match ? toOrderSummary(match) : null;
}

export interface NewLine {
  catalogObjectId: string;
  quantity: number;
  name: string;
}

export async function createOrder(
  tableNumber: number,
  lines: NewLine[],
): Promise<OrderSummary> {
  const { locationId } = getSquareConfig();
  const result = await squareFetch<{ order: SquareOrder }>("/v2/orders", {
    method: "POST",
    body: {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: locationId,
        reference_id: tableReferenceId(tableNumber),
        // Dine-in orders surface in the Square Dashboard / POS open-ticket list
        // through ticket_name, the same way POS-created dine-in tickets do.
        // A PICKUP fulfillment routed them into the pickup queue instead, and
        // IN_STORE is rejected by the Orders API, so no fulfillment is sent.
        ticket_name: `Table ${tableNumber}`,
        state: "OPEN",
        source: { name: "Table Ordering" },
        line_items: lines.map((line) => ({
          catalog_object_id: line.catalogObjectId,
          quantity: String(line.quantity),
          name: line.name,
        })),
      },
    },
  });
  return toOrderSummary(result.order);
}

export async function appendLinesToOrder(
  orderId: string,
  lines: NewLine[],
): Promise<OrderSummary> {
  const { locationId } = getSquareConfig();
  const current = await retrieveOrder(orderId);
  const result = await squareFetch<{ order: SquareOrder }>(
    `/v2/orders/${encodeURIComponent(orderId)}`,
    {
      method: "PUT",
      body: {
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: current.location_id ?? locationId,
          version: current.version,
          line_items: lines.map((line) => ({
            catalog_object_id: line.catalogObjectId,
            quantity: String(line.quantity),
            name: line.name,
          })),
        },
      },
    },
  );
  return toOrderSummary(result.order);
}

async function updateOrderState(
  order: SquareOrder,
  state: "COMPLETED" | "CANCELED",
): Promise<SquareOrder> {
  const { locationId } = getSquareConfig();
  const result = await squareFetch<{ order: SquareOrder }>(
    `/v2/orders/${encodeURIComponent(order.id)}`,
    {
      method: "PUT",
      body: {
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: order.location_id ?? locationId,
          version: order.version,
          state,
        },
      },
    },
  );
  return result.order;
}

/**
 * Closes an order after payment was taken at the POS.
 * Completes open fulfillments first, then COMPLETED, falling back to CANCELED
 * when Square refuses to complete an unpaid order.
 */
export async function closeOrder(orderId: string): Promise<OrderSummary> {
  const { locationId } = getSquareConfig();
  let current = await retrieveOrder(orderId);

  const openFulfillments = (current.fulfillments ?? []).filter(
    (f) => f.uid && f.state !== "COMPLETED" && f.state !== "CANCELED",
  );
  if (openFulfillments.length > 0) {
    const result = await squareFetch<{ order: SquareOrder }>(
      `/v2/orders/${encodeURIComponent(orderId)}`,
      {
        method: "PUT",
        body: {
          idempotency_key: crypto.randomUUID(),
          order: {
            location_id: current.location_id ?? locationId,
            version: current.version,
            fulfillments: openFulfillments.map((f) => ({ uid: f.uid, state: "COMPLETED" })),
          },
        },
      },
    );
    current = result.order;
  }

  try {
    return toOrderSummary(await updateOrderState(current, "COMPLETED"));
  } catch (error) {
    if (!(error instanceof SquareApiError)) throw error;
    const refreshed = await retrieveOrder(orderId);
    return toOrderSummary(await updateOrderState(refreshed, "CANCELED"));
  }
}

export async function listRecentOrders(hours: number): Promise<OrderSummary[]> {
  const orders = await searchOrders({
    states: ["OPEN", "COMPLETED", "CANCELED"],
    sinceHours: hours,
  });
  return orders.map(toOrderSummary);
}

export function verifyAdminPin(pin: string): boolean {
  const expected = process.env["ADMIN_PIN"];
  if (!expected) return false;
  if (pin.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= pin.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
