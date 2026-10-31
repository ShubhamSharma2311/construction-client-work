import { useState } from "react";
import { Link } from "react-router";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { useToast } from "../../app/Toast.tsx";
import { useLeave } from "../../app/useLeave.ts";
import { formatFullDate } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Tag } from "../../ui/Tag.tsx";
import { balanceText } from "./balanceText.ts";
import type { TripItem } from "./tripFilters.ts";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import styles from "../../ui/Actions.module.css";
import { TripStatusTag } from "./TripStatusTag.tsx";
import { useDeleteTrip, useRestoreTrip, useTrip } from "./useTrips.ts";

export function TripPage({ id }: { id: number }) {
  const trip = useTrip(id);
  if (trip.isError) return <LoadError error={trip.error} onRetry={() => void trip.refetch()} />;
  if (!trip.data) return <Loading what="the trip" />;
  return <TripDetails trip={trip.data} />;
}

function TripDetails({ trip }: { trip: TripItem }) {
  const opening = trip.kind === "OPENING_BALANCE";
  const title = opening ? "Old register balance" : `Trip on ${formatFullDate(trip.tripDate)}`;
  return (
    <>
      <PageHeader
        title={title}
        actions={
          trip.deletedAt ? <Tag tone="quiet">Deleted</Tag> : <TripStatusTag status={trip.status} />
        }
      />
      <DetailList>
        <Detail label="Customer">
          <Link to={`/dues/${String(trip.customer.id)}`}>{trip.customer.name}</Link>
        </Detail>
        {opening ? null : (
          <>
            <Detail label="Date">{formatFullDate(trip.tripDate)}</Detail>
            <Detail label="Driver">{trip.driver?.name ?? "—"}</Detail>
            <Detail label="Tractor">{trip.tractor?.regNumber ?? "—"}</Detail>
            <Detail label="Khet">{trip.khet?.name ?? "—"}</Detail>
          </>
        )}
        {trip.quantityNote ? <Detail label="Quantity">{trip.quantityNote}</Detail> : null}
        {trip.notes ? <Detail label="Note">{trip.notes}</Detail> : null}
        <Detail label="Amount">
          <Money paise={trip.amountPaise} />
        </Detail>
        <Detail label="Received">
          <Money paise={trip.receivedPaise} tone={trip.receivedPaise > 0 ? "received" : "plain"} />
        </Detail>
        <Detail label="Still due">
          <Money paise={trip.duePaise} tone={trip.duePaise > 0 ? "owed" : "plain"} />
        </Detail>
      </DetailList>
      {trip.deletedAt ? <RestoreTrip trip={trip} /> : <TripActions trip={trip} />}
    </>
  );
}

function TripActions({ trip }: { trip: TripItem }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteTrip(trip.id);
  const toast = useToast();
  const leave = useLeave("/trips");
  const received = trip.receivedPaise > 0;

  return (
    <div className={styles.actions}>
      {trip.duePaise > 0 ? (
        <ButtonLink to={`/new/payment?trip=${String(trip.id)}`}>Mark money received</ButtonLink>
      ) : null}
      {trip.kind === "TRIP" ? (
        <ButtonLink
          variant={trip.duePaise > 0 ? "secondary" : "primary"}
          to={`/trips/${String(trip.id)}/edit`}
        >
          Edit trip
        </ButtonLink>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Delete this entry?"
        confirmLabel={
          received
            ? `Delete and move ${formatRupees(trip.receivedPaise)} to credit`
            : "Delete entry"
        }
        busy={remove.isPending}
        error={remove.isError ? saveErrorMessage(remove.error) : null}
        onClose={() => {
          setConfirming(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove.mutate(received, {
            onSuccess: (result) => {
              const moved =
                result.releasedPaise > 0
                  ? ` ${formatRupees(result.releasedPaise)} moved to credit.`
                  : "";
              toast(
                `Entry deleted.${moved} ${balanceText(trip.customer.name, result.customerBalance)}`,
              );
              leave();
            },
          });
        }}
      >
        <p className={styles.text}>
          {received
            ? `${formatRupees(trip.receivedPaise)} was received for this trip. Deleting it keeps that money as ${trip.customer.name}'s credit, to use on another trip.`
            : "It can be restored later from the deleted entries."}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function RestoreTrip({ trip }: { trip: TripItem }) {
  const restore = useRestoreTrip(trip.id);
  const toast = useToast();
  return (
    <div className={styles.actions}>
      {restore.isError ? <ErrorNotice>{saveErrorMessage(restore.error)}</ErrorNotice> : null}
      <Button
        disabled={restore.isPending}
        onClick={() => {
          restore.mutate(undefined, {
            onSuccess: (result) => {
              toast(`Entry restored. ${balanceText(trip.customer.name, result.customerBalance)}`);
            },
          });
        }}
      >
        {restore.isPending ? "Restoring…" : "Restore entry"}
      </Button>
    </div>
  );
}
