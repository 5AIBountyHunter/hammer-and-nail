import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const frontendRoot = dirname(root);
const outDir = join(frontendRoot, ".tmp-websocket-tests");
const files = [["src/services/webSocketClient.ts", "webSocketClient.js"],["src/services/webSocketClient.test.ts", "webSocketClient.test.js"]];
async function compile() {
  await rm(outDir, { recursive: true, force: true }); await mkdir(outDir, { recursive: true });
  for (const [src, dest] of files) {
    const result = spawnSync("npx", ["tsc", "--outDir", outDir, "--module", "es2020", "--target", "es2020", "--moduleResolution", "node", "--esModuleInterop", "--strict", join(frontendRoot, src)], { shell: true });
    if (result.status !== 0) { console.error("Compile error:", result.stderr.toString()); process.exit(1); }
  }
}
async function main() {
  console.log("Compiling..."); await compile();
  console.log("Running tests...");
  const result = spawnSync("node", ["--experimental-vm-modules", join(outDir, "webSocketClient.test.js")], { shell: true });
  console.log(result.stdout?.toString() || ""); if (result.stderr?.toString()) console.error(result.stderr.toString());
  process.exit(result.status ?? 1);
}
main().catch(console.error);
