import { useState } from "react";
import { Button } from "../../ui/Button.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterRow } from "../../ui/Register.tsx";
import { type Khet, type Labourer, useKhets, useLabourers } from "../masters/useMasters.ts";
import styles from "./SetupPage.module.css";
import { AddKhet, AddLabourer, EditKhet, EditLabourer } from "./SetupSheets.tsx";

type Sheet =
  | { kind: "addKhet" }
  | { kind: "editKhet"; khet: Khet }
  | { kind: "addLabourer" }
  | { kind: "editLabourer"; labourer: Labourer };

/** The short lists the entry forms pick from: where sand comes from, and who loads it. */
export function SetupPage() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = () => {
    setSheet(null);
  };
  return (
    <>
      <PageHeader title="Khets and labour" />
      <Khets
        onAdd={() => {
          setSheet({ kind: "addKhet" });
        }}
        onEdit={(khet) => {
          setSheet({ kind: "editKhet", khet });
        }}
      />
      <Labourers
        onAdd={() => {
          setSheet({ kind: "addLabourer" });
        }}
        onEdit={(labourer) => {
          setSheet({ kind: "editLabourer", labourer });
        }}
      />
      {sheet?.kind === "addKhet" ? <AddKhet onClose={close} /> : null}
      {sheet?.kind === "editKhet" ? <EditKhet khet={sheet.khet} onClose={close} /> : null}
      {sheet?.kind === "addLabourer" ? <AddLabourer onClose={close} /> : null}
      {sheet?.kind === "editLabourer" ? (
        <EditLabourer labourer={sheet.labourer} onClose={close} />
      ) : null}
    </>
  );
}

function EditButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Button variant="quiet" aria-label={`Edit ${name}`} onClick={onClick}>
      Edit
    </Button>
  );
}

/** Inactive entries stay listed, so one stopped by mistake can be brought back. */
const shownName = (item: { name: string; isActive: boolean }) =>
  item.isActive ? item.name : `${item.name} (not in use)`;

function Khets({ onAdd, onEdit }: { onAdd: () => void; onEdit: (khet: Khet) => void }) {
  const khets = useKhets();
  return (
    <section className={styles.section} aria-label="Khets">
      <div className={styles.head}>
        <h2 className={styles.subhead}>Khets</h2>
        <Button variant="secondary" onClick={onAdd}>
          Add khet
        </Button>
      </div>
      {khets.isError ? (
        <LoadError error={khets.error} onRetry={() => void khets.refetch()} />
      ) : null}
      {khets.isPending ? <Loading what="khets" /> : null}
      {khets.data ? (
        <Register label="Khets">
          {khets.data.length === 0 ? (
            <RegisterRow label="No khets yet. Add the fields the sand comes from." />
          ) : (
            khets.data.map((khet) => (
              <RegisterRow
                key={khet.id}
                label={shownName(khet)}
                detail={khet.location}
                action={
                  <EditButton
                    name={khet.name}
                    onClick={() => {
                      onEdit(khet);
                    }}
                  />
                }
              />
            ))
          )}
        </Register>
      ) : null}
    </section>
  );
}

function Labourers({ onAdd, onEdit }: { onAdd: () => void; onEdit: (labourer: Labourer) => void }) {
  const labourers = useLabourers();
  return (
    <section className={styles.section} aria-label="Labour">
      <div className={styles.head}>
        <h2 className={styles.subhead}>Labour</h2>
        <Button variant="secondary" onClick={onAdd}>
          Add labourer
        </Button>
      </div>
      {labourers.isError ? (
        <LoadError error={labourers.error} onRetry={() => void labourers.refetch()} />
      ) : null}
      {labourers.isPending ? <Loading what="labourers" /> : null}
      {labourers.data ? (
        <Register label="Labour">
          {labourers.data.length === 0 ? (
            <RegisterRow label="No labourers yet. Add the people paid for loading." />
          ) : (
            labourers.data.map((labourer) => (
              <RegisterRow
                key={labourer.id}
                label={shownName(labourer)}
                detail={[labourer.phone, labourer.notes].filter(Boolean).join(", ")}
                action={
                  <EditButton
                    name={labourer.name}
                    onClick={() => {
                      onEdit(labourer);
                    }}
                  />
                }
              />
            ))
          )}
        </Register>
      ) : null}
    </section>
  );
}
