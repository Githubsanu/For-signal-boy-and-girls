import React from 'react';
import { AIPersona } from '../types'; // Assuming AIPersona is defined in types.ts

const Header: React.FC = () => {
  return (
    <header className="py-4 px-6 bg-gradient-to-r from-pink-600 to-purple-700 shadow-lg z-10">
      <h1 className="text-3xl font-extrabold text-white text-center tracking-wide">
        <span className="text-pink-200">Amore</span> AI
      </h1>
      <p className="text-sm text-pink-100 text-center mt-1 italic">Your charming conversational companion</p>
    </header>
  );
};

export default Header;