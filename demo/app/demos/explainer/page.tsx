import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/explainer";

export default function Page() {
  if (!isExampleEnabled("explainer")) notFound();
  return <Example />;
}
