import type { ChatRequestMessage } from '../types';

export interface StreamEvent {
  success: boolean;
  request_id?: string;
  stream?: boolean;
  done?: boolean;
  cancelled?: boolean;
  message?: string;
  error?: string;
  data?: { reasoning_content?: string; reasoning?: string };
}

export interface ChatBridge {
  sevenappRequest: (payload: unknown) => Promise<unknown>;
  sevenappOnMessage: (callback: (message: unknown) => void) => () => void;
  sevenappCancel: (requestId: string) => Promise<unknown>;
}

export function getChatBridge(): ChatBridge | undefined {
  const api = window.electronAPI;
  return typeof api?.sevenappRequest === 'function' && typeof api?.sevenappOnMessage === 'function'
    && typeof api?.sevenappCancel === 'function' ? api : undefined;
}

export function isStreamEvent(value: unknown): value is StreamEvent {
  return typeof value === 'object' && value !== null && 'success' in value
    && typeof value.success === 'boolean';
}

/** Subscribe before invoking; every event is scoped to its request, including after cancellation. */
export async function streamChat(
  bridge: ChatBridge,
  requestId: string,
  messages: ChatRequestMessage[],
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  if (signal.aborted) return;
  let unsubscribe = () => {};
  let onAbort = () => {};
  const aborted = new Promise<void>((resolve) => {
    onAbort = () => {
      unsubscribe();
      // Main process cancellation terminates the active Python request, not just the UI stream.
      void bridge.sevenappCancel(requestId).catch(() => {});
      resolve();
    };
  });
  unsubscribe = bridge.sevenappOnMessage((value) => {
    console.log('streamChat received', value);
    if (!signal.aborted && isStreamEvent(value) && value.request_id === requestId && !value.done) {
      onEvent(value);
    }
  });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const request = bridge.sevenappRequest({ action: 'chat', request_id: requestId, messages, stream: true })
      .then((value) => {
        if (signal.aborted) return;
        if (!isStreamEvent(value)) throw new Error('聊天服务返回了无法识别的响应');
        onEvent({ ...value, done: true });
      });
    await Promise.race([request, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
    unsubscribe();
  }
}
