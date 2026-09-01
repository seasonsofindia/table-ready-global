import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Check,
  ChefHat,
  CircleCheckBig,
  Loader2,
  RefreshCw,
  Settings2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getKitchenOrders, updateOrderService } from "@/lib/square.functions";
import {
  EMPTY_META_VALUE,
  formatMoney,
  isServiceFulfilled,
  lineToken,
  orderDisplayName,
  orderSourceKind,
  orderSourceLabel,
  parseServedTokens,
  serializeServedTokens,
  serviceStatus,
  type OrderSummary,
} from "@/types/square";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kitchen Display — Table Orders" },
      {
        name: "description",
        content: "Live kitchen display of open POS, online and app orders with item handoff tracking.",
      },
      { property: "og:title", content: "Kitchen Display — Table Orders" },
      {
        property: "og:description",
        content: "Live kitchen display of open POS, online and app orders with item handoff tracking.",
      },
    ],
  }),
  component: KitchenScreen,
});

const REFRESH_MODE_KEY = "kds-refresh-mode";
type OrdersData = { orders: OrderSummary[] };

function elapsed(createdAt: string | null): string {
  if (!createdAt) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function sourceVariant(order: OrderSummary) {
  const kind = orderSourceKind(order);
  if (kind === "POS") return "default" as const;
  if (kind === "ONLINE") return "secondary" as const;
  return "outline" as const;
}

function KitchenScreen() {
  const kitchenFn = useServerFn(getKitchenOrders);
  const serviceFn = useServerFn(updateOrderService);
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [tab, setTab] = useState<"active" | "served">("active");

  useEffect(() => {
    if (window.localStorage.getItem(REFRESH_MODE_KEY) === "manual") setAutoRefresh(false);
  }, []);

  const toggleRefresh = () => {
    setAutoRefresh((prev) => {
      const next = !prev;
      window.localStorage.setItem(REFRESH_MODE_KEY, next ? "auto" : "manual");
      return next;
    });
  };

  const ordersQuery = useQuery({
    queryKey: ["kitchen-orders"],
    queryFn: () => kitchenFn({ data: { hours: 12 } }),
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchOnWindowFocus: autoRefresh,
    refetchOnReconnect: autoRefresh,
    retry: false,
  });

  const patchOrder = (orderId: string, patch: (order: OrderSummary) => OrderSummary) => {
    queryClient.setQueryData<OrdersData>(["kitchen-orders"], (prev) =>
      prev
        ? { orders: prev.orders.map((o) => (o.id === orderId ? patch(o) : o)) }
        : prev,
    );
  };

  const serviceMutation = useMutation({
    mutationFn: (vars: { orderId: string; servedTokens: string[]; fulfilled: boolean }) =>
      serviceFn({ data: vars }),
    onSuccess: (result) => {
      // Only the changed order is replaced — no full reload.
      patchOrder(result.order.id, () => result.order);
    },
    onError: (error, vars) => {
      toast.error(error instanceof Error ? error.message : "Could not update order");
      // Roll back by refetching just this order's state from the list.
      void queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      void vars;
    },
  });

  const applyService = (order: OrderSummary, servedTokens: string[], fulfilled: boolean) => {
    // Optimistic: reflect the new metadata locally right away.
    patchOrder(order.id, (o) => ({
      ...o,
      metadata: {
        ...o.metadata,
        ...serializeServedTokens(servedTokens),
        kds_fulfilled_at: fulfilled ? new Date().toISOString() : EMPTY_META_VALUE,
      },
    }));
    serviceMutation.mutate({ orderId: order.id, servedTokens, fulfilled });
  };

  const toggleItem = (order: OrderSummary, token: string) => {
    const served = parseServedTokens(order.metadata);
    if (served.has(token)) served.delete(token);
    else served.add(token);
    // Unchecking an item pulls the order back out of Served.
    const allDone = order.lineItems.every((line, i) => served.has(lineToken(line, i)));
    applyService(order, [...served], isServiceFulfilled(order) && allDone);
  };

  const allOrders = ordersQuery.data?.orders ?? [];
  const activeOrders = allOrders.filter((o) => !isServiceFulfilled(o));
  const servedOrders = allOrders.filter((o) => isServiceFulfilled(o));
  const visible = tab === "active" ? activeOrders : servedOrders;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ChefHat className="size-7 text-primary" />
            Kitchen Display
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeOrders.length} active · {servedOrders.length} served
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={autoRefresh ? "secondary" : "outline"} size="sm" className="h-11" onClick={toggleRefresh}>
            {autoRefresh ? "Auto refresh" : "Manual refresh"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            disabled={ordersQuery.isFetching}
            onClick={() => void ordersQuery.refetch()}
          >
            <RefreshCw className={`mr-1 size-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link to="/order" aria-label="New order">
              <UtensilsCrossed className="size-5" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link to="/admin" aria-label="Admin">
              <Settings2 className="size-5" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="mt-5 inline-flex rounded-lg border bg-muted/40 p-1" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "active"}
          onClick={() => setTab("active")}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Active orders ({activeOrders.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "served"}
          onClick={() => setTab("served")}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "served" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Served ({servedOrders.length})
        </button>
      </div>

      {ordersQuery.isPending ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : ordersQuery.isError ? (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load orders</p>
          <p className="mt-1 text-muted-foreground">
            {ordersQuery.error instanceof Error ? ordersQuery.error.message : "Something went wrong."}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          {tab === "active" ? "No active orders right now." : "Nothing served yet."}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={serviceMutation.isPending && serviceMutation.variables?.orderId === order.id}
              onToggleItem={(token) => toggleItem(order, token)}
              onMarkServed={() =>
                applyService(order, order.lineItems.map((l, i) => lineToken(l, i)), true)
              }
              onReopen={() => applyService(order, [...parseServedTokens(order.metadata)], false)}
            />
          ))}
        </div>
      )}

      {ordersQuery.isFetching && !ordersQuery.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Refreshing…
        </p>
      ) : null}
    </main>
  );
}

function OrderCard({
  order,
  busy,
  onToggleItem,
  onMarkServed,
  onReopen,
}: {
  order: OrderSummary;
  busy: boolean;
  onToggleItem: (token: string) => void;
  onMarkServed: () => void;
  onReopen: () => void;
}) {
  const served = parseServedTokens(order.metadata);
  const status = serviceStatus(order);
  const total = order.lineItems.length;
  const done = order.lineItems.filter((line, i) => served.has(lineToken(line, i))).length;
  const allDone = total > 0 && done === total;

  const cardTone =
    status === "SERVED"
      ? "border-primary/50 bg-primary/5"
      : status === "PARTIAL"
        ? "border-amber-500/60 bg-amber-500/5"
        : "bg-card";

  return (
    <article className={`rounded-xl border p-4 shadow-sm ${cardTone}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-2xl font-bold leading-tight tracking-tight">
          {orderDisplayName(order)}
        </h2>
        <Badge variant={sourceVariant(order)}>{orderSourceLabel(order)}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {elapsed(order.createdAt)}
        {order.tableNumber !== null ? ` · Table ${order.tableNumber}` : ""}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge
          variant={status === "SERVED" ? "default" : status === "PARTIAL" ? "secondary" : "outline"}
        >
          {status === "SERVED"
            ? "Served"
            : allDone
              ? "Ready to close"
              : status === "PARTIAL"
                ? "Partially served"
                : "New"}
        </Badge>
        <span className="text-xs font-medium text-muted-foreground">
          {done} of {total} items served
        </span>
      </div>

      <ul className="mt-3 space-y-1">
        {order.lineItems.map((line, index) => {
          const token = lineToken(line, index);
          const checked = served.has(token);
          return (
            <li key={line.uid ?? index}>
              <button
                type="button"
                aria-pressed={checked}
                disabled={busy}
                onClick={() => onToggleItem(token)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  }`}
                >
                  {checked ? <Check className="size-3.5" /> : null}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    checked ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {line.quantity} × {line.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatMoney(line.totalAmount, line.currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
        <span>Total</span>
        <span>{formatMoney(order.totalAmount, order.currency)}</span>
      </div>

      {status === "SERVED" ? (
        <Button variant="outline" className="mt-3 h-11 w-full" disabled={busy} onClick={onReopen}>
          Move back to active
        </Button>
      ) : (
        <Button className="mt-3 h-11 w-full" disabled={!allDone || busy} onClick={onMarkServed}>
          <CircleCheckBig className="mr-1 size-4" />
          {allDone ? "Mark as served" : `Check all items (${done}/${total})`}
        </Button>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Service status only — payment is unchanged in Square.
      </p>
    </article>
  );
}
