import { dtPublic } from "./deltat";
import { publicRegistry } from "./public-registry";
import { openMeetingRequestStore } from "./meeting-requests";
import { createMeetingService } from "./meeting-request-service";
import { webhookNotifier, webhookUrlFrom } from "./notify";
import { publicBaseUrl } from "./public-base-url";

// The one process-wide meeting service, beside the one registry it reads (public-registry.ts): the
// same single-container limit applies, and the requests file lives on the same data volume.
export const meetings = createMeetingService({
  dt: dtPublic,
  registry: publicRegistry,
  store: openMeetingRequestStore(process.env.MEETING_REQUESTS_PATH ?? "./data/meeting-requests.json"),
  notify: webhookNotifier(webhookUrlFrom(process.env.NOTIFY_WEBHOOK_URL)),
  reviewBase: publicBaseUrl,
});
