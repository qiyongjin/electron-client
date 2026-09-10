import { useCallback } from 'react';
import { useChatStore } from '../../../stores/useChatStore';
import { createId, createMessage, type Attachment } from '../types';
import { buildRequestMessages } from '../services/messages';
import { useChatStream } from './useChatStream';

export function useMessageSender() {
  const { start, stop } = useChatStream();

  const send = useCallback((content: string, attachments: Attachment[] = []): boolean => {
    const store = useChatStore.getState();
    if (store.generation || (!content.trim() && !attachments.length)
      || attachments.some((attachment) => attachment.status !== 'ready')) return false;
    const conversation = store.conversations.find((item) => item.id === store.activeConversationId);
    if (!conversation) return false;
    const userMessage = { ...createMessage('user', content.trim()), attachments };
    const assistantMessage = { ...createMessage('assistant'), status: 'pending' as const };
    if (attachments.length) {
      assistantMessage.citations = attachments.map((file) => ({
        id: file.id, documentName: file.name, snippet: (file.content || '').slice(0, 160),
        content: file.content, kind: 'attachment',
      }));
      assistantMessage.toolCalls = attachments.map((file) => ({
        id: createId(), name: `读取 ${file.name}`, type: 'file', status: 'success',
        parameters: { filename: file.name, bytes: file.size },
        result: `已读取 ${file.content?.length || 0} 个字符，并加入本轮对话上下文。`,
      }));
    }
    const generation = { conversationId: conversation.id, messageId: assistantMessage.id, requestId: createId() };
    store.appendMessages(conversation.id, [userMessage, assistantMessage]);
    store.setGeneration(generation);
    void start(generation, buildRequestMessages([...conversation.messages, userMessage]));
    return true;
  }, [start]);

  const retry = useCallback((messageId: string) => {
    const store = useChatStore.getState();
    if (store.generation) return;
    const conversation = store.conversations.find((item) => item.id === store.activeConversationId);
    if (!conversation) return;
    const index = conversation.messages.findIndex((message) => message.id === messageId && message.role === 'assistant');
    // Retrying an old response would invalidate the subsequent conversation context.
    if (index !== conversation.messages.length - 1 || index < 1) return;
    store.updateMessage(conversation.id, messageId, (message) => ({
      ...message, content: '', reasoning: '', error: undefined, status: 'pending',
    }));
    const generation = { conversationId: conversation.id, messageId, requestId: createId() };
    store.setGeneration(generation);
    void start(generation, buildRequestMessages(conversation.messages.slice(0, index)));
  }, [start]);

  return { send, stop, retry };
}
