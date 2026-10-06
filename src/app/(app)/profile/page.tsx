import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { findVisiblePerson } from "@/lib/profile";
import ProfileView from "./ProfileView";

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const me = await requireUser();
  const person = await findVisiblePerson(me, me.id);
  if (!person) notFound();
  return <ProfileView me={me} person={person} range={range} />;
}
