export type CliOptions = {
  workspaceId: string;
  dataDir: string;
};

function argValue(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  if (args[0] !== "app-server") {
    throw new Error(
      "Usage: claude-app-server-adapter app-server --workspace-id <id> --data-dir <path>",
    );
  }

  return {
    workspaceId: argValue(args, "--workspace-id", "workspace"),
    dataDir: argValue(args, "--data-dir", `${process.cwd()}/.claude-adapter`),
  };
}
