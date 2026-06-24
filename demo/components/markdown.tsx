import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders docs markdown with the site's dark zinc/emerald styling, no typography plugin. Internal
// links go through next/link; fenced code is a plain block, inline code gets a pill.
const components: Components = {
  h1: (p) => <h1 className="mt-10 text-2xl font-semibold text-zinc-100" {...p} />,
  h2: (p) => <h2 className="mt-10 text-xl font-semibold text-zinc-100" {...p} />,
  h3: (p) => <h3 className="mt-7 text-base font-semibold text-zinc-100" {...p} />,
  h4: (p) => <h4 className="mt-5 text-sm font-semibold text-zinc-200" {...p} />,
  p: (p) => <p className="mt-4 text-[14px] leading-relaxed text-zinc-300" {...p} />,
  ul: (p) => <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-zinc-300" {...p} />,
  ol: (p) => <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-zinc-300" {...p} />,
  li: (p) => <li className="leading-relaxed [&>p]:mt-1" {...p} />,
  strong: (p) => <strong className="font-semibold text-zinc-100" {...p} />,
  em: (p) => <em className="text-zinc-200" {...p} />,
  hr: () => <hr className="my-8 border-white/10" />,
  blockquote: (p) => <blockquote className="mt-4 border-l-2 border-emerald-400/40 pl-4 text-[14px] leading-relaxed text-zinc-400" {...p} />,
  pre: (p) => <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-4 text-[12.5px] leading-relaxed text-zinc-200" {...p} />,
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) return <code className={`font-mono ${className ?? ""}`} {...rest}>{children}</code>;
    return <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-200" {...rest}>{children}</code>;
  },
  a: ({ href, children, ...rest }) => {
    const target = href ?? "#";
    if (target.startsWith("/")) {
      return (
        <Link href={target} className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-300">
          {children}
        </Link>
      );
    }
    const external = target.startsWith("http");
    return (
      <a
        href={target}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-300"
        {...rest}
      >
        {children}
      </a>
    );
  },
  table: (p) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-left text-[13px] text-zinc-300" {...p} />
    </div>
  ),
  thead: (p) => <thead className="bg-white/[0.03] text-zinc-200" {...p} />,
  th: (p) => <th className="border-b border-white/10 px-3 py-2 font-medium" {...p} />,
  td: (p) => <td className="border-b border-white/[0.06] px-3 py-2 align-top" {...p} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
