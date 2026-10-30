import type { ReactNode } from "react";
import { useParams } from "react-router";
import { parseId } from "../lib/ids.ts";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";

/** Renders a screen for the `:id` in the address; anything else is "page not found". */
export function WithId({ render }: { render: (id: number) => ReactNode }) {
  const id = parseId(useParams().id);
  return id === null ? <NotFoundPage /> : render(id);
}
