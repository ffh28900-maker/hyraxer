import React from 'react';
import { LevelResult, WeaponId } from '../types';
import { Trophy, ArrowRight, RotateCcw } from 'lucide-react';

interface VictoryModalProps {
  result: LevelResult;
  unlockedNewWeapon?: WeaponId;
  onNextLevel: () => void;
  onRestartLevel: () => void;
  onBackToGrid: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  result,
  unlockedNewWeapon,
  onNextLevel,
  onRestartLevel,
  onBackToGrid,
}) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none font-sans">
      <div className="bg-[#0a0a0a] border border-[#C41E3A]/80 rounded-xl max-w-md w-full p-8 text-white shadow-2xl text-center relative">
        <Trophy className="w-12 h-12 text-[#C41E3A] mx-auto mb-2 animate-bounce" />

        <div className="text-[10px] uppercase font-bold text-[#C41E3A] tracking-widest">Stage Declassified</div>
        <h2 className="text-2xl font-black text-white tracking-wider uppercase">ЭТАП ЗАВЕРШЁН</h2>
        <p className="text-xs text-gray-400 mb-6 font-mono">РЕЗУЛЬТАТЫ БОЕВОЙ ВЫСАДКИ</p>

        {/* GRADE BADGE */}
        <div className="mb-6">
          <div
            className="inline-block bg-white text-black px-8 py-2 text-5xl font-black italic transform -skew-x-12 shadow-[0_0_20px_white]"
          >
            RANK: {result.rank}
          </div>
        </div>

        {/* STATS */}
        <div className="space-y-2 text-xs font-mono bg-black/80 p-4 rounded border border-white/10 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-400">ОЧКИ СТИЛЯ (STYLE):</span>
            <span className="text-[#8B5CF6] font-bold">{result.score} PTS</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">ВРЕМЯ ПРОХОЖДЕНИЯ:</span>
            <span className="text-white font-bold">{result.timeSec} SEC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">УНИЧТОЖЕНО ДОМАН:</span>
            <span className="text-[#C41E3A] font-bold">
              {result.kills} / {result.totalEnemies}
            </span>
          </div>
        </div>

        {/* NEW UNLOCKED WEAPON BANNER */}
        {unlockedNewWeapon && (
          <div className="mb-6 p-3 bg-[#1A0505] border border-[#C41E3A] rounded text-center shadow-[0_0_20px_rgba(196,30,58,0.4)] animate-pulse">
            <div className="text-[10px] text-[#C41E3A] font-black tracking-widest uppercase">NEW ARSENAL UNLOCKED!</div>
            <div className="text-base font-black text-white uppercase">{unlockedNewWeapon}</div>
          </div>
        )}

        {/* BUTTONS */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onNextLevel}
            className="w-full py-3.5 bg-[#C41E3A] hover:bg-[#d92343] font-black rounded text-white tracking-widest uppercase flex items-center justify-center gap-2 transition"
          >
            СЛЕДУЮЩИЙ ЭТАП <ArrowRight className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onRestartLevel}
              className="py-2.5 bg-[#121212] hover:bg-[#1f1f1f] border border-white/10 rounded text-xs font-bold text-gray-300 flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-4 h-4" /> Переиграть
            </button>
            <button
              onClick={onBackToGrid}
              className="py-2.5 bg-[#121212] hover:bg-[#1f1f1f] border border-white/10 rounded text-xs font-bold text-gray-300"
            >
              Сетка уровней
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
