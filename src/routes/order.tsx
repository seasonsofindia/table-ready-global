import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw, Settings2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { CartPanel, cartTotal } from "@/components/CartPanel";
import { CurrentOrderPanel } from "@/components/CurrentOrderPanel";
import { MenuList } from "@/components/MenuList";
import { TableSelector } from "@/components/TableSelector";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addToTableOrder,
  closeTableOrder,
  createTableOrder,
  getMenu,
  getOpenOrderForTable,
} from "@/lib/square.functions";
import { formatMoney, type CartItem, type MenuItem, type MenuVariation } from "@/types/square";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Table Orders — Send orders to the kitchen" },
      {
        name: "description",
        content:
          "Pick a table, build the order from the live Square menu, and send it straight to the kitchen.",
      },
      { property: "og:title", content: "Table Orders — Send orders to the kitchen" },
      {
        property: "og:description",
        content:
          "Pick a table, build the order from the live Square menu, and send it straight to the kitchen.",
      },
    ],
  }),
  component: OrderScreen,
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function OrderScreen() {
  const queryClient = useQueryClient();
  const [table, setTable] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const menuFn = useServerFn(getMenu);
  const openOrderFn = useServerFn(getOpenOrderForTable);
  const createFn = useServerFn(createTableOrder);
  const addFn = useServerFn(addToTableOrder);
  const closeFn = useServerFn(closeTableOrder);

  const menuQuery = useQuery({
    queryKey: ["menu"],
    queryFn: () => menuFn(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const openOrderQuery = useQuery({
    queryKey: ["open-order", table],
    queryFn: () => openOrderFn({ data: { tableNumber: table as number } }),
    enabled: table !== null,
    retry: false,
  });

  const existingOrder = openOrderQuery.data?.order ?? null;

  const addToCart = useCallback((item: MenuItem, variation: MenuVariation) => {
    setCart((current) => {
      const existing = current.find((line) => line.variationId === variation.id);
      if (existing) {
        return current.map((line) =>
          line.variationId === variation.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          variationId: variation.id,
          itemId: item.id,
          itemName: item.name,
          variationName: variation.name,
          amount: variation.amount,
          currency: variation.currency,
          quantity: 1,
        },
      ];
    });
    toast.success(`${item.name} added`);
  }, []);

  const changeQuantity = useCallback((variationId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.variationId !== variationId)
        : current.map((line) => (line.variationId === variationId ? { ...line, quantity } : line)),
    );
  }, []);

  const lines = useMemo(
    () =>
      cart.map((item) => ({
        catalogObjectId: item.variationId,
        quantity: item.quantity,
        name: item.itemName,
      })),
    [cart],
  );

  const submit = useMutation({
    mutationFn: async (mode: "new" | "append") => {
      if (table === null) throw new Error("Select a table first.");
      if (mode === "append" && existingOrder) {
        return addFn({ data: { orderId: existingOrder.id, lines } });
      }
      return createFn({ data: { tableNumber: table, lines } });
    },
    onSuccess: (result) => {
      setCart([]);
      setLastOrderId(result.order.id);
      void queryClient.invalidateQueries({ queryKey: ["open-order", table] });
      toast.success("Order sent to kitchen", { description: `Order ID ${result.order.id}` });
    },
    onError: (error) => {
      toast.error("Square rejected the order", { description: errorMessage(error) });
    },
  });

  const close = useMutation({
    mutationFn: async (orderId: string) => closeFn({ data: { orderId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["open-order", table] });
      toast.success("Table cleared");
    },
    onError: (error) => {
      toast.error("Could not clear the order", { description: errorMessage(error) });
    },
  });

  const busy = submit.isPending || close.isPending;
  const duplicates = existingOrder
    ? cart.filter((line) =>
        existingOrder.lineItems.some((existing) => existing.catalogObjectId === line.variationId),
      )
    : [];

  const handleSubmit = (mode: "new" | "append") => {
    if (mode === "append" && duplicates.length > 0) {
      const names = duplicates.map((d) => d.itemName).join(", ");
      const confirmed = window.confirm(
        `${names} ${duplicates.length === 1 ? "is" : "are"} already on this order. Add the extra quantity anyway?`,
      );
      if (!confirmed) return;
    }
    submit.mutate(mode);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-40 pt-6 lg:pb-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <UtensilsCrossed className="size-7 text-primary" />
            Table Tab
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your table to the kitchen
          </p>
        </div>
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link to="/admin" aria-label="Admin">
            <Settings2 className="size-5" />
          </Link>
        </Button>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Menu</h2>
            <Button
              variant="outline"
              size="sm"
              disabled={menuQuery.isFetching}
              onClick={() => void menuQuery.refetch()}
            >
              <RefreshCw
                className={`mr-1 size-4 ${menuQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          {menuQuery.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : menuQuery.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Could not load the menu</p>
              <p className="mt-1 text-muted-foreground">{errorMessage(menuQuery.error)}</p>
            </div>
          ) : (
            <MenuList menu={menuQuery.data} disabled={table === null} onAdd={addToCart} />
          )}
        </div>

        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <TableSelector value={table} onChange={setTable} />
            {table === null ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Choose a table before adding items.
              </p>
            ) : null}
          </div>

          {table !== null && openOrderQuery.isFetching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking for an open order…
            </p>
          ) : null}

          {openOrderQuery.isError ? (
            <p className="flex items-start gap-2 rounded-xl border border-accent bg-accent/20 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Could not check for an existing order. A new order will be created.
            </p>
          ) : null}

          {existingOrder ? (
            <CurrentOrderPanel
              order={existingOrder}
              busy={busy}
              onMarkPaid={() => close.mutate(existingOrder.id)}
              onStartNew={() => close.mutate(existingOrder.id)}
            />
          ) : null}

          <div className="hidden lg:block">
            <h2 className="mb-2 text-lg font-semibold">Cart</h2>
            <CartPanel items={cart} onChangeQuantity={changeQuantity} onClear={() => setCart([])} />
            {cart.length > 0 ? (
              <SubmitButtons
                busy={busy}
                hasExisting={Boolean(existingOrder)}
                onSubmit={handleSubmit}
              />
            ) : null}
          </div>

          {lastOrderId ? (
            <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              Order sent to kitchen. <span className="break-all font-medium">{lastOrderId}</span>
            </p>
          ) : null}
        </aside>
      </div>

      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-4 backdrop-blur lg:hidden">
          <div className="mx-auto max-w-5xl space-y-3">
            <CartPanel
              items={cart}
              onChangeQuantity={changeQuantity}
              onClear={() => setCart([])}
            />
            <SubmitButtons
              busy={busy}
              hasExisting={Boolean(existingOrder)}
              onSubmit={handleSubmit}
              total={formatMoney(cartTotal(cart), cart[0]?.currency ?? "USD")}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SubmitButtons({
  busy,
  hasExisting,
  onSubmit,
  total,
}: {
  busy: boolean;
  hasExisting: boolean;
  onSubmit: (mode: "new" | "append") => void;
  total?: string;
}) {
  return (
    <div className="mt-3 grid gap-2">
      {hasExisting ? (
        <Button className="h-12 text-base" disabled={busy} onClick={() => onSubmit("append")}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Add to existing order {total ? `· ${total}` : ""}
        </Button>
      ) : null}
      <Button
        className="h-12 text-base"
        variant={hasExisting ? "outline" : "default"}
        disabled={busy}
        onClick={() => onSubmit("new")}
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Send new order {total && !hasExisting ? `· ${total}` : ""}
      </Button>
    </div>
  );
}
