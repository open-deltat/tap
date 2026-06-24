// Emits one schema.org JSON-LD block as a <script>. Callers pass the @graph nodes (from lib/seo);
// the <-escape blocks any "</script>" sequence from breaking out of the tag.
type Ld = Record<string, unknown>;

export function JsonLd({ graph }: { graph: Ld[] }) {
  const data = { "@context": "https://schema.org", "@graph": graph };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
