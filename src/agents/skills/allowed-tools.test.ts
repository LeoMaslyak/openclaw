import { describe, expect, test } from "vitest";
import { describeToolViolation, parseAllowedTools, skillAllowsTool } from "./allowed-tools.js";

describe("parseAllowedTools", () => {
  test("returns null when frontmatter does not declare allowed-tools", () => {
    expect(parseAllowedTools(undefined)).toBeNull();
    expect(parseAllowedTools({})).toBeNull();
    expect(parseAllowedTools({ name: "x" })).toBeNull();
  });

  test("parses comma-separated scalar", () => {
    expect(parseAllowedTools({ "allowed-tools": "Read, Grep, Glob" })).toEqual([
      "Read",
      "Grep",
      "Glob",
    ]);
  });

  test("parses YAML-style inline list (reduced to scalar)", () => {
    expect(parseAllowedTools({ "allowed-tools": "[Read, Grep, Glob]" })).toEqual([
      "Read",
      "Grep",
      "Glob",
    ]);
  });

  test("accepts allowedTools as an alternate key", () => {
    expect(parseAllowedTools({ allowedTools: "Read, Write" })).toEqual(["Read", "Write"]);
  });

  test("deduplicates and trims", () => {
    expect(parseAllowedTools({ "allowed-tools": "  Read , Read , Grep " })).toEqual(["Read", "Grep"]);
  });

  test("returns [] for declared-but-empty list (explicit deny-all)", () => {
    expect(parseAllowedTools({ "allowed-tools": "" })).toEqual([]);
    expect(parseAllowedTools({ "allowed-tools": "[]" })).toEqual([]);
  });

  test("strips surrounding quotes on individual entries", () => {
    expect(parseAllowedTools({ "allowed-tools": `"Read", 'Grep'` })).toEqual(["Read", "Grep"]);
  });
});

describe("skillAllowsTool", () => {
  test("no policy declared → allow-all (backwards-compatible)", () => {
    expect(skillAllowsTool(null, "Bash")).toBe(true);
  });

  test("empty declared policy → deny-all", () => {
    expect(skillAllowsTool([], "Read")).toBe(false);
  });

  test("case-sensitive match", () => {
    expect(skillAllowsTool(["Read", "Grep"], "Read")).toBe(true);
    expect(skillAllowsTool(["Read", "Grep"], "read")).toBe(false);
    expect(skillAllowsTool(["Read", "Grep"], "Write")).toBe(false);
  });
});

describe("describeToolViolation", () => {
  test("formats a single-line diagnostic", () => {
    expect(
      describeToolViolation({ skillName: "retro", toolName: "Write", allowed: ["Read", "Grep"] }),
    ).toBe(
      `skill "retro" invoked tool "Write" outside its allowed-tools policy (allowed: Read, Grep)`,
    );
  });

  test("reports <empty> when no tools are allowed", () => {
    expect(describeToolViolation({ skillName: "locked", toolName: "Bash", allowed: [] })).toBe(
      `skill "locked" invoked tool "Bash" outside its allowed-tools policy (allowed: <empty>)`,
    );
  });
});
