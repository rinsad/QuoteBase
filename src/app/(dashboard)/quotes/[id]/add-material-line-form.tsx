"use client";

import { useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NewQuoteContext } from "@/lib/quotes/new-quote";

type AddMaterialLineFormProps = {
  action: (formData: FormData) => void;
  materials: NewQuoteContext["materials"];
};

function formatMaterialOption(
  material: NewQuoteContext["materials"][number],
): string {
  return [
    material.catalog_sku ? `${material.catalog_sku} - ${material.name}` : material.name,
    `(${material.tier})`,
    material.supplier_name,
  ]
    .filter(Boolean)
    .join(" - ");
}

function normalizeMaterialLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function materialOptionLabels(
  material: NewQuoteContext["materials"][number],
): string[] {
  return [
    formatMaterialOption(material),
    `${material.name} - (${material.tier}) - ${material.supplier_name}`,
    `${material.name} (${material.tier}) - ${material.supplier_name}`,
    `${material.supplier_name} - ${material.name} (${material.tier})`,
  ];
}

export function AddMaterialLineForm({
  action,
  materials,
}: AddMaterialLineFormProps) {
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isMaterialPickerOpen, setIsMaterialPickerOpen] = useState(false);
  const normalizedMaterialSearch = normalizeMaterialLabel(materialSearch);
  const typedMaterialMatch = normalizedMaterialSearch
    ? materials.find((material) =>
        materialOptionLabels(material).some(
          (label) => normalizeMaterialLabel(label) === normalizedMaterialSearch,
        ),
      )
    : undefined;
  const effectiveMaterialId = materialId || typedMaterialMatch?.id || "";
  const filteredMaterials = useMemo(() => {
    const term = materialSearch.trim().toLowerCase();

    if (!term) {
      return materials;
    }

    return materials.filter((material) =>
      [
        material.catalog_sku,
        material.name,
        material.catalog_category,
        material.supplier_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [materials, materialSearch]);
  const materialSuggestions = filteredMaterials.slice(0, 8);
  const canSubmit =
    Boolean(effectiveMaterialId) &&
    Number.isFinite(Number(quantity)) &&
    Number(quantity) > 0;

  function selectMaterial(material: NewQuoteContext["materials"][number]) {
    setMaterialId(material.id);
    setMaterialSearch(formatMaterialOption(material));
    setIsMaterialPickerOpen(false);
  }

  return (
    <form
      action={action}
      className="mt-5 rounded-[20px] border border-border bg-secondary p-4 text-secondary-foreground"
    >
      <div className="flex items-center gap-3">
        <div className="icon-well bg-background text-primary">
          <PackagePlus className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Draft editor
          </p>
          <h3 className="text-lg font-semibold">Add material line</h3>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <label className="relative block">
          <span className="text-sm font-medium text-muted-foreground">
            Material
          </span>
          <input
            type="hidden"
            name="material_id"
            value={effectiveMaterialId}
          />
          <input
            type="search"
            className="soft-control mt-2 w-full"
            placeholder="Search material, SKU, category, or supplier..."
            value={materialSearch}
            autoComplete="off"
            onBlur={() => {
              window.setTimeout(() => setIsMaterialPickerOpen(false), 120);
            }}
            onChange={(event) => {
              setMaterialSearch(event.target.value);
              setMaterialId("");
              setIsMaterialPickerOpen(true);
            }}
            onFocus={() => setIsMaterialPickerOpen(true)}
            required
          />
          {isMaterialPickerOpen ? (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-[16px] border border-border bg-background p-2 shadow-xl">
              {materialSuggestions.length ? (
                materialSuggestions.map((material) => (
                  <button
                    key={material.id}
                    type="button"
                    className="w-full rounded-[12px] px-3 py-2 text-left transition hover:bg-secondary"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectMaterial(material);
                    }}
                  >
                    <span className="block text-sm font-semibold">
                      {material.catalog_sku
                        ? `${material.catalog_sku} - ${material.name}`
                        : material.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {material.supplier_name} - {material.tier} -{" "}
                      {material.unit}
                      {material.catalog_category
                        ? ` - ${material.catalog_category}`
                        : ""}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  No matching materials.
                </p>
              )}
            </div>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-muted-foreground">
            Quantity
          </span>
          <input
            name="quantity"
            type="number"
            min="0.01"
            step="0.01"
            className="soft-control mt-2 w-full"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>

        <Button
          type="submit"
          className="h-12 rounded-full"
          disabled={!canSubmit}
        >
          <PackagePlus className="size-4" />
          Add line
        </Button>
      </div>
    </form>
  );
}
