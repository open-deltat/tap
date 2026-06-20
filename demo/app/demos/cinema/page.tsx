import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/cinema";

export default function Page() {
  if (!isExampleEnabled("cinema")) notFound();
  return <Example />;
}
