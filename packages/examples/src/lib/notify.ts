// Telling the owner that someone asked for a meeting, or booked with a pass they handed out.
// Optional and best effort: the request or booking is already stored and shows on the owner's
// dashboard or pass list, so a webhook that is down must never fail it or slow it past a few seconds.
//
// Configured by NOTIFY_WEBHOOK_URL. The body carries the message as both `text` (Slack) and
// `content` (Discord), so either incoming-webhook URL works as is.

interface NoticeBase {
  /** One line for a human: who, for which calendar, when. */
  readonly text: string;
  readonly calendarId: string;
}

export type OwnerNotice =
  | (NoticeBase & { readonly kind: "meeting_request"; readonly requestId: string })
  | (NoticeBase & { readonly kind: "pass_booking"; readonly passId: string });

/**
 * The webhook body. A meeting request sends the fields it has always sent, plus `kind`, so a
 * receiver written before passes existed keeps working.
 */
function webhookBody(notice: OwnerNotice) {
  const shared = { kind: notice.kind, text: notice.text, content: notice.text, calendar_id: notice.calendarId };
  return notice.kind === "meeting_request" ? { ...shared, request_id: notice.requestId } : { ...shared, pass_id: notice.passId };
}

export type Notifier = (notice: OwnerNotice) => Promise<void>;

export const silentNotifier: Notifier = async () => {};

const TIMEOUT_MS = 5_000;

/**
 * The webhook destination, or null when none is configured. Normalised once, here: trimmed, blank
 * means unset, and anything that is not https is refused rather than used, because the URL is itself
 * a credential (anyone holding it can post to that channel) and must not travel in cleartext. A bad
 * value switches notifications off with a warning; it never stops the app starting.
 */
export function webhookUrlFrom(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || url.protocol !== "https:") {
    console.warn("NOTIFY_WEBHOOK_URL is not an https URL; owner notifications are off.");
    return null;
  }
  return url;
}

export function webhookNotifier(url: URL | null, fetchImpl: typeof fetch = fetch): Notifier {
  if (!url) return silentNotifier;
  return async (notice) => {
    const outcome = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(webhookBody(notice)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then(
      (res) => (res.ok ? null : `answered HTTP ${res.status}`),
      (err: unknown) => (err instanceof Error ? err.message : "failed")
    );
    // The destination is not logged: it is a credential.
    if (outcome) console.warn(`Owner notification webhook ${outcome}; the ${notice.kind === "pass_booking" ? "booking" : "request"} is stored regardless.`);
  };
}
