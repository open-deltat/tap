import { webhookNotifier, webhookUrlFrom } from "./notify";

// The owner's webhook, read from NOTIFY_WEBHOOK_URL once for the whole app: meeting requests
// (meetings.ts) and pass bookings (booking-passes-live.ts) go to the same channel. Stateless, so a
// second module graph evaluating this costs nothing but a repeated warning when it is misconfigured.
export const ownerNotifier = webhookNotifier(webhookUrlFrom(process.env.NOTIFY_WEBHOOK_URL));
