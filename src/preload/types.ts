// 统一从共享契约导出，Window 声明也由该模块维护。
export type { FileAPI, AppAPI, WindowControlsAPI, DisplayAPI, ClipboardAPI, ThemeAPI, DialogAPI, SevenappAPI, DesktopAPIs } from '../shared/types/bridge';

export type { UploadAPI, UploadTask, UploadStartOptions } from '../shared/types/upload';

export type { AgentAPI, InstalledAgent, AgentConfig, AgentTool } from '../shared/types/agent';
