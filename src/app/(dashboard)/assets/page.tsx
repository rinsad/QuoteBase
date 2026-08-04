import { FileText, FolderOpen, Image as ImageIcon, Upload } from "lucide-react";
import { redirect } from "next/navigation";

import { uploadLibraryAsset } from "@/app/(dashboard)/assets/actions";
import { WorkspaceNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listQuoteAssets } from "@/lib/quotes/assets";

export default async function AssetLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; uploaded?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirect("/dashboard");
  }

  const [params, assets] = await Promise.all([
    searchParams,
    listQuoteAssets(user),
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
                  Workspace
                </p>
                <h1 className="truncate text-lg font-semibold">Asset Library</h1>
              </div>
            </div>
            <WorkspaceNav role={user.role} />
          </div>
        </header>

        {params.uploaded ? (
          <p className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Asset uploaded and available for quote attachments.
          </p>
        ) : null}
        {params.error ? (
          <p className="mt-6 rounded-[20px] border border-rose-100 bg-rose-50/90 px-5 py-4 text-sm font-medium text-rose-800 shadow-sm">
            {params.error}
          </p>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <form
            action={uploadLibraryAsset}
            encType="multipart/form-data"
            className="glass-panel p-5 sm:p-6"
          >
            <div className="flex items-center gap-3">
              <div className="icon-well text-primary">
                <Upload className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Reusable attachment
                </p>
                <h2 className="text-2xl font-semibold">Upload asset</h2>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium">Title</span>
                <input
                  name="asset_title"
                  className="soft-control mt-2 w-full"
                  maxLength={200}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Type</span>
                <select
                  name="asset_type"
                  className="soft-control mt-2 w-full"
                  defaultValue="spec"
                >
                  <option value="spec">Material specification</option>
                  <option value="photo">Product image</option>
                  <option value="test">Test document</option>
                  <option value="other">Other attachment</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">File</span>
                <input
                  name="asset_file"
                  type="file"
                  className="soft-control mt-2 w-full py-2"
                  accept=".pdf,.txt,.doc,.docx,image/jpeg,image/png,image/webp"
                  required
                />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                PDF, Word, text, JPEG, PNG, or WebP files up to 20 MB.
              </p>
              <Button type="submit" className="h-11 w-full rounded-full">
                <Upload className="size-4" />
                Upload to library
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-primary">
                <FolderOpen className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tenant assets
                </p>
                <h2 className="text-2xl font-semibold">
                  {assets.length} reusable file{assets.length === 1 ? "" : "s"}
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {assets.length ? (
                assets.map((asset) => {
                  const Icon = asset.asset_type === "photo" ? ImageIcon : FileText;

                  return (
                    <article key={asset.id} className="soft-row flex gap-3 p-4">
                      <div className="icon-well shrink-0 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">
                          {asset.title}
                        </h3>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatAssetType(asset.asset_type)} ·{" "}
                          {asset.source_filename}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Added {formatDate(asset.created_at)}
                        </p>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="soft-row px-4 py-12 text-center">
                  <p className="text-sm font-medium">No assets uploaded yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Upload a specification or product picture to make it
                    available when sending quotes.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function formatAssetType(value: string): string {
  const labels: Record<string, string> = {
    spec: "Material specification",
    photo: "Product image",
    test: "Test document",
    other: "Other attachment",
  };

  return labels[value] ?? "Other attachment";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
