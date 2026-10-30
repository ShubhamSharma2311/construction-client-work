import { Link } from "react-router";

/** Shown under a picker left empty because none of its entries is in use. */
export function SetupHint({ what }: { what: "khets" | "labourers" }) {
  return (
    <>
      No {what} in use.{" "}
      <Link to="/setup">Add one, or turn one back on, under Khets and labour.</Link>
    </>
  );
}
