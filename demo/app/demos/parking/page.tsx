import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/parking";

export default function Page() {
  if (!isExampleEnabled("parking")) notFound();
  return <Example />;
}
