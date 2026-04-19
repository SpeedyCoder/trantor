import { useCallback, useMemo } from "react";
import { harnessForModelId } from "@/features/models/utils/modelRuntime";
import { setWorkspaceRuntimeCodexArgs } from "@services/tauri";
import { buildCodexArgsOptions } from "@threads/utils/codexArgsProfiles";
import {
  resolveWorkspaceRuntimeCodexArgsBadgeLabel,
  resolveWorkspaceRuntimeCodexArgsOverride,
} from "@threads/utils/threadCodexParamsSeed";
import type { ThreadCodexParams } from "@threads/utils/threadStorage";

type ThreadCodexParamsPatch = Partial<
  Pick<
    ThreadCodexParams,
    | "harness"
    | "modelId"
    | "effort"
    | "serviceTier"
    | "accessMode"
    | "collaborationModeId"
    | "codexArgsOverride"
  >
>;

type ThreadCodexMetadata = {
  modelId: string | null;
  effort: string | null;
};

type UseMainAppThreadCodexStateArgs = {
  enabled?: boolean;
  appCodexArgs: string | null | undefined;
  selectedCodexArgsOverride: string | null;
  getThreadCodexParams: (
    workspaceId: string,
    threadId: string,
  ) => ThreadCodexParams | null;
  patchThreadCodexParams: (
    workspaceId: string,
    threadId: string,
    patch: ThreadCodexParamsPatch,
  ) => void;
};

export function useMainAppThreadCodexState({
  enabled = true,
  appCodexArgs,
  selectedCodexArgsOverride,
  getThreadCodexParams,
  patchThreadCodexParams,
}: UseMainAppThreadCodexStateArgs) {
  const handleThreadCodexMetadataDetected = useCallback(
    (workspaceId: string, threadId: string, metadata: ThreadCodexMetadata) => {
      if (!workspaceId || !threadId) {
        return;
      }

      const modelId =
        typeof metadata.modelId === "string" && metadata.modelId.trim().length > 0
          ? metadata.modelId.trim()
          : null;
      const effort =
        typeof metadata.effort === "string" && metadata.effort.trim().length > 0
          ? metadata.effort.trim().toLowerCase()
          : null;
      if (!modelId && !effort) {
        return;
      }

      const current = getThreadCodexParams(workspaceId, threadId);
      const patch: ThreadCodexParamsPatch = {};
      const harness = harnessForModelId(modelId);
      if (harness && !current?.harness) {
        patch.harness = harness;
      }
      if (modelId && !current?.modelId) {
        patch.modelId = modelId;
      }
      if (effort && !current?.effort) {
        patch.effort = effort;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      patchThreadCodexParams(workspaceId, threadId, patch);
    },
    [getThreadCodexParams, patchThreadCodexParams],
  );

  const codexArgsOptions = useMemo(
    () =>
      enabled
        ? buildCodexArgsOptions({
            appCodexArgs: appCodexArgs ?? null,
            additionalCodexArgs: [selectedCodexArgsOverride],
          })
        : [],
    [appCodexArgs, enabled, selectedCodexArgsOverride],
  );

  const ensureWorkspaceRuntimeCodexArgs = useCallback(
    async (workspaceId: string, threadId: string | null) => {
      if (!enabled) {
        return;
      }
      const sanitizedCodexArgsOverride = resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId,
        threadId,
        getThreadCodexParams,
      });
      await setWorkspaceRuntimeCodexArgs(workspaceId, sanitizedCodexArgsOverride);
    },
    [enabled, getThreadCodexParams],
  );

  const getThreadArgsBadge = useCallback(
    (workspaceId: string, threadId: string) =>
      enabled
        ? resolveWorkspaceRuntimeCodexArgsBadgeLabel({
            workspaceId,
            threadId,
            getThreadCodexParams,
          })
        : null,
    [enabled, getThreadCodexParams],
  );

  return {
    handleThreadCodexMetadataDetected,
    codexArgsOptions,
    ensureWorkspaceRuntimeCodexArgs,
    getThreadArgsBadge,
  };
}
