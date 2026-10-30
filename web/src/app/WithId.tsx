import type { ReactNode } from "react";
import { useParams } from "react-router";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";

/** The numeric id from the address, or null when the address is not a real id. */
export function parseId(text: string | undefined): number | null {
  if (text === undefined || !/^\d{1,9}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}

/** Renders a screen for the `:id` in the address; anything else is "page not found". */
export function WithId({ render }: { render: (id: number) => ReactNode }) {
  const id = parseId(useParams().id);
  return id === null ? <NotFoundPage /> : render(id);
}
