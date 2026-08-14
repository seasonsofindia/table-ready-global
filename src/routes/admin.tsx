import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { checkAdminPin, getRecentOrders } from "@/lib/square.functions";
import { formatMoney, type OrderSummary } from "@/types/square";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Table Orders" },
      {
        name: "description",
        content: "Staff view: recent Square orders, table activity and cleanup settings.",
      },
      { property: "og:title", content: "Admin — Table Orders" },
      {
        property: "og:description",
        content: "Staff view: recent Square orders, table activity and cleanup settings.",
      },
    ],
  }),
  component: AdminScreen,
});

function AdminScreen() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Staff only</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-1 size-4" />
            Ordering
          </Link>
        </Button>
      </header>

      {unlocked ? <AdminContent /> : <PinGate onUnlock={() => setUnlocked(true)} />}
    </main>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const verify = useServerFn(checkAdminPin);

  const mutation = useMutation({
    mutationFn: async (value: string) => verify({ data: { pin: value } }),
    onSuccess: (result) => {
      if (result.ok) {
        onUnlock();
      } else {
        toast.error("Incorrect PIN");
      }
    },
    onError: () => toast.error("Could not check the PIN"),
  });

  return (
    <form
      className="mx-auto mt-16 max-w-sm rounded-xl border bg-card p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (pin) mutation.mutate(pin);
      }}
    >
      <ShieldCheck className="size-8 text-primary" />
      <h2 className="mt-3 text-xl font-semibold">Enter staff PIN</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A convenience lock for shared tablets, not account security.
      </p>
      <Label htmlFor="pin" className="mt-4 block">
        PIN
      </Label>
      <Input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="mt-1 h-12 text-base"
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

function stateVariant(state: OrderSummary["state"]) {
  if (state === "OPEN") return "default" as const;
  if (state === "COMPLETED") return "secondary" as const;
  return "outline" as const;
}

function AdminContent() {
  const [autoClear, setAutoClear] = useState(false);
  const recentFn = useServerFn(getRecentOrders);

  const ordersQuery = useQuery({
    queryKey: ["recent-orders"],
    queryFn: () => recentFn({ data: { hours: 72 } }),
    retry: false,
  });

  const orders = ordersQuery.data?.orders ?? [];

  const analytics = useMemo(() => {
    const perTable = new Map<string, number>();
    const perItem = new Map<string, number>();
    for (const order of orders) {
      const key = order.tableNumber ? `Table ${order.tableNumber}` : "Other";
      perTable.set(key, (perTable.get(key) ?? 0) + 1);
      for (const line of order.lineItems) {
        const quantity = Number(line.quantity) || 0;
        perItem.set(line.name, (perItem.get(line.name) ?? 0) + quantity);
      }
    }
    const sort = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { perTable: sort(perTable), perItem: sort(perItem) };
  }, [orders]);

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Cleanup mode</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {autoClear
                ? "Auto-clear: orders drop off when Square reports them as no longer open. Requires the webhook signature key."
                : "Manual clear: staff tap “Mark as paid” on the table's current order."}
            </p>
          </div>
          <Switch
            checked={autoClear}
            onCheckedChange={setAutoClear}
            aria-label="Auto-clear via webhook"
          />
        </div>
        {autoClear ? (
          <p className="mt-3 rounded-lg bg-secondary p-3 text-xs text-secondary-foreground">
            Webhook endpoint: <code>/api/public/square-webhook</code>. Add
            <code> SQUARE_WEBHOOK_SIGNATURE_KEY</code> and point Square's <code>order.updated</code>{" "}
            event at this URL. Until then the app keeps using manual clear.
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent orders (72h)</h2>
          <Button
            variant="outline"
            size="sm"
            disabled={ordersQuery.isFetching}
            onClick={() => void ordersQuery.refetch()}
          >
            <RefreshCw className={`mr-1 size-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {ordersQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : ordersQuery.isError ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {ordersQuery.error instanceof Error ? ordersQuery.error.message : "Request failed"}
          </p>
        ) : orders.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No orders in the last 72 hours.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {order.tableNumber ? `Table ${order.tableNumber}` : (order.referenceId ?? "—")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.lineItems.map((l) => `${l.quantity}× ${l.name}`).join(", ") || "No items"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">
                    {formatMoney(order.totalAmount, order.currency)}
                  </span>
                  <Badge variant={stateVariant(order.state)}>{order.state}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Orders per table</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {analytics.perTable.map(([label, count]) => (
              <li key={label} className="flex justify-between">
                <span>{label}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
            {analytics.perTable.length === 0 ? (
              <li className="text-muted-foreground">No data yet.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Popular items</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {analytics.perItem.map(([label, count]) => (
              <li key={label} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{label}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
            {analytics.perItem.length === 0 ? (
              <li className="text-muted-foreground">No data yet.</li>
            ) : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
