import { redirect } from "next/navigation";
import { FileUp, Save } from "lucide-react";

import {
  confirmSupplierPriceBookMapping,
} from "@/app/(dashboard)/admin/price-book/actions";
import { MaterialPdfUploadForm } from "@/app/(dashboard)/admin/price-book/material-pdf-upload-form";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getPriceBookSuppliers,
  getSupplierPriceImports,
  type PriceBookSupplier,
  type SupplierPriceImport,
} from "@/lib/admin/price-book";
import { getCurrentUser } from "@/lib/auth/current-user";

const requiredFields = [
  {
    key: "description",
    label: "Material",
    helper: "QuoteBase uses the material name as the identifier for matching imported rows.",
  },
  {
    key: "uom",
    label: "Unit of Measure",
    helper: "Tenant unit such as ton, cubic yard, load, each, or an approved alias.",
  },
  {
    key: "cost",
    label: "Material Price",
    helper: "The primary material cost QuoteBase will use when pricing this material.",
  },
] as const;

const optionalFields = [
  {
    key: "per_ton",
    label: "Per Unit",
    helper: "Per-unit value from the supplier PDF, such as per ton or delivered unit price.",
  },
  {
    key: "surcharge_per_load",
    label: "Surcharge per Load",
    helper: "Environmental, fuel, or listed surcharge amount per load.",
  },
  {
    key: "effective_through",
    label: "Effective Through",
    helper: "Good-through or term date text from the supplier document.",
  },
] as const;

export default async function AdminPriceBookPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    error?: string;
    import?: string;
    imported?: string;
    plant?: string;
    supplier?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirect("/dashboard");
  }

  const params = await searchParams;

  if (params.error === "select-plant") {
    redirect(priceBookPathWithoutError(params));
  }

  const selectedPlantId = params.plant ?? params.supplier;
  const [suppliers, imports] = await Promise.all([
    getPriceBookSuppliers(user.organization_id),
    getSupplierPriceImports({
      organizationId: user.organization_id,
      importId: params.import,
      supplierId: selectedPlantId,
    }),
  ]);
  const supplierGroups = groupPlantsBySupplier(suppliers);
  const selectedPlant = suppliers.find(
    (supplier) => supplier.id === selectedPlantId,
  );
  const selectedCompany = selectedPlant
    ? supplierCompanyName(selectedPlant)
    : params.company ?? "";
  const uploadError =
    params.error && params.error !== "select-plant" ? params.error : null;

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mac-window">
          <div className="mac-toolbar">
            <div className="flex min-w-0 items-center gap-3">
              <div className="mac-controls">
                <span className="mac-control-red" />
                <span className="mac-control-yellow" />
                <span className="mac-control-green" />
              </div>
              <div className="h-5 w-px bg-border/80" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-muted-foreground">
                  Masters / Suppliers / Plants / Materials
                </p>
                <h1 className="truncate text-lg font-semibold">
                  Material PDF mapper
                </h1>
              </div>
            </div>
            <AdminNav role={user.role} />
          </div>
        </header>

        {params.imported ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Imported {params.imported} material
            {params.imported === "1" ? "" : "s"} into a new active version.
          </div>
        ) : null}

        {uploadError ? (
          <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm font-medium text-amber-900 shadow-sm">
            {uploadErrorMessage(uploadError)}
          </div>
        ) : null}

        {imports.selectedImport ? (
          <section className="mt-6">
            <MappingPanel priceImport={imports.selectedImport} />
          </section>
        ) : (
          <section className="mx-auto mt-6 max-w-2xl">
            <section className="glass-panel p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="icon-well text-blue-700">
                  <FileUp className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Step 1
                  </p>
                  <h2 className="text-xl font-semibold">Upload material PDF</h2>
                </div>
              </div>

              <MaterialPdfUploadForm
                groups={supplierGroups}
                initialCompany={selectedCompany}
                initialPlantId={selectedPlantId ?? ""}
              />

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Choose the supplier, plant, and material PDF. The next screen
                will show the detected PDF columns for mapping.
              </p>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}

function supplierCompanyName(supplier: PriceBookSupplier): string {
  return supplier.supplier_name;
}

function groupPlantsBySupplier(suppliers: PriceBookSupplier[]): Array<{
  company: string;
  plants: PriceBookSupplier[];
}> {
  const groups = new Map<string, PriceBookSupplier[]>();

  for (const supplier of suppliers) {
    const company = supplierCompanyName(supplier);
    groups.set(company, [...(groups.get(company) ?? []), supplier]);
  }

  return Array.from(groups.entries()).map(([company, plants]) => ({
    company,
    plants,
  }));
}

function uploadErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    "pdf-only": "Upload a PDF material price sheet. Spreadsheet upload is not active here yet.",
    "pdf-required": "Choose a material PDF before uploading.",
    "pdf-too-large": "Material PDF uploads are limited to 20 MB.",
    "plant-mismatch": "The selected plant does not belong to the selected supplier.",
    "plant-not-found": "Choose an active plant before uploading.",
    "select-supplier": "Choose the supplier/company before uploading.",
  };

  return messages[code] ?? "Could not upload the material PDF. Check the selections and try again.";
}

