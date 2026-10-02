"use client";
import { useRouter } from "next/navigation";

export default function PersonPicker({ people, current, meId, offset }: { people: { id: string; name: string }[]; current: string; meId: string; offset: number }) {
  const router = useRouter();
  return (
    <div style={{ flex: "0 1 260px" }}>
      <label htmlFor="caluser">Showing</label>
      <select id="caluser" value={current} onChange={(e) => router.push(`/calendar?w=${offset}${e.target.value !== meId ? `&u=${e.target.value}` : ""}`)}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === meId ? " (you)" : ""}</option>)}
      </select>
    </div>
  );
}
