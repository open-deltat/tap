const PATTERNS: [RegExp, string][] = [
  [/conflict with allocation: \S+/, "Time slot is already booked"],
  [/not found: \S+/, "Resource not found"],
  [/cannot delete resource \S+: has children/, "Cannot delete: resource has sub-resources"],
  [/capacity \d+ exceeded/, "All slots are occupied"],
  [/cycle detected at \S+/, "Cannot create circular resource hierarchy"],
  [/resource already exists: \S+/, "Resource already exists"],
  [/not covered by parent/, "Schedule extends beyond parent availability"],
];

export function formatError(message: string): string {
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(message)) return replacement;
  }
  return message;
}
