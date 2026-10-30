import { type SubmitEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { readIdParam } from "../../lib/addressFilters.ts";
import { todayIso } from "../../lib/dates.ts";
import { formatRupees, rupeesToPaise } from "../../lib/money.ts";
import { PAY_MODE_OPTIONS, type PayMode } from "../../lib/payModes.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { LoadError, Loading } from "../../ui/LoadState.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { pickerOptions } from "../masters/useMasters.ts";
import styles from "./NewPartnerTxnPage.module.css";
import { netPaidText } from "./partnerText.ts";
import { type Partner, usePartners, useRecordPartnerTxn } from "./usePartner.ts";

type Direction = "PAID_TO_PARTNER" | "RECEIVED_FROM_PARTNER";

export function NewPartnerTxnPage() {
  const partners = usePartners();
  const [params] = useSearchParams();
  if (partners.isError)
    return <LoadError error={partners.error} onRetry={() => void partners.refetch()} />;
  if (!partners.data) return <Loading what="partners" />;
  const active = partners.data.filter((partner) => partner.isActive);
  // With one partner (as usual) there is nothing to choose.
  const chosen =
    readIdParam(params, "partner") || (active.length === 1 ? String(active[0]?.id) : "");
  return (
    <>
      <PageHeader title="Partner payment" />
      <TxnForm partners={partners.data} initialPartner={chosen} />
    </>
  );
}

function TxnForm({ partners, initialPartner }: { partners: Partner[]; initialPartner: string }) {
  const today = todayIso(new Date());
  const [partnerId, setPartnerId] = useState(initialPartner);
  const [direction, setDirection] = useState<Direction>("PAID_TO_PARTNER");
  const [txnDate, setTxnDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PayMode>("CASH");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const { key, renew } = useIdempotencyKey();
  const record = useRecordPartnerTxn(Number(partnerId));
  const toast = useToast();
  const navigate = useNavigate();
  const name = partners.find((partner) => String(partner.id) === partnerId)?.name ?? "the partner";
  const server = fieldErrors(record.error);
  const missingPartner = tried && partnerId === "" ? "Pick the partner" : undefined;
  const missingAmount =
    tried && (rupeesToPaise(amount) ?? 0) === 0 ? "Enter the amount" : undefined;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (partnerId === "" || (rupeesToPaise(amount) ?? 0) === 0) return;
    const body = {
      direction,
      txnDate,
      amount,
      mode,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    record.mutate(
      { body, key },
      {
        onSuccess: (result) => {
          const what =
            direction === "PAID_TO_PARTNER" ? `paid to ${name}` : `received from ${name}`;
          toast(
            `${formatRupees(result.txn.amountPaise)} ${what}. ${netPaidText(name, result.netPaidPaise)}.`,
          );
          // Straight to this partner's account, even when there are several partners.
          void navigate(`/partner/${partnerId}`);
        },
        onError: (error) => {
          renewAfterMismatch(error, renew);
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <FormError
        error={record.error}
        shownFields={["direction", "txnDate", "amount", "mode", "notes"]}
      />
      <SelectField
        label="Partner"
        placeholder="Choose the partner"
        value={partnerId}
        options={pickerOptions(partners, partnerId, (partner) => partner.name)}
        error={missingPartner}
        onChange={setPartnerId}
      />
      <Choice
        label="Which way"
        value={direction}
        options={[
          { value: "PAID_TO_PARTNER", label: `Paid to ${name}` },
          { value: "RECEIVED_FROM_PARTNER", label: `Received from ${name}` },
        ]}
        error={server["direction"]}
        onChange={setDirection}
      />
      <DateField
        label="Date"
        value={txnDate}
        max={today}
        error={server["txnDate"]}
        onChange={setTxnDate}
      />
      <MoneyField
        label="Amount"
        large
        value={amount}
        error={missingAmount ?? server["amount"]}
        onChange={setAmount}
      />
      <Choice
        label="By"
        value={mode}
        options={PAY_MODE_OPTIONS}
        error={server["mode"]}
        onChange={setMode}
      />
      <TextField
        label="Note"
        maxLength={500}
        value={notes}
        error={server["notes"]}
        onChange={(event) => {
          setNotes(event.target.value);
        }}
      />
      <Button type="submit" block disabled={record.isPending}>
        {record.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
