import { useLocation, useNavigate } from "react-router";

/**
 * Leaves a screen after its entry is deleted: back to the list it was opened from, so that
 * list's filters stay, or to `fallback` when the screen was opened directly from a link.
 */
export function useLeave(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    // React Router gives the first page a visit opened the key "default".
    if (location.key === "default") void navigate(fallback);
    else void navigate(-1);
  };
}
