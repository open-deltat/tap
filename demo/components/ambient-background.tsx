// The canvas the dashboard sits on, the same as every other page: flat dt-canvas with one faint light
// from above (the .dt-canvas class in globals.css). Theme-aware through the dt-* tokens.
export function AmbientBackground() {
  return <div aria-hidden className="dt-canvas pointer-events-none fixed inset-0 -z-10" />;
}
