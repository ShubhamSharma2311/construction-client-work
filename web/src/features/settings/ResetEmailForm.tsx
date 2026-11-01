import { type SubmitEvent, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { Button } from "../../ui/Button.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { TextField } from "../../ui/TextField.tsx";
import styles from "./SettingsPage.module.css";
import { type Account, useAccount, useSetResetEmail } from "./useSettings.ts";

/** Where "Forgot password?" sends its link. */
export function ResetEmailForm() {
  const account = useAccount();
  if (account.isError)
    return <LoadError error={account.error} onRetry={() => void account.refetch()} />;
  if (!account.data) return <Loading what="the sign-in email" />;
  return <EmailForm account={account.data} />;
}

function EmailForm({ account }: { account: Account }) {
  const [email, setEmail] = useState(account.email ?? "");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const save = useSetResetEmail();
  const server = fieldErrors(save.error);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (email.trim() === "" || password === "") return;
    save.mutate(
      { email, currentPassword: password },
      {
        onSuccess: () => {
          setPassword("");
          setTried(false);
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label="Reset email">
      <h2 className={styles.heading}>Email for a forgotten password</h2>
      <p className={styles.note}>
        {account.email
          ? `Reset links go to ${account.email}.`
          : "No email is set, so a forgotten password cannot be reset from the sign-in page."}
      </p>
      {save.isSuccess ? (
        <p role="status" className={styles.note}>
          Email saved.
        </p>
      ) : null}
      <FormError error={save.error} shownFields={["email", "currentPassword"]} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        error={tried && email.trim() === "" ? "Enter the email" : server["email"]}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={password}
        error={tried && password === "" ? "Enter the current password" : server["currentPassword"]}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <Button type="submit" variant="secondary" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save email"}
      </Button>
    </form>
  );
}
