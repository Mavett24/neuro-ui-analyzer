import { redirect } from "next/navigation";

// The landing page moved to the homepage. Old /landing links still work.
export default function LandingRedirect() {
  redirect("/");
}
