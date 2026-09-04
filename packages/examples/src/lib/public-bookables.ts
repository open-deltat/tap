import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hashManageKey, mintManageKey, verifyManageKey } from "./manage-key";
import { requireDisplayText } from "./display-text";

// The registry of bookables strangers created on the live site. deltat owns the timeline; this owns
// the two things deltat must never learn (NOT-02): who may edit a bookable, and the presentation
// settings around it. One file, one process. That is the honest limit of this tier today.

export const MAX_BOOKABLE_NAME_LENGTH = 60;

/** Ceiling on the whole public tenant, so a caller who outlasts the rate limiter still cannot fill the disk. */
export const MAX_PUBLIC_BOOKABLES = 5_000;

export interface BookableRecord {
  readonly id: string;
  readonly name: string;
  readonly slotMinutes: number;
  readonly timezone: string;
  readonly createdAt: number;
}

interface StoredRecord extends BookableRecord {
  readonly keyHash: string;
}

interface RegistryFile {
  readonly version: 1;
  readonly records: readonly StoredRecord[];
}

export interface BookableRegistry {
  /** Mint ownership for an already-created deltat resource. The raw key is returned once and never stored. */
  register(input: {
    id: string;
    name: string;
    slotMinutes: number;
    timezone: string;
  }): { record: BookableRecord; manageKey: string };
  get(id: string): BookableRecord | undefined;
  /** The record if this key owns it, otherwise undefined. The single authorization point. */
  authorize(id: string, key: string): BookableRecord | undefined;
  rename(id: string, key: string, name: string): BookableRecord | undefined;
  unregister(id: string, key: string): boolean;
  count(): number;
}

/** The bookable's public label, under the same rules as every other stranger-supplied string. */
export function normalizeBookableName(raw: string): string {
  return requireDisplayText(raw, { field: "bookable name", maxLength: MAX_BOOKABLE_NAME_LENGTH });
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.slotMinutes === "number" &&
    typeof r.timezone === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.keyHash === "string"
  );
}

function loadRecords(path: string): Map<string, StoredRecord> {
  try {
    if (!existsSync(path)) return new Map();
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    const records = (parsed as Partial<RegistryFile> | null)?.records;
    if (!Array.isArray(records)) return new Map();
    // A record that fails its shape check is dropped rather than trusted: the file is durable state
    // an operator can hand-edit, and a half-typed entry must not become an unownable bookable.
    return new Map(records.filter(isStoredRecord).map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function toPublic({ keyHash: _keyHash, ...record }: StoredRecord): BookableRecord {
  return record;
}

export function openBookableRegistry(
  path: string,
  opts?: { maxEntries?: number }
): BookableRegistry {
  const maxEntries = opts?.maxEntries ?? MAX_PUBLIC_BOOKABLES;
  const records = loadRecords(path);

  // Write to a sibling then rename. A crash during a direct writeFileSync truncates the file first,
  // which would lose every bookable at once rather than the one being written.
  const flush = (): void => {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${path}.tmp`;
    const file: RegistryFile = { version: 1, records: [...records.values()] };
    writeFileSync(tmp, JSON.stringify(file));
    renameSync(tmp, path);
  };

  // Not a secret: the id is in the public booking URL, so an early return on an unknown id leaks
  // nothing an attacker cannot already see. The key comparison below is the part that is constant time.
  const ownedRecord = (id: string, key: string): StoredRecord | undefined => {
    const record = records.get(id);
    if (!record) return undefined;
    return verifyManageKey(key, record.keyHash) ? record : undefined;
  };

  return {
    register(input) {
      const name = normalizeBookableName(input.name);
      if (records.has(input.id)) {
        throw new Error(`Bookable ${input.id} is already registered.`);
      }
      if (records.size >= maxEntries) {
        throw new Error("The public registry is full; no new bookables can be created right now.");
      }
      const manageKey = mintManageKey();
      const stored: StoredRecord = {
        id: input.id,
        name,
        slotMinutes: input.slotMinutes,
        timezone: input.timezone,
        createdAt: Date.now(),
        keyHash: hashManageKey(manageKey),
      };
      records.set(stored.id, stored);
      flush();
      return { record: toPublic(stored), manageKey };
    },

    get(id) {
      const record = records.get(id);
      return record && toPublic(record);
    },

    authorize(id, key) {
      const record = ownedRecord(id, key);
      return record && toPublic(record);
    },

    rename(id, key, name) {
      // Authorize before validating: an unauthorized caller learns nothing about the name rules.
      const record = ownedRecord(id, key);
      if (!record) return undefined;
      const renamed: StoredRecord = { ...record, name: normalizeBookableName(name) };
      records.set(id, renamed);
      flush();
      return toPublic(renamed);
    },

    unregister(id, key) {
      if (!ownedRecord(id, key)) return false;
      records.delete(id);
      flush();
      return true;
    },

    count() {
      return records.size;
    },
  };
}
