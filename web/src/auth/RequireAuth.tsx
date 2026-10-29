import { Navigate, Outlet, useLocation } from "react-router";
import { useServices, useSessionStatus } from "../app/ServicesContext.tsx";
import { Button } from "../ui/Button.tsx";
import styles from "./RequireAuth.module.css";

const PROBLEMS = {
  unreachable: "Cannot reach the server. Check the internet connection.",
  "server-error": "The server had a problem. Try again in a minute.",
} as const;

/** Shows the signed-in app, or sends the person to sign in and back again afterwards. */
export function RequireAuth() {
  const { session } = useServices();
  const status = useSessionStatus();
  const location = useLocation();

  if (status === "signed-in") return <Outlet />;
  if (status === "signed-out") {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  if (status === "checking") {
    return (
      <div className={styles.center} aria-busy="true">
        <p>Opening your ledger…</p>
      </div>
    );
  }
  return (
    <div className={styles.center} role="alert">
      <p>{PROBLEMS[status]}</p>
      <Button onClick={() => void session.restore()}>Try again</Button>
    </div>
  );
}
