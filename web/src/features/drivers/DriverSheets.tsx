import { useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatFullDate, formatMonth, previousMonth, todayIso } from "../../lib/dates.ts";
import { formatRupees, paiseToRupeeInput, rupeesToPaise } from "../../lib/money.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FilterCheckbox } from "../../ui/FilterPanel.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { MonthField } from "../../ui/MonthField.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { Register, RegisterRow } from "../../ui/Register.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import { pickerOptions, useTractors } from "../masters/useMasters.ts";
import { driverStanding } from "./driverText.ts";
import {
  type DriverDetail,
  useAddDriverOpening,
  useAddSalaryRate,
  useCloseMonth,
  useMonthSalary,
  usePayBonus,
  useRemoveDriverOpening,
  useRemoveSalaryRate,
  useReopenMonth,
  useUpdateDriver,
} from "./useDriver.ts";
import { PAY_MODE_OPTIONS } from "../../lib/payModes.ts";

// The sheets on a driver's page. Each is mounted only while open, so it starts fresh.

export function CloseMonth({ driver, onClose }: { driver: DriverDetail; onClose: () => void }) {
  const today = todayIso(new Date());
  const [month, setMonth] = useState(previousMonth(today));
  const salary = useMonthSalary(driver.id, month);
  return (
    <Sheet open onClose={onClose} title="Close a month">
      <div className={sheetStyles.body}>
        <p className={actions.text}>
          Closing a month adds that month&apos;s salary to what {driver.name} has earned. Advances
          already paid come off it.
        </p>
        <MonthField
          label="Month"
          value={month}
          fromYear={Number(driver.joinedOn.slice(0, 4))}
          toYear={Number(today.slice(0, 4))}
          onChange={setMonth}
        />
        {salary.isError ? (
          <LoadError error={salary.error} onRetry={() => void salary.refetch()} />
        ) : null}
        {salary.isPending && salary.fetchStatus !== "idle" ? <Loading what="the month" /> : null}
        {/* The API closes only a month that is over; say so before the person fills anything. */}
        {month >= today.slice(0, 7) ? (
          <p className={actions.text}>
            {formatMonth(month)} is not over yet, so it cannot be closed.
          </p>
        ) : salary.data ? (
          salary.data.closed ? (
            <ReopenMonth
              driver={driver}
              month={month}
              closedPaise={salary.data.closed.amountPaise}
              onDone={onClose}
            />
          ) : salary.data.suggestedPaise === null ||
            salary.data.monthlyPaise === null ||
            salary.data.daysWorked === 0 ? (
            // No day worked: the month is before the driver joined or after they left.
            <p className={actions.text}>
              {driver.name} was not working in {formatMonth(month)}, so there is no salary to close.
            </p>
          ) : (
            <CloseMonthForm
              key={month}
              driver={driver}
              month={month}
              suggestedPaise={salary.data.suggestedPaise}
              detail={`${formatRupees(salary.data.monthlyPaise)} a month, ${String(salary.data.daysWorked)} of ${String(
                salary.data.daysInMonth,
              )} days worked`}
              onDone={onClose}
            />
          )
        ) : null}
      </div>
    </Sheet>
  );
}

