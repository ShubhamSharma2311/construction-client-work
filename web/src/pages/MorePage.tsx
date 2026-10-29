import { MORE_ITEMS } from "../shell/nav.ts";
import { useSignOut } from "../shell/useSignOut.ts";
import { ErrorNotice } from "../ui/Notice.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Register, RegisterButton, RegisterLink } from "../ui/Register.tsx";

export function MorePage() {
  const { signOut, pending, errorMessage } = useSignOut();
  return (
    <>
      <PageHeader title="More" />
      <Register label="Other screens">
        {MORE_ITEMS.map((item) => (
          <RegisterLink key={item.to} to={item.to} label={item.label} />
        ))}
      </Register>
      {errorMessage ? <ErrorNotice>{errorMessage}</ErrorNotice> : null}
      <Register label="Account">
        <RegisterButton label="Sign out" disabled={pending} onClick={signOut} />
      </Register>
    </>
  );
}
