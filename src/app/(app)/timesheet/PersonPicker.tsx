"use client";
import { useRouter } from "next/navigation";
import SearchSelect from "@/components/SearchSelect";

/** Switches the Timesheet or Calendar to another person, keeping the week. Your own week is the one with no `u` in the address. */
export default function PersonPicker({ people, current, meId, offset, view = "cal", label = "Showing" }: { people: { id: string; name: string }[]; current: string; meId: string; offset: number; view?: "sheet" | "cal"; label?: string }) {
  const router = useRouter();
  return (
    <div style={{ flex: "0 1 260px" }}>
      <label htmlFor="caluser">{label}</label>
      <SearchSelect id="caluser" value={current} searchLabel="Search people" onChange={(v) => {
        const q = new URLSearchParams();
        if (view === "cal") q.set("view", "cal");
        if (offset) q.set("w", String(offset));
        if (v !== meId) q.set("u", v);
        router.push(`/timesheet${q.size ? `?${q}` : ""}`);
      }}
        options={people.map((p) => ({ value: p.id, label: p.name + (p.id === meId ? " (you)" : "") }))} />
    </div>
  );
}
