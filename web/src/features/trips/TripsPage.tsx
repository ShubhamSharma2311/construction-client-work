import { useState } from "react";
import { useSearchParams } from "react-router";
import { useDownload } from "../../api/useDownload.ts";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { presetRange } from "../../lib/ranges.ts";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { LoadError, Loading } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { loadErrorMessage } from "../../ui/LoadState.tsx";
import { filterOptions, useDrivers, useKhets, useTractors } from "../masters/useMasters.ts";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import {
  readTripFilters,
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  type TripFilters,
  type TripItem,
  tripQuery,
  writeTripFilters,
} from "./tripFilters.ts";
import styles from "./TripsPage.module.css";
import { TripStatusTag } from "./TripStatusTag.tsx";
import { useTripList } from "./useTrips.ts";

export function TripsPage() {
  const settings = useSettings();
  if (settings.data === null) {
    return (
      <>
        <PageHeader title="Trips" />
        <SetupPrompt />
      </>
    );
  }
  if (!settings.data) return <PageHeader title="Trips" />;
  return <TripsList startDate={settings.data.businessStartDate} />;
}

function TripsList({ startDate }: { startDate: IsoDate }) {
  const today = todayIso(new Date());
  const [params, setParams] = useSearchParams();
  const filters = readTripFilters(params, presetRange("week", today));
  const setFilters = (next: TripFilters) => {
    setParams(writeTripFilters(next), { replace: true });
  };
  const list = useTripList(filters);
  const download = useDownload();
  const first = list.data?.pages[0];
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title={filters.deleted ? "Deleted trips" : "Trips"}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={download.isPending}
              onClick={() => {
                const query = Object.fromEntries(
                  Object.entries(tripQuery(filters)).map(([key, value]) => [key, String(value)]),
                );
                download.mutate({ path: "/trips/export", query });
              }}
            >
              {download.isPending ? "Preparing…" : "Download"}
            </Button>
            <ButtonLink to="/new/trip">New trip</ButtonLink>
          </>
        }
      />
      {download.isError ? <ErrorNotice>{loadErrorMessage(download.error)}</ErrorNotice> : null}
      <RangeChips
        value={filters.range}
        today={today}
        startDate={startDate}
        onChange={(range) => {
          setFilters({ ...filters, range });
        }}
      />
      <Filters filters={filters} onChange={setFilters} />

      {first ? (
        <dl className={styles.totals}>
          <div>
            <dt>Trips</dt>
            <dd>{first.totals.count}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>
              <Money paise={first.totals.amountPaise} />
            </dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>
              <Money paise={first.totals.receivedPaise} tone="received" />
            </dd>
          </div>
          <div>
            <dt>Still due</dt>
            <dd>
              <Money
                paise={first.totals.duePaise}
                tone={first.totals.duePaise > 0 ? "owed" : "plain"}
              />
            </dd>
          </div>
        </dl>
      ) : null}

      {list.isPending ? <Loading what="trips" /> : null}
      {list.isError ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data ? (
        <EntryTable
          caption="Trips"
          rows={rows}
          columns={tripColumns(today)}
          rowKey={(trip) => trip.id}
          rowLink={(trip) => `/trips/${String(trip.id)}`}
          rowLabel={(trip) => `${trip.customer.name}, ${formatDate(trip.tripDate, today)}`}
          phoneMeta={(trip) =>
            [formatDate(trip.tripDate, today), trip.driver?.name, trip.khet?.name]
              .filter(Boolean)
              .join(", ")
          }
          empty={emptyText(filters)}
        />
      ) : null}
      {list.hasNextPage ? (
        <div className={styles.more}>
          <span>
            Showing {rows.length} of {first?.total ?? rows.length}
          </span>
          <Button
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function tripColumns(today: IsoDate): Column<TripItem>[] {
  return [
    {
      key: "date",
      header: "Date",
      cell: (trip) => formatDate(trip.tripDate, today),
      phone: "hidden",
      margin: true,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (trip) =>
        trip.kind === "OPENING_BALANCE"
          ? `${trip.customer.name} (old balance)`
          : trip.customer.name,
      phone: "title",
    },
    { key: "driver", header: "Driver", cell: (trip) => trip.driver?.name ?? "—", phone: "hidden" },
    {
      key: "tractor",
      header: "Tractor",
      cell: (trip) => trip.tractor?.regNumber ?? "—",
      phone: "hidden",
    },
    { key: "khet", header: "Khet", cell: (trip) => trip.khet?.name ?? "—", phone: "hidden" },
    {
      key: "amount",
      header: "Amount",
      cell: (trip) => <Money paise={trip.amountPaise} />,
      phone: "amount",
      numeric: true,
    },
    {
      key: "received",
      header: "Received",
      cell: (trip) => <Money paise={trip.receivedPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "status",
      header: "Status",
      cell: (trip) => <TripStatusTag status={trip.status} />,
      phone: "status",
    },
  ];
}

function Filters({
  filters,
  onChange,
}: {
  filters: TripFilters;
  onChange: (next: TripFilters) => void;
}) {
  const drivers = useDrivers();
  const tractors = useTractors();
  const khets = useKhets();
  const set = (patch: Partial<TripFilters>) => {
    onChange({ ...filters, ...patch });
  };
  // Open at first if any filter is set; after that the person opens and closes it.
  const [initiallyOpen] = useState(() => countFilters(filters) > 0);
  const count = countFilters(filters);

  return (
    <details className={styles.filters} open={initiallyOpen}>
      <summary>{count > 0 ? `Filters (${String(count)})` : "Filters"}</summary>
      <div className={styles.filterGrid}>
        <SelectField
          label="Driver"
          placeholder="All drivers"
          value={filters.driverId}
          options={filterOptions(drivers.data, (item) => item.name)}
          onChange={(driverId) => {
            set({ driverId });
          }}
        />
        <SelectField
          label="Tractor"
          placeholder="All tractors"
          value={filters.tractorId}
          options={filterOptions(tractors.data, (item) => item.regNumber)}
          onChange={(tractorId) => {
            set({ tractorId });
          }}
        />
        <SelectField
          label="Khet"
          placeholder="All khets"
          value={filters.khetId}
          options={filterOptions(khets.data, (item) => item.name)}
          onChange={(khetId) => {
            set({ khetId });
          }}
        />
        <SelectField
          label="Payment"
          placeholder="Paid or not"
          value={filters.status}
          options={TRIP_STATUSES.map((status) => ({
            value: status,
            label: TRIP_STATUS_LABELS[status],
          }))}
          onChange={(status) => {
            set({ status: TRIP_STATUSES.find((candidate) => candidate === status) ?? "" });
          }}
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={filters.deleted}
            onChange={(event) => {
              set({ deleted: event.target.checked });
            }}
          />
          Show deleted trips only
        </label>
      </div>
    </details>
  );
}

function countFilters(filters: TripFilters): number {
  const set = [filters.driverId, filters.tractorId, filters.khetId, filters.status].filter(
    Boolean,
  ).length;
  return set + (filters.deleted ? 1 : 0);
}

function emptyText(filters: TripFilters): string {
  const what = filters.deleted ? "deleted trips" : "trips";
  return filters.range ? `No ${what} in these dates.` : `No ${what} yet.`;
}
