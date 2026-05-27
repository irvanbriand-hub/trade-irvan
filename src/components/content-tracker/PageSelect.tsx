import { useMemo } from "react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger,
} from "@/components/ui/select";
import { PlatformIcon } from "./PlatformIcon";
import { platformMeta } from "@/lib/content-tracker";
import type { ContentPage } from "@/hooks/useContentPages";

interface PageSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  pages: ContentPage[];
  placeholder?: string;
  className?: string;
  // Tambah opsi "semua" di atas (untuk filter). value-nya "all".
  includeAll?: boolean;
  allLabel?: string;
}

const NO_BRAND = "Lainnya";

// Dropdown channel berbentuk brand > sub-brand (platform), dengan logo platform.
export function PageSelect({ value, onValueChange, pages, placeholder = "Pilih channel", className, includeAll, allLabel = "Semua channel" }: PageSelectProps) {
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ContentPage[]>();
    for (const p of pages) {
      const key = p.brand?.trim() || NO_BRAND;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(p);
    }
    return order.map((brand) => ({ brand, pages: map.get(brand)! }));
  }, [pages]);

  const selected = pages.find((p) => p.id === value) ?? null;

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <PlatformIcon platform={selected.platform} />
            <span className="truncate">
              {selected.brand ? `${selected.brand} · ${platformMeta(selected.platform).label}` : selected.name}
            </span>
          </span>
        ) : includeAll && value === "all" ? (
          <span className="truncate">{allLabel}</span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">{allLabel}</SelectItem>}
        {groups.map((g) => (
          <SelectGroup key={g.brand}>
            <SelectLabel>{g.brand}</SelectLabel>
            {g.pages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={p.platform} />
                  {platformMeta(p.platform).label}
                  {p.content_type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.content_type}</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
