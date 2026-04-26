import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { TerminalTab } from "../hooks/useTerminalTabs";
import { TerminalTabs } from "./TerminalTabs";

type TerminalDockProps = {
  isOpen: boolean;
  terminals: TerminalTab[];
  activeTerminalId: string | null;
  onSelectTerminal: (terminalId: string) => void;
  onNewTerminal: () => void;
  onCloseTerminal: (terminalId: string) => void;
  onResizeStart?: (event: ReactMouseEvent) => void;
  terminalNode: ReactNode;
};

export function TerminalDock({
  isOpen,
  terminals,
  activeTerminalId,
  onSelectTerminal,
  onNewTerminal,
  onCloseTerminal,
  onResizeStart,
  terminalNode,
}: TerminalDockProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="terminal-panel">
      {onResizeStart && (
        <div
          className="terminal-panel-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal panel"
          onMouseDown={onResizeStart}
        />
      )}
      <TerminalTabs
        tabs={terminals}
        activeTabId={activeTerminalId}
        ariaLabel="Terminal tabs"
        addLabel="New terminal"
        onSelectTab={onSelectTerminal}
        onAddTab={onNewTerminal}
        onCloseTab={onCloseTerminal}
      />
      <div className="terminal-body">{terminalNode}</div>
    </section>
  );
}