function priceBookPathWithoutError(params: {
  company?: string;
  import?: string;
  imported?: string;
  plant?: string;
  supplier?: string;
}): string {
  const nextParams = new URLSearchParams();

  for (const key of ["company", "import", "imported", "plant", "supplier"] as const) {
    if (params[key]) {
      nextParams.set(key, params[key]);
    }
  }

  return nextParams.size
    ? `/admin/price-book?${nextParams.toString()}`
    : "/admin/price-book";
}

function MappingPanel({
  priceImport,
}: {
  priceImport: SupplierPriceImport | null;
}) {
  if (!priceImport) {
    return (
      <section className="glass-panel p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="icon-well text-muted-foreground">
            <Save className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Step 2</p>
            <h2 className="text-xl font-semibold">Map columns</h2>
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Upload a supplier material PDF to detect source fields, then map those
          fields into QuoteBase material and pricing fields.
        </p>
      </section>
    );
  }

  const confirmImportAction = confirmSupplierPriceBookMapping.bind(
    null,
    priceImport.id,
  );

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="icon-well text-blue-700">
            <Save className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Step 2</p>
            <h2 className="text-xl font-semibold">Map and import version</h2>
          </div>
        </div>
        <StatusPill status={priceImport.status} />
      </div>

      <div className="mt-5 rounded-[18px] border border-border bg-card/70 p-4">
        <p className="text-sm font-semibold">{priceImport.source_filename}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {priceImport.supplier_name} - {priceImport.row_count} row
          {priceImport.row_count === 1 ? "" : "s"} detected
        </p>
      </div>

      <form action={confirmImportAction} className="mt-5 grid gap-4">
        <input type="hidden" name="import_id" value={priceImport.id} />
        <div className="overflow-hidden rounded-[18px] border border-border bg-card/70">
          <div className="grid gap-3 border-b border-border bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground sm:grid-cols-[0.95fr_1.05fr]">
            <span>QuoteBase database field</span>
            <span>Detected PDF column</span>
          </div>
          <div className="divide-y divide-border">
            {requiredFields.map((field) => (
              <MappingSelect
                key={field.key}
                name={`map_${field.key}`}
                label={field.label}
                helper={field.helper}
                required
                columns={priceImport.detected_columns}
                defaultValue={priceImport.column_mapping[field.key] ?? ""}
              />
            ))}
            {optionalFields.map((field) => (
              <MappingSelect
                key={field.key}
                name={`map_${field.key}`}
                label={field.label}
                helper={field.helper}
                columns={priceImport.detected_columns}
                defaultValue={priceImport.column_mapping[field.key] ?? ""}
              />
            ))}
          </div>
        </div>

        <Button
          type="submit"
          disabled={priceImport.status === "imported"}
          className="h-11 rounded-full"
        >
          <Save className="size-4" />
          {priceImport.status === "imported"
            ? "Already imported"
            : "Import and update materials"}
        </Button>
      </form>

    </section>
  );
}

function MappingSelect({
  name,
  label,
  columns,
  defaultValue,
  helper,
  required = false,
}: {
  name: string;
  label: string;
  columns: string[];
  defaultValue: string;
  helper: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-3 px-4 py-4 sm:grid-cols-[0.95fr_1.05fr] sm:items-center">
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span>{label}</span>
          {required ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-100">
              Required
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {helper}
        </span>
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="soft-control w-full"
        required={required}
      >
        <option value="">Do not map</option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const imported = status === "imported";

  return (
    <span
      className={`soft-chip w-fit ${
        imported
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "bg-amber-50 text-amber-800 ring-amber-100"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
