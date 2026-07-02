import { DeltaT } from "@open-deltat/client";
import { DEV_DELTAT_PASSWORD } from "./config";

export const dt = new DeltaT({
  host: process.env.DELTAT_HOST ?? "localhost",
  port: Number(process.env.DELTAT_PORT ?? 5433),
  database: process.env.DELTAT_DB ?? "cal",
  username: process.env.DELTAT_USER ?? "user",
  password: process.env.DELTAT_PASSWORD ?? DEV_DELTAT_PASSWORD,
});
