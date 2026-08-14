import { CheckCircle2, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, type OrderSummary } from "@/types/square";

interface CurrentOrderPanelProps {
  order: OrderSummary;
  busy: boolean;
  onMarkPaid: () => void;
  onStartNew: () => void;
}

export function CurrentOrderPanel({
  order,
  busy,
  onMarkPaid,
  onStartNew,
}: CurrentOrderPanelProps) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Current order</h2>
        <Badge variant="secondary">{order.state}</Badge>
      </div>
      <p className="mt-1 break-all text-xs text-muted-foreground">ID {order.id}</p>

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

      <div className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
        <span>Total</span>
        <span>{formatMoney(order.totalAmount, order.currency)}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="h-11" disabled={busy} onClick={onStartNew}>
          <RotateCcw className="mr-1 size-4" />
          Clear and start new
        </Button>
        <Button className="h-11" disabled={busy} onClick={onMarkPaid}>
          <CheckCircle2 className="mr-1 size-4" />
          Mark as paid
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Payment is taken at the Square POS terminal. Marking as paid only clears the table here.
      </p>
    </div>
  );
}
