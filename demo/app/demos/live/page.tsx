import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/live";

export default function Page() {
  if (!isExampleEnabled("live")) notFound();
  return <Example />;
}
