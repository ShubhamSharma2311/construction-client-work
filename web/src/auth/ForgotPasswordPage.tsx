import { type SubmitEvent, useState } from "react";
import { Link } from "react-router";
import { APP_NAME } from "../lib/appName.ts";
import { Button } from "../ui/Button.tsx";
import { FormError } from "../ui/FormError.tsx";
import { TextField } from "../ui/TextField.tsx";
import styles from "./LoginPage.module.css";
import { useForgotPassword } from "./usePasswordReset.ts";

export function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [tried, setTried] = useState(false);
  const request = useForgotPassword();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (username.trim() === "") return;
    request.mutate(username);
  };

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.title}>{APP_NAME}</h1>
        {request.isSuccess ? (
          <section className={styles.sheet} aria-labelledby="sent">
            <h2 id="sent" className={styles.heading}>
              Check your email
            </h2>
            <p role="status" className={styles.note}>
              If {username.trim()} has an email set, a link to choose a new password is on its way.
              It works once, for 30 minutes.
            </p>
            <Link className={styles.help} to="/login">
              Back to sign in
            </Link>
          </section>
        ) : (
          <form className={styles.sheet} onSubmit={submit} noValidate>
            <h2 className={styles.heading}>Forgot password</h2>
            <p className={styles.note}>
              Enter your username. A link to choose a new password goes to the email set in
              Settings.
            </p>
            <FormError error={request.error} shownFields={["username"]} />
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              error={tried && username.trim() === "" ? "Enter your username" : undefined}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
            <Button type="submit" block disabled={request.isPending}>
              {request.isPending ? "Sending…" : "Email me a link"}
            </Button>
            <Link className={styles.help} to="/login">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
