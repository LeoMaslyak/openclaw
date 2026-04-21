import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { spawn } from "node:child_process";
import type { ProgramContext } from "./context.js";

/**
 * Stable extension seam for user/local CLI passthrough commands.
 *
 * On program boot, read `~/.openclaw/cli-commands.json` (if present) and
 * register each declared top-level command as a Commander passthrough
 * that execs the configured shell command with forwarded argv.
 *
 * Manifest shape (synchronous JSON so registration happens in sync with
 * Commander finalization — no async/argv-parse race):
 *
 *   {
 *     "commands": {
 *       "fleet": {
 *         "exec": "bun /Users/you/clawd/scripts/fleet.ts",
 *         "description": "Manifest-backed parallel worker dispatcher"
 *       }
 *     }
 *   }
 *
 * This lets power-users and local integrations wire `openclaw <name>`
 * to a script without patching vendored `dist/` files.
 *
 * Opt-out: `OPENCLAW_DISABLE_USER_CLI_EXTENSIONS=1` skips loading.
 */
const USER_CLI_MANIFEST_RELATIVE = join(".openclaw", "cli-commands.json");

interface UserCliCommandEntry {
  exec: string;
  description?: string;
}

interface UserCliManifest {
  commands?: Record<string, UserCliCommandEntry>;
}

export function getUserCliManifestPath(): string {
  return join(homedir(), USER_CLI_MANIFEST_RELATIVE);
}

function shouldSkipExtensions(): boolean {
  return process.env.OPENCLAW_DISABLE_USER_CLI_EXTENSIONS === "1";
}

function loadManifest(path: string): UserCliManifest | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as UserCliManifest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`openclaw: failed to read ${path}: ${msg}\n`);
    return null;
  }
}

/**
 * Run a shell string with forwarded argv. We deliberately split the
 * configured `exec` into argv pieces and spawn without a shell, so the
 * command cannot smuggle extra shell metacharacters from user argv.
 */
function runPassthrough(exec: string, forwardedArgs: readonly string[]): Promise<number> {
  const parts = exec.trim().split(/\s+/);
  const [cmd, ...baseArgs] = parts;
  if (!cmd) return Promise.resolve(1);
  return new Promise((resolve) => {
    const proc = spawn(cmd, [...baseArgs, ...forwardedArgs], { stdio: "inherit" });
    proc.on("close", (code) => resolve(typeof code === "number" ? code : 1));
    proc.on("error", (err) => {
      process.stderr.write(`openclaw: ${cmd} failed: ${err.message}\n`);
      resolve(1);
    });
  });
}

/**
 * Synchronously register user extension commands on the given program.
 *
 * Called from `registerProgramCommands` so the entries are available by
 * the time Commander parses argv — no async race with `.parse()`.
 */
export function registerUserCliExtensions(program: Command, _ctx: ProgramContext): void {
  if (shouldSkipExtensions()) return;
  const manifest = loadManifest(getUserCliManifestPath());
  if (!manifest?.commands) return;
  for (const [name, entry] of Object.entries(manifest.commands)) {
    if (!entry || typeof entry.exec !== "string" || entry.exec.trim().length === 0) continue;
    if (program.commands.some((c) => c.name() === name)) continue; // do not shadow core
    program
      .command(name)
      .description(entry.description ?? `user extension: ${entry.exec}`)
      .allowUnknownOption(true)
      .helpOption(false)
      .argument("[args...]", "forwarded to the extension")
      .action(async (_args: string[], _opts: unknown, cmd: Command) => {
        // Forward every raw argv token AFTER the command name, including
        // unparsed options and the `--` separator if present.
        const argv = process.argv;
        const idx = argv.indexOf(cmd.name());
        const forwarded = idx >= 0 ? argv.slice(idx + 1) : [];
        const code = await runPassthrough(entry.exec, forwarded);
        process.exit(code);
      });
  }
}
