import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/stadium";

export default function Page() {
  if (!isExampleEnabled("stadium")) notFound();
  return <Example />;
}
