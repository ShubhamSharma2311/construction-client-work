import { useState } from "react";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { type IsoDate, todayIso } from "../../lib/dates.ts";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { balanceText } from "./balanceText.ts";
import { TripForm } from "./TripForm.tsx";
import { emptyTrip, NO_PAYMENT, newTripBody, type TripValues } from "./tripForm.ts";
import { useCreateTrip } from "./useTrips.ts";

export function NewTripPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="New trip" />
      {settings.data === null ? <SetupPrompt /> : null}
      {settings.data ? <NewTrip startDate={settings.data.businessStartDate} /> : null}
    </>
  );
}

function NewTrip({ startDate }: { startDate: IsoDate }) {
  const today = todayIso(new Date());
  const { key, renew } = useIdempotencyKey();
  const create = useCreateTrip();
  const toast = useToast();
  // Trips come in runs: same day, same driver and khet. Those stay for the next entry.
  const [next, setNext] = useState<TripValues>(() => emptyTrip(today));
  const [entry, setEntry] = useState(0);

  return (
    <TripForm
      key={entry}
      initial={next}
      initialPayment={NO_PAYMENT}
      startDate={startDate}
      today={today}
      submitLabel="Save trip"
      pending={create.isPending}
      error={create.error}
      onSubmit={(values, payment) => {
        create.mutate(
          { body: newTripBody(values, payment ?? NO_PAYMENT), key },
          {
            onSuccess: (saved) => {
              toast(`Trip saved. ${balanceText(saved.trip.customer.name, saved.customerBalance)}`);
              for (const warning of saved.warnings) toast(warning);
              renew();
              setNext({
                ...emptyTrip(values.tripDate),
                driverId: values.driverId,
                tractorId: values.tractorId,
                khetId: values.khetId,
              });
              setEntry((current) => current + 1);
              create.reset();
            },
            onError: (error) => {
              renewAfterMismatch(error, renew);
            },
          },
        );
      }}
    />
  );
}
