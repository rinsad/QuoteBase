import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Save,
  X,
} from "lucide-react";

import {
  savePlant,
  togglePlantActive,
  updatePlantOperations,
} from "@/app/(dashboard)/admin/plants/actions";
import { AdminNav, WorkspaceNav } from "@/components/app-nav";
import { MapboxAddressSearch } from "@/components/mapbox-address-search";
import { Button } from "@/components/ui/button";
import {
  getAdminPlantsSummary,
  type AdminSupplier,
} from "@/lib/admin/plants";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";

export default async function AdminPlantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    dir?: string;
    plant?: string;
    supplier?: string;
    new?: string;
    saved?: string;
    sort?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirect("/dashboard");
  }

  await logAction({
    user,
    action: "admin.plants.viewed",
    targetTable: "supplier_plants",
    metadata: {
      route: "/admin/plants",
    },
  });

  const [params, summary] = await Promise.all([
    searchParams,
    getAdminPlantsSummary(user.organization_id),
  ]);
  const showNewPlant = params.new === "1";
  const sortKey = parsePlantSortKey(params.sort);
  const sortDirection = params.dir === "desc" ? "desc" : "asc";
  const selectedParentSupplierId = summary.parentSuppliers.some(
    (supplier) => supplier.id === params.supplier,
  )
    ? params.supplier
    : undefined;
  const filteredPlants = selectedParentSupplierId
    ? summary.suppliers.filter(
        (plant) => plant.supplier_id === selectedParentSupplierId,
      )
    : summary.suppliers;
  const selectedPlant =
    filteredPlants.find((plant) => plant.id === params.plant) ?? null;
  const sortedPlants = sortPlants(filteredPlants, sortKey, sortDirection);
  const listParams = new URLSearchParams({
    sort: sortKey,
    dir: sortDirection,
  });
  if (selectedParentSupplierId) {
    listParams.set("supplier", selectedParentSupplierId);
  }
  const plantsListHref = `/admin/plants?${listParams.toString()}`;
  const newPlantParams = new URLSearchParams({ new: "1" });
  if (selectedParentSupplierId) {
    newPlantParams.set("supplier", selectedParentSupplierId);
  }

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
                  Admin
                </p>
                <h1 className="truncate text-lg font-semibold">
                  Plants & Materials
                </h1>
              </div>
            </div>
            {user.role === "admin" ? (
              <AdminNav />
            ) : (
              <WorkspaceNav role={user.role} />
            )}
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            {params.saved === "operations"
              ? "Plant operational details saved."
              : "Plant added."}
          </div>
        ) : null}

        {params.error ? (
          <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm font-medium text-amber-900 shadow-sm">
            {plantFormErrorMessage(params.error)}
          </div>
        ) : null}

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="slide-panel-header">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Plant locations
              </p>
              <h2 className="accent-title text-2xl font-semibold tracking-normal">
                {filteredPlants.length} plant
                {filteredPlants.length === 1 ? "" : "s"}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/plants?${newPlantParams.toString()}`}
                className="mac-button-primary h-10 px-4"
              >
                <Plus className="size-4" />
                New plant
              </Link>
            </div>
            </div>
          </div>

          <form
            action="/admin/plants"
            method="get"
            className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="sort" value={sortKey} />
            <input type="hidden" name="dir" value={sortDirection} />
            <label className="block w-full max-w-sm">
              <span className="text-sm font-medium text-muted-foreground">
                Supplier
              </span>
              <select
                name="supplier"
                defaultValue={selectedParentSupplierId ?? ""}
                className="soft-control mt-2 w-full"
              >
                <option value="">All suppliers</option>
                {summary.parentSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" className="h-10 px-5">
              Filter plants
            </Button>
          </form>

          <div className="master-table-head lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(220px,1fr)_160px_120px_100px] lg:gap-4">
            <SortableHeader
              label="Plant"
              sortKey="plant"
              activeSortKey={sortKey}
              direction={sortDirection}
              selectedPlantId={params.plant}
              selectedSupplierId={selectedParentSupplierId}
            />
            <SortableHeader
              label="Supplier"
              sortKey="supplier"
              activeSortKey={sortKey}
              direction={sortDirection}
              selectedPlantId={params.plant}
              selectedSupplierId={selectedParentSupplierId}
            />
            <SortableHeader
              label="Location"
              sortKey="location"
              activeSortKey={sortKey}
              direction={sortDirection}
              selectedPlantId={params.plant}
              selectedSupplierId={selectedParentSupplierId}
            />
            <span>Coordinates</span>
            <SortableHeader
              label="Materials"
              sortKey="materials"
              activeSortKey={sortKey}
              direction={sortDirection}
              selectedPlantId={params.plant}
              selectedSupplierId={selectedParentSupplierId}
            />
            <SortableHeader
              label="Status"
              sortKey="status"
              activeSortKey={sortKey}
              direction={sortDirection}
              selectedPlantId={params.plant}
              selectedSupplierId={selectedParentSupplierId}
            />
          </div>

          <div className="divide-y divide-border">
            {sortedPlants.map((supplier) => (
              <Link
                key={supplier.id}
                href={plantDetailsHref({
                  plantId: supplier.id,
                  supplierId: selectedParentSupplierId,
                  sortKey,
                  sortDirection,
                })}
                className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.8fr)_minmax(220px,1fr)_160px_120px_100px] lg:items-center lg:gap-4 ${
                  selectedPlant?.id === supplier.id ? "bg-secondary" : ""
                }`}
              >
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{supplier.name}</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {supplier.hours ?? "Hours not set"}
                  </p>
                </div>
                <p className="truncate text-sm font-medium text-muted-foreground">
                  {supplier.supplier_name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {formatAddress(supplier.address)}
                  {supplier.primary_contact_name
                    ? ` - ${supplier.primary_contact_name}`
                    : ""}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {supplier.latitude ?? "lat pending"},{" "}
                  {supplier.longitude ?? "lng pending"}
                </p>
                <p className="text-sm font-medium">
                  {supplier.materials.length} material
                  {supplier.materials.length === 1 ? "" : "s"}
                </p>
                <span
                  className={`soft-chip w-fit ${
                    supplier.is_active
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {supplier.is_active ? "Active" : "Inactive"}
                </span>
              </Link>
            ))}
            {!sortedPlants.length ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                No plants found for this supplier.
              </p>
            ) : null}
          </div>
        </section>
        <PlantSlideOver
          supplier={selectedPlant}
          returnHref={plantsListHref}
        />
        <NewPlantSlideOver
          open={showNewPlant}
          suppliers={summary.parentSuppliers}
          selectedSupplierId={params.supplier ?? ""}
          returnHref={plantsListHref}
        />
      </div>
    </main>
  );
}

type PlantSortKey = "plant" | "supplier" | "location" | "materials" | "status";

type SortDirection = "asc" | "desc";

function parsePlantSortKey(value: string | undefined): PlantSortKey {
  const allowed: PlantSortKey[] = [
    "plant",
    "supplier",
    "location",
    "materials",
    "status",
  ];

  return allowed.includes(value as PlantSortKey)
    ? (value as PlantSortKey)
    : "plant";
}

function sortPlants(
  plants: AdminSupplier[],
  sortKey: PlantSortKey,
  direction: SortDirection,
): AdminSupplier[] {
  const sorted = [...plants].sort((left, right) => {
    const multiplier = direction === "asc" ? 1 : -1;

    if (sortKey === "materials") {
      return (left.materials.length - right.materials.length) * multiplier;
    }

    if (sortKey === "status") {
      return (Number(right.is_active) - Number(left.is_active)) * multiplier;
    }

    const leftValue = getPlantSortValue(left, sortKey);
    const rightValue = getPlantSortValue(right, sortKey);

    return leftValue.localeCompare(rightValue, "en", {
      numeric: true,
      sensitivity: "base",
    }) * multiplier;
  });

  return sorted;
}

function getPlantSortValue(plant: AdminSupplier, sortKey: PlantSortKey): string {
  if (sortKey === "supplier") {
    return plant.supplier_name;
  }

  if (sortKey === "location") {
    return formatAddress(plant.address);
  }

  return plant.name;
}

function plantDetailsHref({
  plantId,
  supplierId,
  sortKey,
  sortDirection,
}: {
  plantId: string;
  supplierId?: string;
  sortKey: PlantSortKey;
  sortDirection: SortDirection;
}): string {
  const params = new URLSearchParams({
    plant: plantId,
    sort: sortKey,
    dir: sortDirection,
  });
  if (supplierId) {
    params.set("supplier", supplierId);
  }
  return `/admin/plants?${params.toString()}`;
}

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  selectedPlantId,
  selectedSupplierId,
}: {
  label: string;
  sortKey: PlantSortKey;
  activeSortKey: PlantSortKey;
  direction: SortDirection;
  selectedPlantId?: string;
  selectedSupplierId?: string;
}) {
  const isActive = activeSortKey === sortKey;
  const nextDirection = isActive && direction === "asc" ? "desc" : "asc";
  const params = new URLSearchParams({
    sort: sortKey,
    dir: nextDirection,
  });

  if (selectedPlantId) {
    params.set("plant", selectedPlantId);
  }

  if (selectedSupplierId) {
    params.set("supplier", selectedSupplierId);
  }

  const SortIcon = isActive
    ? direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <Link
      href={`/admin/plants?${params.toString()}`}
      className={`flex min-w-0 items-center gap-1.5 rounded-md py-1 transition hover:text-foreground ${
        isActive ? "text-foreground" : ""
      }`}
    >
      <span className="truncate">{label}</span>
      <SortIcon className="size-3.5 shrink-0" />
    </Link>
  );
}

function NewPlantSlideOver({
  open,
  suppliers,
  selectedSupplierId,
  returnHref,
}: {
  open: boolean;
  suppliers: { id: string; name: string }[];
  selectedSupplierId: string;
  returnHref: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="New plant">
      <Link
        href={returnHref}
        className="customer-slide-backdrop"
        aria-label="Close new plant form"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                New plant
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Add plant location
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Search Mapbox to fill address and route coordinates.
              </p>
            </div>
            <Link
              href={returnHref}
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close new plant form"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={savePlant} className="grid gap-4 p-4" noValidate>
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              Supplier/company
            </span>
            <select
              name="parent_supplier_id"
              defaultValue={selectedSupplierId}
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
          <MapboxAddressSearch
            label="Plant address search"
            placeholder="Search plant address with Mapbox..."
            fieldIds={{
              street: "plant-street",
              city: "plant-city",
              state: "plant-state",
              postalCode: "plant-postal-code",
              latitude: "plant-latitude",
              longitude: "plant-longitude",
              mapboxId: "plant-mapbox-id",
            }}
          />
          <input id="plant-mapbox-id" type="hidden" name="mapbox_id" />
          <TextField name="name" label="Plant name" />
          <TextField
            name="street"
            id="plant-street"
            label="Street"
            required={false}
          />
          <TextField name="city" id="plant-city" label="City" />
          <TextField
            name="state"
            id="plant-state"
            label="State"
            defaultValue="CA"
            maxLength={2}
          />
          <TextField
            name="postal_code"
            id="plant-postal-code"
            label="ZIP"
            required={false}
          />
          <NumberField name="latitude" id="plant-latitude" label="Latitude" />
          <NumberField name="longitude" id="plant-longitude" label="Longitude" />
          <TextField name="hours" label="Hours" required={false} />
          <TextField
            name="primary_contact_name"
            label="Contact name"
            required={false}
          />
          <TextField
            name="primary_contact_phone"
            label="Contact phone"
            required={false}
          />
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              Notes
            </span>
            <textarea
              name="notes"
              rows={4}
              className="soft-control mt-2 w-full resize-none"
            />
          </label>
          <Button type="submit" className="h-11 rounded-md">
            <Save className="size-4" />
            Save plant
          </Button>
        </form>
      </div>
    </aside>
  );
}

function plantFormErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    city: "Choose a plant address or enter the city before saving.",
    "plant-name": "Enter the plant name before saving.",
    "select-supplier": "Choose the supplier/company for this plant before saving.",
    state: "Enter a valid two-letter state before saving.",
  };

  return messages[code] ?? "Could not save the plant. Check the required fields and try again.";
}

function PlantSlideOver({
  supplier,
  returnHref,
}: {
  supplier: AdminSupplier | null;
  returnHref: string;
}) {
  if (!supplier) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Plant details">
      <Link
        href={returnHref}
        className="customer-slide-backdrop"
        aria-label="Close plant details"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                Plant details
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                {supplier.name}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {supplier.supplier_name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`soft-chip ${
                  supplier.is_active
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {supplier.is_active ? "Active" : "Inactive"}
              </span>
              <Link
                href={returnHref}
                className="mac-link size-9 px-0"
                aria-label="Close plant details"
              >
                <X className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <section className="soft-row p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Location
            </h3>
            <p className="mt-2 text-sm font-medium">
              {formatAddress(supplier.address)}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {supplier.latitude ?? "lat pending"},{" "}
              {supplier.longitude ?? "lng pending"}
            </p>
          </section>

          <section className="soft-row p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Operational details
            </h3>
            <div className="mt-3 grid gap-3 text-sm">
              <DetailRow label="Hours" value={supplier.hours} />
              <DetailRow
                label="Contact"
                value={supplier.primary_contact_name}
              />
              <DetailRow
                label="Phone"
                value={supplier.primary_contact_phone}
              />
            </div>
            {supplier.notes ? (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {supplier.notes}
              </p>
            ) : null}
          </section>

          <form action={updatePlantOperations} className="soft-row grid gap-4 p-4">
            <input type="hidden" name="plant_id" value={supplier.id} />
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Edit operational details
            </h3>
            <TextField
              name="hours"
              label="Operating hours"
              defaultValue={supplier.hours ?? ""}
              required={false}
            />
            <TextField
              name="primary_contact_name"
              label="Contact name"
              defaultValue={supplier.primary_contact_name ?? ""}
              required={false}
            />
            <TextField
              name="primary_contact_phone"
              label="Contact phone"
              defaultValue={supplier.primary_contact_phone ?? ""}
              required={false}
            />
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                Notes
              </span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={supplier.notes ?? ""}
                className="soft-control mt-2 w-full resize-none"
              />
            </label>
            <Button type="submit" className="h-10 rounded-md">
              <Save className="size-4" />
              Save operational details
            </Button>
          </form>

          <form action={togglePlantActive} className="soft-row flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold">Plant status</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inactive plants are hidden from active quote setup.
              </p>
            </div>
            <input type="hidden" name="supplier_id" value={supplier.id} />
            <input
              type="hidden"
              name="is_active"
              value={supplier.is_active ? "false" : "true"}
            />
            <button type="submit" className="mac-link h-10 px-3">
              {supplier.is_active ? "Flag inactive" : "Reactivate"}
            </button>
          </form>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Materials ({supplier.materials.length})
              </h3>
              <Link
                href="/admin/material-prices"
                className="text-xs font-semibold text-primary hover:text-foreground"
              >
                Manage prices
              </Link>
            </div>
            <div className="grid gap-2">
              {supplier.materials.length ? (
                supplier.materials.map((material) => (
                  <div key={material.id} className="soft-row p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {material.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {material.unit} - Updated{" "}
                          {formatDate(material.last_price_update)}
                        </p>
                      </div>
                      <TierBadge tier={material.tier} />
                    </div>
                    <p className="mt-3 font-mono text-sm font-semibold">
                      ${Number(material.cost_per_unit).toFixed(2)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="soft-row px-4 py-5 text-sm text-muted-foreground">
                  No materials loaded for this supplier yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

function TextField({
  name,
  id,
  label,
  defaultValue = "",
  maxLength,
  required = true,
}: {
  name: string;
  id?: string;
  label: string;
  defaultValue?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        maxLength={maxLength}
        className="soft-control mt-2 w-full"
        required={required}
      />
    </label>
  );
}

function NumberField({
  name,
  id,
  label,
}: {
  name: string;
  id?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        id={id}
        name={name}
        type="number"
        step="0.0000001"
        className="soft-control mt-2 w-full"
      />
    </label>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "Not set"}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: "R1" | "R2" | "R3" | "R4" }) {
  const tones = {
    R1: "bg-slate-100 text-slate-700 ring-slate-200",
    R2: "bg-blue-50 text-blue-700 ring-blue-100",
    R3: "bg-amber-50 text-amber-700 ring-amber-100",
    R4: "bg-purple-50 text-purple-700 ring-purple-100",
  };

  return (
    <span
      className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tones[tier]}`}
    >
      {tier}
    </span>
  );
}

function formatAddress(address: Record<string, unknown>) {
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [city, state].filter(Boolean).join(", ") || "Address pending";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "not recorded";
}
