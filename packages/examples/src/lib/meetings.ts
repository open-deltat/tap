import { dtPublic } from "./deltat";
import { publicRegistry } from "./public-registry";
import { openMeetingRequestStore } from "./meeting-requests";
import { createMeetingService, type MeetingService } from "./meeting-request-service";
import { webhookNotifier, webhookUrlFrom } from "./notify";
import { publicBaseUrl } from "./public-base-url";
import { canonicalPrincipalId } from "./auth-config";

// The one process-wide meeting service, beside the one registry it reads (public-registry.ts): the
// same single-container limit applies, and the requests file lives on the same data volume. Kept on
// globalThis for the reason the registry is: a module graph that evaluated this a second time would
// hold its own copy of the requests and overwrite the other's file on every flush.
const shared = globalThis as typeof globalThis & { __deltatMeetings?: MeetingService };

export const meetings: MeetingService = (shared.__deltatMeetings ??= createMeetingService({
  dt: dtPublic,
  registry: publicRegistry,
  store: openMeetingRequestStore(process.env.MEETING_REQUESTS_PATH ?? "./data/meeting-requests.json", {
    canonicalRequester: (id) => canonicalPrincipalId(id),
  }),
  notify: webhookNotifier(webhookUrlFrom(process.env.NOTIFY_WEBHOOK_URL)),
  reviewBase: publicBaseUrl,
}));
