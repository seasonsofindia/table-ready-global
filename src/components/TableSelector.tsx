import { TABLE_NUMBERS } from "@/types/square";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TableSelectorProps {
  value: number | null;
  onChange: (table: number) => void;
}

export function TableSelector({ value, onChange }: TableSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="table-select" className="text-sm font-medium">
        Select Table
      </Label>
      <Select
        {...(value === null ? {} : { value: String(value) })}
        onValueChange={(next) => onChange(Number(next))}
      >

        <SelectTrigger id="table-select" className="h-14 w-full text-base">
          <SelectValue placeholder="Choose a table…" />
        </SelectTrigger>
        <SelectContent>
          {TABLE_NUMBERS.map((table) => (
            <SelectItem key={table} value={String(table)} className="h-12 text-base">
              Table {table}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
