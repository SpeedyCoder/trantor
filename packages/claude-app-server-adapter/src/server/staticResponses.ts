import type { GetAccountRateLimitsResponse } from "../generated/v2/GetAccountRateLimitsResponse.js";
import type { GetAccountResponse } from "../generated/v2/GetAccountResponse.js";
import type { RateLimitSnapshot } from "../generated/v2/RateLimitSnapshot.js";

export function collaborationModesResult() {
  return {
    data: [],
  };
}

export function emptyListResult() {
  return { data: [] };
}

export function accountRateLimitsResult(): GetAccountRateLimitsResponse {
  const emptySnapshot: RateLimitSnapshot = {
    limitId: null,
    limitName: null,
    primary: null,
    secondary: null,
    credits: null,
    planType: null,
  };

  return {
    rateLimits: emptySnapshot,
    rateLimitsByLimitId: null,
  };
}

export function accountReadResult(): GetAccountResponse {
  return {
    account: null,
    requiresOpenaiAuth: false,
  };
}
