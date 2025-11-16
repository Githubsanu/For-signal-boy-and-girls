import { LiveSession as GenAILiveSession, Blob as GenAIBlob } from '@google/genai';

export enum Mode {
  LOW_LATENCY = 'low-latency',
  SEARCH = 'search',
  THINKING = 'thinking',
  VOICE = 'voice',
}

export enum AIPersona {
  FEMALE = 'Female',
  MALE = 'Male',
}

export interface Source {
  uri: string;
  title?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  sources?: Source[];
  timestamp?: Date;
}

// Re-exporting LiveSession and Blob from @google/genai for consistent typing across the app.
export type LiveSession = GenAILiveSession;
export type Blob = GenAIBlob;

// Simplified interface for window.aistudio
// NOTE: Assuming `window.aistudio` types are provided by the execution environment as per guidelines.
// Removing explicit declaration to avoid conflicts with ambient type definitions.
