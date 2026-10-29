import { useMutation } from "@tanstack/react-query";
import { useServices } from "../app/ServicesContext.tsx";

export interface SignOut {
  signOut: () => void;
  pending: boolean;
  /** Set when the last attempt failed; the person is still signed in. */
  errorMessage: string | null;
}

export function useSignOut(): SignOut {
  const { session } = useServices();
  const mutation = useMutation({ mutationFn: () => session.signOut() });
  return {
    signOut: () => {
      mutation.mutate();
    },
    pending: mutation.isPending,
    errorMessage: mutation.isError ? "Could not sign out. Check the connection." : null,
  };
}
