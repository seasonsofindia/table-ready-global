import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Check,
  ChefHat,
  CircleCheckBig,
  Loader2,
  Maximize,
  Minimize,
  RefreshCw,
  RotateCw,


  Settings2,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getKitchenOrders, updateOrderService } from "@/lib/square.functions";
import {
  EMPTY_META_VALUE,
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


type OrdersData = { orders: OrderSummary[] };

/**
 * Paid (completed) Square orders can no longer be updated, so their served
 * state is kept on this device and merged over the order metadata.
 */
const LOCAL_SERVICE_KEY = "kds-local-service";
type LocalService = Record<string, { served: string[]; fulfilled: boolean }>;

function readLocalService(): LocalService {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SERVICE_KEY) ?? "{}") as LocalService;
  } catch {
    return {};
  }
}

function writeLocalService(next: LocalService) {
  try {
    window.localStorage.setItem(LOCAL_SERVICE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

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

type LineGroup = { name: string; lines: { line: OrderSummary["lineItems"][number]; index: number }[] };

/** Groups line items by menu category while keeping each line's original index. */
function groupByCategory(lines: OrderSummary["lineItems"]): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  lines.forEach((line, index) => {
    const name = line.categoryName?.trim() || "Other";
    let group = groups.get(name);
    if (!group) {
      group = { name, lines: [] };
      groups.set(name, group);
    }
    group.lines.push({ line, index });
  });
  return [...groups.values()];
}


function KitchenScreen() {
  const kitchenFn = useServerFn(getKitchenOrders);
  const serviceFn = useServerFn(updateOrderService);
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [tab, setTab] = useState<"active" | "served">("active");
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localService, setLocalService] = useState<LocalService>({});

  useEffect(() => {
    setLocalService(readLocalService());
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    if (window.localStorage.getItem("kds-refresh-mode") === "manual") setAutoRefresh(false);
    const saved = Number(window.localStorage.getItem("kds-rotation"));
    if (saved === 90 || saved === 180 || saved === 270) setRotation(saved);
  }, []);

  const rotateScreen = () => {
    setRotation((prev) => {
      const next = ((prev + 90) % 360) as 0 | 90 | 180 | 270;
      window.localStorage.setItem("kds-rotation", String(next));
      return next;
    });
  };

  const toggleRefresh = () => {
    setAutoRefresh((prev) => {
      const next = !prev;
      window.localStorage.setItem("kds-refresh-mode", next ? "auto" : "manual");
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

  const rememberLocally = (vars: { orderId: string; servedTokens: string[]; fulfilled: boolean }) => {
    setLocalService((prev) => {
      const next = { ...prev, [vars.orderId]: { served: vars.servedTokens, fulfilled: vars.fulfilled } };
      writeLocalService(next);
      return next;
    });
  };

  const serviceMutation = useMutation({
    mutationFn: (vars: { orderId: string; servedTokens: string[]; fulfilled: boolean }) =>
      serviceFn({ data: vars }),
    onSuccess: (result) => {
      // Only the changed order is replaced — no full reload.
      patchOrder(result.order.id, () => result.order);
    },
    onError: (_error, vars) => {
      // Paid/closed orders can't be updated in Square — keep the state on this screen.
      rememberLocally(vars);
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
    if (localService[order.id]) rememberLocally({ orderId: order.id, servedTokens, fulfilled });
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

  const allOrders = (ordersQuery.data?.orders ?? []).map((order) => {
    const local = localService[order.id];
    if (!local) return order;
    return {
      ...order,
      metadata: {
        ...order.metadata,
        ...serializeServedTokens(local.served),
        kds_fulfilled_at: local.fulfilled ? new Date().toISOString() : EMPTY_META_VALUE,
      },
    };
  });

  const activeOrders = allOrders.filter((o) => !isServiceFulfilled(o));
  const servedOrders = allOrders.filter((o) => isServiceFulfilled(o));
  const visible = tab === "active" ? activeOrders : servedOrders;

  // TV-optimized dense grid: row-major, receive-order flow, with each tile height based on its own content size.
  const gridColumns = rotation === 90 || rotation === 270 ? 2 : 3;
  const tileAreaStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
    gridAutoFlow: "row",
    alignItems: "start",
    alignContent: "start",
    gap: "1rem",
    height: "100%",
    overflow: "hidden",
  } as const;

  const content = (
    <main className="mx-auto min-h-screen w-full max-w-[1800px] px-3 py-4 sm:px-4 sm:py-6 flex flex-col">

      <header className="flex flex-wrap items-center justify-end gap-2">
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
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          onClick={() => setShowOptions((v) => !v)}
        >
          {showOptions ? "Hide options" : "Show options"}
        </Button>
      </header>

      {showOptions && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <ChefHat className="size-6 text-primary" />
              Kitchen Display
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeOrders.length} active · {servedOrders.length} served
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-11" onClick={rotateScreen}>
              <RotateCw className="mr-1 size-4" />
              Rotate {rotation}°
            </Button>
            <Button variant="outline" size="sm" className="h-11" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="mr-1 size-4" /> : <Maximize className="mr-1 size-4" />}
              {isFullscreen ? "Exit full screen" : "Full screen"}
            </Button>


            <Button variant={autoRefresh ? "secondary" : "outline"} size="sm" className="h-11" onClick={toggleRefresh}>
              {autoRefresh ? "Auto refresh" : "Manual refresh"}
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
        </div>
      )}

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
        <div className="mt-6 flex-1 overflow-hidden" style={tileAreaStyle}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="mb-4 block h-56 w-full rounded-xl" />
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
        <div className="mt-6 flex-1 overflow-hidden" style={tileAreaStyle}>
          {[...visible]
            .sort((a, b) => {
              const ta = new Date(a.createdAt ?? 0).getTime();
              const tb = new Date(b.createdAt ?? 0).getTime();
              return ta - tb;
            })
            .map((order) => {
              const cardHeight = 150 + order.lineItems.length * 28 + (order.lineItems.reduce((sum, line) => sum + (line.modifiers?.length ?? 0), 0) * 8);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  busy={serviceMutation.isPending && serviceMutation.variables?.orderId === order.id}
                  onToggleItem={(token) => toggleItem(order, token)}
                  onMarkServed={() => applyService(order, order.lineItems.map((l, i) => lineToken(l, i)), true)}
                  onReopen={() => applyService(order, [...parseServedTokens(order.metadata)], false)}
                  height={cardHeight}
                />
              );
            })}
        </div>
      )}

      {ordersQuery.isFetching && !ordersQuery.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Refreshing…
        </p>
      ) : null}
    </main>
  );

  if (rotation === 0) return content;

  const quarter = rotation === 90 || rotation === 270;
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        className="origin-top-left overflow-auto"
        style={{
          width: quarter ? "100vh" : "100vw",
          height: quarter ? "100vw" : "100vh",
          transform:
            rotation === 90
              ? "rotate(90deg) translateY(-100%)"
              : rotation === 180
                ? "rotate(180deg) translate(-100%, -100%)"
                : "rotate(270deg) translateX(-100%)",
        }}
      >
        {content}
      </div>
    </div>
  );
}


