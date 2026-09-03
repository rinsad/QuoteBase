import fs from "node:fs";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

function loadEnvironmentFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvironmentFile(".env.local");
loadEnvironmentFile(".env");

const organizationName = process.argv.slice(2).join(" ") || "Western Materials";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: organization, error: organizationError } = await supabase
  .from("organizations")
  .select("id, name")
  .eq("name", organizationName)
  .maybeSingle();

if (organizationError || !organization) {
  throw new Error(organizationError?.message ?? `Organization not found: ${organizationName}`);
}

const profiles = [
  {
    organization_id: organization.id,
    name: "Test - Local delivery",
    average_speed_mph: 30,
    hourly_rate: 95,
    round_trip_factor: 2,
    time_adjustment_bands: [
      { under_miles: 18, hours: 0.5 },
      { under_miles: 25, hours: 0.375 },
      { under_miles: 30, hours: 0.25 },
    ],
    is_active: true,
  },
  {
    organization_id: organization.id,
    name: "Test - Regional delivery",
    average_speed_mph: 40,
    hourly_rate: 115,
    round_trip_factor: 2,
    time_adjustment_bands: [
      { under_miles: 20, hours: 0.5 },
      { under_miles: 40, hours: 0.25 },
    ],
    is_active: true,
  },
  {
    organization_id: organization.id,
    name: "Test - Long haul",
    average_speed_mph: 50,
    hourly_rate: 135,
    round_trip_factor: 2,
    time_adjustment_bands: [],
    is_active: true,
  },
];

const { data: savedProfiles, error: profilesError } = await supabase
  .from("trucking_profiles")
  .upsert(profiles, { onConflict: "organization_id,name" })
  .select("id, name, average_speed_mph, hourly_rate");

if (profilesError) throw new Error(profilesError.message);

console.log(`Seeded ${savedProfiles.length} test trucking profiles for ${organization.name}:`);
for (const profile of savedProfiles) {
  console.log(`- ${profile.name}: ${profile.average_speed_mph} MPH, $${profile.hourly_rate}/hr`);
}
