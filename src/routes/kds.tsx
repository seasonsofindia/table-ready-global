import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkAdminPin, closeTableOrder, getRecentOrders } from "@/lib/square.functions";
import { formatMoney, type OrderSummary } from "@/types/square";

const PIN_STORAGE_KEY = "kds-unlocked";

export const Route = createFileRoute("/kds")({
  head: () => ({
    meta: [
      { title: "Kitchen Display — Table Orders" },
      {
        name: "description",
        content:
          "Live kitchen display of open dining and online orders, built for a tablet on the pass.",
      },
      { property: "og:title", content: "Kitchen Display — Table Orders" },
      {
        property: "og:description",
        content: "Live kitchen display of open dining and online orders for tablets.",
      },
    ],
  }),
  component: KdsScreen,
});

function KdsScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      if (sessionStorage.getItem(PIN_STORAGE_KEY) === "1") setUnlocked(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const unlock = () => {
    try {
      sessionStorage.setItem(PIN_STORAGE_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setUnlocked(true);
  };

  return (
    <main className="min-h-screen w-full bg-neutral-950 px-4 py-4 text-neutral-50">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Kitchen Display</h1>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50"
        >
          <Link to="/">
            <ArrowLeft className="mr-1 size-4" />
            Ordering
          </Link>
        </Button>
      </header>

      {!hydrated ? null : unlocked ? <KdsBoard /> : <PinGate onUnlock={unlock} />}
    </main>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const verify = useServerFn(checkAdminPin);

  const mutation = useMutation({
    mutationFn: async (value: string) => verify({ data: { pin: value } }),
    onSuccess: (result) => {
      if (result.ok) onUnlock();
      else toast.error("Incorrect PIN");
    },
    onError: () => toast.error("Could not check the PIN"),
  });

  return (
    <form
      className="mx-auto mt-20 max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (pin) mutation.mutate(pin);
      }}
    >
      <ShieldCheck className="size-8 text-primary" />
      <h2 className="mt-3 text-xl font-semibold">Enter staff PIN</h2>
      <p className="mt-1 text-sm text-neutral-400">
        A convenience lock for shared tablets, not account security.
      </p>
      <Label htmlFor="kds-pin" className="mt-4 block">
        PIN
      </Label>
      <Input
        id="kds-pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="mt-1 h-12 border-neutral-700 bg-neutral-950 text-base text-neutral-50"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
      />
      <Button type="submit" className="mt-4 h-12 w-full text-base" disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Unlock
      </Button>
    </form>
  );
}

type Filter = "all" | "dining" | "online";

function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

function ageClasses(minutes: number): string {
  if (minutes >= 20) return "border-red-500/70 bg-red-950/30";
  if (minutes >= 10) return "border-amber-500/70 bg-amber-950/20";
  return "border-neutral-800 bg-neutral-900";
}

function orderLabel(order: OrderSummary): string {
  if (order.tableNumber) return `Dining ${order.tableNumber}`;
  if (order.sourceName) return order.sourceName;
  return order.referenceId ?? "Order";
}

function isDining(order: OrderSummary): boolean {
  return order.tableNumber !== null;
}

function KdsBoard() {
  const [filter, setFilter] = useState<Filter>("all");
  const [tick, setTick] = useState(0);
  const queryClient = useQueryClient();
  const recentFn = useServerFn(getRecentOrders);
  const closeFn = useServerFn(closeTableOrder);

  // Re-render every 30s so the age of each ticket stays current.
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const ordersQuery = useQuery({
    queryKey: ["kds-orders"],
    queryFn: () => recentFn({ data: { hours: 12 } }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const bump = useMutation({
    mutationFn: async (orderId: string) => closeFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Ticket bumped");
      void queryClient.invalidateQueries({ queryKey: ["kds-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["recent-orders"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not bump"),
  });

  const open = useMemo(
    () =>
      (ordersQuery.data?.orders ?? [])
        .filter((order) => order.state === "OPEN")
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
    [ordersQuery.data],
  );

  const tickets = useMemo(
    () =>
      open.filter((order) =>
        filter === "all" ? true : filter === "dining" ? isDining(order) : !isDining(order),
      ),
    [open, filter],
  );

  const updatedAt = ordersQuery.dataUpdatedAt
    ? new Date(ordersQuery.dataUpdatedAt).toLocaleTimeString()
    : "—";

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: open.length },
    { key: "dining", label: "Dining", count: open.filter(isDining).length },
    { key: "online", label: "Online", count: open.filter((o) => !isDining(o)).length },
  ];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`h-11 rounded-lg px-4 text-base font-medium transition-colors ${
                filter === item.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-400" data-tick={tick}>
            Updated {updatedAt}
          </span>
          <Button
            variant="outline"
            className="h-11 border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 hover:text-neutral-50"
            disabled={ordersQuery.isFetching}
            onClick={() => void ordersQuery.refetch()}
          >
            <RefreshCw
              className={`mr-1 size-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {ordersQuery.isPending ? (
        <p className="mt-10 text-center text-neutral-400">Loading tickets…</p>
      ) : ordersQuery.isError ? (
        <p className="mt-6 rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-red-200">
          {ordersQuery.error instanceof Error ? ordersQuery.error.message : "Request failed"}
        </p>
      ) : tickets.length === 0 ? (
        <p className="mt-16 text-center text-lg text-neutral-500">No open tickets.</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tickets.map((order) => {
            const minutes = minutesSince(order.createdAt);
            return (
              <article
                key={order.id}
                className={`flex flex-col rounded-xl border p-4 ${ageClasses(minutes)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl font-bold">{orderLabel(order)}</h2>
                  <Badge variant="secondary" className="shrink-0 text-sm">
                    {minutes}m
                  </Badge>
                </div>
                {!isDining(order) && order.sourceName ? (
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-neutral-400">Online</p>
                ) : null}

                <ul className="mt-3 flex-1 space-y-2">
                  {order.lineItems.map((line, index) => (
                    <li key={line.uid ?? index} className="text-lg leading-tight">
                      <span className="font-semibold">{line.quantity}×</span> {line.name}
                      {line.note ? (
                        <span className="mt-0.5 block text-sm italic text-amber-300">
                          {line.note}
                        </span>
                      ) : null}
                    </li>
                  ))}
                  {order.lineItems.length === 0 ? (
                    <li className="text-neutral-500">No items</li>
                  ) : null}
                </ul>

                <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
                  <span className="text-sm text-neutral-400">
                    {formatMoney(order.totalAmount, order.currency)}
                  </span>
                  <Button
                    className="h-12 px-6 text-base"
                    disabled={bump.isPending}
                    onClick={() => bump.mutate(order.id)}
                  >
                    <Check className="mr-1 size-5" />
                    Bump
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