function CloseMonthForm({
  driver,
  month,
  suggestedPaise,
  detail,
  onDone,
}: {
  driver: DriverDetail;
  month: string;
  suggestedPaise: number;
  detail: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(paiseToRupeeInput(suggestedPaise));
  const [note, setNote] = useState("");
  const close = useCloseMonth(driver.id);
  const toast = useToast();
  const changed = rupeesToPaise(amount) !== suggestedPaise;
  const errors = fieldErrors(close.error);

  return (
    <>
      <p className={actions.text}>
        {detail}: works out to <Money paise={suggestedPaise} />.
      </p>
      <FormError error={close.error} shownFields={["amount", "note"]} />
      <MoneyField
        label="Salary for the month"
        value={amount}
        error={errors["amount"]}
        onChange={setAmount}
      />
      {changed ? (
        <TextField
          label="Why a different amount"
          maxLength={500}
          value={note}
          error={errors["note"]}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      ) : null}
      <Button
        block
        disabled={close.isPending || amount === "" || (changed && note.trim() === "")}
        onClick={() => {
          // The salary worked out from the rate is the default; only a different one is sent.
          const body = changed ? { month, amount, note: note.trim() } : { month };
          close.mutate(body, {
            onSuccess: (result) => {
              toast(
                `${formatMonth(month)} closed. ${driverStanding(driver.name, result.balancePaise).text}.`,
              );
              onDone();
            },
          });
        }}
      >
        {close.isPending ? "Saving…" : `Close ${formatMonth(month)}`}
      </Button>
    </>
  );
}

function ReopenMonth({
  driver,
  month,
  closedPaise,
  onDone,
}: {
  driver: DriverDetail;
  month: string;
  closedPaise: number;
  onDone: () => void;
}) {
  const reopen = useReopenMonth(driver.id);
  const toast = useToast();
  return (
    <>
      <p className={actions.text}>
        {formatMonth(month)} is closed at <Money paise={closedPaise} />. Reopen it to change the
        salary; it comes off what {driver.name} has earned until closed again.
      </p>
      {reopen.isError ? <ErrorNotice>{saveErrorMessage(reopen.error)}</ErrorNotice> : null}
      <Button
        block
        variant="secondary"
        disabled={reopen.isPending}
        onClick={() => {
          reopen.mutate(month, {
            onSuccess: (result) => {
              toast(
                `${formatMonth(month)} reopened. ${driverStanding(driver.name, result.balancePaise).text}.`,
              );
              onDone();
            },
          });
        }}
      >
        {reopen.isPending ? "Reopening…" : `Reopen ${formatMonth(month)}`}
      </Button>
    </>
  );
}

export function Bonus({ driver, onClose }: { driver: DriverDetail; onClose: () => void }) {
  const today = todayIso(new Date());
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"CASH" | "ONLINE">("CASH");
  const [note, setNote] = useState("");
  const { key, renew } = useIdempotencyKey();
  const pay = usePayBonus();
  const toast = useToast();
  const errors = fieldErrors(pay.error);

  return (
    <Sheet open onClose={onClose} title="Bonus">
      <div className={sheetStyles.body}>
        <p className={actions.text}>Extra money given and paid at once, such as for Diwali.</p>
        <FormError error={pay.error} shownFields={["paidOn", "amount", "mode", "note"]} />
        <DateField
          label="Paid on"
          value={paidOn}
          max={today}
          error={errors["paidOn"]}
          onChange={setPaidOn}
        />
        <MoneyField label="Bonus" value={amount} error={errors["amount"]} onChange={setAmount} />
        <Choice label="Paid by" value={mode} options={PAY_MODE_OPTIONS} onChange={setMode} />
        <TextField
          label="What it is for"
          maxLength={500}
          value={note}
          error={errors["note"]}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
        <Button
          block
          disabled={pay.isPending || amount === "" || note.trim() === ""}
          onClick={() => {
            pay.mutate(
              { driverId: driver.id, body: { paidOn, amount, mode, note: note.trim() }, key },
              {
                onSuccess: (result) => {
                  toast(
                    `Bonus of ${formatRupees(result.payment.amountPaise)} paid to ${driver.name}.`,
                  );
                  onClose();
                },
                onError: (error) => {
                  renewAfterMismatch(error, renew);
                },
              },
            );
          }}
        >
          {pay.isPending ? "Saving…" : "Pay bonus"}
        </Button>
      </div>
    </Sheet>
  );
}

export function EditDriver({ driver, onClose }: { driver: DriverDetail; onClose: () => void }) {
  const today = todayIso(new Date());
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone ?? "");
  const [joinedOn, setJoinedOn] = useState(driver.joinedOn);
  const [leftOn, setLeftOn] = useState(driver.leftOn ?? "");
  const [tractorId, setTractorId] = useState(
    driver.defaultTractor ? String(driver.defaultTractor.id) : "",
  );
  const [active, setActive] = useState(driver.isActive);
  const tractors = useTractors();
  const update = useUpdateDriver(driver.id);
  const toast = useToast();
  const errors = fieldErrors(update.error);

  const save = () => {
    const before = driver.defaultTractor ? String(driver.defaultTractor.id) : "";
    const changes = {
      ...(name.trim() === driver.name ? {} : { name: name.trim() }),
      ...(phone.trim() === (driver.phone ?? "")
        ? {}
        : { phone: phone.trim() === "" ? null : phone.trim() }),
      ...(joinedOn === driver.joinedOn ? {} : { joinedOn }),
      ...(leftOn === (driver.leftOn ?? "") ? {} : { leftOn: leftOn === "" ? null : leftOn }),
      ...(tractorId === before
        ? {}
        : { defaultTractorId: tractorId === "" ? null : Number(tractorId) }),
      ...(active === driver.isActive ? {} : { isActive: active }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate(changes, {
      onSuccess: (result) => {
        toast("Details saved.");
        for (const warning of result.warnings) toast(warning);
        onClose();
      },
    });
  };

  return (
    <Sheet open onClose={onClose} title="Edit details">
      <div className={sheetStyles.body}>
        <FormError
          error={update.error}
          shownFields={["name", "phone", "joinedOn", "leftOn", "defaultTractorId"]}
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
        <DateField
          label="Left on (if left)"
          value={leftOn}
          min={joinedOn}
          max={today}
          error={errors["leftOn"]}
          hint={
            leftOn && active
              ? "Untick Active below so they stop showing when entering trips."
              : undefined
          }
          onChange={setLeftOn}
        />
        <SelectField
          label="Usual tractor"
          placeholder="None"
          value={tractorId}
          // A tractor is one driver's usual one; another driver's is named so the clash is clear.
          options={pickerOptions(tractors.data, tractorId, (item) =>
            item.defaultDriver && item.defaultDriver.id !== driver.id
              ? `${item.regNumber} (${item.defaultDriver.name}'s)`
              : item.regNumber,
          )}
          error={errors["defaultTractorId"]}
          onChange={setTractorId}
        />
        <FilterCheckbox
          label="Active (shown when entering trips)"
          checked={active}
          onChange={setActive}
        />
        <Button block onClick={save} disabled={update.isPending || name.trim() === ""}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </Sheet>
  );
}

export function SalaryRates({ driver, onClose }: { driver: DriverDetail; onClose: () => void }) {
  const [from, setFrom] = useState("");
  const [salary, setSalary] = useState("");
  const add = useAddSalaryRate(driver.id);
  const remove = useRemoveSalaryRate(driver.id);
  const toast = useToast();
  const errors = fieldErrors(add.error);
  const thisYear = Number(todayIso(new Date()).slice(0, 4));
  return (
    <Sheet open onClose={onClose} title="Salary">
      <div className={sheetStyles.body}>
        <Register label="Salary over time">
          {driver.salaryRates.map((rate) => (
            <RegisterRow
              key={rate.id}
              label={`From ${formatMonth(rate.effectiveFrom.slice(0, 7))}`}
              amount={<Money paise={rate.monthlyPaise} />}
              action={
                driver.salaryRates.length > 1 ? (
                  <Button
                    variant="quiet"
                    disabled={remove.isPending}
                    aria-label={`Remove the salary from ${formatMonth(rate.effectiveFrom.slice(0, 7))}`}
                    onClick={() => {
                      remove.mutate(rate.id, {
                        onSuccess: () => {
                          toast("Salary removed.");
                        },
                      });
                    }}
                  >
                    Remove
                  </Button>
                ) : undefined
              }
            />
          ))}
        </Register>
        {remove.isError ? <ErrorNotice>{saveErrorMessage(remove.error)}</ErrorNotice> : null}
        <p className={actions.text}>
          A new salary counts from the month it starts; months already closed keep theirs.
        </p>
        <FormError error={add.error} shownFields={["effectiveFrom", "monthlySalary"]} />
        <MonthField
          label="New salary from"
          value={from}
          fromYear={Number(driver.joinedOn.slice(0, 4))}
          toYear={thisYear + 1}
          error={errors["effectiveFrom"]}
          onChange={setFrom}
        />
        <MoneyField
          label="Monthly salary"
          value={salary}
          error={errors["monthlySalary"]}
          onChange={setSalary}
        />
        <Button
          block
          disabled={add.isPending || from === "" || salary === ""}
          onClick={() => {
            add.mutate(
              { effectiveFrom: from, monthlySalary: salary },
              {
                onSuccess: () => {
                  toast(
                    `${driver.name}'s salary is ${formatRupees(rupeesToPaise(salary) ?? 0)} from ${formatMonth(from)}.`,
                  );
                  onClose();
                },
              },
            );
          }}
        >
          {add.isPending ? "Saving…" : "Add new salary"}
        </Button>
      </div>
    </Sheet>
  );
}

export function DriverOpening({ driver, onClose }: { driver: DriverDetail; onClose: () => void }) {
  const [direction, setDirection] = useState<"OWED_TO_DRIVER" | "OWED_BY_DRIVER">("OWED_TO_DRIVER");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { key, renew } = useIdempotencyKey();
  const add = useAddDriverOpening(driver.id);
  const toast = useToast();
  const errors = fieldErrors(add.error);

  return (
    <Sheet open onClose={onClose} title="Old register balance">
      <div className={sheetStyles.body}>
        <p className={actions.text}>
          Where {driver.name}&apos;s account stood in the paper register when you started this app.
        </p>
        <FormError error={add.error} shownFields={["amount", "note"]} />
        <Choice
          label="Who owed whom"
          value={direction}
          options={[
            { value: "OWED_TO_DRIVER", label: `You owed ${driver.name}` },
            { value: "OWED_BY_DRIVER", label: `${driver.name} owed you` },
          ]}
          onChange={setDirection}
        />
        <MoneyField label="Amount" value={amount} error={errors["amount"]} onChange={setAmount} />
        <TextField
          label="Note"
          maxLength={500}
          value={note}
          error={errors["note"]}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
        <Button
          block
          disabled={add.isPending || (rupeesToPaise(amount) ?? 0) === 0}
          onClick={() => {
            // The account counts what the driver earned as plus, so money the driver owed is minus.
            const signed = direction === "OWED_BY_DRIVER" ? `-${amount}` : amount;
            add.mutate(
              { body: { amount: signed, ...(note.trim() ? { note: note.trim() } : {}) }, key },
              {
                onSuccess: (result) => {
                  toast(
                    `Old balance added. ${driverStanding(driver.name, result.balancePaise).text}.`,
                  );
                  onClose();
                },
                onError: (error) => {
                  renewAfterMismatch(error, renew);
                },
              },
            );
          }}
        >
          {add.isPending ? "Saving…" : "Add old balance"}
        </Button>
      </div>
    </Sheet>
  );
}

/** "Joined 1 Apr 2026" or "Joined 1 Apr 2026, left 30 Sep 2026". */
export function serviceDates(driver: DriverDetail): string {
  const joined = `Joined ${formatFullDate(driver.joinedOn)}`;
  return driver.leftOn ? `${joined}, left ${formatFullDate(driver.leftOn)}` : joined;
}

export function RemoveDriverOpening({
  driver,
  onClose,
}: {
  driver: DriverDetail;
  onClose: () => void;
}) {
  const remove = useRemoveDriverOpening(driver.id);
  const toast = useToast();
  return (
    <ConfirmDialog
      open
      title="Remove the old register balance?"
      confirmLabel="Remove old balance"
      busy={remove.isPending}
      error={remove.isError ? saveErrorMessage(remove.error) : null}
      onClose={onClose}
      onConfirm={() => {
        remove.mutate(undefined, {
          onSuccess: (result) => {
            toast(`Old balance removed. ${driverStanding(driver.name, result.balancePaise).text}.`);
            onClose();
          },
        });
      }}
    >
      <p className={actions.text}>
        For a balance entered wrongly; the right one can then be entered again.
      </p>
    </ConfirmDialog>
  );
}
