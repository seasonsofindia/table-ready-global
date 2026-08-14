import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney, type CartItem } from "@/types/square";

interface CartPanelProps {
  items: CartItem[];
  onChangeQuantity: (variationId: string, quantity: number) => void;
  onClear: () => void;
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0) * item.quantity, 0);
}

export function CartPanel({ items, onChangeQuantity, onClear }: CartPanelProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Cart is empty. Tap Add on a menu item to start.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <li key={item.variationId} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.itemName}</p>
              <p className="text-xs text-muted-foreground">
                {item.variationName} · {formatMoney(item.amount, item.currency)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                aria-label={`Decrease ${item.itemName}`}
                onClick={() => onChangeQuantity(item.variationId, item.quantity - 1)}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                aria-label={`Increase ${item.itemName}`}
                onClick={() => onChangeQuantity(item.variationId, item.quantity + 1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="mr-1 size-4" />
          Clear cart
        </Button>
        <p className="text-base font-semibold">
          Subtotal {formatMoney(cartTotal(items), items[0]?.currency ?? "USD")}
        </p>
      </div>
    </div>
  );
}
