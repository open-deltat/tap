import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/rules";

export default function Page() {
  if (!isExampleEnabled("rules")) notFound();
  return <Example />;
}
