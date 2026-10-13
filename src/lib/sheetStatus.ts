/** What each timesheet status is called on screen, everywhere: the Timesheet pill, Profile, Approvals and the Reports filter. */
export const SHEET_STATUS: Record<string, string> = { DRAFT: "Not submitted", SUBMITTED: "Waiting for approval", APPROVED: "Approved", REJECTED: "Sent back" };
export const sheetStatusLabel = (status: string | null | undefined) => SHEET_STATUS[status ?? "DRAFT"] ?? String(status);
