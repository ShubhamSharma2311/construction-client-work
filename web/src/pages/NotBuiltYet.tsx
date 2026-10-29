import { PageHeader } from "../ui/PageHeader.tsx";
import styles from "./NotBuiltYet.module.css";

/** Holds the place of a screen that a later block builds, so the menus can be tried now. */
export function NotBuiltYet({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <p className={styles.note}>This screen is coming in a later update.</p>
    </>
  );
}
