import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/hotel";

export default function Page() {
  if (!isExampleEnabled("hotel")) notFound();
  return <Example />;
}
