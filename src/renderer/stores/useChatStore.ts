import { create } from 'zustand';
import type { ChatMessage, Conversation, Generation } from '../pages/ChatPage/types';
import { createId } from '../pages/ChatPage/types';

function newConversation(): Conversation {
  return { id: createId(), title: '新对话', createdAt: Date.now(), messages: [] };
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string;
  generation: Generation | null;
  createConversation: () => string;
  selectConversation: (id: string) => void;
  appendMessages: (conversationId: string, messages: ChatMessage[]) => void;
  updateMessage: (conversationId: string, messageId: string, update: (message: ChatMessage) => ChatMessage) => void;
  setGeneration: (generation: Generation | null) => void;
}

const initialConversation = newConversation();

export const useChatStore = create<ChatState>((set) => ({
  conversations: [initialConversation],
  activeConversationId: initialConversation.id,
  generation: null,
  createConversation: () => {
    const conversation = newConversation();
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
    }));
    return conversation.id;
  },
  selectConversation: (id) => set((state) => (
    state.conversations.some((conversation) => conversation.id === id)
      ? { activeConversationId: id } : {}
  )),
  appendMessages: (conversationId, messages) => set((state) => ({
    conversations: state.conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const firstUser = messages.find((message) => message.role === 'user');
      return {
        ...conversation,
        title: conversation.messages.length === 0 && firstUser
          ? (firstUser.content || firstUser.attachments[0]?.name || '新对话').slice(0, 28)
          : conversation.title,
        messages: [...conversation.messages, ...messages],
      };
    }),
  })),
  updateMessage: (conversationId, messageId, update) => set((state) => ({
    conversations: state.conversations.map((conversation) => conversation.id === conversationId ? {
      ...conversation,
      messages: conversation.messages.map((message) => message.id === messageId ? update(message) : message),
    } : conversation),
  })),
  setGeneration: (generation) => set({ generation }),
}));
