/**
 * A secret from the person at the keyboard: typed without echo on a terminal, or the first line of
 * piped input (`pass show deltat | deltat-cli login`). Null when they abort or give nothing.
 */
export async function readSecret(prompt: string): Promise<string | null> {
  return process.stdin.isTTY ? readHidden(prompt) : readFirstLine();
}

function readHidden(prompt: string): Promise<string | null> {
  const input = process.stdin;
  process.stderr.write(prompt);
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.resume();

  return new Promise((resolve) => {
    const typed: string[] = [];
    const finish = (value: string | null) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
      resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(typed.join("") || null);
        if (ch === "\u0003" || ch === "\u0004") return finish(null); // Ctrl-C, Ctrl-D
        if (ch === "\u007f" || ch === "\b") typed.pop();
        else if (ch >= " ") typed.push(ch);
      }
    };
    input.on("data", onData);
  });
}

/** The first line exactly as piped, minus its line ending: a password may contain spaces. */
async function readFirstLine(): Promise<string | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const first = Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
  return first === "" ? null : first;
}
