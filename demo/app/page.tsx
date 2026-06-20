import { redirect } from "next/navigation";

// The "How it works" wiki is the landing page.
export default function Home() {
  redirect("/demos/explainer");
}
