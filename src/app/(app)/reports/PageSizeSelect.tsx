"use client";
import { useRouter } from "next/navigation";

/** How many projects the report's Summary shows on each page. Changing it starts again from the first page. */
export default function PageSizeSelect({ value, options, query }: { value: number; options: number[]; query: string }) {
  const router = useRouter();
  return (
    <label className="psize">Per page
      <select defaultValue={value} onChange={(e) => router.push(`/reports?${query}${query ? "&" : ""}pp=${e.target.value}`)}>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
