import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/meet";

export default function Page() {
  if (!isExampleEnabled("meet")) notFound();
  return <Example />;
}
