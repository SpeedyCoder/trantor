export type TerminalTabsItem = {
  id: string;
  title: string;
};

type TerminalTabsProps = {
  tabs: TerminalTabsItem[];
  activeTabId: string | null;
  ariaLabel: string;
  addLabel: string;
  addTitle?: string;
  className?: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab?: (tabId: string) => void;
};

export function TerminalTabs({
  tabs,
  activeTabId,
  ariaLabel,
  addLabel,
  addTitle,
  className,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: TerminalTabsProps) {
  return (
    <div className={`terminal-header${className ? ` ${className}` : ""}`}>
      <div className="terminal-tabs" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              className={`terminal-tab${isActive ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="terminal-tab-label">{tab.title}</span>
              {onCloseTab ? (
                <span
                  className="terminal-tab-close"
                  role="button"
                  aria-label={`Close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          className="terminal-tab-add"
          type="button"
          onClick={onAddTab}
          aria-label={addLabel}
          title={addTitle ?? addLabel}
        >
          +
        </button>
      </div>
    </div>
  );
}
