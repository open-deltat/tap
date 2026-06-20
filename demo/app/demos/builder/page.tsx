import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/builder";

export default function Page() {
  if (!isExampleEnabled("builder")) notFound();
  return <Example />;
}
