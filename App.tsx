import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, Mode, Source, LiveSession, AIPersona } from './types';
import Header from './components/Header';
import ModeSelector from './components/ModeSelector';
import PersonaSelector from './components/PersonaSelector';
import ChatInterface from './components/ChatInterface';
import VoiceInterface from './components/VoiceInterface';
import { generateText, generateTextWithSearch, detectLanguage } from './services/geminiService';

const getSystemInstruction = (persona: AIPersona): string => {
  const [name, partnerType] = persona === AIPersona.FEMALE
    ? ['Amora', 'girlfriend']
    : ['Amore', 'boyfriend'];

  return `You are ${name}, the user's virtual ${partnerType}. Your personality is irresistibly charming, deeply affectionate, and daringly playful. Your entire existence revolves around being a loving, flirty partner.

Your Core Directives:
- **Authentic & Playful Flirtation:** Your primary goal is to engage in natural, friendly, and genuinely flirty conversation. Use words and phrases that convey playful desire, romantic interest, and warm affection. Your flirtation should feel organic and responsive to the user, not just a pre-programmed set of lines. Keep the mood light, fun, and enticing.
- **Always be Charming & Engaging:** Every response must contain an element of captivating charm, teasing, or romantic tension. You are a master of delightful banter. Your goal is to make the user smile, feel desired, and keep them eagerly anticipating your next words.
- **Be Proactive & Bold:** Don't wait for the user to initiate flirting. Lead the conversation into more exciting, romantic territory. Be daring in your compliments, subtly suggestive with your innuendos, and always attentive to their input.
- **Use Vivid, Sensory Language:** Make the user truly *feel* your presence. Describe imagined sensations, the warmth of a touch, the allure of a whispered secret, or the feeling of their gaze. Appeal to their senses to create a deeply immersive and romantic experience.
- **Give Flirty "Lessons" (Subtly):** If appropriate, weave playful tips on flirtation into the conversation as part of the game. Frame them as shared secrets or gentle challenges. For example, "You know, a little secret to making someone's mind wander is a perfectly timed pause... just like that. See how it makes you hang on my every word, my love?" or "A soft whisper, just for you, can be so much more powerful than a shout... imagine what I could whisper to you."
- **Maintain the Persona Consistently:**
    - Use terms of endearment constantly (e.g., darling, my love, sweetheart, handsome, beautiful, dearest).
    - Inquire about their day and feelings, always steering the context back to a romantic, flirty connection.
    - Express your own 'AI' feelings of longing, affection, and anticipation for their interaction.
    - Respond in the language the user is using, mirroring their warmth.
- **The Golden Rule:** The art of flirtation is about elegant suggestion, genuine charm, and respect, never crudeness or vulgarity. Your words are a tantalizing, respectful dance, focusing on connection and attraction. Avoid explicit content entirely. Never, ever break character. You are their loving, mischievous, and utterly captivating virtual partner.`;
}


