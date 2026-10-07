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
  phaseName?: string;
  tagIds?: string[];
  description?: string;
  custom?: Record<string, string>;
  date: string;
  startMin?: number;
  minutes?: number;
  readOnly?: boolean;
  lockedReason?: string | null;
  ownerName?: string;
  /** Timesheet cells: project and date come from the cell, so the form doesn't ask for them or for a start time. */
  fixed?: boolean;
  /** Shown under the title, e.g. "Patient portal · Bluebird Health · Wed, Sep 30". */
  context?: string;
};
