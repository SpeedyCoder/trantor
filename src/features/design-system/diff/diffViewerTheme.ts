export const DIFF_VIEWER_SCROLL_CSS = `
[data-column-number],
[data-buffer],
[data-separator-wrapper],
[data-annotation-content] {
  position: static !important;
}

[data-buffer] {
  background-image: none !important;
}

[data-hover-slot] {
  left: 0 !important;
  right: auto !important;
  justify-content: flex-start !important;
}

diffs-container,
[data-diffs],
[data-diffs-header],
[data-error-wrapper] {
  position: relative !important;
  contain: layout style !important;
  isolation: isolate !important;
}

[data-diffs-header],
[data-diffs],
[data-error-wrapper] {
  --diffs-light-bg: var(--ds-diff-lib-bg-light);
  --diffs-dark-bg: var(--ds-diff-lib-bg-dark);
  --diffs-light: var(--text-quiet);
  --diffs-dark: var(--text-quiet);
  --diffs-bg-buffer-override: color-mix(in srgb, var(--surface-control) 45%, transparent);
  --diffs-bg-hover-override: color-mix(in srgb, var(--surface-active) 45%, transparent);
  --diffs-bg-context-override: var(--surface-card-muted);
  --diffs-bg-separator-override: var(--surface-card-muted);
  --diffs-fg-number-override: var(--text-fainter);
  --diffs-fg-number-addition-override: var(--ds-diff-add-text);
  --diffs-fg-number-deletion-override: var(--ds-diff-del-text);
  --diffs-addition-color-override: var(--ds-diff-add-text);
  --diffs-deletion-color-override: var(--ds-diff-del-text);
  --diffs-modified-color-override: var(--ds-diff-info-text);
  --diffs-bg-addition-override: var(--ds-diff-add-bg);
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--ds-diff-add-text) 18%, transparent);
  --diffs-bg-addition-hover-override: var(--ds-diff-add-bg-strong);
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--ds-diff-add-text) 24%, transparent);
  --diffs-bg-deletion-override: var(--ds-diff-del-bg);
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--ds-diff-del-text) 18%, transparent);
  --diffs-bg-deletion-hover-override: var(--ds-diff-del-bg-strong);
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, var(--ds-diff-del-text) 24%, transparent);
  --diffs-selection-color-override: var(--border-accent);
  --diffs-bg-selection-override: color-mix(in srgb, var(--surface-active) 78%, transparent);
  --diffs-bg-selection-number-override: color-mix(in srgb, var(--border-accent) 24%, transparent);
  --diffs-bg-selection-background-override: color-mix(in srgb, var(--surface-active) 60%, transparent);
  --diffs-bg-selection-number-background-override: color-mix(in srgb, var(--border-accent) 18%, transparent);
}

[data-diffs-header][data-theme-type='light'],
[data-diffs][data-theme-type='light'] {
  --diffs-bg: var(--ds-diff-lib-bg-light);
}

[data-diffs-header][data-theme-type='dark'],
[data-diffs][data-theme-type='dark'] {
  --diffs-bg: var(--ds-diff-lib-bg-dark);
}

@media (prefers-color-scheme: dark) {
  [data-diffs-header]:not([data-theme-type]),
  [data-diffs]:not([data-theme-type]),
  [data-diffs-header][data-theme-type='system'],
  [data-diffs][data-theme-type='system'] {
    --diffs-bg: var(--ds-diff-lib-bg-system-dark);
  }
}

@media (prefers-color-scheme: light) {
  [data-diffs-header]:not([data-theme-type]),
  [data-diffs]:not([data-theme-type]),
  [data-diffs-header][data-theme-type='system'],
  [data-diffs][data-theme-type='system'] {
    --diffs-bg: var(--ds-diff-lib-bg-system-light);
  }
}
`;

export const DIFF_VIEWER_HIGHLIGHTER_OPTIONS = {
  theme: { dark: "pierre-dark", light: "pierre-light" },
} as const;
