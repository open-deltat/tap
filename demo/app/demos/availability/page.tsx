import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/availability";

export default function Page() {
  if (!isExampleEnabled("availability")) notFound();
  return <Example />;
}
