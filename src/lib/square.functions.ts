import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendLinesToOrder,
  closeOrder,
  createOrder,
  fetchMenu,
  findOpenOrderForTable,
  listKitchenOrders,
  listRecentOrders,
  setOrderService,
  verifyAdminPin,
} from "./square.server";


const lineSchema = z.object({
  catalogObjectId: z.string().min(1).max(192),
  quantity: z.number().int().min(1).max(99),
  name: z.string().min(1).max(255),
});

const tableSchema = z.object({ tableNumber: z.number().int().min(1).max(16) });

export const getMenu = createServerFn({ method: "GET" }).handler(async () => {
  return fetchMenu();
});

export const getOpenOrderForTable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tableSchema.parse(input))
  .handler(async ({ data }) => {
    const order = await findOpenOrderForTable(data.tableNumber);
    return { order };
  });

export const createTableOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ tableNumber: z.number().int().min(1).max(16), lines: z.array(lineSchema).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const order = await createOrder(data.tableNumber, data.lines);
    return { order };
  });

export const addToTableOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().min(1).max(192), lines: z.array(lineSchema).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const order = await appendLinesToOrder(data.orderId, data.lines);
    return { order };
  });

export const closeTableOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().min(1).max(192) }).parse(input))
  .handler(async ({ data }) => {
    const order = await closeOrder(data.orderId);
    return { order };
  });

export const getRecentOrders = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ hours: z.number().int().min(1).max(720) }).parse(input))
  .handler(async ({ data }) => {
    const orders = await listRecentOrders(data.hours);
    return { orders };
  });

export const getKitchenOrders = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ hours: z.number().int().min(1).max(72) }).parse(input))
  .handler(async ({ data }) => {
    const orders = await listKitchenOrders(data.hours);
    return { orders };
  });


export const updateOrderService = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().min(1).max(192),
        servedTokens: z.array(z.string().min(1).max(32)).max(200),
        fulfilled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const order = await setOrderService(data);
    return { order };
  });

export const checkAdminPin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ pin: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    return { ok: verifyAdminPin(data.pin) };
  });
