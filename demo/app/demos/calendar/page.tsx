import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/calendar";

export default function Page() {
  if (!isExampleEnabled("calendar")) notFound();
  return <Example />;
}
