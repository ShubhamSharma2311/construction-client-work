/** A database id from text in the address, or null when the text is not one. */
export function parseId(text: string | null | undefined): number | null {
  if (text === null || text === undefined || !/^\d{1,9}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}
