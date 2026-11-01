import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the API runs separately; the proxy gives the app and API one origin, as the
// Cloudflare Worker does in production, so the refresh cookie stays first-party.
const API_ORIGIN = process.env["API_ORIGIN"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // shadcn/ui components import each other through "@/".
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
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
    include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "worker/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "worker/**/*.test.ts",
        "src/api/schema.gen.ts",
        "src/main.tsx",
        "src/test/**",
        "src/components/ui/**",
        "src/hooks/use-mobile.ts",
      ],
      thresholds: { lines: 90 },
    },
  },
});
