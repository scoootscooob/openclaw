import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPluginCommandWithTimeout, type RuntimeEnv } from "openclaw/plugin-sdk";

const MATRIX_SDK_PACKAGE = "@vector-im/matrix-bot-sdk";
const CRYPTO_PACKAGE = "@matrix-org/matrix-sdk-crypto-nodejs";

export function isMatrixSdkAvailable(): boolean {
  try {
    const req = createRequire(import.meta.url);
    req.resolve(MATRIX_SDK_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether the native crypto module can be loaded.
 * Returns true if the platform binary is present, false otherwise.
 */
export function isCryptoNativeModuleAvailable(): boolean {
  try {
    const req = createRequire(import.meta.url);
    req.resolve(CRYPTO_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

function resolvePluginRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..");
}

export async function ensureMatrixSdkInstalled(params: {
  runtime: RuntimeEnv;
  confirm?: (message: string) => Promise<boolean>;
}): Promise<void> {
  if (isMatrixSdkAvailable()) {
    return;
  }
  const confirm = params.confirm;
  if (confirm) {
    const ok = await confirm("Matrix requires @vector-im/matrix-bot-sdk. Install now?");
    if (!ok) {
      throw new Error("Matrix requires @vector-im/matrix-bot-sdk (install dependencies first).");
    }
  }

  const root = resolvePluginRoot();
  const command = fs.existsSync(path.join(root, "pnpm-lock.yaml"))
    ? ["pnpm", "install"]
    : ["npm", "install", "--omit=dev", "--silent"];
  params.runtime.log?.(`matrix: installing dependencies via ${command[0]} (${root})…`);
  const result = await runPluginCommandWithTimeout({
    argv: command,
    cwd: root,
    timeoutMs: 300_000,
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "Matrix dependency install failed.",
    );
  }
  if (!isMatrixSdkAvailable()) {
    throw new Error(
      "Matrix dependency install completed but @vector-im/matrix-bot-sdk is still missing.",
    );
  }
  // Ensure the native crypto binary is downloaded. The postinstall hook in
  // package.json should handle this, but some environments suppress
  // postinstall scripts (--ignore-scripts, restricted sandboxes, etc.).
  await ensureCryptoNativeModule({ root, runtime: params.runtime });
}

/**
 * Download the native crypto binary if it wasn't fetched during npm install.
 * This is a best-effort fallback — encryption will degrade gracefully if
 * the binary remains unavailable (see create-client.ts catch block).
 */
async function ensureCryptoNativeModule(params: {
  root: string;
  runtime: RuntimeEnv;
}): Promise<void> {
  if (isCryptoNativeModuleAvailable()) {
    return;
  }
  const downloadScript = path.join(params.root, "node_modules", CRYPTO_PACKAGE, "download-lib.js");
  if (!fs.existsSync(downloadScript)) {
    return;
  }
  params.runtime.log?.(`matrix: downloading native crypto module (${CRYPTO_PACKAGE})…`);
  try {
    const result = await runPluginCommandWithTimeout({
      argv: ["node", downloadScript],
      cwd: params.root,
      timeoutMs: 120_000,
    });
    if (result.code !== 0) {
      params.runtime.log?.(
        `matrix: native crypto download exited with code ${result.code}: ${result.stderr.trim()}`,
      );
    }
  } catch {
    // Best-effort: encryption will degrade gracefully.
  }
}
