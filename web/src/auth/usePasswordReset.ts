import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { expectNoContent } from "../api/client.ts";
import type { BodyOf } from "../api/types.ts";
import { useServices } from "../app/ServicesContext.tsx";

/** Asks the server to email the owner a link to choose a new password. */
export function useForgotPassword(): UseMutationResult<void, Error, string> {
  const { api } = useServices();
  return useMutation({
    mutationFn: async (username: string) => {
      expectNoContent(await api.POST("/auth/forgot-password", { body: { username } }));
    },
  });
}

type ResetBody = BodyOf<"/auth/reset-password", "post">;

/** Sets the new password from an emailed link; the server signs every device out. */
export function useResetPassword(): UseMutationResult<void, Error, ResetBody> {
  const { api } = useServices();
  return useMutation({
    mutationFn: async (body: ResetBody) => {
      expectNoContent(await api.POST("/auth/reset-password", { body }));
    },
  });
}
