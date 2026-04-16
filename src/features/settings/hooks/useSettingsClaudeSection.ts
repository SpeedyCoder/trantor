import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings, ClaudeAuthStatus } from "@/types";
import {
  getClaudeAuthStatus,
  runClaudeAuthLogout,
  startClaudeAuthLogin,
} from "@services/tauri";

type UseSettingsClaudeSectionArgs = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export type SettingsClaudeSectionProps = {
  claudeCliPathDraft: string;
  claudeAdapterPathDraft: string;
  claudeDirty: boolean;
  isSavingSettings: boolean;
  authStatus: ClaudeAuthStatus | null;
  authLoading: boolean;
  authActionLoading: boolean;
  authError: string | null;
  onSetClaudeCliPathDraft: (value: string) => void;
  onSetClaudeAdapterPathDraft: (value: string) => void;
  onBrowseClaudeCliPath: () => Promise<void>;
  onBrowseClaudeAdapterPath: () => Promise<void>;
  onSaveClaudeSettings: () => Promise<void>;
  onRefreshAuthStatus: () => Promise<void>;
  onStartLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
};

export function useSettingsClaudeSection({
  appSettings,
  onUpdateAppSettings,
}: UseSettingsClaudeSectionArgs): SettingsClaudeSectionProps {
  const [claudeCliPathDraft, setClaudeCliPathDraft] = useState(appSettings.claudeCliPath ?? "");
  const [claudeAdapterPathDraft, setClaudeAdapterPathDraft] = useState(
    appSettings.claudeAdapterPath ?? "",
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [authStatus, setAuthStatus] = useState<ClaudeAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    setClaudeCliPathDraft(appSettings.claudeCliPath ?? "");
  }, [appSettings.claudeCliPath]);

  useEffect(() => {
    setClaudeAdapterPathDraft(appSettings.claudeAdapterPath ?? "");
  }, [appSettings.claudeAdapterPath]);

  const nextClaudeCliPath = claudeCliPathDraft.trim() ? claudeCliPathDraft.trim() : null;
  const nextClaudeAdapterPath = claudeAdapterPathDraft.trim()
    ? claudeAdapterPathDraft.trim()
    : null;
  const claudeDirty =
    nextClaudeCliPath !== (appSettings.claudeCliPath ?? null) ||
    nextClaudeAdapterPath !== (appSettings.claudeAdapterPath ?? null);

  const refreshAuthStatus = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      setAuthStatus(await getClaudeAuthStatus());
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    void refreshAuthStatus();
  }, []);

  const browsePath = async (setter: (value: string) => void) => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setter(selection);
  };

  return {
    claudeCliPathDraft,
    claudeAdapterPathDraft,
    claudeDirty,
    isSavingSettings,
    authStatus,
    authLoading,
    authActionLoading,
    authError,
    onSetClaudeCliPathDraft: setClaudeCliPathDraft,
    onSetClaudeAdapterPathDraft: setClaudeAdapterPathDraft,
    onBrowseClaudeCliPath: () => browsePath(setClaudeCliPathDraft),
    onBrowseClaudeAdapterPath: () => browsePath(setClaudeAdapterPathDraft),
    onSaveClaudeSettings: async () => {
      setIsSavingSettings(true);
      try {
        await onUpdateAppSettings({
          ...appSettings,
          claudeCliPath: nextClaudeCliPath,
          claudeAdapterPath: nextClaudeAdapterPath,
        });
      } finally {
        setIsSavingSettings(false);
      }
    },
    onRefreshAuthStatus: refreshAuthStatus,
    onStartLogin: async () => {
      setAuthActionLoading(true);
      setAuthError(null);
      try {
        await startClaudeAuthLogin();
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : String(error));
      } finally {
        setAuthActionLoading(false);
      }
    },
    onLogout: async () => {
      setAuthActionLoading(true);
      setAuthError(null);
      try {
        setAuthStatus(await runClaudeAuthLogout());
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : String(error));
      } finally {
        setAuthActionLoading(false);
      }
    },
  };
}
