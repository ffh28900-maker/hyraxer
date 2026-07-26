import React, { useState } from 'react';
import { Play, Shield, BookOpen, Settings, RotateCcw, AlertTriangle } from 'lucide-react';
import { PlayerProgress } from '../types';
import { LoreModal } from './LoreModal';
import { ArsenalModal } from './ArsenalModal';
import { SettingsModal } from './SettingsModal';
import { ResetConfirmModal } from './ResetConfirmModal';

interface MainMenuProps {
  progress: PlayerProgress;
  onPlayClick: () => void;
  onUpdateSettings: (newSettings: PlayerProgress['settings']) => void;
  onResetProgress: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  progress,
  onPlayClick,
  onUpdateSettings,
  onResetProgress,
}) => {
  const [showLore, setShowLore] = useState(false);
  const [showArsenal, setShowArsenal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#050505] text-[#F0F0F0] flex flex-col justify-between p-8 md:p-12 font-sans select-none overflow-hidden">
      {/* Background Radial Crimson Grid */}
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#C41E3A 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#C41E3A] via-[#8B5CF6] to-white shadow-[0_0_20px_#C41E3A]" />

      {/* HEADER SLOGAN & TITLE */}
      <div className="relative z-10 text-center max-w-3xl mx-auto pt-6">
        <div className="text-[10px] uppercase tracking-[0.5em] text-[#C41E3A] font-bold mb-3">
          Project: Hyrax // Requiem • «СПАСИТЕ ДОМАНИЮ»
        </div>

        <h1 className="text-5xl md:text-8xl font-black leading-[0.85] tracking-tighter text-white drop-shadow-[0_0_25px_rgba(196,30,58,0.6)] uppercase my-2">
          SAVE<br />DOMANIA
        </h1>
        <div className="inline-block bg-white text-black px-6 py-1.5 text-xl font-black italic transform -skew-x-12 mt-3 shadow-[0_0_15px_rgba(255,255,255,0.4)]">
          СПАСИТЕЛЬ ДОМАНИИ
        </div>

        {/* Disclaimer Banner Box */}
        <div className="mt-6 p-3.5 bg-[#100303] border border-[#C41E3A]/40 rounded-lg text-[11px] text-gray-300 flex items-center justify-center gap-2 max-w-xl mx-auto">
          <AlertTriangle className="w-4 h-4 text-[#C41E3A] shrink-0" />
          <span>
            Важное примечание: Это всего лишь игра, вымысел, шутка. Ни одно живое существо не пострадало.
            Все доманы — цифровые модели.
          </span>
        </div>
      </div>

      {/* MAIN NAVIGATION BUTTONS */}
      <div className="relative z-10 max-w-md mx-auto w-full space-y-4 my-8">
        <button
          onClick={onPlayClick}
          className="w-full py-5 bg-[#C41E3A] hover:bg-[#d92343] text-white font-black text-2xl tracking-widest uppercase transform -skew-x-6 border border-red-400 shadow-[0_0_30px_rgba(196,30,58,0.6)] flex items-center justify-center gap-3 transition hover:scale-105"
        >
          <Play className="w-7 h-7 fill-white transform skew-x-6" /> <span className="transform skew-x-6">ИГРАТЬ (PLAY)</span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowArsenal(true)}
            className="py-3.5 bg-[#121212] hover:bg-[#1f1f1f] border border-[#8B5CF6]/50 rounded-lg text-xs font-bold text-gray-200 flex items-center justify-center gap-2 shadow-lg transition"
          >
            <Shield className="w-4 h-4 text-[#8B5CF6]" /> Арсенал
          </button>

          <button
            onClick={() => setShowLore(true)}
            className="py-3.5 bg-[#121212] hover:bg-[#1f1f1f] border border-[#C41E3A]/50 rounded-lg text-xs font-bold text-gray-200 flex items-center justify-center gap-2 shadow-lg transition"
          >
            <BookOpen className="w-4 h-4 text-[#C41E3A]" /> Лор (Lore)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="py-3.5 bg-[#121212] hover:bg-[#1f1f1f] border border-white/20 rounded-lg text-xs font-bold text-gray-300 flex items-center justify-center gap-2 transition"
          >
            <Settings className="w-4 h-4 text-gray-400" /> Настройки
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="py-3.5 bg-[#121212] hover:bg-red-950/40 border border-red-500/30 hover:border-red-500/70 rounded-lg text-xs font-bold text-gray-300 hover:text-red-400 flex items-center justify-center gap-2 transition shadow-md"
          >
            <RotateCcw className="w-4 h-4 text-[#C41E3A]" /> Сброс прогресса
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <div className="relative z-10 flex justify-between items-center border-t border-white/10 pt-4 text-[10px] tracking-widest font-mono text-gray-500">
        <span>PROJECT HYRAX // REQUIEM V1.04</span>
        <span className="text-[#C41E3A] font-bold">SYSTEM_STATUS: AGGRESSIVE</span>
      </div>

      {/* MODALS */}
      {showLore && <LoreModal onClose={() => setShowLore(false)} />}
      {showArsenal && (
        <ArsenalModal
          unlockedWeapons={progress.unlockedWeapons}
          onClose={() => setShowArsenal(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          initialSettings={progress.settings}
          onSave={onUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <ResetConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={onResetProgress}
      />
    </div>
  );
};
