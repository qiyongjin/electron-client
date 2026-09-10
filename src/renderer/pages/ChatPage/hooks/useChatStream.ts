import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '../../../stores/useChatStore';
import type { ChatRequestMessage, Generation } from '../types';
import { getChatBridge, streamChat } from '../services/chatTransport';

export function useChatStream() {
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    const generation = useChatStore.getState().generation;
    controller.current?.abort();
    controller.current = null;
    if (!generation) return;
    const store = useChatStore.getState();
    store.updateMessage(generation.conversationId, generation.messageId, (message) => ({ ...message, status: 'stopped' }));
    store.setGeneration(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async (generation: Generation, messages: ChatRequestMessage[]) => {
    const abortController = new AbortController();
    controller.current = abortController;
    const update = (transform: Parameters<ReturnType<typeof useChatStore.getState>['updateMessage']>[2]) => {
      if (!abortController.signal.aborted) {
        useChatStore.getState().updateMessage(generation.conversationId, generation.messageId, transform);
      }
    };
    try {
      const bridge = getChatBridge();
      if (!bridge) throw new Error('请在 Electron 桌面端打开此页面后发送消息');
      await streamChat(bridge, generation.requestId, messages, abortController.signal, (event) => {
        if (!event.success) {
          update((message) => ({ ...message, status: 'error', error: event.error || '生成失败，请重试' }));
          return;
        }
        update((message) => ({
          ...message,
          content: event.done ? (event.message || message.content) : message.content + (event.message || ''),
          reasoning: (message.reasoning || '') + (event.data?.reasoning_content || event.data?.reasoning || ''),
          status: event.cancelled ? 'stopped' : event.done ? 'complete' : 'streaming',
        }));
      });
    } catch (error) {
      update((message) => ({ ...message, status: 'error', error: error instanceof Error ? error.message : '生成失败，请重试' }));
    } finally {
      if (controller.current === abortController) controller.current = null;
      if (useChatStore.getState().generation?.requestId === generation.requestId) {
        useChatStore.getState().setGeneration(null);
      }
    }
  }, []);

  return { start, stop };
}
