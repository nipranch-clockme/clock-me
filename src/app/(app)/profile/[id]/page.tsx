import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { findVisiblePerson } from "@/lib/profile";
import ProfileView from "../ProfileView";

/** Someone else's profile. Only people who can already see their time get it; everyone else gets "not found". */
export default async function PersonProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ id }, { range }] = await Promise.all([params, searchParams]);
  const me = await requireUser();
  if (id === me.id) redirect(`/profile${range ? `?range=${encodeURIComponent(range)}` : ""}`);
  const person = await findVisiblePerson(me, id);
  if (!person) notFound();
  return <ProfileView me={me} person={person} range={range} />;
}
