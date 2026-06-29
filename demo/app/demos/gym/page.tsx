import { notFound } from "next/navigation";
import { isExampleEnabled } from "@/examples/config";
import Example from "@/examples/gym";

export default function Page() {
  if (!isExampleEnabled("gym")) notFound();
  // The full demo page shows the copy-paste embed snippet; the /embed/gym widget does not.
  return <Example showEmbed />;
}
