import { Button } from "./Button.tsx";
import styles from "./ShowMore.module.css";

/** Under a long list: how much is showing, and a button for the next page. */
export function ShowMore({
  shown,
  total,
  loading,
  onMore,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onMore: () => void;
}) {
  return (
    <div className={styles.more}>
      <span>
        Showing {shown} of {total}
      </span>
      <Button variant="secondary" disabled={loading} onClick={onMore}>
        {loading ? "Loading…" : "Show more"}
      </Button>
    </div>
  );
}
