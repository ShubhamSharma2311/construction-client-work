import { useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { PAY_MODE_LABELS } from "../../lib/payModes.ts";
import { presetRange } from "../../lib/ranges.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { FigureStrip } from "../../ui/FigureStrip.tsx";
import { FilterCheckbox } from "../../ui/FilterPanel.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { Tag } from "../../ui/Tag.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { checkPartner, PartnerFields, type PartnerValues, shareOf } from "./PartnerFields.tsx";
import styles from "./PartnerPage.module.css";
import { netPaidText, shareStanding } from "./partnerText.ts";
import {
  type Partner,
  type PartnerEntry,
  useCreatePartner,
  useDeletePartnerTxn,
  usePartnerLedger,
  usePartners,
  usePartnerShare,
  useUpdatePartner,
} from "./usePartner.ts";

/** "Partner" in the menu: most businesses have one (Manish), so his account opens at once. */
export function PartnersPage() {
  const partners = usePartners();
  const settings = useSettings();
  const [adding, setAdding] = useState(false);
  if (partners.isError)
    return <LoadError error={partners.error} onRetry={() => void partners.refetch()} />;
  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!partners.data || settings.data === undefined) return <Loading what="partners" />;
  const active = partners.data.filter((partner) => partner.isActive);
  const only = active.length === 1 ? active[0] : undefined;
  if (only && settings.data)
    return <PartnerAccount partner={only} startDate={settings.data.businessStartDate} />;

  return (
    <>
      <PageHeader
        title="Partners"
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setAdding(true);
            }}
          >
            Add partner
          </Button>
        }
      />
      <Register label="Partners">
        {partners.data.length === 0 ? (
          <RegisterRow label="No partner yet. Add the partner who shares the profit." />
        ) : (
          partners.data.map((partner) => (
            <RegisterLink
              key={partner.id}
              to={`/partner/${String(partner.id)}`}
              label={partner.isActive ? partner.name : `${partner.name} (inactive)`}
              detail={
                partner.sharePercent === null
                  ? "Share not set"
                  : `${String(partner.sharePercent)}% of profit`
              }
            />
          ))
        )}
      </Register>
      {adding ? (
        <AddPartner
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </>
  );
}

export function PartnerByIdPage({ id }: { id: number }) {
  const partners = usePartners();
  const settings = useSettings();
  if (partners.isError)
    return <LoadError error={partners.error} onRetry={() => void partners.refetch()} />;
  if (!partners.data || !settings.data) return <Loading what="the partner" />;
  const partner = partners.data.find((candidate) => candidate.id === id);
  if (!partner) return <ErrorNotice>There is no partner number {id}.</ErrorNotice>;
  return <PartnerAccount partner={partner} startDate={settings.data.businessStartDate} />;
}