function OrderCard({
  order,
  busy,
  onToggleItem,
  onMarkServed,
  onReopen,
  height,
}: {
  order: OrderSummary;
  busy: boolean;
  onToggleItem: (token: string) => void;
  onMarkServed: () => void;
  onReopen: () => void;
  height?: number;
}) {
  const served = parseServedTokens(order.metadata);
  const status = serviceStatus(order);
  const total = order.lineItems.length;
  const done = order.lineItems.filter((line, i) => served.has(lineToken(line, i))).length;
  const allDone = total > 0 && done === total;

  // Local per-client seen tokens so newly added lines can be marked "New".
  const seenKey = `kds_seen_${order.id}`;
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(seenKey);
      return raw ? new Set(raw.split(",").filter(Boolean)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Initialize seen snapshot on first render for this order (if missing)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(seenKey);
      if (!raw) {
        const initial = order.lineItems.map((l, i) => lineToken(l, i)).join(",");
        window.localStorage.setItem(seenKey, initial);
        setSeen(new Set(initial.split(",").filter(Boolean)));
      }
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // When items become served, mark them as seen so badge disappears.
  useEffect(() => {
    try {
      const s = new Set(seen);
      for (const t of served) s.add(t);
      const arr = [...s];
      window.localStorage.setItem(seenKey, arr.join(","));
      setSeen(s);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(served).join(",")]);

  const cardTone =
    status === "SERVED"
      ? "border-primary/50 bg-primary/5"
      : status === "PARTIAL"
        ? "border-amber-500/60 bg-amber-500/5"
        : "bg-card";

  return (
    <article
      className={`mb-4 w-full break-inside-avoid rounded-xl border p-5 shadow-sm text-base ${cardTone} flex flex-col self-start`}
      style={height ? { minHeight: height } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-3xl font-bold leading-tight tracking-tight">
          {orderDisplayName(order)}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant={sourceVariant(order)} className="text-sm h-6">
            {orderSourceLabel(order)}
          </Badge>
          {orderSourceKind(order) === "POS" && status !== "SERVED" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={!allDone || busy}
              onClick={onMarkServed}
            >
              Served
            </Button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {elapsed(order.createdAt)}
        {order.tableNumber !== null ? ` · Table ${order.tableNumber}` : ""}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge
          variant={status === "SERVED" ? "default" : status === "PARTIAL" ? "secondary" : "outline"}
          className="text-sm h-6"
        >
          {status === "SERVED"
            ? "Served"
            : allDone
              ? "Ready to close"
              : status === "PARTIAL"
                ? "Partially served"
                : "New"}
        </Badge>
        <span className="text-sm font-medium text-muted-foreground">
          {done} of {total} items served
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {groupByCategory(order.lineItems).map((group) => (
          <div key={group.name} className="break-inside-avoid mb-3">
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
            </p>
            <ul className="space-y-1">
              {group.lines.map(({ line, index }) => {
                const token = lineToken(line, index);
                const checked = served.has(token);
                return (
                  <li key={line.uid ?? index}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      disabled={busy}
                      onClick={() => onToggleItem(token)}
                      className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left text-base transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      <span
                        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border ${
                          checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        }`}
                      >
                        {checked ? <Check className="size-4" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`block break-words ${
                              checked ? "text-muted-foreground line-through" : ""
                            }`}
                          >
                            {line.quantity} × {line.name}
                          </span>
                          {/* New badge for newly added lines (per-client localStorage) */}
                          {(!checked && !seen.has(token)) ? (
                            <Badge variant="secondary" className="text-xs h-5 px-2">
                              New
                            </Badge>
                          ) : null}
                        </div>
                        {(line.modifiers ?? []).length > 0 ? (
                          <span
                            className={`block text-sm font-bold text-destructive ${
                              checked ? "opacity-60 line-through" : ""
                            }`}
                          >
                            {(line.modifiers ?? []).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>



      {status === "SERVED" ? (
        <Button variant="outline" className="mt-3 h-11 w-full" disabled={busy} onClick={onReopen}>
          Move back to active
        </Button>
      ) : null}
    </article>
  );
}
