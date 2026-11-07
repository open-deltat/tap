import { SITE } from "./seo";

// There is no signup form or trial flow: every sales call to action opens a prefilled email, and the
// prompts in the body are the questions the first reply would otherwise have to ask.
const mailto = (subject: string, body: string) =>
  `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const EMAIL_HREF = `mailto:${SITE.email}`;

export const PILOT_MAILTO = mailto(
  "Δt founding pilot",
  "What the agent books:\nHow many calendars or resources:\nWhere the calendar lives today:\n"
);

export const ENTERPRISE_MAILTO = mailto(
  "Δt enterprise",
  "Company:\nWhat you want to run on Δt:\nSelf-hosted or managed:\n"
);