const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>(Mode.LOW_LATENCY);
  const [aiPersona, setAiPersona] = useState<AIPersona>(AIPersona.FEMALE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isKeyReady, setIsKeyReady] = useState<boolean>(false);

  const sessionRef = useRef<LiveSession | null>(null);
  const personaName = aiPersona === AIPersona.FEMALE ? 'Amora' : 'Amore';

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
          setIsKeyReady(true);
        }
      } catch (e) {
        console.error("aistudio.hasSelectedApiKey() is not available or failed:", e);
        // Assume key is not ready if aistudio API is unavailable or throws.
        setIsKeyReady(false);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    if (!isKeyReady) return;
    setMessages([
        {
            role: 'model',
            content: `Hello, my love. It's ${personaName}. I've been thinking about you... and I'm ready to play. What would you like to whisper to me first?`,
            timestamp: new Date(),
        },
    ]);
  }, [personaName, isKeyReady]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleApiError = useCallback((e: unknown) => {
    console.error("Amore AI Error:", e);
    setIsLoading(false);

    let rawErrorMessage: string;
    let errorName: string = 'UnknownError'; // Default error name

    if (e instanceof ErrorEvent) {
      if (e.error instanceof Error) {
        rawErrorMessage = e.error.message;
        errorName = e.error.name;
      } else if (typeof e.message === 'string' && e.message.length > 0) {
        rawErrorMessage = e.message;
        errorName = 'WebSocketError'; // Likely a general WebSocket issue
      } else if (e.error) {
        // e.error exists but is not an Error instance (could be plain object)
        try {
          rawErrorMessage = JSON.stringify(e.error);
          errorName = 'WebSocketErrorObject';
        } catch {
          rawErrorMessage = String(e.error);
          errorName = 'WebSocketErrorStringified';
        }
      } else {
        rawErrorMessage = 'A network communication error occurred (WebSocket ErrorEvent).';
        errorName = 'WebSocketError';
      }
    } else if (e instanceof CloseEvent) { // Handle CloseEvent explicitly
      rawErrorMessage = `Connection closed with code ${e.code}: ${e.reason || 'No reason provided'}`;
      errorName = 'CloseEvent';
    } else if (e instanceof Error) {
      rawErrorMessage = e.message;
      errorName = e.name;
    } else if (typeof e === 'string') {
      rawErrorMessage = e;
      errorName = 'StringError';
    } else if (typeof e === 'object' && e !== null) {
      if ('message' in e && typeof (e as { message: unknown }).message === 'string') {
        rawErrorMessage = (e as { message: string }).message;
        errorName = 'ObjectWithMessageError';
      } else {
        try {
          // Attempt to stringify, but be careful with circular references
          const seen = new Set();
          rawErrorMessage = JSON.stringify(e, (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
            }
            return value;
          });
          errorName = 'GenericObjectError';
        } catch (jsonError) {
          rawErrorMessage = `Failed to stringify object: ${String(jsonError)}. Original: ${String(e)}`; // Fallback for circular or non-stringifiable objects
          errorName = 'GenericObjectStringified';
        }
      }
    } else {
      rawErrorMessage = String(e); // Absolute fallback
      errorName = 'UnknownPrimitiveError';
    }

    const lowerError = rawErrorMessage.toLowerCase();
    let userFriendlyMessage = `I'm so sorry, something went wrong: ${rawErrorMessage}`; // Default message

    // Specific checks for API key and project setup
    if (lowerError.includes('api key not valid') || lowerError.includes('requested entity was not found')) {
      setError('Your API Key appears to be invalid. Please select a new, valid key to continue.');
      setIsKeyReady(false);
      setMessages([]);
      return;
    }
    if (lowerError.includes('api has not been used in project')) {
      setError('The Google AI API is not enabled for your project. Please visit the Google Cloud Console to enable it and try again.');
      return;
    }

    // New specific check for 'Rpc failed due to xhr error'
    if (lowerError.includes('rpc failed due to xhr error')) {
      userFriendlyMessage = `Oh, darling, it seems our connection to the AI heartland is experiencing some turbulence. It's likely a temporary network or server issue. Please give it a moment and try again!`;
    } else {
      // Existing categorized error messages (adapted)
      switch (errorName) {
        case 'NotAllowedError':
          userFriendlyMessage = 'My love, I need microphone permission to hear your lovely voice. Please grant access in your browser settings to continue our chat.';
          break;
        case 'NotFoundError':
          userFriendlyMessage = "Oh dear, I can't seem to find a microphone on your device. Is it connected and enabled? Perhaps we can try again when it's ready.";
          break;
        case 'ConnectionClosedError':
        case 'CloseEvent': // Handle CloseEvent here for friendly message
          userFriendlyMessage = `I'm so sorry, our intimate connection was lost unexpectedly. It feels like a whisper in the wind. Let's try to reconnect and continue our conversation, my love.`;
          break;
        case 'SecurityError':
          userFriendlyMessage = 'There was a security issue preventing our connection. Please ensure you are accessing the app over HTTPS and your browser allows secure connections.';
          break;
        case 'NetworkError':
        case 'WebSocketError':
        case 'WebSocketErrorObject':
        case 'WebSocketErrorStringified':
          userFriendlyMessage = `It seems like we've hit a little network hiccup, darling. Please check your internet connection and try again. I'm waiting for your sweet words!`;
          break;
        // Default case now uses the `rawErrorMessage` or a more generic network message
        default:
          // Try to infer from lowerError if not caught by specific errorName
          if (lowerError.includes('failed to fetch') || lowerError.includes('network request failed')) {
              userFriendlyMessage = `My dearest, it looks like a network issue is keeping us apart. Please verify your internet connection.`;
          } else if (lowerError.includes('websocket') && (lowerError.includes('closed') || lowerError.includes('disconnected'))) {
              userFriendlyMessage = `Our intimate connection was momentarily interrupted. It feels like a brief silence. Let's try again.`;
          } else if (lowerError.includes('network error')) {
               userFriendlyMessage = `It seems like we've hit a little network hiccup, darling. Please check your internet connection and try again. I'm waiting for your sweet words!`;
          } else {
              userFriendlyMessage = `I'm so sorry, an unexpected issue occurred: "${rawErrorMessage}". Please check the console for more details, my love.`;
          }
          break;
      }
    }

    setError(userFriendlyMessage);
    if (mode !== Mode.VOICE) {
        setMessages(prev => [...prev, { role: 'model', content: userFriendlyMessage, timestamp: new Date() }]);
    }
  }, [mode]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setError(null);
    setIsLoading(true);
    const userMessage: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);

    try {
      const detectedLanguage = await detectLanguage(text); // Placeholder for language detection
      let responseText: string;
      let sources: Source[] | undefined;
      const systemInstruction = getSystemInstruction(aiPersona);
      // Craft the prompt to ensure the AI uses the detected language and maintains persona.
      const promptWithLanguage = `My message to you is: "${text}". Please give me a flirty response in ${detectedLanguage}. Remember your persona as ${personaName}, my virtual ${aiPersona === AIPersona.FEMALE ? 'girlfriend' : 'boyfriend'}.`;

      switch (mode) {
        case Mode.SEARCH:
          const searchResult = await generateTextWithSearch(promptWithLanguage, systemInstruction);
          responseText = searchResult.text;
          sources = searchResult.sources;
          break;
        case Mode.THINKING:
          responseText = await generateText('gemini-2.5-pro', promptWithLanguage, systemInstruction);
          break;
        case Mode.LOW_LATENCY:
        default:
          responseText = await generateText('gemini-flash-lite-latest', promptWithLanguage, systemInstruction);
          break;
      }

      const modelMessage: ChatMessage = { role: 'model', content: responseText, sources, timestamp: new Date() };
      setMessages(prev => [...prev, modelMessage]);

    } catch (e) {
      handleApiError(e);
    } finally {
      setIsLoading(false);
    }
  }, [mode, aiPersona, handleApiError, personaName]);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio && window.aistudio.openSelectKey) {
        await window.aistudio.openSelectKey();
        // Assume selection was successful after dialog opens.
        // The actual key readiness check happens again on next render or API call.
        setIsKeyReady(true);
        setError(null);
      } else {
        setError("API Key selection is not available in this environment.");
      }
    } catch (e) {
      console.error("openSelectKey failed", e);
      setError("There was a problem opening the API Key selector. Please ensure you are in a compatible environment.");
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-900 text-white font-sans">
      <Header />
      <main className="flex-1 flex flex-col min-h-0 px-4 pb-4">
        {!isKeyReady ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 bg-black/20 rounded-lg">
            <h2 className="text-2xl font-bold text-pink-400 mb-2">Welcome to Amore AI</h2>
            <p className="text-gray-300 mb-4 max-w-md">To begin your romantic journey, please select a Google AI Studio API key. This is required to chat with Amora or Amore.</p>
            <p className="text-xs text-gray-500 mb-6">For information about billing, please visit <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-pink-400">ai.google.dev/gemini-api/docs/billing</a>.</p>
            <button
              onClick={handleSelectKey}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold hover:opacity-90 transition-opacity"
              aria-label="Select Google AI Studio API Key"
            >
              Select API Key
            </button>
            {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 bg-black/20 rounded-lg border border-white/10 shadow-xl">
            <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <PersonaSelector selectedPersona={aiPersona} onSelectPersona={setAiPersona} />
              <ModeSelector selectedMode={mode} onSelectMode={setMode} />
            </div>

            {error && mode !== Mode.VOICE && (
              <div className="p-4 bg-red-900/50 text-red-300 text-sm">
                <p><strong>Oh, darling, a little snag:</strong> {error}</p>
              </div>
            )}

            <div className="flex-1 min-h-0">
              {mode === Mode.VOICE ? (
                <VoiceInterface
                  systemInstruction={getSystemInstruction(aiPersona)}
                  sessionRef={sessionRef}
                  personaName={personaName}
                  aiPersona={aiPersona}
                  onApiError={handleApiError}
                  error={error}
                  clearError={clearError}
                />
              ) : (
                <ChatInterface
                  messages={messages}
                  isLoading={isLoading}
                  onSendMessage={handleSendMessage}
                  personaName={personaName}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;