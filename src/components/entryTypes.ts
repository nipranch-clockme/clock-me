export type ProjectOpt = { id: string; name: string; client: string; phases: { id: string; name: string }[] };
export type FieldOpt = { id: string; name: string; type: string; options: string[]; required: boolean };
export type EntryOptions = {
  projects: ProjectOpt[];
  tags: { id: string; name: string }[];
  fields: FieldOpt[];
  requireTag: boolean;
  requireDescription: boolean;
  timeFormat: "decimal" | "hhmm";
};
export type EntryValue = {
  id?: string;
  projectId?: string;
  projectName?: string;
  phaseId?: string | null;
  tagId?: string | null;
  description?: string;
  custom?: Record<string, string>;
  date: string;
  startMin?: number;
  minutes?: number;
  readOnly?: boolean;
  lockedReason?: string | null;
  ownerName?: string;
};
