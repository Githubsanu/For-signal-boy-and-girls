import React from 'react';
import { Mode } from '../types';

interface ModeSelectorProps {
  selectedMode: Mode;
  onSelectMode: (mode: Mode) => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ selectedMode, onSelectMode }) => {
  const modes = [
    { value: Mode.LOW_LATENCY, label: 'Chat' },
    { value: Mode.SEARCH, label: 'Search Chat' },
    { value: Mode.THINKING, label: 'Deep Chat' },
    { value: Mode.VOICE, label: 'Voice Chat' },
  ];

  return (
    <div className="flex justify-center flex-wrap gap-2 mb-4 p-2 bg-white/5 rounded-lg shadow-inner">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onSelectMode(mode.value)}
          className={`
            px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-in-out
            ${selectedMode === mode.value
              ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
            }
          `}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;