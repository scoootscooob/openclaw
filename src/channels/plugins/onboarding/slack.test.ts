import { describe, expect, it } from "vitest";
import { buildSlackManifest } from "./slack.js";

describe("buildSlackManifest", () => {
  it("includes native slash commands beyond /openclaw", () => {
    const raw = buildSlackManifest("TestBot");
    const manifest = JSON.parse(raw);
    const commands: { command: string; description: string }[] = manifest.features.slash_commands;

    // Should always include the primary /openclaw command
    expect(commands.some((c) => c.command === "/openclaw")).toBe(true);

    // Should include well-known native commands (with Slack overrides)
    const names = commands.map((c) => c.command);
    expect(names).toContain("/help");
    expect(names).toContain("/new");
    expect(names).toContain("/reset");
    expect(names).toContain("/stop");
    // Slack renames /status → /agentstatus to avoid Slack's reserved name
    expect(names).toContain("/agentstatus");
    expect(names).not.toContain("/status");

    // Should have many more than just /openclaw
    expect(commands.length).toBeGreaterThan(10);
  });

  it("uses the provided bot name", () => {
    const raw = buildSlackManifest("MyBot");
    const manifest = JSON.parse(raw);
    expect(manifest.display_information.name).toBe("MyBot");
    expect(manifest.features.bot_user.display_name).toBe("MyBot");
  });

  it("falls back to OpenClaw for empty names", () => {
    const raw = buildSlackManifest("  ");
    const manifest = JSON.parse(raw);
    expect(manifest.display_information.name).toBe("OpenClaw");
  });

  it("every slash command has a description", () => {
    const raw = buildSlackManifest("TestBot");
    const manifest = JSON.parse(raw);
    const commands: { command: string; description: string }[] = manifest.features.slash_commands;

    for (const cmd of commands) {
      expect(cmd.description).toBeTruthy();
      expect(cmd.command.startsWith("/")).toBe(true);
    }
  });
});
