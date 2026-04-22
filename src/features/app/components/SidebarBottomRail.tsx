import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";

type SidebarBottomRailProps = {
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
};

export function SidebarBottomRail({
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
}: SidebarBottomRailProps) {
  return (
    <div className="sidebar-bottom-rail">
      <div className="sidebar-bottom-actions">
        <div className="sidebar-utility-actions">
          <button
            className="ghost sidebar-utility-button ds-tooltip-trigger"
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Open settings"
            data-tooltip="Open settings"
            data-tooltip-align="start"
            data-tooltip-placement="top"
          >
            <Settings aria-hidden />
          </button>
          {showDebugButton && (
            <button
              className="ghost sidebar-utility-button ds-tooltip-trigger"
              type="button"
              onClick={onOpenDebug}
              aria-label="Open debug log"
              title="Open debug log"
              data-tooltip="Open debug log"
              data-tooltip-align="start"
              data-tooltip-placement="top"
            >
              <ScrollText aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
