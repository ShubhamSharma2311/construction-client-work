import { useState } from "react";
import { useNavigate } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { useToast } from "../../app/Toast.tsx";
import { todayIso } from "../../lib/dates.ts";
import { rupeesToPaise } from "../../lib/money.ts";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import { type Driver, pickerOptions, useDrivers, useTractors } from "../masters/useMasters.ts";
import { driverStanding } from "./driverText.ts";
import { useCreateDriver, useDriverLedger } from "./useDriver.ts";

export function DriversPage() {
  const drivers = useDrivers();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Drivers"
        actions={
          <>
            <ButtonLink to="/new/driver-payment">Pay driver</ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(true);
              }}
            >
              Add driver
            </Button>
          </>
        }
      />
      {drivers.isError ? (
        <LoadError error={drivers.error} onRetry={() => void drivers.refetch()} />
      ) : null}
      {drivers.isPending ? <Loading what="drivers" /> : null}
      {drivers.data ? (
        <Register label="Drivers">
          {drivers.data.length === 0 ? (
            <RegisterRow label="No drivers yet. Add the first one." />
          ) : (
            drivers.data.map((driver) => <DriverLine key={driver.id} driver={driver} />)
          )}
        </Register>
      ) : null}
      {adding ? (
        <AddDriver
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </>
  );
}

/** One driver with where their account stands; a business has a handful, so each loads its own. */
function DriverLine({ driver }: { driver: Driver }) {
  const ledger = useDriverLedger(driver.id, null);
  // A balance that did not load says so; showing nothing would read as a settled account.
  const standing = ledger.data
    ? driverStanding(driver.name, ledger.data.closingBalancePaise).text
    : ledger.isError
      ? "balance did not load; open to retry"
      : "loading balance";
  return (
    <RegisterLink
      to={`/drivers/${String(driver.id)}`}
      label={driver.isActive ? driver.name : `${driver.name} (inactive)`}
      detail={[driver.defaultTractor?.regNumber, standing].filter(Boolean).join(", ")}
    />
  );
}

function AddDriver({ onClose }: { onClose: () => void }) {
  const today = todayIso(new Date());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [joinedOn, setJoinedOn] = useState(today);
  const [salary, setSalary] = useState("");
  const [tractorId, setTractorId] = useState("");
  const tractors = useTractors();
  const create = useCreateDriver();
  const toast = useToast();
  const navigate = useNavigate();
  const errors = fieldErrors(create.error);
  const ready = name.trim() !== "" && joinedOn !== "" && (rupeesToPaise(salary) ?? 0) > 0;

  return (
    <Sheet open onClose={onClose} title="Add driver">
      <div className={sheetStyles.body}>
        <FormError
          error={create.error}
          shownFields={["name", "phone", "joinedOn", "monthlySalary", "defaultTractorId"]}
        />
        <TextField
          label="Name"
          maxLength={100}
          value={name}
          error={errors["name"]}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <TextField
          label="Phone"
          inputMode="tel"
          value={phone}
          error={errors["phone"]}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
        />
        <DateField
          label="Joined on"
          value={joinedOn}
          max={today}
          error={errors["joinedOn"]}
          onChange={setJoinedOn}
        />
        <MoneyField
          label="Monthly salary"
          value={salary}
          error={errors["monthlySalary"]}
          onChange={setSalary}
        />
        <SelectField
          label="Usual tractor"
          placeholder="None yet"
          value={tractorId}
          options={pickerOptions(tractors.data, tractorId, (item) => item.regNumber)}
          error={errors["defaultTractorId"]}
          onChange={setTractorId}
        />
        <Button
          block
          disabled={create.isPending || !ready}
          onClick={() => {
            create.mutate(
              {
                name: name.trim(),
                joinedOn,
                monthlySalary: salary,
                ...(phone.trim() ? { phone: phone.trim() } : {}),
                ...(tractorId ? { defaultTractorId: Number(tractorId) } : {}),
              },
              {
                onSuccess: (driver) => {
                  toast(`${driver.name} added.`);
                  void navigate(`/drivers/${String(driver.id)}`);
                },
              },
            );
          }}
        >
          {create.isPending ? "Adding…" : "Add driver"}
        </Button>
      </div>
    </Sheet>
  );
}
