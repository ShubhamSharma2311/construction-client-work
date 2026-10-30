import { useSearchParams } from "react-router";
import { useDownload } from "../../api/useDownload.ts";
import { readChoice, readRange, writeRange } from "../../lib/addressFilters.ts";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { PAY_MODE_OPTIONS, PAY_MODES, type PayMode } from "../../lib/payModes.ts";
import { businessDates, type DateRange, presetRange } from "../../lib/ranges.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { LoadError, loadErrorMessage } from "../../ui/LoadState.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { ViewToggle } from "../../ui/ViewToggle.tsx";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { DriversReport, KhetsReport, TractorsReport } from "./BreakdownReports.tsx";
import { CashBookReport } from "./CashBookReport.tsx";
import { DayByDayReport } from "./DayByDayReport.tsx";
import { ProfitReport } from "./ProfitReport.tsx";
import styles from "./Reports.module.css";

const REPORTS = [
  { value: "profit", label: "Profit", path: "/reports/pnl/export" },
  { value: "cashbook", label: "Cash book", path: "/reports/cashbook/export" },
  { value: "days", label: "Day by day", path: "/reports/summary/export" },
  { value: "tractors", label: "Tractors", path: "/reports/tractors/export" },
  { value: "khets", label: "Khets", path: "/reports/khets/export" },
  { value: "drivers", label: "Drivers", path: "/reports/drivers/export" },
] as const;

type Report = (typeof REPORTS)[number]["value"];
const REPORT_NAMES = REPORTS.map((report) => report.value);

export function ReportsPage() {
  const settings = useSettings();
  if (settings.data === null) {
    return (
      <>
        <PageHeader title="Reports" />
        <SetupPrompt />
      </>
    );
  }
  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!settings.data) return <PageHeader title="Reports" />;
  return <Reports startDate={settings.data.businessStartDate} />;
}

function Reports({ startDate }: { startDate: IsoDate }) {
  const today = todayIso(new Date());
  const [params, setParams] = useSearchParams();
  const report: Report = readChoice(params, "report", REPORT_NAMES) || "profit";
  const mode = readChoice(params, "mode", PAY_MODES) || "CASH";
  const range = readRange(params, presetRange("month", today));
  const dates = businessDates(range, startDate, today);
  const download = useDownload();
  const update = (patch: { report?: Report; mode?: PayMode; range?: DateRange | null }) => {
    const next = { report, mode, range, ...patch };
    setParams(
      {
        report: next.report,
        ...writeRange(next.range),
        ...(next.report === "cashbook" ? { mode: next.mode } : {}),
      },
      { replace: true },
    );
  };
  const path = REPORTS.find((candidate) => candidate.value === report)?.path ?? REPORTS[0].path;

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <Button
            variant="secondary"
            disabled={download.isPending || !dates}
            onClick={() => {
              if (!dates) return;
              download.mutate({
                path,
                query: { ...dates, ...(report === "cashbook" ? { mode } : {}) },
              });
            }}
          >
            {download.isPending ? "Preparing…" : "Download"}
          </Button>
        }
      />
      {download.isError ? <ErrorNotice>{loadErrorMessage(download.error)}</ErrorNotice> : null}
      <ViewToggle
        options={REPORTS}
        value={report}
        onChange={(next) => {
          update({ report: next });
        }}
      />
      <div className={styles.toolbar}>
        <RangeChips
          value={range}
          today={today}
          startDate={startDate}
          onChange={(next) => {
            update({ range: next });
          }}
        />
        {report === "cashbook" ? (
          <Choice
            label="Book"
            value={mode}
            options={PAY_MODE_OPTIONS}
            onChange={(next) => {
              update({ mode: next });
            }}
          />
        ) : null}
      </div>
      {dates ? (
        <ReportBody report={report} dates={dates} mode={mode} />
      ) : (
        <p className={styles.note}>
          The business started on {formatDate(startDate, today)}, so there is nothing before that.
        </p>
      )}
    </>
  );
}

function ReportBody({ report, dates, mode }: { report: Report; dates: DateRange; mode: PayMode }) {
  switch (report) {
    case "profit":
      return <ProfitReport range={dates} />;
    case "cashbook":
      return <CashBookReport range={dates} mode={mode} />;
    case "days":
      return <DayByDayReport range={dates} />;
    case "tractors":
      return <TractorsReport range={dates} />;
    case "khets":
      return <KhetsReport range={dates} />;
    case "drivers":
      return <DriversReport range={dates} />;
  }
}
