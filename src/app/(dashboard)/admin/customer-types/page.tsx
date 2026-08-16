import Link from "next/link";
import { redirect } from "next/navigation";

import { saveCustomerType } from "@/app/(dashboard)/admin/customer-types/actions";
import { Button } from "@/components/ui/button";
import { getCustomerTypes } from "@/lib/admin/customer-types";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function CustomerTypesPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const [params, types] = await Promise.all([searchParams, getCustomerTypes(user.organization_id)]);
  const editing = params.edit && params.edit !== "new" ? types.find((type) => type.id === params.edit) : undefined;
  const showEditor = params.edit === "new" || Boolean(editing);

  return <main className="app-background"><div className="mx-auto w-full max-w-6xl">
    <header className="mac-window"><div className="mac-toolbar"><div><p className="text-sm text-muted-foreground">Masters</p><h1 className="text-lg font-semibold">Customer Types</h1></div></div></header>
    {params.saved ? <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800">Customer type saved.</div> : null}
    <section className="glass-panel mt-6 overflow-hidden">
      <div className="slide-panel-header flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Customer classification</p><h2 className="accent-title text-2xl font-semibold">{types.length} customer types</h2></div><Link href="/admin/customer-types?edit=new" className="mac-button-primary h-10 px-4">New customer type</Link></div>
      <div className="master-table-head grid-cols-[1fr_180px_100px]"><span>Name</span><span>Code</span><span>Status</span></div>
      <div className="divide-y divide-border">{types.map((type) => <Link key={type.id} href={`/admin/customer-types?edit=${type.id}`} className="grid grid-cols-[1fr_180px_100px] gap-4 px-4 py-4 hover:bg-secondary/70"><span className="font-semibold">{type.name}</span><code className="text-sm">{type.code}</code><span>{type.is_active ? "Active" : "Inactive"}</span></Link>)}</div>
    </section>
    {showEditor ? <aside className="customer-slide-over" aria-label="Customer type editor"><Link href="/admin/customer-types" className="customer-slide-backdrop" aria-label="Close editor"/><div className="customer-slide-panel"><div className="slide-panel-header"><h2 className="text-2xl font-semibold">{editing ? "Edit customer type" : "New customer type"}</h2></div><form action={saveCustomerType} className="grid gap-4 p-4"><input type="hidden" name="customer_type_id" value={editing?.id ?? ""}/><label><span className="text-sm font-medium text-muted-foreground">Name</span><input name="name" className="soft-control mt-2 w-full" defaultValue={editing?.name ?? ""} maxLength={80} required/></label><label className="flex items-center gap-2"><input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true}/>Active</label><Button type="submit">Save customer type</Button></form></div></aside> : null}
  </div></main>;
}
