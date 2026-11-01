import { type SubmitEvent, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { Button } from "../../ui/Button.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { newPasswordProblems } from "../../auth/newPassword.ts";
import { TextField } from "../../ui/TextField.tsx";
import styles from "./SettingsPage.module.css";
import { useChangePassword } from "./useSettings.ts";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [tried, setTried] = useState(false);
  const change = useChangePassword();
  const problems = tried ? newPasswordProblems(next, repeat) : {};
  const server = fieldErrors(change.error);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (current === "" || Object.keys(newPasswordProblems(next, repeat)).length > 0) return;
    change.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.note}>
        Changing the password signs out every phone and computer, this one too.
      </p>
      <FormError error={change.error} shownFields={["currentPassword", "newPassword"]} />
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        error={tried && current === "" ? "Enter the current password" : server["currentPassword"]}
        onChange={(event) => {
          setCurrent(event.target.value);
        }}
      />
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
      <Button type="submit" disabled={change.isPending}>
        {change.isPending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
