import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Inbound macro expansion.
 *
 * Rewrites a leading `!name ...` token in user-facing text to a registered
 * expansion (typically a `/slash-command ...`) before OpenClaw's command
 * detection / slash-command routing runs. Lets power-users define short
 * aliases in a single JSON file and have every inbound surface (chat
 * channels, auto-reply, future inbound paths) route them identically.
 *
 * Manifest shape (JSON at `~/.openclaw/inbound-macros.json`, or override
 * via `OPENCLAW_INBOUND_MACROS_FILE`):
 *
 *   {
 *     "macros": {
 *       "!deploy-check": "/land-and-deploy --verify-only",
 *       "!retro":        "/retro"
 *     }
 *   }
 *
 * Rules:
 * - Only the FIRST whitespace-delimited token is matched. Arg tokens after
 *   the macro name are preserved verbatim after the expansion.
 * - Match is case-sensitive. Users pick the exact trigger.
 * - Non-matching input is returned unchanged.
 * - No recursion: an expansion that itself starts with `!` is not
 *   re-expanded, to avoid loops.
 * - Manifest read is best-effort; parse errors or missing files never throw.
 */
const DEFAULT_MACROS_FILENAME = "inbound-macros.json";
const DEFAULT_MACROS_DIR = ".openclaw";
const MAX_MACRO_FILE_BYTES = 256 * 1024;

interface ManifestShape {
  macros?: Record<string, string>;
}

export function getInboundMacrosManifestPath(): string {
  const override = process.env.OPENCLAW_INBOUND_MACROS_FILE;
  if (override && override.trim().length > 0) return override;
  return join(homedir(), DEFAULT_MACROS_DIR, DEFAULT_MACROS_FILENAME);
}

let cachedManifestPath: string | null = null;
let cachedMacros: Record<string, string> | null = null;
let cachedMtimeMs = 0;

function loadMacrosFromDisk(path: string): Record<string, string> | null {
  if (!existsSync(path)) return null;
  let size: number;
  let mtimeMs: number;
  try {
    const st = statSync(path);
    size = st.size;
    mtimeMs = st.mtimeMs;
  } catch {
    return null;
  }
  if (size <= 0 || size > MAX_MACRO_FILE_BYTES) return null;
  if (path === cachedManifestPath && mtimeMs === cachedMtimeMs && cachedMacros) {
    return cachedMacros;
  }
  let parsed: ManifestShape;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as ManifestShape;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !parsed.macros) return null;
  const macros: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.macros)) {
    if (typeof k !== "string" || !k.startsWith("!")) continue;
    if (typeof v !== "string" || v.trim().length === 0) continue;
    macros[k] = v.trim();
  }
  cachedManifestPath = path;
  cachedMacros = macros;
  cachedMtimeMs = mtimeMs;
  return macros;
}

/**
 * Read the inbound-macro manifest and return the macro map. Returns `{}`
 * when no manifest is present or parse fails.
 */
export function loadInboundMacros(path = getInboundMacrosManifestPath()): Record<string, string> {
  return loadMacrosFromDisk(path) ?? {};
}

/**
 * Expand a leading macro token if the text begins with a registered
 * `!name` alias. Non-matching input is returned unchanged.
 *
 * Pure function; accepts an explicit macro map for tests.
 */
export function expandInboundMacros(
  text: string,
  macros: Record<string, string> = loadInboundMacros(),
): string {
  if (!text) return text;
  // Preserve any leading whitespace so we don't accidentally change
  // indentation-sensitive code samples.
  const leadingWhitespace = text.match(/^\s*/)?.[0] ?? "";
  const body = text.slice(leadingWhitespace.length);
  if (!body.startsWith("!")) return text;
  const firstSpace = body.search(/\s/);
  const token = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : body.slice(firstSpace);
  const expansion = macros[token];
  if (!expansion) return text;
  return `${leadingWhitespace}${expansion}${rest}`;
}

/** Reset the internal cache. Test-only; never exported through index. */
export function __resetInboundMacroCacheForTest(): void {
  cachedManifestPath = null;
  cachedMacros = null;
  cachedMtimeMs = 0;
}
