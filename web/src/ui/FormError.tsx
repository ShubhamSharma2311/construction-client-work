import { fieldErrors } from "../api/errors.ts";
import { saveErrorMessage } from "../api/saveErrorMessage.ts";
import { ErrorNotice } from "./Notice.tsx";

/**
 * The notice at the top of a form after a failed save. Problems the server tied to a field
 * on screen are shown at that field; anything else (the whole request, a field this form
 * does not show) is listed here, so no failure goes unexplained.
 */
export function FormError({
  error,
  shownFields,
}: {
  error: unknown;
  shownFields: readonly string[];
}) {
  if (!error) return null;
  const byField = fieldErrors(error);
  const fields = Object.keys(byField);
  if (fields.length === 0) return <ErrorNotice>{saveErrorMessage(error)}</ErrorNotice>;
  const elsewhere = fields.filter((field) => !shownFields.includes(field));
  if (elsewhere.length === 0) return null;
  return <ErrorNotice>{elsewhere.map((field) => byField[field]).join(". ")}.</ErrorNotice>;
}
