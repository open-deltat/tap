import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/airline";

export default function Page() {
  if (!isExampleEnabled("airline")) notFound();
  return <Example />;
}
