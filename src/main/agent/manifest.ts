import { z } from "zod";
import semver from "semver";
import path from "node:path";
import type { AgentManifest, AgentConfig } from "../../shared/types/agent.js";
const field = z.object({
  type: z.enum(["string", "number", "boolean", "file", "directory"]),
  title: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  multiple: z.boolean().optional(),
  default: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
const override = z.object({
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
const schema = z.object({
  manifest_version: z.enum(["0.1", "0.2", "0.3"]).optional(),
  dxt_version: z.literal("0.1").optional(),
  name: z.string().min(1).max(128),
  display_name: z.string().max(256).optional(),
  version: z.string().refine((value) => !!semver.valid(value)),
  description: z.string().max(10000),
  author: z.object({ name: z.string().min(1) }),
  server: z.object({
    type: z.enum(["node", "python", "binary"]),
    entry_point: z.string().min(1),
    mcp_config: override
      .extend({
        command: z.string().min(1),
        platform_overrides: z.record(z.string(), override).optional(),
      })
      .optional(),
  }),
  compatibility: z
    .object({
      platforms: z.array(z.enum(["win32", "darwin", "linux"])).optional(),
      runtimes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  user_config: z.record(z.string(), field).optional(),
});
export function relativeFile(value: string) {
  if (
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[<>:"|?*\x00-\x1f]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
    throw new Error(`不安全的包内路径: ${value}`);
  return value;
}
export function parseManifest(value: unknown): AgentManifest {
  const parsed = schema.parse(value);
  if (!parsed.manifest_version && !parsed.dxt_version)
    throw new Error(
      "缺少 manifest_version / dxt_version；支持 MCPB 0.1–0.3 和 DXT 0.1",
    );
  relativeFile(parsed.server.entry_point);
  if (
    parsed.compatibility?.platforms &&
    !parsed.compatibility.platforms.includes(process.platform as "linux")
  )
    throw new Error("此 Agent 不支持当前系统");
  for (const requirement of Object.values(parsed.compatibility?.runtimes ?? {}))
    if (!semver.validRange(requirement))
      throw new Error("无效的运行时版本要求");
  return parsed;
}
export function resolveConfig(
  manifest: AgentManifest,
  input: AgentConfig,
  variables: Record<string, string>,
): AgentConfig {
  const output: AgentConfig = Object.create(null);
  const expand = (text: string) =>
    text.replace(/\$\{([^}]+)\}/g, (_, key) => {
      if (!(key in variables)) throw new Error(`不支持的变量: ${key}`);
      return variables[key];
    });
  for (const key of Object.keys(input))
    if (!Object.prototype.hasOwnProperty.call(manifest.user_config ?? {}, key))
      throw new Error(`未知配置: ${key}`);
  for (const [key, rule] of Object.entries(manifest.user_config ?? {})) {
    let value = input[key];
    if (value === undefined && rule.default !== undefined)
      value =
        typeof rule.default === "string"
          ? expand(rule.default)
          : Array.isArray(rule.default)
            ? rule.default.map(expand)
            : rule.default;
    if (value === undefined || value === "") {
      if (rule.required) throw new Error(`请填写 ${rule.title}`);
      continue;
    }
    if (rule.multiple) {
      if (
        !["file", "directory"].includes(rule.type) ||
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      )
        throw new Error(`${rule.title} 需要路径数组`);
    } else if (rule.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (rule.min !== undefined && value < rule.min) ||
        (rule.max !== undefined && value > rule.max)
      )
        throw new Error(`${rule.title} 数值无效`);
    } else if (rule.type === "boolean") {
      if (typeof value !== "boolean")
        throw new Error(`${rule.title} 需要布尔值`);
    } else if (typeof value !== "string")
      throw new Error(`${rule.title} 需要字符串`);
    if (JSON.stringify(value).includes("\\u0000"))
      throw new Error("配置不能包含空字符");
    output[key] = value;
  }
  return output;
}
export function launchConfig(
  manifest: AgentManifest,
  directory: string,
  config: AgentConfig,
  variables: Record<string, string>,
) {
  const source = manifest.server.mcp_config;
  const override = source?.platform_overrides?.[process.platform];
  const values = resolveConfig(manifest, config, variables);
  const lookup = (key: string): string | string[] => {
    if (key === "__dirname") return directory;
    if (key === "/" || key === "pathSeparator") return path.sep;
    if (Object.prototype.hasOwnProperty.call(variables, key))
      return variables[key];
    if (
      key.startsWith("user_config.") &&
      Object.prototype.hasOwnProperty.call(
        manifest.user_config ?? {},
        key.slice(12),
      )
    )
      return values[key.slice(12)] === undefined
        ? ""
        : Array.isArray(values[key.slice(12)])
          ? (values[key.slice(12)] as string[])
          : String(values[key.slice(12)]);
    throw new Error(`不支持的变量: ${key}`);
  };
  const expand = (text: string) =>
    text.replace(/\$\{([^}]+)\}/g, (_, key) => {
      const value = lookup(key);
      return Array.isArray(value) ? value.join(path.delimiter) : value;
    });
  const args = (
    override?.args ??
    source?.args ??
    (manifest.server.type === "binary"
      ? []
      : [path.join(directory, manifest.server.entry_point)])
  ).flatMap((arg) => {
    const match = /^\$\{([^}]+)\}$/.exec(arg);
    const value = match ? lookup(match[1]) : expand(arg);
    return Array.isArray(value) ? value : [value];
  });
  const command = expand(
    override?.command ??
      source?.command ??
      (manifest.server.type === "binary"
        ? path.join(directory, manifest.server.entry_point)
        : manifest.server.type === "python"
          ? "python3"
          : "node"),
  );
  const env = Object.fromEntries(
    Object.entries({ ...source?.env, ...override?.env }).map(([key, value]) => [
      key,
      expand(value),
    ]),
  );
  return { command, args, env };
}
