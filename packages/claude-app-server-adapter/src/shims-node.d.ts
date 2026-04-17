declare module "node:fs/promises" {
  const fs: any;
  export default fs;
}

declare module "node:path" {
  const path: any;
  export default path;
}

declare module "node:readline" {
  const readline: any;
  export default readline;
}

declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "node:os" {
  const os: any;
  export default os;
}

declare var process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  pid: number;
  stdin: unknown;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  exit(code?: number): never;
};

declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string;
  }
}
