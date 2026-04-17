import type { ModelOption } from "../../../types";
import { runtimeForModelId } from "./modelRuntime";

type ModelLabelSource = Pick<ModelOption, "id" | "displayName" | "model">;

export function formatModelDisplayLabel(model: ModelLabelSource | null, fallback = "Default model") {
  const baseLabel = model?.displayName?.trim() || model?.model?.trim() || fallback;
  if (!model) {
    return baseLabel;
  }
  return runtimeForModelId(model.id) === "claude"
    ? baseLabel.replace(/\s*[·•]\s*Claude$/i, "").trim()
    : baseLabel;
}
