// Telling the owner that someone asked for a meeting. Optional and best effort: the request is
// already stored and shows on the owner's dashboard, so a webhook that is down must never fail the
// request or slow it past a few seconds.
//
// Configured by NOTIFY_WEBHOOK_URL. The body carries the message as both `text` (Slack) and
// `content` (Discord), so either incoming-webhook URL works as is.

export interface OwnerNotice {
  /** One line for a human: who asked, for which calendar, when. */
  readonly text: string;
  readonly calendarId: string;
  readonly requestId: string;
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
      body: JSON.stringify({ text: notice.text, content: notice.text, calendar_id: notice.calendarId, request_id: notice.requestId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then(
      (res) => (res.ok ? null : `answered HTTP ${res.status}`),
      (err: unknown) => (err instanceof Error ? err.message : "failed")
    );
    // The destination is not logged: it is a credential.
    if (outcome) console.warn(`Owner notification webhook ${outcome}; the request is stored regardless.`);
  };
}
