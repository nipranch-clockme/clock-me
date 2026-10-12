// The choices for a client in the Monthly contracts table. Plain values with no database import, so the table can use them in the browser too.

/** A client's status, in the order the table lists them: Contracted, then Project Based, then Lost. */
export const CLIENT_STATUS = [
  { value: "CONTRACTED", label: "Contracted" },
  { value: "PROJECT_BASED", label: "Project Based" },
  { value: "LOST", label: "Lost" },
];

export const DRAWING_STANDARDS = [
  { value: "AVDL", label: "AVDL" },
  { value: "MODIFIED_AVDL", label: "Modified AVDL" },
  { value: "PROPRIETARY", label: "Proprietary" },
];

/** Where a status sits in the table's order (Contracted first). */
export const statusRank = (value: string) => CLIENT_STATUS.findIndex((s) => s.value === value);

/** The label for a stored value, or "" when there is none. */
export const labelOf = (options: { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? "";
