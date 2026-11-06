import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Renders docs markdown on the site's dt-* tokens, no typography plugin. Internal links go through
// next/link; fenced code is highlighted and stays dark in both themes (the .hljs palette in
// globals.css is tuned for a dark fence), inline code gets a quiet pill.
const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-[3px] transition-colors hover:decoration-dt-accent";

const components: Components = {
  h1: (p) => <h1 className="mt-12 text-balance text-[1.6rem] font-semibold tracking-[-0.02em] text-dt-ink" {...p} />,
  h2: (p) => <h2 className="mt-12 text-balance text-[1.3rem] font-semibold tracking-[-0.015em] text-dt-ink" {...p} />,
  h3: (p) => <h3 className="mt-8 text-[1.05rem] font-semibold tracking-tight text-dt-ink" {...p} />,
  h4: (p) => <h4 className="mt-6 text-[15px] font-semibold text-dt-ink" {...p} />,
  p: (p) => <p className="mt-4 max-w-[68ch] text-pretty text-[15.5px] leading-[1.7] text-dt-ink-2" {...p} />,
  ul: (p) => <ul className="mt-4 max-w-[68ch] list-disc space-y-2 pl-5 text-[15.5px] leading-[1.7] text-dt-ink-2 marker:text-dt-ink-3" {...p} />,
  ol: (p) => <ol className="mt-4 max-w-[68ch] list-decimal space-y-2 pl-5 text-[15.5px] leading-[1.7] text-dt-ink-2 marker:text-dt-ink-3" {...p} />,
  li: (p) => <li className="leading-[1.7] [&>p]:mt-1" {...p} />,
  strong: (p) => <strong className="font-semibold text-dt-ink" {...p} />,
  em: (p) => <em className="text-dt-ink" {...p} />,
  hr: () => <hr className="my-10 border-dt-line" />,
  blockquote: (p) => (
    <blockquote className="mt-5 max-w-[68ch] rounded-r-xl border-l-2 border-dt-accent bg-dt-sunken py-3 pl-4 pr-4 text-[15px] leading-[1.7] text-dt-ink-2 [&>p]:mt-0" {...p} />
  ),
  // Fences stay dark in both themes on purpose: the highlight palette is tuned for a dark ground,
  // and a dark block reads as "code" at a glance on a light page too (Stripe, Vercel docs).
  pre: (p) => (
    <pre className="mt-5 overflow-x-auto rounded-2xl border border-dt-line bg-[#0b0b0f] p-5 text-[13px] leading-relaxed text-[#e4e4e7]" {...p} />
  ),
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) return <code className={`font-mono ${className ?? ""}`} {...rest}>{children}</code>;
    return <code className="rounded-md bg-dt-sunken px-1.5 py-0.5 font-mono text-[0.86em] text-dt-ink ring-1 ring-dt-line" {...rest}>{children}</code>;
  },
  a: ({ href, children, ...rest }) => {
    const target = href ?? "#";
    if (target.startsWith("/")) {
      return (
        <Link href={target} className={LINK}>
          {children}
        </Link>
      );
    }
    const external = target.startsWith("http");
    return (
      <a href={target} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} className={LINK} {...rest}>
        {children}
      </a>
    );
  },
  table: (p) => (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-dt-line bg-dt-surface">
      <table className="w-full text-left text-[14px] tabular-nums text-dt-ink-2" {...p} />
    </div>
  ),
  thead: (p) => <thead className="bg-dt-sunken text-dt-ink" {...p} />,
  th: (p) => <th className="border-b border-dt-line px-4 py-2.5 font-medium" {...p} />,
  td: (p) => <td className="border-b border-dt-line px-4 py-2.5 align-top" {...p} />,
};

// `detect: false` is the default and is load-bearing: a few fences are deliberately unlabelled
// pseudo-code (the read/think/write sketch), and guessing a language for those colours them wrong.
// Highlighting runs here on the server at build time, so highlight.js never reaches the browser;
// the token colours live in globals.css under `.hljs`.
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: false }]]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
