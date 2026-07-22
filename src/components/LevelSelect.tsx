import React from 'react';
import { PlayerProgress, RankGrade } from '../types';
import { Lock, Skull, Star, Award, ArrowLeft } from 'lucide-react';

interface LevelSelectProps {
  progress: PlayerProgress;
  onSelectLevel: (levelNum: number) => void;
  onBackToMenu: () => void;
}

const CHAPTERS = [
  { name: 'ГЛАВА 1: ГОРЯЩИЙ ГОРОД', levels: [1, 2, 3, 4], bossLevel: 4, bossName: 'Голиаф' },
  { name: 'ГЛАВА 2: МЕТРО', levels: [5, 6, 7, 8], bossLevel: 8, bossName: 'Червь-Носитель' },
  { name: 'ГЛАВА 3: ТЁМНАЯ ШАХТА', levels: [9, 10, 11, 12], bossLevel: 12, bossName: 'Шахтёр-Подрывник' },
  { name: 'ГЛАВА 4: АДСКАЯ ЛОКАЦИЯ', levels: [13, 14, 15, 16], bossLevel: 16, bossName: 'Владыка' },
];

export const LevelSelect: React.FC<LevelSelectProps> = ({ progress, onSelectLevel, onBackToMenu }) => {
  // Check if Level N is unlocked
  const isLevelUnlocked = (levelNum: number): boolean => {
    if (levelNum === 1) return true;
    if (levelNum === 17) {
      // Secret 17 unlocked ONLY if all 1-16 are beaten with S rank!
      for (let i = 1; i <= 16; i++) {
        const lvlRes = progress.completedLevels[i];
        if (!lvlRes || !lvlRes.completed || lvlRes.rank !== 'S') {
          return false;
        }
      }
      return true;
    }
    const prev = progress.completedLevels[levelNum - 1];
    return prev ? prev.completed : false;
  };

  const getRankBadgeClass = (rank?: RankGrade) => {
    switch (rank) {
      case 'S':
        return 'bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black border-amber-400';
      case 'A':
        return 'bg-[#8B5CF6] text-white font-bold border-purple-400';
      case 'B':
        return 'bg-blue-600 text-white font-bold border-blue-400';
      case 'C':
        return 'bg-purple-800 text-white font-bold border-purple-600';
      case 'D':
        return 'bg-neutral-800 text-gray-300 font-bold border-neutral-700';
      default:
        return 'bg-neutral-900 text-gray-500 border-neutral-800';
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#F0F0F0] p-6 md:p-10 select-none flex flex-col justify-between font-sans relative overflow-hidden">
      {/* Radial Grid Background */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#C41E3A 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex flex-wrap justify-between items-end mb-8 border-b border-white/10 pb-6">
        <button
          onClick={onBackToMenu}
          className="flex items-center gap-2 px-4 py-2 bg-[#121212] hover:bg-[#1f1f1f] border border-white/10 rounded text-xs font-bold text-gray-300 transition"
        >
          <ArrowLeft className="w-4 h-4 text-[#C41E3A]" /> Главное меню
        </button>

        <div className="text-center my-2 md:my-0">
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#C41E3A] font-bold mb-1">
            Project: Hyrax // Level Selection
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(196,30,58,0.5)]">
            СЕТКА УРОВНЕЙ
          </h1>
        </div>

        <div className="text-right flex flex-col items-end">
          <div className="text-[10px] font-mono text-[#8B5CF6] mb-1 flex items-center gap-1">
            <Star className="w-3 h-3 fill-[#8B5CF6]" /> SECRET_UNLOCK: 16 S-RANKS
          </div>
          <div className="bg-white text-black px-4 py-1 text-xl font-black italic transform -skew-x-12 shadow-[0_0_10px_white]">
            STATUS: ACTIVE
          </div>
        </div>
      </div>

      {/* 4x4 Level Grid */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
        {CHAPTERS.map((ch) => (
          <div key={ch.name} className="bg-[#0c0c0c] border border-white/10 rounded-lg p-5 flex flex-col gap-4 shadow-2xl relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-[1px] flex-1 bg-[#C41E3A]" />
              <h2 className="text-[10px] uppercase tracking-widest font-bold text-[#C41E3A]">
                {ch.name}
              </h2>
              <div className="h-[1px] flex-1 bg-[#C41E3A]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {ch.levels.map((lvlNum) => {
                const unlocked = isLevelUnlocked(lvlNum);
                const res = progress.completedLevels[lvlNum];
                const isBoss = lvlNum === ch.bossLevel;

                return (
                  <button
                    key={lvlNum}
                    disabled={!unlocked}
                    onClick={() => onSelectLevel(lvlNum)}
                    className={`aspect-square border flex flex-col items-center justify-center group transition-all relative overflow-hidden ${
                      unlocked
                        ? isBoss
                          ? 'border-[#C41E3A] bg-[#220006] hover:bg-[#C41E3A] text-white shadow-[0_0_15px_rgba(196,30,58,0.4)]'
                          : 'border-[#C41E3A] bg-[#1A0505] hover:bg-[#C41E3A] text-white'
                        : 'border-[#333333] bg-[#050505] opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-[10px] font-mono opacity-60 group-hover:text-black absolute top-2 left-2">
                      0{lvlNum < 10 ? `0${lvlNum}` : lvlNum}
                    </span>

                    {isBoss && (
                      <Skull className="w-3.5 h-3.5 text-[#C41E3A] group-hover:text-black absolute top-2 right-2 animate-pulse" />
                    )}

                    <div className="text-2xl font-black group-hover:text-black my-1">
                      {res?.completed ? res.rank : unlocked ? `#${lvlNum}` : '-'}
                    </div>

                    {unlocked ? (
                      <div className="text-[9px] font-mono group-hover:text-black opacity-80 mt-1">
                        {res?.score ? `${res.score} pts` : isBoss ? ch.bossName : 'НОВЫЙ'}
                      </div>
                    ) : (
                      <Lock className="w-3 h-3 opacity-30 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* SECRET LEVEL 17 CARD ("???") */}
      <div className="relative z-10 mt-8 max-w-xl mx-auto w-full">
        {(() => {
          const secretUnlocked = isLevelUnlocked(17);
          const secretRes = progress.completedLevels[17];

          return (
            <div
              className={`p-6 bg-[#C41E3A] text-white flex items-center justify-between group cursor-pointer transition-all border border-red-400 shadow-[0_0_25px_rgba(196,30,58,0.5)] ${
                !secretUnlocked && 'opacity-60 cursor-not-allowed bg-neutral-900 border-neutral-800'
              }`}
              onClick={() => {
                if (secretUnlocked) onSelectLevel(17);
              }}
            >
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-1.5">
                  <Award className="w-4 h-4" /> Secret Protocol
                </span>
                <span className="text-3xl font-black italic">LEVEL ???</span>
                <span className="text-xs opacity-90 font-mono mt-1">
                  {secretUnlocked
                    ? 'БЕЛАЯ ПУСТОТА — БОЙ С УЛЬТРА-ДОМАНОМ'
                    : 'Требуется 16 S-рангов для разблокировки'}
                </span>
              </div>
              <div className="text-4xl md:text-5xl font-black italic opacity-40 group-hover:opacity-100 transition">
                {secretUnlocked ? (secretRes?.completed ? 'S-RANK' : 'ENTER') : 'LOCKED'}
              </div>
            </div>
          );
        })()}
      </div>

      <footer className="relative z-10 mt-8 flex justify-between items-center border-t border-white/10 pt-4 text-[10px] tracking-widest font-mono text-gray-500">
        <span>PROJECT HYRAX // LEVEL GRID</span>
        <span className="text-[#C41E3A]">NO_LIVING_BEINGS_HARMED</span>
      </footer>
    </div>
  );
};
