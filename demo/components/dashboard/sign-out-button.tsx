// Sign-out is a POST (a GET would be CSRF-able), so it is a one-button same-origin form.
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/logout" method="post">
      <button
        type="submit"
        className={className ?? "text-muted-foreground hover:text-foreground text-sm underline"}
      >
        Sign out
      </button>
    </form>
  );
}
