import { cookies } from "next/headers";
import ThemePicker from "./ThemePicker";
import { THEME_COOKIE, themeOf } from "@/lib/themes";

/** The theme choice card, shown under Settings and on My profile. It only changes how the app looks for the person using this browser. */
export default async function AppearancePanel() {
  const cur = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <section className="panel full">
      <h3>Appearance</h3>
      <p className="note" style={{ margin: "0 0 12px" }}>Pick a theme. It changes how The Time Sink looks for you only, on this browser.</p>
      <ThemePicker initial={cur} />
    </section>
  );
}
