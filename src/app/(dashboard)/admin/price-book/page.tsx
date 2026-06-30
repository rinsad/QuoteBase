import { redirect } from "next/navigation";
import { Database, FileSpreadsheet, FileUp, Save } from "lucide-react";

import {
  confirmSupplierPriceBookMapping,
  deactivateSupplierMarkupRule,
  saveSupplierMarkupRule,
  uploadSupplierPriceBook,
} from "@/app/(dashboard)/admin/price-book/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getPriceBookSuppliers,
  getSupplierCatalogItemOptions,
  getSupplierMarkupRules,
  getSupplierPriceImports,
  type SupplierCatalogItemOption,
  type SupplierMarkupRuleView,
  type SupplierPriceImport,
} from "@/lib/admin/price-book";
import { getCurrentUser } from "@/lib/auth/current-user";

const requiredFields = [
  { key: "description", label: "Description" },
  { key: "uom", label: "UOM" },
  { key: "cost", label: "Cost" },
] as const;

const optionalFields = [
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "tier", label: "Tier" },
] as const;

export default async function AdminPriceBookPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; imported?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const [suppliers, imports, markupRules, catalogItems] = await Promise.all([
    getPriceBookSuppliers(user.organization_id),
    getSupplierPriceImports({
      organizationId: user.organization_id,
      importId: params.import,
    }),
    getSupplierMarkupRules(user.organization_id),
    getSupplierCatalogItemOptions(user.organization_id),
  ]);

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
                  Masters
                </p>
                <h1 className="truncate text-lg font-semibold">
                  Supplier price book
                </h1>
              </div>
            </div>
            <AdminNav role={user.role} />
          </div>
        </header>

        {params.imported ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Imported {params.imported} catalog item
            {params.imported === "1" ? "" : "s"} into a new active version.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <section className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <FileUp className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Step 1
                </p>
                <h2 className="text-xl font-semibold">Upload supplier file</h2>
              </div>
            </div>

            <form action={uploadSupplierPriceBook} className="mt-5 grid gap-4">
              <label>
                <span className="text-sm font-medium text-muted-foreground">
                  Supplier
                </span>
                <select
                  name="supplier_id"
                  className="soft-control mt-2 w-full"
                  required
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-medium text-muted-foreground">
                  Supplier file
                </span>
                <input
                  name="price_book_file"
                  type="file"
                  accept=".csv,.xls,.xlsx,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="soft-control mt-2 w-full"
                  required
                />
              </label>

              <Button type="submit" className="h-11 rounded-full">
                <FileSpreadsheet className="size-4" />
                Upload and detect columns
              </Button>
            </form>

            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              CSV, Excel, and registered supplier PDF formats are active for
              this step. New supplier layouts can be added as parser modules
              over time.
            </p>
          </section>

          <MappingPanel priceImport={imports.selectedImport} />
        </section>

        <MarkupRulesPanel
          suppliers={suppliers}
          catalogItems={catalogItems}
          markupRules={markupRules}
        />

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="slide-panel-header">
            <div className="flex items-center gap-3">
              <div className="icon-well text-[#3d6652]">
                <Database className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Import history
                </p>
                <h2 className="text-xl font-semibold">Recent price books</h2>
              </div>
            </div>
          </div>

          <div className="master-table-head lg:grid-cols-[1fr_1fr_120px_120px_150px_120px] lg:gap-4">
            <span>File</span>
            <span>Supplier</span>
            <span>Status</span>
            <span>Rows</span>
            <span>Uploaded</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-border">
            {imports.recentImports.length ? (
              imports.recentImports.map((priceImport) => (
                <a
                  key={priceImport.id}
                  href={`/admin/price-book?import=${priceImport.id}`}
                  className="grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[1fr_1fr_120px_120px_150px_120px] lg:items-center lg:gap-4"
                >
                  <span className="truncate text-sm font-semibold">
                    {priceImport.source_filename}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {priceImport.supplier_name}
                  </span>
                  <StatusPill status={priceImport.status} />
                  <span className="font-mono text-sm">
                    {priceImport.imported_count || priceImport.row_count}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(priceImport.created_at)}
                  </span>
                  <span className="mac-link h-9 justify-center text-xs">
                    Review
                  </span>
                </a>
              ))
            ) : (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                No supplier price book imports yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MarkupRulesPanel({
  suppliers,
  catalogItems,
  markupRules,
}: {
  suppliers: Array<{ id: string; name: string }>;
  catalogItems: SupplierCatalogItemOption[];
  markupRules: SupplierMarkupRuleView[];
}) {
  return (
    <section className="mt-6 glass-panel overflow-hidden">
      <div className="slide-panel-header">
        <div className="flex items-center gap-3">
          <div className="icon-well text-[#3d6652]">
            <Database className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Price book rules
            </p>
            <h2 className="text-xl font-semibold">Markup and margin floors</h2>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={saveSupplierMarkupRule} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Supplier
              </span>
              <select name="supplier_id" className="soft-control mt-2 w-full">
                <option value="">All suppliers</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Scope
              </span>
              <select
                name="scope"
                defaultValue="global"
                className="soft-control mt-2 w-full"
                required
              >
                <option value="global">Global</option>
                <option value="category">Category</option>
                <option value="item">Catalog item</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Category
              </span>
              <input
                name="category"
                className="soft-control mt-2 w-full"
                placeholder="Required for category rules"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Catalog item
              </span>
              <select name="catalog_item_id" className="soft-control mt-2 w-full">
                <option value="">Required for item rules</option>
                {catalogItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} - {item.supplier_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Markup type
              </span>
              <select
                name="markup_type"
                defaultValue="dollar"
                className="soft-control mt-2 w-full"
                required
              >
                <option value="dollar">Dollar per unit</option>
                <option value="percent">Percent of cost</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Markup value
              </span>
              <input
                name="markup_value"
                type="number"
                min="0"
                step="0.0001"
                className="soft-control mt-2 w-full"
                placeholder="12.50"
                required
              />
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Margin floor %
              </span>
              <input
                name="margin_floor_pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="soft-control mt-2 w-full"
                placeholder="22"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Priority
              </span>
              <input
                name="priority"
                type="number"
                min="0"
                step="1"
                className="soft-control mt-2 w-full"
                defaultValue="100"
              />
            </label>
          </div>

          <Button type="submit" className="h-11 rounded-full">
            <Save className="size-4" />
            Save markup rule
          </Button>
        </form>

        <div className="overflow-hidden rounded-[18px] border border-border">
          <div className="grid grid-cols-[1fr_110px_100px_88px] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold text-muted-foreground">
            <span>Rule</span>
            <span>Markup</span>
            <span>Floor</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-border">
            {markupRules.length ? (
              markupRules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_110px_100px_88px] lg:items-center"
                >
                  <div>
                    <p className="font-semibold">{formatRuleScope(rule)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rule.supplier_name} - priority {rule.priority}
                    </p>
                  </div>
                  <span className="font-mono text-xs">
                    {rule.markup_type === "percent"
                      ? `${rule.markup_value}%`
                      : `${formatCurrency(rule.markup_value)}/unit`}
                  </span>
                  <span className="font-mono text-xs">
                    {rule.margin_floor_pct === null
                      ? "None"
                      : `${rule.margin_floor_pct.toFixed(1)}%`}
                  </span>
                  <form action={deactivateSupplierMarkupRule}>
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-9 rounded-full text-xs"
                    >
                      Disable
                    </Button>
                  </form>
                </div>
              ))
            ) : (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                No active markup rules yet. Quotes will use the R1-R4 tier
                fallback until a price book rule applies.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
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
          Upload a supplier CSV to detect columns and preview the first rows.
        </p>
      </section>
    );
  }

  const previewRows = priceImport.preview_rows.slice(0, 5);

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

      <form action={confirmSupplierPriceBookMapping} className="mt-5 grid gap-4">
        <input type="hidden" name="import_id" value={priceImport.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          {requiredFields.map((field) => (
            <MappingSelect
              key={field.key}
              name={`map_${field.key}`}
              label={field.label}
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
              columns={priceImport.detected_columns}
              defaultValue={priceImport.column_mapping[field.key] ?? ""}
            />
          ))}
        </div>

        <Button
          type="submit"
          disabled={priceImport.status === "imported"}
          className="h-11 rounded-full"
        >
          <Save className="size-4" />
          {priceImport.status === "imported"
            ? "Already imported"
            : "Create active catalog version"}
        </Button>
      </form>

      {previewRows.length ? (
        <div className="mt-6 overflow-hidden rounded-[18px] border border-border">
          <div className="bg-muted/70 px-4 py-3 text-sm font-semibold">
            Preview rows
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-card">
                <tr>
                  {priceImport.detected_columns.slice(0, 8).map((column) => (
                    <th key={column} className="px-3 py-2 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index} className="border-t border-border">
                    {priceImport.detected_columns.slice(0, 8).map((column) => (
                      <td key={column} className="max-w-48 truncate px-3 py-2">
                        {typeof row[column] === "string" ? row[column] : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MappingSelect({
  name,
  label,
  columns,
  defaultValue,
  required = false,
}: {
  name: string;
  label: string;
  columns: string[];
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        {required ? <span className="text-xs text-rose-600">Required</span> : null}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
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

function formatRuleScope(rule: SupplierMarkupRuleView): string {
  if (rule.scope === "item") {
    return rule.catalog_item_label ?? "Catalog item rule";
  }

  if (rule.scope === "category") {
    return rule.category ? `Category: ${rule.category}` : "Category rule";
  }

  return "Global markup";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
