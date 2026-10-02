import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  const me = await currentUser();
  redirect(!me ? "/login" : me.role === "MEMBER" ? "/timesheet" : "/dashboard");
}
