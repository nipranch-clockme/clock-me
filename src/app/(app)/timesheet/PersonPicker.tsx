"use client";
import { useRouter } from "next/navigation";
import SearchSelect from "@/components/SearchSelect";

export default function PersonPicker({ people, current, meId, offset }: { people: { id: string; name: string }[]; current: string; meId: string; offset: number }) {
  const router = useRouter();
  return (
    <div style={{ flex: "0 1 260px" }}>
      <label htmlFor="caluser">Showing</label>
      <SearchSelect id="caluser" value={current} searchLabel="Search people" onChange={(v) => router.push(`/timesheet?view=cal&w=${offset}${v !== meId ? `&u=${v}` : ""}`)}
        options={people.map((p) => ({ value: p.id, label: p.name + (p.id === meId ? " (you)" : "") }))} />
    </div>
  );
}
