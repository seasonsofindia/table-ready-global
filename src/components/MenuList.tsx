import { useState } from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, type Menu, type MenuItem, type MenuVariation } from "@/types/square";

interface MenuListProps {
  menu: Menu;
  disabled: boolean;
  onAdd: (item: MenuItem, variation: MenuVariation) => void;
}

function MenuItemCard({
  item,
  disabled,
  onAdd,
}: {
  item: MenuItem;
  disabled: boolean;
  onAdd: (item: MenuItem, variation: MenuVariation) => void;
}) {
  const available = item.variations.filter((v) => v.available);
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? "");
  const selected = available.find((v) => v.id === selectedId) ?? available[0];
  const soldOut = available.length === 0;

  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm transition-colors",
        soldOut && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug text-card-foreground">{item.name}</h3>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-base font-semibold text-primary">
          {selected ? formatMoney(selected.amount, selected.currency) : "Unavailable"}
        </span>
      </div>

      {available.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {available.map((variation) => (
            <button
              key={variation.id}
              type="button"
              onClick={() => setSelectedId(variation.id)}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
                variation.id === selected?.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary",
              )}
            >
              {variation.name} · {formatMoney(variation.amount, variation.currency)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        {soldOut ? (
          <Badge variant="secondary">Unavailable</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {available.length > 1 ? `${available.length} options` : available[0]?.name}
          </span>
        )}
        <Button
          size="lg"
          className="h-11"
          disabled={soldOut || disabled || !selected}
          onClick={() => selected && onAdd(item, selected)}
        >
          <Plus className="mr-1 size-4" />
          Add
        </Button>
      </div>
    </li>
  );
}

export function MenuList({ menu, disabled, onAdd }: MenuListProps) {
  if (menu.categories.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No catalog items found for this location.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {menu.categories.map((category) => (
        <section key={category.id}>
          <h2 className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 py-2 text-lg font-semibold backdrop-blur">
            {category.name}
          </h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {category.items.map((item) => (
              <MenuItemCard key={item.id} item={item} disabled={disabled} onAdd={onAdd} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
