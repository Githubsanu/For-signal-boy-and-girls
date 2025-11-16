import React from 'react';
import { AIPersona } from '../types';

interface PersonaSelectorProps {
  selectedPersona: AIPersona;
  onSelectPersona: (persona: AIPersona) => void;
}

const PersonaSelector: React.FC<PersonaSelectorProps> = ({ selectedPersona, onSelectPersona }) => {
  return (
    <div className="flex justify-center gap-4 mb-4 p-2 bg-white/5 rounded-lg shadow-inner">
      <button
        onClick={() => onSelectPersona(AIPersona.FEMALE)}
        className={`
          flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-in-out
          ${selectedPersona === AIPersona.FEMALE
            ? 'bg-gradient-to-r from-pink-500 to-red-500 text-white shadow-md'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
          }
        `}
      >
        <span role="img" aria-label="female persona icon">♀️</span>
        <span>Amora (Female)</span>
      </button>
      <button
        onClick={() => onSelectPersona(AIPersona.MALE)}
        className={`
          flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-in-out
          ${selectedPersona === AIPersona.MALE
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
          }
        `}
      >
        <span role="img" aria-label="male persona icon">♂️</span>
        <span>Amore (Male)</span>
      </button>
    </div>
  );
};

export default PersonaSelector;