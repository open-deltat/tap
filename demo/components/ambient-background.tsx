// The same ambient treatment the landing page uses, as a reusable layer: a soft accent glow plus a
// faint dot grid. Theme-aware (the dot colour follows the foreground), so it works on the light and
// dark dashboard alike, unlike the landing page's hardcoded dark canvas.
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bg-emerald-500/10 absolute left-1/2 top-0 h-[45vh] w-[45vh] -translate-x-1/2 -translate-y-1/3 rounded-full blur-[130px]" />
      <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,currentColor_1px,transparent_1px)] [background-size:22px_22px]" />
    </div>
  );
}
