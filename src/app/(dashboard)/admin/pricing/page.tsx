import { redirect } from "next/navigation";

export default function LegacyPricingPage(): never {
  redirect("/admin/settings");
}
