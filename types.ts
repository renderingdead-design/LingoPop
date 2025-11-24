
export enum AppView {
  ONBOARDING = 'ONBOARDING',
  SEARCH = 'SEARCH',
  RESULT = 'RESULT',
  NOTEBOOK = 'NOTEBOOK',
  FLASHCARDS = 'FLASHCARDS',
  NEWS = 'NEWS',
}

export interface Language {
  code: string;
  name: string;
  flag: string;
  voiceName?: string; // Hint for TTS
}

export interface ExampleSentence {
  text: string;
  translation: string;
}

export interface DictionaryData {
  word: string;
  pronunciation?: string; // IPA or phonetic
  definition: string;
  etymology?: string; // Word origin
  examples?: ExampleSentence[]; // Optional for staged loading
  funUsage?: string; // Optional for staged loading
  imageUrl?: string; // Base64 or URL
  synonyms?: string[]; // New: Synonyms
  antonyms?: string[]; // New: Antonyms
  synonymNuance?: string; // New: Explanation of differences
}

export interface SavedEntry extends DictionaryData {
  id: string;
  timestamp: number;
  targetLang: string;
  nativeLang: string;
  // Ensure these are present when saving
  examples: ExampleSentence[];
  funUsage: string;
  
  // SRS / Ebbinghaus Fields
  nextReviewDate: number; // Timestamp for when it should be shown next
  interval: number; // Current interval in days
  easeFactor: number; // Difficulty multiplier (starts at 2.5)
  reviewCount: number; // How many times reviewed
}

export interface NewsArticle {
  title: string;
  content: string; // Target language
  translation: string; // Native language
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', voiceName: 'Puck' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', voiceName: 'Fenrir' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', voiceName: 'Kore' },
  { code: 'fr', name: 'French', flag: '🇫🇷', voiceName: 'Charon' },
  { code: 'de', name: 'German', flag: '🇩🇪', voiceName: 'Fenrir' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', voiceName: 'Zephyr' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', voiceName: 'Puck' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', voiceName: 'Kore' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷', voiceName: 'Charon' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', voiceName: 'Fenrir' },
];
