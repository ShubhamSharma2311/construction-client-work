import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { App } from "./app/App.tsx";
import { createQueryClient } from "./app/queryClient.ts";
import { routes } from "./app/routes.tsx";
import { createServices } from "./app/services.ts";
import "./styles/base.css";

const services = createServices({
  baseUrl: `${window.location.origin}/api`,
  fetch: (request) => fetch(request),
  locks: "locks" in navigator ? navigator.locks : undefined,
});

// Never rejects: a failure becomes the session status, which the screen explains.
void services.session.restore();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App
      services={services}
      queryClient={createQueryClient()}
      router={createBrowserRouter(routes)}
    />
  </StrictMode>,
);
