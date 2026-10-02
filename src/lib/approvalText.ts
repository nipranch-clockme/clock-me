/** Why an approver's Approve or Send back didn't go through, judged from the timesheet's status now. */
export function staleText(status: string | undefined, name: string, week: string) {
  if (status === "DRAFT") return `${name} cancelled their submission for ${week}, so there's nothing to approve right now.`;
  if (status === "SUBMITTED") return `${name} changed their timesheet for ${week} after you opened this page, so nothing was done. Check the new hours and try again.`;
  return `Someone already handled ${name}'s timesheet for ${week}. Reload the page to see its status.`;
}
