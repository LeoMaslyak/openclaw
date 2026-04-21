import { describe, expect, test } from "vitest";
import { expandInboundMacros } from "./inbound-macros.js";

describe("expandInboundMacros", () => {
  const macros = {
    "!deploy-check": "/land-and-deploy --verify-only",
    "!retro": "/retro",
    "!second-opinion": "/codex consult",
  };

  test("expands leading macro token with no args", () => {
    expect(expandInboundMacros("!retro", macros)).toBe("/retro");
  });

  test("preserves trailing args verbatim", () => {
    expect(expandInboundMacros("!deploy-check staging", macros)).toBe(
      "/land-and-deploy --verify-only staging",
    );
    expect(expandInboundMacros("!second-opinion why did the test flake?", macros)).toBe(
      "/codex consult why did the test flake?",
    );
  });

  test("preserves leading whitespace", () => {
    expect(expandInboundMacros("   !retro", macros)).toBe("   /retro");
  });

  test("leaves non-matching input unchanged", () => {
    expect(expandInboundMacros("!unknown arg", macros)).toBe("!unknown arg");
    expect(expandInboundMacros("hello !retro", macros)).toBe("hello !retro");
    expect(expandInboundMacros("/retro", macros)).toBe("/retro");
    expect(expandInboundMacros("", macros)).toBe("");
  });

  test("does not recurse when expansion starts with !", () => {
    const loopy = { "!a": "!b", "!b": "/done" };
    expect(expandInboundMacros("!a", loopy)).toBe("!b");
  });

  test("match is case-sensitive", () => {
    expect(expandInboundMacros("!RETRO", macros)).toBe("!RETRO");
  });
});
