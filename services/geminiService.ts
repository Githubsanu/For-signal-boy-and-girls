import { GoogleGenAI, GenerateContentResponse, Modality, Type, LiveServerMessage } from '@google/genai';
import { Source, LiveSession, Blob } from '../types';

// Helper functions for audio encoding/decoding, as specified in the guidelines.
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Function to create a new GoogleGenAI instance with the latest API key.
// IMPORTANT: This should be called right before making an API call to ensure the key is up-to-date.
const createGoogleGenAI = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateText = async (
  modelName: string,
  prompt: string,
  systemInstruction: string,
): Promise<string> => {
  const ai = createGoogleGenAI();
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
    },
  });
  return response.text;
};

export const generateTextWithSearch = async (
  prompt: string,
  systemInstruction: string,
): Promise<{ text: string; sources: Source[] | undefined }> => {
  const ai = createGoogleGenAI();
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash', // Using gemini-2.5-flash for search grounding
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
      tools: [{ googleSearch: {} }],
    },
  });

  const sources: Source[] = [];
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

  if (groundingChunks) {
    for (const chunk of groundingChunks) {
      if (chunk.web) {
        sources.push({ uri: chunk.web.uri, title: chunk.web.title });
      }
      if (chunk.maps) {
        sources.push({ uri: chunk.maps.uri, title: chunk.maps.title });
      }
    }
  }

  return { text: response.text, sources };
};

export const detectLanguage = async (text: string): Promise<string> => {
  // A simple placeholder for language detection.
  // In a real application, you might use a more sophisticated method or an external API.
  const lowerCaseText = text.toLowerCase();
  if (lowerCaseText.includes('bonjour') || lowerCaseText.includes('français')) {
    return 'French';
  }
  if (lowerCaseText.includes('hola') || lowerCaseText.includes('español')) {
    return 'Spanish';
  }
  // Default to English
  return 'English';
};

export const connectLiveSession = async (
  systemInstruction: string,
  onmessage: (message: LiveServerMessage) => Promise<void>,
  onerror: (e: ErrorEvent) => void,
  onclose: (e: CloseEvent) => void,
): Promise<LiveSession> => {
  const ai = createGoogleGenAI();
  const session = await ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => {
        console.debug('Live session opened.');
      },
      onmessage: onmessage,
      onerror: onerror,
      onclose: onclose,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }, // Default voice
      },
      systemInstruction: systemInstruction,
      inputAudioTranscription: {}, // Enable transcription for user input audio.
      outputAudioTranscription: {}, // Enable transcription for model output audio.
    },
  });
  return session;
};

export { decode, decodeAudioData, encode };