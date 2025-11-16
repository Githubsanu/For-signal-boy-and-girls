import React, { useState, useCallback, useRef, useEffect } from 'react';
import { LiveSession, Blob, AIPersona } from '../types';
import { connectLiveSession, decode, decodeAudioData, encode } from '../services/geminiService';
import { LiveServerMessage } from '@google/genai';

interface VoiceInterfaceProps {
  systemInstruction: string;
  sessionRef: React.MutableRefObject<LiveSession | null>;
  personaName: string;
  aiPersona: AIPersona;
  onApiError: (e: unknown) => void;
  error: string | null;
  clearError: () => void;
}

const SAMPLE_RATE_INPUT = 16000; // Gemini Live API input audio sample rate
const SAMPLE_RATE_OUTPUT = 24000; // Gemini Live API output audio sample rate
const BUFFER_SIZE = 4096; // Audio buffer size for ScriptProcessorNode

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({
  systemInstruction,
  sessionRef,
  personaName,
  aiPersona,
  onApiError,
  error,
  clearError,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [currentInputTranscription, setCurrentInputTranscription] = useState<string>('');
  const [currentOutputTranscription, setCurrentOutputTranscription] = useState<string>('');
  const [transcriptionHistory, setTranscriptionHistory] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Audio Context and Nodes refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Audio playback state
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const createPCMBlob = useCallback((data: Float32Array): Blob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768; // Convert float32 to int16
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_INPUT}`,
    };
  }, []);

  const handleLiveMessage = useCallback(async (message: LiveServerMessage) => {
    // Handle input transcription
    if (message.serverContent?.inputTranscription) {
      setCurrentInputTranscription((prev) => prev + message.serverContent?.inputTranscription?.text);
    }
    // Handle output transcription
    if (message.serverContent?.outputTranscription) {
      setCurrentOutputTranscription((prev) => prev + message.serverContent?.outputTranscription?.text);
    }

    // Handle audio output from the model
    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64EncodedAudioString) {
      setIsSpeaking(true);
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE_OUTPUT });
      }

      nextStartTimeRef.current = Math.max(
        nextStartTimeRef.current,
        outputAudioContextRef.current.currentTime,
      );

      try {
        const audioBuffer = await decodeAudioData(
          decode(base64EncodedAudioString),
          outputAudioContextRef.current,
          SAMPLE_RATE_OUTPUT,
          1,
        );
        const source = outputAudioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(outputAudioContextRef.current.destination); // Directly connect to destination for simplicity

        source.addEventListener('ended', () => {
          sourcesRef.current.delete(source);
          if (sourcesRef.current.size === 0) {
            setIsSpeaking(false); // No more audio chunks playing
          }
        });

        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
        sourcesRef.current.add(source);
      } catch (e) {
        console.error('Error decoding or playing audio:', e);
        onApiError(e);
      }
    }

    // Handle interruption
    const interrupted = message.serverContent?.interrupted;
    if (interrupted) {
      for (const source of sourcesRef.current.values()) {
        source.stop();
        sourcesRef.current.delete(source);
      }
      setIsSpeaking(false);
      nextStartTimeRef.current = 0;
    }

    // A turn complete means both input and output for a conversation turn are finished.
    if (message.serverContent?.turnComplete) {
      const fullInput = currentInputTranscription;
      const fullOutput = currentOutputTranscription;

      setTranscriptionHistory((prev) => [
        ...prev,
        `You: ${fullInput}`,
        `${personaName}: ${fullOutput}`,
      ]);
      setCurrentInputTranscription('');
      setCurrentOutputTranscription('');
      // It's possible the model finishes speaking after turnComplete,
      // so we rely on 'ended' event of AudioBufferSourceNode to set isSpeaking to false.
    }
  }, [currentInputTranscription, currentOutputTranscription, onApiError, personaName]);

  // Fix: Declare stopRecording before startRecording as it is a dependency.
  const stopRecording = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    // Also stop any playing output audio
    for (const source of sourcesRef.current.values()) {
      source.stop();
    }
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsRecording(false);
    setIsConnecting(false);
    setIsSpeaking(false);
  }, [sessionRef]);


  const startRecording = useCallback(async () => {
    if (isRecording || isConnecting) return;

    clearError();
    setIsConnecting(true);
    setCurrentInputTranscription('');
    setCurrentOutputTranscription('');
    setTranscriptionHistory([]);
    nextStartTimeRef.current = 0;
    sourcesRef.current.clear();
    setIsSpeaking(false);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create input audio context and nodes
      inputAudioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE_INPUT });
      mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
      scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(BUFFER_SIZE, 1, 1);

      // Connect scriptProcessor to destination (necessary for onaudioprocess to fire)
      mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);


      // Connect to Gemini Live Session
      const sessionPromise = connectLiveSession(
        systemInstruction,
        handleLiveMessage,
        (e) => {
          onApiError(e);
          // Ensure local state cleanup on error
          stopRecording();
        },
        (e) => {
          console.debug('Live session closed:', e);
          onApiError(e); // Also pass close event errors to main error handler
          stopRecording();
        }
      );

      sessionRef.current = await sessionPromise;
      setIsRecording(true);
      setIsConnecting(false);

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const pcmBlob = createPCMBlob(inputData);
        // CRITICAL: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`,
        // **do not** add other condition checks.
        sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        }).catch(err => {
          // Handle cases where sessionPromise might reject or session is not ready.
          console.error("Failed to send real-time input:", err);
          // This catch block is for sending data failures after session is established.
          // Errors preventing initial connection are handled by the connectLiveSession onerror.
        });
      };

    } catch (e) {
      onApiError(e);
      // Clean up if there's an error getting media or connecting
      stopRecording();
    }
  }, [
    isRecording,
    isConnecting,
    systemInstruction,
    createPCMBlob,
    handleLiveMessage,
    onApiError,
    sessionRef,
    clearError,
    stopRecording, // Added stopRecording to dependencies
  ]);

  useEffect(() => {
    // Cleanup on component unmount
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const personaColor = aiPersona === AIPersona.FEMALE ? 'pink-400' : 'blue-400';
  const personaBg = aiPersona === AIPersona.FEMALE ? 'from-pink-500 to-red-500' : 'from-blue-500 to-purple-600';
  const personaIcon = aiPersona === AIPersona.FEMALE ? '♀️' : '♂️';


  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-900 text-white rounded-lg shadow-inner">
      <div className="flex flex-col items-center p-6 bg-white/5 rounded-2xl shadow-lg border border-white/10 mb-8 max-w-lg w-full">
        <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${personaBg} flex items-center justify-center text-5xl mb-4 shadow-xl`}>
          {personaIcon}
        </div>
        <h2 className={`text-3xl font-bold mb-2 text-${personaColor}`}>{personaName}</h2>
        <p className="text-gray-300 text-center text-lg leading-relaxed">
          {isConnecting
            ? `Just a moment, my love, connecting us...`
            : isRecording
              ? isSpeaking ? `Shhh... ${personaName} is whispering to you...` : `I'm listening closely, my love...`
              : `Ready for a private chat with ${personaName}?`}
        </p>
      </div>

      <div className="relative w-24 h-24 flex items-center justify-center mb-8">
        {isConnecting && (
          <div className="absolute inset-0 rounded-full bg-pink-500/30 animate-ping-slow-big"></div>
        )}
        {(isRecording || isConnecting) && (
          <div className={`absolute inset-0 rounded-full ${isRecording ? 'bg-red-500/30' : 'bg-purple-500/30'} animate-pulse-slow-medium`}></div>
        )}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isConnecting}
          className={`
            relative w-20 h-20 rounded-full flex items-center justify-center text-white text-4xl shadow-2xl focus:outline-none focus:ring-4 focus:ring-pink-400 focus:ring-opacity-75
            transition-all duration-300 ease-in-out
            ${isRecording
              ? 'bg-gradient-to-br from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700'
              : 'bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
            }
            ${isConnecting ? 'opacity-70 cursor-not-allowed' : ''}
          `}
          aria-label={isRecording ? 'Stop voice chat session and microphone input' : 'Start voice chat session and enable microphone input'}
        >
          {isConnecting ? (
            <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : isRecording ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 text-red-300 rounded-lg max-w-xl text-center text-sm mb-4">
          <p><strong>Oh, darling, a little snag:</strong> {error}</p>
        </div>
      )}

      {(currentInputTranscription || currentOutputTranscription || transcriptionHistory.length > 0) && (
        <div className="w-full max-w-xl bg-white/5 rounded-lg p-4 shadow-inner text-sm overflow-y-auto max-h-48 custom-scrollbar">
          {transcriptionHistory.map((line, index) => (
            <p key={index} className="mb-1 text-gray-300">{line}</p>
          ))}
          {currentInputTranscription && (
            <p className="text-gray-100 font-semibold">You: {currentInputTranscription}<span className="animate-pulse">_</span></p>
          )}
          {currentOutputTranscription && (
            <p className={`text-${personaColor} font-semibold`}>{personaName}: {currentOutputTranscription}<span className="animate-pulse">_</span></p>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceInterface;