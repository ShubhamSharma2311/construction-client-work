import { Link } from "react-router";
import { PageHeader } from "../ui/PageHeader.tsx";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <p>
        This address does not match any screen. <Link to="/">Go to Today</Link>.
      </p>
    </>
  );
}
