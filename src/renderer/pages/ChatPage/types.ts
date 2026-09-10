export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'stopped' | 'error';

export interface Attachment {
  id: string;
  name: string;
  size: number;
  status: 'reading' | 'ready' | 'error';
  progress: number;
  content?: string;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  type: 'file' | 'search' | 'image' | 'task';
  status: 'running' | 'success' | 'error';
  parameters?: unknown;
  result?: string;
  error?: string;
}

export interface Citation {
  id: string;
  documentName: string;
  page?: number;
  snippet: string;
  content?: string;
  similarity?: number;
  url?: string;
  kind?: 'attachment' | 'citation';
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
  reasoning?: string;
  error?: string;
  attachments: Attachment[];
  toolCalls: ToolCall[];
  citations: Citation[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

export interface Generation {
  conversationId: string;
  messageId: string;
  requestId: string;
}

export interface ChatRequestMessage {
  role: MessageRole;
  content: string;
}

export function createId(): string {
  return crypto.randomUUID();
}

export function createMessage(role: MessageRole, content = ''): ChatMessage {
  return {
    id: createId(), role, content, createdAt: Date.now(), status: 'complete',
    attachments: [], toolCalls: [], citations: [],
  };
}
