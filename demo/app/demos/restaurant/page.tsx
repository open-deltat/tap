import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/restaurant";

export default function Page() {
  if (!isExampleEnabled("restaurant")) notFound();
  return <Example />;
}
