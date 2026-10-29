import { useMutation } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useServices, useSessionStatus } from "../app/ServicesContext.tsx";
import { APP_NAME } from "../lib/appName.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorNotice } from "../ui/Notice.tsx";
import { TextField } from "../ui/TextField.tsx";
import styles from "./LoginPage.module.css";
import { loginErrorMessage } from "./loginErrorMessage.ts";

/** Where to go after sign in: the page that sent the person here, if it is inside this app. */
function returnAddress(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/";
  const { from } = state;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

export function LoginPage() {
  const { session } = useServices();
  const status = useSessionStatus();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({ mutationFn: () => session.signIn({ username, password }) });

  if (status === "signed-in") {
    return <Navigate to={returnAddress(location.state)} replace />;
  }

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    signIn.mutate();
  };

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.title}>{APP_NAME}</h1>
        <form className={styles.sheet} onSubmit={submit} noValidate>
          <h2 className={styles.heading}>Sign in</h2>
          {signIn.isError ? <ErrorNotice>{loginErrorMessage(signIn.error)}</ErrorNotice> : null}
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <Button type="submit" block disabled={signIn.isPending}>
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
