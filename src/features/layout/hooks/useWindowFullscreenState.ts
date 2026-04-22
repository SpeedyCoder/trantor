import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

function currentWindowSafe() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function useWindowFullscreenState() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unlistenResized: (() => void) | null = null;
    const windowHandle = currentWindowSafe();
    if (!windowHandle) {
      return;
    }

    const syncFullscreen = async () => {
      try {
        const next = await windowHandle.isFullscreen();
        if (mounted) {
          setIsFullscreen(next);
        }
      } catch {
        // Ignore non-Tauri/test runtimes.
      }
    };

    void syncFullscreen();
    void windowHandle
      .onResized(() => {
        void syncFullscreen();
      })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
          return;
        }
        unlistenResized = unlisten;
      })
      .catch(() => {
        // Ignore non-Tauri/test runtimes.
      });

    return () => {
      mounted = false;
      if (unlistenResized) {
        unlistenResized();
      }
    };
  }, []);

  return isFullscreen;
}
