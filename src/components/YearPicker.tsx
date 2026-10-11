import AutoForm from "./AutoForm";
import { Ifld } from "./ui";
import { gridYears } from "@/lib/monthGrid";

/** The year picker for the monthly tables. `view` keeps the page on the same view when the year changes. */
export default function YearPicker({ year, view }: { year: number; view: string }) {
  return (
    <AutoForm className="phd-a" key={year}>
      <input type="hidden" name="view" value={view} />
      <Ifld id="mg-year" label="Year" name="year" defaultValue={String(year)}>{gridYears().map((y) => <option key={y} value={y}>{y}</option>)}</Ifld>
    </AutoForm>
  );
}
