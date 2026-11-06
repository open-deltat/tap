// The five people whose calendars the example reads. Each has a name and a mark: an abstract,
// geometric avatar drawn in the theme's greys, so colour keeps its meaning (green free, amber held,
// ink chosen) and the faces carry no mood.
export const FRIENDS = [
  { name: "Ava", mark: "dot" },
  { name: "Ben", mark: "bars" },
  { name: "Cleo", mark: "ring" },
  { name: "Dev", mark: "half" },
  { name: "Eli", mark: "diamond" },
] as const;

type Mark = (typeof FRIENDS)[number]["mark"];

export function FriendAvatar({ i, size = 24, className }: { i: number; size?: number; className?: string }) {
  const friend = FRIENDS[i] ?? FRIENDS[0];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={friend.name} className={className}>
      <title>{friend.name}</title>
      <circle cx="12" cy="12" r="11.5" fill="var(--dt-sunken)" stroke="var(--dt-line-strong)" />
      <MarkShape kind={friend.mark} />
    </svg>
  );
}

function MarkShape({ kind }: { kind: Mark }) {
  const c = "var(--dt-ink-2)";
  switch (kind) {
    case "dot":
      return <circle cx="12" cy="12" r="4.5" fill={c} />;
    case "bars":
      return (
        <>
          <rect x="7.5" y="7" width="3" height="10" rx="1.5" fill={c} />
          <rect x="13.5" y="7" width="3" height="10" rx="1.5" fill={c} />
        </>
      );
    case "ring":
      return <circle cx="12" cy="12" r="5" fill="none" stroke={c} strokeWidth="2.5" />;
    case "half":
      return <path d="M12 6a6 6 0 0 1 0 12z" fill={c} />;
    case "diamond":
      return <rect x="8" y="8" width="8" height="8" rx="1.5" transform="rotate(45 12 12)" fill={c} />;
  }
}
