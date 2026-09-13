import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Preferences {
  displayName: string;
  bio: string;
  accent: 'sage' | 'violet' | 'blue';
  textSize: 'regular' | 'large';
  showSuggestions: boolean;
  sendShortcut: 'enter' | 'modifier-enter';
}
const defaults: Preferences = {
  displayName: 'min_seven', bio: '', accent: 'sage', textSize: 'regular',
  showSuggestions: true, sendShortcut: 'enter',
};
interface PreferencesState extends Preferences {
  update: (values: Partial<Preferences>) => void;
  resetAppearance: () => void;
}
export const usePreferencesStore = create<PreferencesState>()(persist((set) => ({
  ...defaults,
  update: (values) => set(values),
  resetAppearance: () => set({ accent: 'sage', textSize: 'regular', showSuggestions: true, sendShortcut: 'enter' }),
}), {
  name: 'seven-preferences',
  storage: createJSONStorage(() => localStorage),
  partialize: ({ displayName, bio, accent, textSize, showSuggestions, sendShortcut }) => ({ displayName, bio, accent, textSize, showSuggestions, sendShortcut }),
}));
