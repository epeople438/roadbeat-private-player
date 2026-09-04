import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";
import { serviceWorkerVersion } from "./build/sw-version-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

interface HostingConfig {
  d1?: string;
  r2?: string;
}

/**
 * `.openai/hosting.json` only exists in a checkout that is wired to a Sites
 * project. Read it optionally so the Cloudflare build still runs (without D1 or
 * R2 bindings) in a checkout that has none — a static import would fail the
 * whole config load instead.
 */
function readHostingConfig(): HostingConfig {
  try {
    const path = fileURLToPath(new URL("./.openai/hosting.json", import.meta.url));
    return JSON.parse(readFileSync(path, "utf8")) as HostingConfig;
  } catch {
    return {};
  }
}

const { d1, r2 } = readHostingConfig();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      serviceWorkerVersion(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
