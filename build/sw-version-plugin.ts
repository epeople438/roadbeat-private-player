import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const PLACEHOLDER = "__ROADBEAT_BUILD__";

/**
 * `public/sw.js` is copied verbatim, so its cache name would otherwise have to
 * be bumped by hand on every client change — and forgetting leaves installed
 * PWAs on a stale shell. This stamps the placeholder with a hash of the emitted
 * asset file names, which Vite already content-hashes: the cache name changes
 * exactly when the client bundle does, and stays put when it does not.
 */
export function serviceWorkerVersion(): Plugin {
  return {
    name: "roadbeat-sw-version",
    apply: "build",
    async writeBundle(options, bundle) {
      const outputDirectory = options.dir;
      if (!outputDirectory) return;

      const serviceWorkerPath = resolve(outputDirectory, "sw.js");
      let source: string;
      try {
        source = await readFile(serviceWorkerPath, "utf8");
      } catch {
        // This environment did not emit the public directory.
        return;
      }
      if (!source.includes(PLACEHOLDER)) return;

      const version = createHash("sha256")
        .update(Object.keys(bundle).sort().join("\n"))
        .digest("hex")
        .slice(0, 10);

      await writeFile(
        serviceWorkerPath,
        source.replaceAll(PLACEHOLDER, version),
        "utf8",
      );
    },
  };
}
