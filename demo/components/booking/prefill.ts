/** What the booking form starts with: the signed-in person's name and email, editable; empty when signed out. */
export interface Prefill {
  name: string;
  email: string;
}

export function prefillFrom(contact: { name: string; email: string | null } | null): Prefill {
  return { name: contact?.name ?? "", email: contact?.email ?? "" };
}
