import { describe, expect, it } from "vitest";
import { formatModelDisplayLabel } from "./modelPresentation";

describe("formatModelDisplayLabel", () => {
  it("removes the Claude suffix while preserving the version label", () => {
    expect(
      formatModelDisplayLabel({
        id: "claude:sonnet-4.6",
        displayName: "Sonnet 4.6 · Claude",
        model: "sonnet-4.6",
      }),
    ).toBe("Sonnet 4.6");
  });

  it("keeps non-Claude labels unchanged", () => {
    expect(
      formatModelDisplayLabel({
        id: "codex:gpt-5.1",
        displayName: "GPT-5.1",
        model: "gpt-5.1",
      }),
    ).toBe("GPT-5.1");
  });
});
