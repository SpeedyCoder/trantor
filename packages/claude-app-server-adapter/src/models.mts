export function modelListResult() {
  return {
    data: [
      {
        id: "claude-sonnet-4-20250514",
        model: "claude-sonnet-4-20250514",
        providerModelId: "claude-sonnet-4-20250514",
        runtime: "claude",
        displayName: "Claude Sonnet 4",
        supportedReasoningEfforts: [],
        defaultReasoningEffort: null,
        isDefault: true,
      },
      {
        id: "claude-opus-4-20250514",
        model: "claude-opus-4-20250514",
        providerModelId: "claude-opus-4-20250514",
        runtime: "claude",
        displayName: "Claude Opus 4",
        supportedReasoningEfforts: [],
        defaultReasoningEffort: null,
        isDefault: false,
      },
    ],
  };
}

export function emptyListResult() {
  return { data: [] };
}

export function collaborationModesResult() {
  return {
    data: [],
  };
}

export function accountRateLimitsResult() {
  return {
    rateLimits: {
      primary: null,
      secondary: null,
      credits: null,
      planType: null,
    },
  };
}

export function accountReadResult() {
  return {
    account: {
      type: "unknown",
      email: null,
      planType: null,
    },
    requiresOpenaiAuth: false,
  };
}
