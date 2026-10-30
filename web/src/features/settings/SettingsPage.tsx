import { useSearchParams } from "react-router";
import { readChoice } from "../../lib/addressFilters.ts";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink } from "../../ui/Register.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { ViewToggle } from "../../ui/ViewToggle.tsx";
import { HISTORY_KINDS } from "../history/historyKinds.ts";
import { HistoryView } from "../history/HistoryView.tsx";
import { BusinessForm } from "./BusinessForm.tsx";
import { PasswordForm } from "./PasswordForm.tsx";
import styles from "./SettingsPage.module.css";
import { useSettings } from "./useSettings.ts";

const VIEWS = [
  { value: "business", label: "Business details" },
  { value: "password", label: "Password" },
  { value: "deleted", label: "Deleted entries" },
  { value: "history", label: "Change history" },
] as const;

type View = (typeof VIEWS)[number]["value"];
const VIEW_NAMES = VIEWS.map((view) => view.value);

export function SettingsPage() {
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const view: View = readChoice(params, "view", VIEW_NAMES) || "business";
  const kind = HISTORY_KINDS.find((one) => one.value === params.get("kind")) ?? HISTORY_KINDS[0];
  const show = (next: { view: View; kind?: string }) => {
    setParams(
      next.view === "history"
        ? { view: next.view, kind: next.kind ?? kind.value }
        : { view: next.view },
      {
        replace: true,
      },
    );
  };

  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (settings.data === undefined) return <Loading what="the settings" />;
  // A new install has nothing to delete or look back on until the business is set up.
  if (settings.data === null) {
    return (
      <>
        <PageHeader title="Set up the business" />
        <BusinessForm settings={null} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" />
      <ViewToggle
        options={VIEWS}
        value={view}
        onChange={(next) => {
          show({ view: next });
        }}
      />
      {view === "business" ? <BusinessForm settings={settings.data} /> : null}
      {view === "password" ? <PasswordForm /> : null}
      {view === "deleted" ? <DeletedEntries /> : null}
      {view === "history" ? (
        <section className={styles.section} aria-label="History">
          <SelectField
            label="Show changes to"
            value={kind.value}
            options={HISTORY_KINDS.map(({ value, label }) => ({ value, label }))}
            onChange={(next) => {
              show({ view: "history", kind: next });
            }}
          />
          <HistoryView key={kind.value} kind={kind} />
        </section>
      ) : null}
    </>
  );
}

/** Deleted trips and expenses are listed on their own screens, where each can be restored. */
function DeletedEntries() {
  return (
    <section className={styles.section} aria-label="Deleted entries">
      <p className={styles.note}>
        A deleted entry stays out of every total until it is restored. Open one to restore it.
      </p>
      <Register label="Deleted entries">
        <RegisterLink to="/trips?deleted=true&range=all" label="Deleted trips" />
        <RegisterLink to="/expenses?deleted=true&range=all" label="Deleted expenses" />
      </Register>
    </section>
  );
}
