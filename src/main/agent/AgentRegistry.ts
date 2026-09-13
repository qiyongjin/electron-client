import type {
  AgentRecord,
  InstalledAgent,
  AgentState,
} from "../../shared/types/agent.js";
export class AgentRegistry {
  private entries = new Map<string, InstalledAgent>();
  constructor(private changed: () => void) {}
  list() {
    return [...this.entries.values()].map((item) => ({ ...item }));
  }
  get(id: string) {
    const item = this.entries.get(id);
    if (!item) throw new Error("Agent 未安装");
    return item;
  }
  add(record: AgentRecord) {
    this.entries.set(record.id, { ...record, state: "stopped" });
    this.changed();
  }
  update(id: string, state: AgentState, error?: string, pid?: number) {
    Object.assign(this.get(id), { state, error, pid });
    this.changed();
  }
  remove(id: string) {
    this.entries.delete(id);
    this.changed();
  }
}
