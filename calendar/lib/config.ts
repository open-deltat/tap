export const config = {
  user: process.env.CAL_USER ?? "admin",
  pass: process.env.CAL_PASS ?? "changeme",
  secret: process.env.CAL_SECRET ?? "dev-secret-change-in-production!!",
  displayName: process.env.CAL_DISPLAY_NAME ?? "Calendar",
  slug: process.env.CAL_SLUG ?? "cal",
  slotMinutes: Number(process.env.CAL_SLOT_MINUTES ?? 30),
} as const;
