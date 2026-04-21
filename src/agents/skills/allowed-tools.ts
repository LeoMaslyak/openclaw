import type { ParsedSkillFrontmatter } from "./types.js";

/**
 * Scoped skill `allowed-tools` parsing (warning-first).
 *
 * A skill's SKILL.md frontmatter may declare `allowed-tools`, either as a
 * comma/space-separated scalar:
 *
 *   allowed-tools: Read, Grep, Glob
 *
 * or as a YAML-style inline list (also reduced to a scalar by the existing
 * frontmatter parser, since `ParsedSkillFrontmatter = Record<string, string>`):
 *
 *   allowed-tools: [Read, Grep, Glob]
 *
 * This module provides a pure parser + predicate. It does NOT yet enforce
 * anything at runtime; we ship the helpers first so downstream code can
 * consume them and the warning-first UX can be wired incrementally (log
 * a structured warning when a skill invokes a tool outside its declared
 * set, before escalating to hard denial).
 */

const LIST_TRIM_RE = /^[\s[{]+|[\s\]}]+$/g;

/**
 * Parse the `allowed-tools` frontmatter field of a skill.
 *
 * Returns:
 * - `null` when the skill does not declare `allowed-tools` at all (no policy).
 * - `[]` when the skill declares `allowed-tools` but the list is empty (explicit denial of everything).
 * - `string[]` of unique, trimmed tool names otherwise.
 */
export function parseAllowedTools(
  frontmatter: ParsedSkillFrontmatter | undefined,
): string[] | null {
  if (!frontmatter) {
    return null;
  }
  const raw = frontmatter["allowed-tools"] ?? frontmatter["allowedTools"];
  if (raw === undefined) {
    return null;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const stripped = raw.replace(LIST_TRIM_RE, "");
  if (!stripped) {
    return [];
  }
  const pieces = stripped
    .split(/[,\n]/)
    .map((p) => p.trim())
    .map((p) => p.replace(/^['"]|['"]$/g, ""))
    .filter((p) => p.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pieces) {
    if (seen.has(p)) {
      continue;
    }
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Decide whether a skill with the given parsed allowed-tools list allows a
 * specific tool invocation.
 *
 * - When `allowed` is `null`, the skill has no declared policy — all tools
 *   are permitted (backwards-compatible with existing skills).
 * - When `allowed` is `[]`, the skill has an explicit empty list — nothing
 *   is permitted.
 * - Otherwise, permitted iff `toolName` is present (case-sensitive match).
 *
 * Callers are expected to treat a `false` return as a soft warning in the
 * initial rollout; hard denial is a separate, future opt-in layer.
 */
export function skillAllowsTool(allowed: string[] | null, toolName: string): boolean {
  if (allowed === null) {
    return true;
  }
  if (allowed.length === 0) {
    return false;
  }
  return allowed.includes(toolName);
}

/**
 * Build a single-line diagnostic describing an allowed-tools policy
 * violation, suitable for logging via stderr or a structured logger.
 */
export function describeToolViolation(params: {
  skillName: string;
  toolName: string;
  allowed: readonly string[];
}): string {
  const { skillName, toolName, allowed } = params;
  return `skill "${skillName}" invoked tool "${toolName}" outside its allowed-tools policy (allowed: ${allowed.join(", ") || "<empty>"})`;
}
