import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/theater";

export default function Page() {
  if (!isExampleEnabled("theater")) notFound();
  return <Example />;
}
