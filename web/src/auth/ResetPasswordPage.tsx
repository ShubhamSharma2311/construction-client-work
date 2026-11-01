import { type SubmitEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { fieldErrors } from "../api/errors.ts";
import { APP_NAME } from "../lib/appName.ts";
import { Button } from "../ui/Button.tsx";
import { FormError } from "../ui/FormError.tsx";
import { TextField } from "../ui/TextField.tsx";
import styles from "./LoginPage.module.css";
import { newPasswordProblems } from "./newPassword.ts";
import { useResetPassword } from "./usePasswordReset.ts";

/** Opened from the emailed link, which carries the one-time token. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.title}>{APP_NAME}</h1>
        {token === "" ? <BrokenLink /> : <NewPasswordForm token={token} />}
      </div>
    </div>
  );
}

function BrokenLink() {
  return (
    <section className={styles.sheet} aria-labelledby="broken">
      <h2 id="broken" className={styles.heading}>
        This link is incomplete
      </h2>
      <p className={styles.note}>Open the link from the email again, or ask for a new one.</p>
      <Link className={styles.help} to="/forgot-password">
        Ask for a new link
      </Link>
    </section>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [tried, setTried] = useState(false);
  const reset = useResetPassword();
  const problems = tried ? newPasswordProblems(next, repeat) : {};
  const server = fieldErrors(reset.error);

  if (reset.isSuccess) {
    return (
      <section className={styles.sheet} aria-labelledby="changed">
        <h2 id="changed" className={styles.heading}>
          Password changed
        </h2>
        <p role="status" className={styles.note}>
          Sign in with the new password. Every phone and computer was signed out.
        </p>
        <Link className={styles.help} to="/login">
          Sign in
        </Link>
      </section>
    );
  }

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(newPasswordProblems(next, repeat)).length > 0) return;
    reset.mutate({ token, newPassword: next });
  };

  return (
    <form className={styles.sheet} onSubmit={submit} noValidate>
      <h2 className={styles.heading}>Choose a new password</h2>
      <FormError error={reset.error} shownFields={["newPassword"]} />
      {reset.isError && Object.keys(server).length === 0 ? (
        <Link className={styles.help} to="/forgot-password">
          Ask for a new link
        </Link>
      ) : null}
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        error={problems.newPassword ?? server["newPassword"]}
        onChange={(event) => {
          setNext(event.target.value);
        }}
      />
      <TextField
        label="New password again"
        type="password"
        autoComplete="new-password"
        value={repeat}
        error={problems.repeat}
        onChange={(event) => {
          setRepeat(event.target.value);
        }}
      />
      <Button type="submit" block disabled={reset.isPending}>
        {reset.isPending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
