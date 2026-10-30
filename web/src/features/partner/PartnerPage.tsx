import { useState } from "react";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { PAY_MODE_LABELS } from "../../lib/payModes.ts";
import { businessDates, type DateRange, presetRange } from "../../lib/ranges.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { FigureStrip } from "../../ui/FigureStrip.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { Tag } from "../../ui/Tag.tsx";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { AddPartner, EditPartner } from "./PartnerSheets.tsx";
import styles from "./PartnerPage.module.css";
import { netPaidText, shareStanding } from "./partnerText.ts";
import {
  type Partner,
  type PartnerEntry,
  useDeletePartnerTxn,
  usePartnerLedger,
  usePartners,
  usePartnerShare,
} from "./usePartner.ts";

/**
 * "Partner" in the menu: most businesses have one (Manish), so his account opens at once. With
 * anyone else on the books, even a partner who has left, the list comes first.
 */
export function PartnersPage() {
  const partners = usePartners();
  const settings = useSettings();
  const [adding, setAdding] = useState(false);
  if (partners.isError)
    return <LoadError error={partners.error} onRetry={() => void partners.refetch()} />;
  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!partners.data || settings.data === undefined) return <Loading what="partners" />;
  const [only, ...others] = partners.data;
  if (only?.isActive && others.length === 0 && settings.data)
    return (
      <PartnerAccount partner={only} startDate={settings.data.businessStartDate} canAddPartner />
    );

  return (
    <>
      <PageHeader
        title="Partners"
        actions={
          <>
            <ButtonLink to="/new/partner">Money with partner</ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(true);
              }}
            >
              Add partner
            </Button>
          </>
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
  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (settings.data === null) {
    return (
      <>
        <PageHeader title="Partner" />
        <SetupPrompt />
      </>
    );
  }
  if (!partners.data || !settings.data) return <Loading what="the partner" />;
  const partner = partners.data.find((candidate) => candidate.id === id);
  if (!partner) return <ErrorNotice>There is no partner number {id}.</ErrorNotice>;
  return <PartnerAccount partner={partner} startDate={settings.data.businessStartDate} />;
}

function PartnerAccount({
  partner,
  startDate,
  canAddPartner = false,
}: {
  partner: Partner;
  startDate: IsoDate;
  /** Reached straight from the menu, this screen stands in for the list, so it adds partners. */
  canAddPartner?: boolean;
}) {
  const today = todayIso(new Date());
  // A share is settled over a stretch of time; this month is where the owner usually looks.
  const [range, setRange] = useState(presetRange("month", today));
  const [sheet, setSheet] = useState<"edit" | "add" | null>(null);
  const shareDates = businessDates(range, startDate, today);
  const close = () => {
    setSheet(null);
  };

  return (
    <>
      <PageHeader
        title={partner.name}
        actions={partner.isActive ? null : <Tag tone="quiet">Inactive</Tag>}
      />
      <div className={actions.actions}>
        <ButtonLink to={`/new/partner?partner=${String(partner.id)}&way=paid`}>
          Pay {partner.name}
        </ButtonLink>
        <ButtonLink
          variant="secondary"
          to={`/new/partner?partner=${String(partner.id)}&way=received`}
        >
          Money from {partner.name}
        </ButtonLink>
        <Button
          variant="secondary"
          onClick={() => {
            setSheet("edit");
          }}
        >
          Edit details
        </Button>
        {canAddPartner ? (
          <Button
            variant="secondary"
            onClick={() => {
              setSheet("add");
            }}
          >
            Add partner
          </Button>
        ) : null}
      </div>
      <RangeChips value={range} onChange={setRange} today={today} startDate={startDate} />
      {shareDates ? (
        <Share partner={partner} range={shareDates} />
      ) : (
        <p className={actions.text}>
          The business started on {formatDate(startDate, today)}, so there is no share before that.
        </p>
      )}
      <Payments partner={partner} range={range} today={today} />
      {sheet === "edit" ? <EditPartner partner={partner} onClose={close} /> : null}
      {sheet === "add" ? <AddPartner onClose={close} /> : null}
    </>
  );
}

function Share({ partner, range }: { partner: Partner; range: DateRange }) {
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
  const loss = data.profitPaise < 0;
  return (
    <section className={styles.section} aria-label="Share of profit">
      <p className={`${styles.standing} ${data.balancePaise < 0 ? styles.over : ""}`}>
        {shareStanding(partner.name, data.balancePaise)}
      </p>
      <FigureStrip
        label="How the share is worked out"
        figures={[
          {
            label: loss ? "Loss" : "Profit",
            value: <Money paise={Math.abs(data.profitPaise)} tone={loss ? "owed" : "plain"} />,
          },
          {
            label: `${String(data.partner.sharePercent)}% ${loss ? "of the loss" : "share"}`,
            value: <Money paise={Math.abs(data.shareDuePaise)} />,
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
  range: DateRange | null;
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
                  aria-label={`Undo ${entry.direction === "PAID_TO_PARTNER" ? "paid" : "received"} ${formatRupees(entry.amountPaise)} on ${formatDate(entry.date, today)}`}
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
            toast(
              `Entry undone. ${netPaidText(partner.name, result.netPaidPaise, { inAll: true })}.`,
            );
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