function PartnerAccount({ partner, startDate }: { partner: Partner; startDate: IsoDate }) {
  const today = todayIso(new Date());
  // A share is settled over a stretch of time; this month is where the owner usually looks.
  const [range, setRange] = useState(presetRange("month", today));
  const [editing, setEditing] = useState(false);
  const shareRange = range ?? { from: startDate, to: today };

  return (
    <>
      <PageHeader
        title={partner.name}
        actions={partner.isActive ? null : <Tag tone="quiet">Inactive</Tag>}
      />
      <div className={actions.actions}>
        <ButtonLink to={`/new/partner?partner=${String(partner.id)}`}>
          Money to or from {partner.name}
        </ButtonLink>
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(true);
          }}
        >
          Edit details
        </Button>
      </div>
      <RangeChips value={range} onChange={setRange} today={today} startDate={startDate} />
      <Share partner={partner} range={shareRange} />
      <Payments partner={partner} range={range} today={today} />
      {editing ? (
        <EditPartner
          partner={partner}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}

function Share({ partner, range }: { partner: Partner; range: { from: IsoDate; to: IsoDate } }) {
  const share = usePartnerShare(partner.id, range, partner.sharePercent !== null);
  if (partner.sharePercent === null) {
    return (
      <p className={actions.text}>
        No share of profit is set for {partner.name}. Set it under Edit details.
      </p>
    );
  }
  if (share.isError) return <LoadError error={share.error} onRetry={() => void share.refetch()} />;
  if (!share.data) return <Loading what="the share" />;
  const { data } = share;
  return (
    <section className={styles.section} aria-label="Share of profit">
      <p className={`${styles.standing} ${data.balancePaise < 0 ? styles.over : ""}`}>
        {shareStanding(partner.name, data.balancePaise)}
      </p>
      <FigureStrip
        label="How the share is worked out"
        figures={[
          {
            label: "Profit",
            value: (
              <Money paise={data.profitPaise} tone={data.profitPaise < 0 ? "owed" : "plain"} />
            ),
          },
          {
            label: `${String(data.partner.sharePercent)}% share`,
            value: <Money paise={data.shareDuePaise} />,
          },
          { label: "Paid, net", value: <Money paise={data.netPaidPaise} /> },
        ]}
      />
    </section>
  );
}

function Payments({
  partner,
  range,
  today,
}: {
  partner: Partner;
  range: { from: IsoDate; to: IsoDate } | null;
  today: IsoDate;
}) {
  const ledger = usePartnerLedger(partner.id, range);
  const [undoing, setUndoing] = useState<PartnerEntry | null>(null);
  if (ledger.isError)
    return <LoadError error={ledger.error} onRetry={() => void ledger.refetch()} />;
  if (!ledger.data) return <Loading what="payments" />;
  return (
    <section className={styles.section} aria-label="Money to and from the partner">
      <h2 className={styles.subhead}>
        {netPaidText(partner.name, ledger.data.totals.netPaidPaise)}
      </h2>
      <Register label="Money to and from the partner">
        {ledger.data.entries.length === 0 ? (
          <RegisterRow label={`No money moved with ${partner.name} in these dates.`} />
        ) : (
          ledger.data.entries.map((entry) => (
            <RegisterRow
              key={entry.refId}
              label={
                entry.direction === "PAID_TO_PARTNER"
                  ? `Paid to ${partner.name}`
                  : `Received from ${partner.name}`
              }
              detail={[
                formatDate(entry.date, today),
                PAY_MODE_LABELS[entry.mode].toLowerCase(),
                entry.notes,
              ]
                .filter(Boolean)
                .join(", ")}
              amount={
                <Money
                  paise={entry.amountPaise}
                  tone={entry.direction === "RECEIVED_FROM_PARTNER" ? "received" : "plain"}
                />
              }
              action={
                <Button
                  variant="quiet"
                  aria-label={`Undo ${formatRupees(entry.amountPaise)} on ${formatDate(entry.date, today)}`}
                  onClick={() => {
                    setUndoing(entry);
                  }}
                >
                  Undo
                </Button>
              }
            />
          ))
        )}
      </Register>
      {undoing ? (
        <UndoTxn
          partner={partner}
          entry={undoing}
          onClose={() => {
            setUndoing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function UndoTxn({
  partner,
  entry,
  onClose,
}: {
  partner: Partner;
  entry: PartnerEntry;
  onClose: () => void;
}) {
  const remove = useDeletePartnerTxn();
  const toast = useToast();
  return (
    <ConfirmDialog
      open
      title="Undo this entry?"
      confirmLabel="Undo entry"
      busy={remove.isPending}
      error={remove.isError ? saveErrorMessage(remove.error) : null}
      onClose={onClose}
      onConfirm={() => {
        remove.mutate(entry.refId, {
          onSuccess: (result) => {
            toast(`Entry undone. ${netPaidText(partner.name, result.netPaidPaise)}.`);
            onClose();
          },
        });
      }}
    >
      <p className={actions.text}>
        The {formatRupees(entry.amountPaise)} comes off the cash book and the partner&apos;s
        account.
      </p>
    </ConfirmDialog>
  );
}

function AddPartner({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<PartnerValues>({ name: "", sharePercent: "", notes: "" });
  const [tried, setTried] = useState(false);
  const create = useCreatePartner();
  const toast = useToast();
  const problems = tried ? checkPartner(values) : {};
  const server = fieldErrors(create.error);
  return (
    <Sheet open onClose={onClose} title="Add partner">
      <div className={sheetStyles.body}>
        <FormError error={create.error} shownFields={["name", "sharePercent", "notes"]} />
        <PartnerFields values={values} errors={{ ...server, ...problems }} onChange={setValues} />
        <Button
          block
          disabled={create.isPending}
          onClick={() => {
            setTried(true);
            if (Object.keys(checkPartner(values)).length > 0) return;
            const share = shareOf(values.sharePercent);
            create.mutate(
              {
                name: values.name.trim(),
                ...(share === null ? {} : { sharePercent: share }),
                ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
              },
              {
                onSuccess: (partner) => {
                  toast(`${partner.name} added.`);
                  onClose();
                },
              },
            );
          }}
        >
          {create.isPending ? "Adding…" : "Add partner"}
        </Button>
      </div>
    </Sheet>
  );
}

function EditPartner({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const before: PartnerValues = {
    name: partner.name,
    sharePercent: partner.sharePercent === null ? "" : String(partner.sharePercent),
    notes: partner.notes ?? "",
  };
  const [values, setValues] = useState(before);
  const [active, setActive] = useState(partner.isActive);
  const [tried, setTried] = useState(false);
  const update = useUpdatePartner(partner.id);
  const toast = useToast();
  const problems = tried ? checkPartner(values) : {};
  const server = fieldErrors(update.error);

  const save = () => {
    setTried(true);
    if (Object.keys(checkPartner(values)).length > 0) return;
    const changes = {
      ...(values.name.trim() === before.name ? {} : { name: values.name.trim() }),
      ...(values.sharePercent === before.sharePercent
        ? {}
        : { sharePercent: shareOf(values.sharePercent) }),
      ...(values.notes.trim() === before.notes ? {} : { notes: values.notes.trim() }),
      ...(active === partner.isActive ? {} : { isActive: active }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate(changes, {
      onSuccess: () => {
        toast("Details saved.");
        onClose();
      },
    });
  };

  return (
    <Sheet open onClose={onClose} title="Edit details">
      <div className={sheetStyles.body}>
        <FormError error={update.error} shownFields={["name", "sharePercent", "notes"]} />
        <PartnerFields values={values} errors={{ ...server, ...problems }} onChange={setValues} />
        <FilterCheckbox label="Active" checked={active} onChange={setActive} />
        <Button block onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </Sheet>
  );
}
