import { describe, expect, it } from "vitest";
import { extractThreadFromResponse } from "./threadSummary";

describe("extractThreadFromResponse", () => {
  it("carries top-level model metadata into extracted thread payloads", () => {
    const thread = extractThreadFromResponse({
      result: {
        thread: {
          id: "thread-1",
          preview: "hello",
        },
        model: "sonnet-4.5",
        modelProvider: "anthropic",
        reasoningEffort: "medium",
      },
    });

    expect(thread).toMatchObject({
      id: "thread-1",
      model: "sonnet-4.5",
      modelProvider: "anthropic",
      reasoningEffort: "medium",
    });
  });
});
