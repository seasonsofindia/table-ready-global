import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChefHat, Loader2, RefreshCw, Settings2, UtensilsCrossed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getKitchenOrders } from "@/lib/square.functions";
import {
  formatMoney,
  orderDisplayName,
  orderSourceKind,
  orderSourceLabel,
  type OrderSummary,
} from "@/types/square";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kitchen Display — Table Orders" },
      {
        name: "description",
        content: "Live kitchen display of open POS, online and app orders with table and item detail.",
      },
      { property: "og:title", content: "Kitchen Display — Table Orders" },
      {
        property: "og:description",
        content: "Live kitchen display of open POS, online and app orders with table and item detail.",
      },
    ],
  }),
  component: KitchenScreen,
});

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

const REFRESH_MODE_KEY = "kds-refresh-mode";

function KitchenScreen() {
  const kitchenFn = useServerFn(getKitchenOrders);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(REFRESH_MODE_KEY);
    if (stored === "manual") setAutoRefresh(false);
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

  const orders = ordersQuery.data?.orders ?? [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ChefHat className="size-7 text-primary" />
            Kitchen Display
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {orders.length} open {orders.length === 1 ? "order" : "orders"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {ordersQuery.isPending ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : ordersQuery.isError ? (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load orders</p>
          <p className="mt-1 text-muted-foreground">
            {ordersQuery.error instanceof Error ? ordersQuery.error.message : "Something went wrong."}
          </p>
        </div>
      ) : orders.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">No open orders right now.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-xl border bg-card p-4 shadow-sm">
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

              <ul className="mt-3 space-y-1.5">
                {order.lineItems.map((line, index) => (
                  <li key={line.uid ?? index} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {line.quantity} × {line.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatMoney(line.totalAmount, line.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
                <span>Total</span>
                <span>{formatMoney(order.totalAmount, order.currency)}</span>
              </div>
            </article>
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
