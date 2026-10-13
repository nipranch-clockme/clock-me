import { redirect } from "next/navigation";
import { currentUser, signInPath } from "@/lib/auth";

export default async function Home() {
  const me = await currentUser();
  redirect(!me ? await signInPath() : me.role === "MEMBER" ? "/timesheet" : "/dashboard");
}
