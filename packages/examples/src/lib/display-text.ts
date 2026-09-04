// One sanitizer for every piece of free text a stranger can put on a public page. Both the name of
// a bookable and the name a person books under land in a rendered page, in server logs, and (once
// the agent catalogue exists) in model context, so they get identical treatment. Two call sites
// with one rule beats two call sites that drift.

/**
 * Control and format characters become a space rather than being deleted.
 *
 * A raw newline, an ANSI escape, or a right-to-left override lets one field impersonate the output
 * around it. Deleting them would weld neighbouring words together and hide that anything was
 * removed; a space keeps the text readable and the tampering visible.
 */
export function collapseDisplayText(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse, then insist the result is a usable one-line label. Throws with a message meant for the person typing. */
export function requireDisplayText(raw: string, opts: { field: string; maxLength: number }): string {
  const text = collapseDisplayText(raw);
  if (text.length === 0) {
    throw new Error(`A ${opts.field} is required.`);
  }
  if (text.length > opts.maxLength) {
    throw new Error(`A ${opts.field} can be at most ${opts.maxLength} characters.`);
  }
  return text;
}
