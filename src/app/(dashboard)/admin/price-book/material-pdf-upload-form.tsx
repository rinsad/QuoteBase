"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { uploadSupplierPriceBook } from "@/app/(dashboard)/admin/price-book/actions";
import { Button } from "@/components/ui/button";
import type { PriceBookSupplier } from "@/lib/admin/price-book";

type SupplierGroup = {
  company: string;
  plants: PriceBookSupplier[];
};

export function MaterialPdfUploadForm({
  groups,
  initialCompany,
  initialPlantId,
}: {
  groups: SupplierGroup[];
  initialCompany: string;
  initialPlantId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [company, setCompany] = useState(initialCompany);
  const [plantId, setPlantId] = useState(initialPlantId);
  const [fileSelected, setFileSelected] = useState(false);
  const selectedGroup = useMemo(
    () => groups.find((group) => group.company === company) ?? null,
    [company, groups],
  );
  const plants = selectedGroup?.plants ?? [];
  const selectedPlant = plants.find((plant) => plant.id === plantId) ?? null;
  const replaceSelectionParams = (
    nextCompany: string,
    nextPlantId: string,
    options: { clearError?: boolean } = {},
  ) => {
    const nextParams = new URLSearchParams(searchParams);

    if (options.clearError) {
      nextParams.delete("error");
    }

    if (nextCompany) {
      nextParams.set("company", nextCompany);
    } else {
      nextParams.delete("company");
    }

    if (nextPlantId) {
      nextParams.set("plant", nextPlantId);
    } else {
      nextParams.delete("plant");
    }

    router.replace(
      nextParams.size ? `${pathname}?${nextParams.toString()}` : pathname,
      { scroll: false },
    );
  };
  const clearUploadError = () => {
    if (!searchParams.has("error")) {
      return;
    }

    replaceSelectionParams(company, plantId, { clearError: true });
  };
  const selectPlant = (nextPlantId: string) => {
    setPlantId(nextPlantId);
    replaceSelectionParams(company, nextPlantId, { clearError: true });
  };
  const uploadButtonText = !plantId
    ? "Choose plant"
    : fileSelected
      ? "Upload PDF and detect fields"
      : "Choose PDF";

  return (
    <form action={uploadSupplierPriceBook} className="mt-5 grid gap-4">
      <label>
        <span className="text-sm font-medium text-muted-foreground">
          Supplier/company
        </span>
        <select
          name="supplier_company"
          value={company}
          className="soft-control mt-2 w-full"
          required
          onChange={(event) => {
            const nextCompany = event.target.value;

            setCompany(nextCompany);
            setPlantId("");
            setFileSelected(false);
            replaceSelectionParams(nextCompany, "", { clearError: true });
          }}
        >
          <option value="">Select supplier...</option>
          {groups.map((group) => (
            <option key={group.company} value={group.company}>
              {group.company}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="text-sm font-medium text-muted-foreground">
          Plant
        </span>
        <select
          name="plant_id"
          value={plantId}
          className="soft-control mt-2 w-full"
          required
          disabled={!company}
          onChange={(event) => {
            const nextPlantId = event.target.value;

            selectPlant(nextPlantId);
          }}
        >
          <option value="">Select plant...</option>
          {plants.map((plant) => (
            <option key={plant.id} value={plant.id}>
              {plant.name}
            </option>
          ))}
        </select>
        <input type="hidden" name="plant_id_fallback" value={plantId} />
        <input type="hidden" name="plant_name" value={selectedPlant?.name ?? ""} />
        {plants.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {plants.map((plant) => (
              <button
                key={plant.id}
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                  plant.id === plantId
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-secondary text-muted-foreground ring-border hover:text-foreground"
                }`}
                onClick={() => selectPlant(plant.id)}
              >
                {plant.name}
              </button>
            ))}
          </div>
        ) : null}
      </label>

      <label>
        <span className="text-sm font-medium text-muted-foreground">
          Material PDF
        </span>
        <input
          name="price_book_file"
          type="file"
          accept=".pdf,application/pdf"
          className="soft-control mt-2 w-full"
          required
          onChange={(event) => {
            setFileSelected(Boolean(event.target.files?.length));
            clearUploadError();
          }}
        />
      </label>

      <Button
        type="submit"
        className="h-11 rounded-full"
        disabled={!company || !plantId || !fileSelected}
      >
        <FileText className="size-4" />
        {uploadButtonText}
      </Button>
    </form>
  );
}
