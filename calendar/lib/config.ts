const DEV_PASS = "changeme";
const DEV_SECRET = "dev-secret-change-in-production!!";
export const DEV_DELTAT_PASSWORD = "secret";

export const config = {
  user: process.env.CAL_USER ?? "admin",
  pass: process.env.CAL_PASS ?? DEV_PASS,
  secret: process.env.CAL_SECRET ?? DEV_SECRET,
  displayName: process.env.CAL_DISPLAY_NAME ?? "Calendar",
  slug: process.env.CAL_SLUG ?? "cal",
  slotMinutes: Number(process.env.CAL_SLOT_MINUTES ?? 30),
} as const;

/**
 * Refuse to authenticate with an in-repo default credential in production: the published HMAC
 * secret would let anyone forge a session cookie, and the default database password is public.
 * Called at request time rather than module load so a build without runtime env still succeeds.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (config.secret === DEV_SECRET) {
    throw new Error("CAL_SECRET must be set to a non-default value in production");
  }
  if (config.pass === DEV_PASS) {
    throw new Error("CAL_PASS must be set to a non-default value in production");
  }
  if ((process.env.DELTAT_PASSWORD ?? DEV_DELTAT_PASSWORD) === DEV_DELTAT_PASSWORD) {
    throw new Error("DELTAT_PASSWORD must be set to a non-default value in production");
  }
}
