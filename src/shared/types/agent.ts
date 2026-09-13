export type AgentState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";
export type AgentConfigValue = string | number | boolean | string[];
export type AgentConfig = Record<string, AgentConfigValue>;
export interface AgentConfigField {
  type: "string" | "number" | "boolean" | "file" | "directory";
  title: string;
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  multiple?: boolean;
  default?: AgentConfigValue;
  min?: number;
  max?: number;
}
export interface AgentMcpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  platform_overrides?: Record<
    string,
    { command?: string; args?: string[]; env?: Record<string, string> }
  >;
}
export interface AgentManifest {
  manifest_version?: string;
  dxt_version?: string;
  name: string;
  display_name?: string;
  version: string;
  description: string;
  author: { name: string };
  server: {
    type: "node" | "python" | "binary";
    entry_point: string;
    mcp_config?: AgentMcpConfig;
  };
  compatibility?: { platforms?: string[]; runtimes?: Record<string, string> };
  user_config?: Record<string, AgentConfigField>;
}
export interface AgentRecord {
  id: string;
  manifest: AgentManifest;
  installedAt: number;
  archiveHash: string;
}
export interface InstalledAgent extends AgentRecord {
  state: AgentState;
  error?: string;
  pid?: number;
}
export interface AgentTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}
export interface AgentLog {
  time: string;
  level: "info" | "warn" | "error";
  message: string;
}
export interface AgentAPI {
  install: () => Promise<InstalledAgent | null>;
  list: () => Promise<InstalledAgent[]>;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  uninstall: (id: string) => Promise<boolean>;
  getConfig: (
    id: string,
  ) => Promise<{ values: AgentConfig; configuredSecrets: string[] }>;
  saveConfig: (id: string, values: AgentConfig) => Promise<void>;
  listTools: (id: string) => Promise<AgentTool[]>;
  callTool: (
    id: string,
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  logs: (id: string) => Promise<AgentLog[]>;
  onChanged: (callback: (agents: InstalledAgent[]) => void) => () => void;
}
