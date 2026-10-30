import { Link, useNavigate } from "react-router";
import { useToast } from "../../app/Toast.tsx";
import { todayIso } from "../../lib/dates.ts";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { balanceText } from "./balanceText.ts";
import { TripForm } from "./TripForm.tsx";
import { tripChanges, tripValuesOf } from "./tripForm.ts";
import { useTrip, useUpdateTrip } from "./useTrips.ts";

export function EditTripPage({ id }: { id: number }) {
  const trip = useTrip(id);
  const settings = useSettings();
  const update = useUpdateTrip(id);
  const toast = useToast();
  const navigate = useNavigate();

  if (trip.isError) return <LoadError error={trip.error} onRetry={() => void trip.refetch()} />;
  if (!trip.data || !settings.data) return <Loading what="the trip" />;
  if (trip.data.kind === "OPENING_BALANCE" || trip.data.deletedAt) {
    return (
      <>
        <PageHeader title="Edit trip" />
        <p>
          {trip.data.deletedAt
            ? "Restore this trip before changing it."
            : "An old register balance is changed from the customer's account."}{" "}
          <Link to={`/trips/${String(id)}`}>Back to the entry</Link>
        </p>
      </>
    );
  }

  const before = tripValuesOf(trip.data);
  return (
    <>
      <PageHeader title="Edit trip" />
      <TripForm
        initial={before}
        initialPayment={null}
        startDate={settings.data.businessStartDate}
        today={todayIso(new Date())}
        submitLabel="Save changes"
        pending={update.isPending}
        error={update.error}
        onSubmit={(values) => {
          const changes = tripChanges(before, values);
          if (Object.keys(changes).length === 0) {
            toast("Nothing was changed.");
            void navigate(`/trips/${String(id)}`);
            return;
          }
          update.mutate(changes, {
            onSuccess: (saved) => {
              toast(
                `Trip updated. ${balanceText(saved.trip.customer.name, saved.customerBalance)}`,
              );
              for (const warning of saved.warnings) toast(warning);
              void navigate(`/trips/${String(id)}`);
            },
          });
        }}
      />
    </>
  );
}
