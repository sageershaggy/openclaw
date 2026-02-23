import { describe, expect, it } from "vitest";
import { getValueAtPath, resolveOpenAiConnectionDetails } from "./connections.ts";

describe("connections helpers", () => {
  it("reads nested values by path", () => {
    const value = getValueAtPath({ env: { OPENAI_API_KEY: "sk-test" } }, ["env", "OPENAI_API_KEY"]);
    expect(value).toBe("sk-test");
  });

  it("prefers env OPENAI key when both env and provider keys are present", () => {
    const details = resolveOpenAiConnectionDetails({
      env: { OPENAI_API_KEY: "__OPENCLAW_REDACTED__" },
      models: { providers: { openai: { apiKey: "provider-key" } } },
      agents: { defaults: { model: "openai/gpt-5.2" } },
    });

    expect(details.keyConfigured).toBe(true);
    expect(details.keyStoredHidden).toBe(true);
    expect(details.keySource).toBe("env");
    expect(details.modelValue).toBe("openai/gpt-5.2");
    expect(details.modelPath).toEqual(["agents", "defaults", "model"]);
  });

  it("uses model.primary path when defaults model is object-shaped", () => {
    const details = resolveOpenAiConnectionDetails({
      models: { providers: { openai: { apiKey: "__OPENCLAW_REDACTED__" } } },
      agents: { defaults: { model: { primary: "anthropic/claude-sonnet", fallbacks: [] } } },
    });

    expect(details.keyConfigured).toBe(true);
    expect(details.keySource).toBe("provider");
    expect(details.modelValue).toBe("anthropic/claude-sonnet");
    expect(details.modelPath).toEqual(["agents", "defaults", "model", "primary"]);
  });
});
