import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("local-loader allowed-tools notice", () => {
  let tmp = "";
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-allowed-tools-notice-"));
    writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const mod = await import("./local-loader.js");
    mod.__resetAllowedToolsNoticeCacheForTest();
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
    const mod = await import("./local-loader.js");
    mod.__resetAllowedToolsNoticeCacheForTest();
    delete process.env.OPENCLAW_DISABLE_ALLOWED_TOOLS_NOTICE;
  });

  function writeSkill(dir: string, frontmatter: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\n${frontmatter}\n---\n\nbody\n`,
      "utf-8",
    );
  }

  async function loadOnce(skillDir: string) {
    const { loadWorkspaceSkillEntries } = await import("../skills.js");
    return loadWorkspaceSkillEntries(tmp, {});
  }

  test("emits a one-shot stderr notice when a skill declares allowed-tools", async () => {
    const skillDir = path.join(tmp, "skills", "my-retro-fixture-skill");
    writeSkill(
      skillDir,
      "name: my-retro-fixture-skill\ndescription: weekly retro helper\nallowed-tools: Read, Grep, Glob",
    );
    await loadOnce(skillDir);
    const ours = writeSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((msg) => msg.includes(`skill "my-retro-fixture-skill"`));
    expect(ours.length).toBe(1);
    expect(ours[0]).toContain(
      `skill "my-retro-fixture-skill" declares allowed-tools: Read, Grep, Glob`,
    );
    expect(ours[0]).toContain("warning-first");
  });

  test("stays silent for our fixture skill that does not declare allowed-tools", async () => {
    const skillDir = path.join(tmp, "skills", "my-plain-fixture-skill");
    writeSkill(skillDir, "name: my-plain-fixture-skill\ndescription: no policy");
    await loadOnce(skillDir);
    const loggedCalls = writeSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((msg) => msg.includes(`skill "my-plain-fixture-skill"`));
    expect(loggedCalls.length).toBe(0);
  });

  test("respects OPENCLAW_DISABLE_ALLOWED_TOOLS_NOTICE=1", async () => {
    process.env.OPENCLAW_DISABLE_ALLOWED_TOOLS_NOTICE = "1";
    const skillDir = path.join(tmp, "skills", "my-gated-fixture-skill");
    writeSkill(skillDir, "name: my-gated-fixture-skill\ndescription: x\nallowed-tools: Read");
    await loadOnce(skillDir);
    const loggedCalls = writeSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((msg) => msg.includes(`skill "my-gated-fixture-skill"`));
    expect(loggedCalls.length).toBe(0);
  });

  test("does not re-emit for the same skill across multiple loads", async () => {
    const skillDir = path.join(tmp, "skills", "my-once-fixture-skill");
    writeSkill(skillDir, "name: my-once-fixture-skill\ndescription: x\nallowed-tools: Read, Grep");
    await loadOnce(skillDir);
    await loadOnce(skillDir);
    await loadOnce(skillDir);
    const ours = writeSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((msg) => msg.includes('skill "my-once-fixture-skill"'));
    expect(ours.length).toBe(1);
  });
});
