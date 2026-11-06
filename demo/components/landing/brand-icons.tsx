import { siApple, siGooglecalendar } from "simple-icons";

// The calendars people already use, as monochrome marks. Google Calendar and Apple come from
// simple-icons; Outlook is drawn here because that set carries no Microsoft marks any more. All
// three are drawn in the current text colour so they sit quietly in the theme.
function Glyph({ d, title, className }: { d: string; title: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={title} className={className}>
      <title>{title}</title>
      <path d={d} />
    </svg>
  );
}

export function GoogleCalendarMark({ className }: { className?: string }) {
  return <Glyph d={siGooglecalendar.path} title="Google Calendar" className={className} />;
}

export function AppleMark({ className }: { className?: string }) {
  return <Glyph d={siApple.path} title="Apple" className={className} />;
}

// The three calendars most people use today, in the order the hero and the walls show them.
export const OLD_WORLD = [
  { name: "Google Calendar", Mark: GoogleCalendarMark },
  { name: "Apple Calendar", Mark: AppleMark },
  { name: "Outlook", Mark: OutlookMark },
] as const;

export function OutlookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" role="img" aria-label="Outlook" className={className}>
      <title>Outlook</title>
      <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 4.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5zm0 2.2a2.55 2.55 0 1 1 0 5.1 2.55 2.55 0 0 1 0-5.1z" />
    </svg>
  );
}
