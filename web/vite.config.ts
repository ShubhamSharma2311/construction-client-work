import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the API runs separately; the proxy gives the app and API one origin, as the
// Cloudflare Worker does in production, so the refresh cookie stays first-party.
const API_ORIGIN = process.env["API_ORIGIN"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: API_ORIGIN, rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/api/schema.gen.ts", "src/main.tsx", "src/test/**"],
      thresholds: { lines: 90 },
    },
  },
});
