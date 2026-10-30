import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./Toast.module.css";

interface Toast {
  id: number;
  text: string;
}

type Show = (text: string) => void;

const ToastContext = createContext<Show | null>(null);

const SHOW_FOR_MS = 6000;

/** Short confirmations after a save ("Trip saved"); announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback<Show>((text) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, text }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, SHOW_FOR_MS);
  }, []);
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <p key={toast.id} className={styles.toast}>
            {toast.text}
          </p>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast needs a ToastProvider above it");
  return show;
}
