"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type SupplierOption = {
  id: string;
  name: string;
};

type PlantOption = {
  id: string;
  name: string;
  supplierId: string;
};

export function MaterialPriceFilters({
  supplierOptions,
  plantOptions,
  initialSupplierId,
  initialPlantId,
  sortKey,
  sortDir,
}: {
  supplierOptions: SupplierOption[];
  plantOptions: PlantOption[];
  initialSupplierId: string;
  initialPlantId: string;
  sortKey: string;
  sortDir: "asc" | "desc";
}) {
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [plantId, setPlantId] = useState(initialPlantId);
  const visiblePlantOptions = supplierId
    ? plantOptions.filter((plant) => plant.supplierId === supplierId)
    : plantOptions;

  return (
    <form
      method="get"
      className="grid gap-3 border-t border-border bg-card/50 px-4 py-4 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto_auto] sm:items-end"
    >
      <input type="hidden" name="sort" value={sortKey} />
      <input type="hidden" name="dir" value={sortDir} />
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supplier
        </span>
        <select
          name="supplier"
          value={supplierId}
          onChange={(event) => {
            setSupplierId(event.target.value);
            setPlantId("");
          }}
          className="soft-control w-full py-2 text-sm"
        >
          <option value="">All suppliers</option>
          {supplierOptions.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plant
        </span>
        <select
          name="plant"
          value={plantId}
          onChange={(event) => setPlantId(event.target.value)}
          className="soft-control w-full py-2 text-sm"
        >
          <option value="">All plants</option>
          {visiblePlantOptions.map((plant) => (
            <option key={plant.id} value={plant.id}>
              {plant.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" className="h-10 rounded-md px-5">
        Apply filters
      </Button>
      {supplierId || plantId ? (
        <Link
          href="/admin/material-prices"
          className="mac-link h-10 justify-center px-4"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
