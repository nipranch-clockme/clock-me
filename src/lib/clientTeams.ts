import { db } from "./db";

/** Teams a client can be assigned to, labelled with their office. */
export async function clientTeamOptions() {
  const teams = await db.team.findMany({ include: { location: true }, orderBy: [{ location: { name: "asc" } }, { name: "asc" }] });
  return teams.map((t) => ({ id: t.id, label: `${t.name} team, ${t.location.name}` }));
}

export const teamLabelOf = (t: { name: string; location: { name: string } }) => `${t.name} team, ${t.location.name}`;
