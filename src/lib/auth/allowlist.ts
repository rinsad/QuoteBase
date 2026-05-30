export const WESTERN_MATERIALS_ALLOWED_EMAILS = [
  "john@westernmaterials.net",
  "admin@westernmaterials.net",
  "estimate@westernmaterials.net",
  "bid@westernmaterials.net",
  "dispatch@westernmaterials.net",
  "info@westernmaterials.net",
  "rinsad@gmail.com",
] as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedWesternMaterialsEmail(email: string) {
  return WESTERN_MATERIALS_ALLOWED_EMAILS.includes(
    normalizeEmail(email) as (typeof WESTERN_MATERIALS_ALLOWED_EMAILS)[number],
  );
}
