"use client";

import { useState, useTransition } from "react";

import { updateMaterialTruckingProfile } from "@/app/(dashboard)/admin/material-prices/actions";
import type { MaterialTruckingProfileOption } from "@/lib/admin/material-prices";

export function TruckingProfileSelect({
  materialId,
  materialName,
  initialProfileId,
  profiles,
}: {
  materialId: string;
  materialName: string;
  initialProfileId: string | null;
  profiles: MaterialTruckingProfileOption[];
}) {
  const [profileId, setProfileId] = useState(initialProfileId ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const defaultProfile = profiles.find((profile) => profile.isDefault);

  function saveProfile(nextProfileId: string): void {
    const previousProfileId = profileId;
    setProfileId(nextProfileId);
    setStatus("idle");

    const formData = new FormData();
    formData.set("material_id", materialId);
    formData.set("trucking_profile_id", nextProfileId);

    startTransition(async () => {
      try {
        await updateMaterialTruckingProfile(formData);
        setStatus("saved");
      } catch {
        setProfileId(previousProfileId);
        setStatus("error");
      }
    });
  }

  return (
    <div className="min-w-0">
      <select
        value={profileId}
        onChange={(event) => saveProfile(event.target.value)}
        disabled={isPending}
        className="soft-control w-full py-2 text-xs disabled:cursor-wait disabled:opacity-60"
        aria-label={`Trucking profile for ${materialName}`}
      >
        <option value="">
          Use default{defaultProfile ? ` (${defaultProfile.name})` : ""}
        </option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
      <p
        className={`mt-1 min-h-4 text-xs ${
          status === "error" ? "text-destructive" : "text-muted-foreground"
        }`}
        aria-live="polite"
      >
        {isPending
          ? "Saving…"
          : status === "saved"
            ? "Saved"
            : status === "error"
              ? "Could not save. Try again."
              : ""}
      </p>
    </div>
  );
}
