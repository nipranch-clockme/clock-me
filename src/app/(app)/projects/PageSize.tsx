"use client";
import { useRouter } from "next/navigation";

/** How many projects the list shows on each page. Changing it starts again from the first page. */
export default function PageSize({ value, options, params }: { value: number; options: number[]; params: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="psize">Per page
      <select defaultValue={value} onChange={(e) => router.push(`/projects?${new URLSearchParams({ ...params, pp: e.target.value })}`)}>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
