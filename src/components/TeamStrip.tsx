import type { Me } from "@/lib/auth";

/** The team line at the top of every page for members and team/project managers. Location managers and admins see no strip. */
export default function TeamStrip({ me }: { me: Me }) {
  if (me.role === "LOCATION" || me.role === "ADMIN" || !me.team) return null;
  return (
    <div className="teamstrip" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "0 0 14px", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)" }}>
      <b>{me.team.name} team, {me.location.name}</b>
    </div>
  );
}
