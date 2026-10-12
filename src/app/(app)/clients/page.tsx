import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead } from "@/components/ui";
import { AddClientButton } from "../projects/ClientForm";
import { clientTeamOptions } from "@/lib/clientTeams";
import ContractsView from "./ContractsView";
import YearPicker from "@/components/YearPicker";
import { gridYear } from "@/lib/monthGrid";

// Monthly contracts for location managers and admins. Contracts are company-wide. The client overview (hours and utilisation for each client)
// is a tab on the Dashboard.
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const me = await requireTab("clients");
  await getSettings(); // sets the company time zone, which decides the year's current month
  const admin = me.role === "ADMIN";
  const [teamOpts, tagOpts] = admin ? await Promise.all([clientTeamOptions(), db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]) : [[], []];
  return (
    <>
      <PageHead title="Clients" actions={<><YearPicker year={gridYear(sp.year)} view="contracts" />{admin && <AddClientButton teams={teamOpts} tags={tagOpts} />}</>}
        sub="Contracted hours for each client, month by month. Contracts that change from month to month, or end part-way through one, are worked out month by month." />
      <div className="grid"><ContractsView admin={admin} yearParam={sp.year} /></div>
    </>
  );
}
