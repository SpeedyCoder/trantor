import { useCallback, useEffect, useState } from "react";
import type { AppSettings, ModelOption } from "@/types";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "@utils/commitMessagePrompt";
import { normalizeWorktreeBranchFormat } from "@/features/workspaces/utils/worktreeBranchFormat";

type UseSettingsGitSectionArgs = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
};

export type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
  commitMessagePromptDraft: string;
  commitMessagePromptDirty: boolean;
  commitMessagePromptSaving: boolean;
  defaultWorktreeBranchFormatDraft: string;
  defaultWorktreeBranchFormatDirty: boolean;
  defaultWorktreeBranchFormatSaving: boolean;
  onSetCommitMessagePromptDraft: (value: string) => void;
  onSaveCommitMessagePrompt: () => Promise<void>;
  onResetCommitMessagePrompt: () => Promise<void>;
  onSetDefaultWorktreeBranchFormatDraft: (value: string) => void;
  onSaveDefaultWorktreeBranchFormat: () => Promise<void>;
  onResetDefaultWorktreeBranchFormat: () => void;
};

export const useSettingsGitSection = ({
  appSettings,
  onUpdateAppSettings,
  models,
}: UseSettingsGitSectionArgs): SettingsGitSectionProps => {
  const [commitMessagePromptDraft, setCommitMessagePromptDraft] = useState(
    appSettings.commitMessagePrompt,
  );
  const [commitMessagePromptSaving, setCommitMessagePromptSaving] = useState(false);
  const [defaultWorktreeBranchFormatDraft, setDefaultWorktreeBranchFormatDraft] =
    useState(appSettings.defaultWorktreeBranchFormat);
  const [defaultWorktreeBranchFormatSaving, setDefaultWorktreeBranchFormatSaving] =
    useState(false);

  useEffect(() => {
    setCommitMessagePromptDraft(appSettings.commitMessagePrompt);
  }, [appSettings.commitMessagePrompt]);

  useEffect(() => {
    setDefaultWorktreeBranchFormatDraft(appSettings.defaultWorktreeBranchFormat);
  }, [appSettings.defaultWorktreeBranchFormat]);

  const commitMessagePromptDirty =
    commitMessagePromptDraft !== appSettings.commitMessagePrompt;
  const normalizedDefaultWorktreeBranchFormat = normalizeWorktreeBranchFormat(
    defaultWorktreeBranchFormatDraft,
  );
  const defaultWorktreeBranchFormatDirty =
    normalizedDefaultWorktreeBranchFormat !== appSettings.defaultWorktreeBranchFormat;

  const handleSaveCommitMessagePrompt = useCallback(async () => {
    if (commitMessagePromptSaving || !commitMessagePromptDirty) {
      return;
    }
    setCommitMessagePromptSaving(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        commitMessagePrompt: commitMessagePromptDraft,
      });
    } finally {
      setCommitMessagePromptSaving(false);
    }
  }, [
    appSettings,
    commitMessagePromptDirty,
    commitMessagePromptDraft,
    commitMessagePromptSaving,
    onUpdateAppSettings,
  ]);

  const handleResetCommitMessagePrompt = useCallback(async () => {
    if (commitMessagePromptSaving) {
      return;
    }
    setCommitMessagePromptDraft(DEFAULT_COMMIT_MESSAGE_PROMPT);
    setCommitMessagePromptSaving(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
      });
    } finally {
      setCommitMessagePromptSaving(false);
    }
  }, [appSettings, commitMessagePromptSaving, onUpdateAppSettings]);

  const handleSaveDefaultWorktreeBranchFormat = useCallback(async () => {
    if (defaultWorktreeBranchFormatSaving || !defaultWorktreeBranchFormatDirty) {
      return;
    }
    setDefaultWorktreeBranchFormatSaving(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        defaultWorktreeBranchFormat: normalizedDefaultWorktreeBranchFormat,
      });
    } finally {
      setDefaultWorktreeBranchFormatSaving(false);
    }
  }, [
    appSettings,
    defaultWorktreeBranchFormatDirty,
    defaultWorktreeBranchFormatSaving,
    normalizedDefaultWorktreeBranchFormat,
    onUpdateAppSettings,
  ]);

  const handleResetDefaultWorktreeBranchFormat = useCallback(() => {
    if (defaultWorktreeBranchFormatSaving) {
      return;
    }
    setDefaultWorktreeBranchFormatDraft(appSettings.defaultWorktreeBranchFormat);
  }, [appSettings.defaultWorktreeBranchFormat, defaultWorktreeBranchFormatSaving]);

  return {
    appSettings,
    onUpdateAppSettings,
    models,
    commitMessagePromptDraft,
    commitMessagePromptDirty,
    commitMessagePromptSaving,
    defaultWorktreeBranchFormatDraft,
    defaultWorktreeBranchFormatDirty,
    defaultWorktreeBranchFormatSaving,
    onSetCommitMessagePromptDraft: setCommitMessagePromptDraft,
    onSaveCommitMessagePrompt: handleSaveCommitMessagePrompt,
    onResetCommitMessagePrompt: handleResetCommitMessagePrompt,
    onSetDefaultWorktreeBranchFormatDraft: setDefaultWorktreeBranchFormatDraft,
    onSaveDefaultWorktreeBranchFormat: handleSaveDefaultWorktreeBranchFormat,
    onResetDefaultWorktreeBranchFormat: handleResetDefaultWorktreeBranchFormat,
  };
};
