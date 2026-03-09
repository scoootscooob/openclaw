import { describe, expect, it, vi } from "vitest";
import { stripPluginOnlyAllowlist, type PluginToolGroups } from "./tool-policy.js";

// Mock isKnownCoreToolId so the test doesn't depend on the real tool catalog.
vi.mock(import("./tool-catalog.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isKnownCoreToolId: (id: string) => ["apply_patch", "read", "write", "exec"].includes(id),
  };
});

const pluginGroups: PluginToolGroups = {
  all: ["lobster", "workflow_tool"],
  byPlugin: new Map([["lobster", ["lobster", "workflow_tool"]]]),
};
const coreTools = new Set(["read", "write", "exec", "session_status"]);

describe("stripPluginOnlyAllowlist", () => {
  it("strips allowlist when it only targets plugin tools", () => {
    const policy = stripPluginOnlyAllowlist({ allow: ["lobster"] }, pluginGroups, coreTools);
    expect(policy.policy?.allow).toBeUndefined();
    expect(policy.unknownAllowlist).toEqual([]);
  });

  it("strips allowlist when it only targets plugin groups", () => {
    const policy = stripPluginOnlyAllowlist({ allow: ["group:plugins"] }, pluginGroups, coreTools);
    expect(policy.policy?.allow).toBeUndefined();
    expect(policy.unknownAllowlist).toEqual([]);
  });

  it('keeps allowlist when it uses "*"', () => {
    const policy = stripPluginOnlyAllowlist({ allow: ["*"] }, pluginGroups, coreTools);
    expect(policy.policy?.allow).toEqual(["*"]);
    expect(policy.unknownAllowlist).toEqual([]);
  });

  it("keeps allowlist when it mixes plugin and core entries", () => {
    const policy = stripPluginOnlyAllowlist(
      { allow: ["lobster", "read"] },
      pluginGroups,
      coreTools,
    );
    expect(policy.policy?.allow).toEqual(["lobster", "read"]);
    expect(policy.unknownAllowlist).toEqual([]);
  });

  it("strips allowlist with unknown entries when no core tools match", () => {
    const emptyPlugins: PluginToolGroups = { all: [], byPlugin: new Map() };
    const policy = stripPluginOnlyAllowlist({ allow: ["lobster"] }, emptyPlugins, coreTools);
    expect(policy.policy?.allow).toBeUndefined();
    expect(policy.unknownAllowlist).toEqual(["lobster"]);
  });

  it("keeps allowlist with core tools and reports unknown entries", () => {
    const emptyPlugins: PluginToolGroups = { all: [], byPlugin: new Map() };
    const policy = stripPluginOnlyAllowlist(
      { allow: ["read", "lobster"] },
      emptyPlugins,
      coreTools,
    );
    expect(policy.policy?.allow).toEqual(["read", "lobster"]);
    expect(policy.unknownAllowlist).toEqual(["lobster"]);
  });

  it("does not flag catalog-known tools as unknown when not in runtime coreTools (#40538)", () => {
    // `apply_patch` is in the core catalog (coding profile) but not in the runtime
    // coreTools set because it's only instantiated for OpenAI-compatible providers.
    const emptyPlugins: PluginToolGroups = { all: [], byPlugin: new Map() };
    const policy = stripPluginOnlyAllowlist(
      { allow: ["read", "apply_patch"] },
      emptyPlugins,
      coreTools,
    );
    expect(policy.policy?.allow).toEqual(["read", "apply_patch"]);
    expect(policy.unknownAllowlist).toEqual([]);
    expect(policy.strippedAllowlist).toBe(false);
  });

  it("keeps allowlist when only catalog-known tools are present (#40538)", () => {
    // Even if no runtime core tools match, catalog-known tools should prevent stripping.
    const emptyPlugins: PluginToolGroups = { all: [], byPlugin: new Map() };
    const policy = stripPluginOnlyAllowlist({ allow: ["apply_patch"] }, emptyPlugins, coreTools);
    expect(policy.policy?.allow).toEqual(["apply_patch"]);
    expect(policy.unknownAllowlist).toEqual([]);
    expect(policy.strippedAllowlist).toBe(false);
  });
});
