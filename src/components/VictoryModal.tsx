import React from 'react';
import { LevelResult, WeaponId, RankGrade, StyleBreakdown } from '../types';
import { Trophy, ArrowRight, RotateCcw, Zap, Wind, Flame, Sparkles, Activity } from 'lucide-react';

interface VictoryModalProps {
  result: LevelResult;
  unlockedNewWeapon?: WeaponId;
  onNextLevel: () => void;
  onRestartLevel: () => void;
  onBackToGrid: () => void;
}

const getRankColor = (rank: RankGrade): string => {
  switch (rank) {
    case 'S':
      return 'text-yellow-400 border-yellow-400/60 bg-yellow-400/10 shadow-[0_0_12px_rgba(250,204,21,0.3)]';
    case 'A':
      return 'text-emerald-400 border-emerald-400/60 bg-emerald-400/10 shadow-[0_0_12px_rgba(52,211,153,0.3)]';
    case 'B':
      return 'text-blue-400 border-blue-400/60 bg-blue-400/10';
    case 'C':
      return 'text-purple-400 border-purple-400/60 bg-purple-400/10';
    default:
      return 'text-gray-400 border-gray-400/60 bg-gray-400/10';
  }
};

const getOverallRankBadge = (score: number, breakdownRank?: string) => {
  if (breakdownRank) {
    if (breakdownRank === 'ULTRAKILL') return { name: 'ULTRAKILL', color: 'text-red-500 bg-red-950/80 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.5)]' };
    if (breakdownRank === 'SSADISTIC') return { name: 'SSADISTIC', color: 'text-pink-400 bg-pink-950/80 border-pink-500/80 shadow-[0_0_18px_rgba(236,72,153,0.4)]' };
    if (breakdownRank === 'SUPREME') return { name: 'SUPREME', color: 'text-amber-400 bg-amber-950/80 border-amber-500/80 shadow-[0_0_16px_rgba(245,158,11,0.4)]' };
    if (breakdownRank === 'SAVAGE') return { name: 'SAVAGE', color: 'text-emerald-400 bg-emerald-950/80 border-emerald-500/80 shadow-[0_0_14px_rgba(16,185,129,0.3)]' };
  }

  if (score > 3500) return { name: 'ULTRAKILL', color: 'text-red-500 bg-red-950/80 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.5)]' };
  if (score > 2400) return { name: 'SSADISTIC', color: 'text-pink-400 bg-pink-950/80 border-pink-500/80 shadow-[0_0_18px_rgba(236,72,153,0.4)]' };
  if (score > 1400) return { name: 'SUPREME', color: 'text-amber-400 bg-amber-950/80 border-amber-500/80 shadow-[0_0_16px_rgba(245,158,11,0.4)]' };
  if (score > 600) return { name: 'SAVAGE', color: 'text-emerald-400 bg-emerald-950/80 border-emerald-500/80 shadow-[0_0_14px_rgba(16,185,129,0.3)]' };

  return { name: 'DESTRUCTIVE', color: 'text-blue-400 bg-blue-950/80 border-blue-500/80 shadow-[0_0_12px_rgba(59,130,246,0.3)]' };
};

export const VictoryModal: React.FC<VictoryModalProps> = ({
  result,
  unlockedNewWeapon,
  onNextLevel,
  onRestartLevel,
  onBackToGrid,
}) => {
  // If no style breakdown explicitly recorded, calculate dynamic breakdown from score
  const totalScore = result.score || 0;
  const breakdown: StyleBreakdown = result.styleBreakdown || {
    movementPoints: Math.round(totalScore * 0.35),
    airtimePoints: Math.round(totalScore * 0.40),
    multikillPoints: Math.round(totalScore * 0.25),
    movementRank: totalScore > 2000 ? 'S' : totalScore > 1200 ? 'A' : totalScore > 600 ? 'B' : 'C',
    airtimeRank: totalScore > 2400 ? 'S' : totalScore > 1400 ? 'A' : totalScore > 800 ? 'B' : 'C',
    multikillRank: totalScore > 1800 ? 'S' : totalScore > 1000 ? 'A' : totalScore > 500 ? 'B' : 'C',
    overallStyleRank: totalScore > 3500 ? 'ULTRAKILL' : totalScore > 2400 ? 'SSADISTIC' : totalScore > 1400 ? 'SUPREME' : totalScore > 600 ? 'SAVAGE' : 'DESTRUCTIVE',
  };

  const styleBadge = getOverallRankBadge(result.score, breakdown.overallStyleRank);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none font-sans overflow-y-auto">
      <div className="bg-[#0a0a0a] border border-[#C41E3A]/80 rounded-2xl max-w-lg w-full p-6 text-white shadow-[0_0_40px_rgba(196,30,58,0.3)] text-center relative my-auto">
        
        {/* TOP HEADER */}
        <div className="relative mb-3">
          <Trophy className="w-10 h-10 text-[#C41E3A] mx-auto animate-bounce" />
          <div className="text-[10px] uppercase font-bold text-[#C41E3A] tracking-widest mt-1">Stage Declassified</div>
          <h2 className="text-2xl font-black text-white tracking-wider uppercase">ЭТАП ЗАВЕРШЁН</h2>
          <p className="text-[11px] text-gray-400 font-mono">РЕЗУЛЬТАТЫ БОЕВОЙ ВЫСАДКИ</p>
        </div>

        {/* GRADE & OVERALL STYLE RATING BADGE */}
        <div className="flex items-center justify-center gap-3 mb-5">
          {/* PRIMARY MISSION RANK */}
          <div className="bg-white text-black px-6 py-2 text-4xl font-black italic transform -skew-x-12 shadow-[0_0_20px_white]">
            RANK: {result.rank}
          </div>

          {/* OVERALL STYLE RATING BADGE */}
          <div className={`px-4 py-2 border rounded-lg font-black tracking-widest text-sm uppercase transform skew-x-6 flex items-center gap-1.5 ${styleBadge.color}`}>
            <Sparkles className="w-4 h-4 animate-spin" />
            {styleBadge.name}
          </div>
        </div>

        {/* STYLE RANK BREAKDOWN PANEL */}
        <div className="bg-black/80 border border-white/10 rounded-xl p-4 text-left mb-5 shadow-inner">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <span className="text-[11px] font-bold text-[#8B5CF6] tracking-widest uppercase flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#8B5CF6]" /> АНАЛИЗ СТИЛЯ БОЯ (STYLE BREAKDOWN)
            </span>
            <span className="text-xs font-mono font-bold text-[#8B5CF6]">{result.score} PTS</span>
          </div>

          <div className="space-y-3">
            {/* 1. MOVEMENT COMPLEXITY */}
            <div className="bg-white/5 p-2.5 rounded border border-white/5 hover:border-white/20 transition">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-gray-200">СЛОЖНОСТЬ ДВИЖЕНИЯ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-cyan-300 font-bold">+{breakdown.movementPoints} PTS</span>
                  <span className={`text-[10px] font-black font-mono px-1.5 py-0.5 rounded border ${getRankColor(breakdown.movementRank)}`}>
                    {breakdown.movementRank}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 font-mono mb-1">Слайды, рывки, крюк-кошка, удар о землю</p>
              <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(15, (breakdown.movementPoints / (totalScore || 1)) * 220))}%` }}
                />
              </div>
            </div>

            {/* 2. AIRTIME & AERIAL KILLS */}
            <div className="bg-white/5 p-2.5 rounded border border-white/5 hover:border-white/20 transition">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-gray-200">ВОЗДУШНЫЙ БОЙ & ЭЙРТАЙМ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-purple-300 font-bold">+{breakdown.airtimePoints} PTS</span>
                  <span className={`text-[10px] font-black font-mono px-1.5 py-0.5 rounded border ${getRankColor(breakdown.airtimeRank)}`}>
                    {breakdown.airtimeRank}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 font-mono mb-1">Выстрелы в воздухе, рикошеты</p>
              <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-purple-400 shadow-[0_0_8px_#c084fc] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(15, (breakdown.airtimePoints / (totalScore || 1)) * 220))}%` }}
                />
              </div>
            </div>

            {/* 3. MULTI-KILLS & COMBOS */}
            <div className="bg-white/5 p-2.5 rounded border border-white/5 hover:border-white/20 transition">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-bold text-gray-200">МУЛЬТИ-УБИЙСТВА И СЕРИИ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-rose-400 font-bold">+{breakdown.multikillPoints} PTS</span>
                  <span className={`text-[10px] font-black font-mono px-1.5 py-0.5 rounded border ${getRankColor(breakdown.multikillRank)}`}>
                    {breakdown.multikillRank}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 font-mono mb-1">Взрывные серии, критические попадания</p>
              <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-rose-500 shadow-[0_0_8px_#f43f5e] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(15, (breakdown.multikillPoints / (totalScore || 1)) * 220))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* STATS OVERVIEW GRID */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-black/80 p-3 rounded-lg border border-white/10 mb-5 text-left">
          <div className="bg-white/5 p-2 rounded">
            <span className="text-gray-400 text-[10px] block">ВРЕМЯ ПРОХОЖДЕНИЯ</span>
            <span className="text-white font-bold text-sm">{result.timeSec} SEC</span>
          </div>
          <div className="bg-white/5 p-2 rounded">
            <span className="text-gray-400 text-[10px] block">УНИЧТОЖЕНО ДОМАН</span>
            <span className="text-[#C41E3A] font-bold text-sm">
              {result.kills} / {result.totalEnemies}
            </span>
          </div>
        </div>

        {/* NEW UNLOCKED WEAPON BANNER */}
        {unlockedNewWeapon && (
          <div className="mb-5 p-3 bg-[#1A0505] border border-[#C41E3A] rounded-lg text-center shadow-[0_0_20px_rgba(196,30,58,0.4)] animate-pulse">
            <div className="text-[10px] text-[#C41E3A] font-black tracking-widest uppercase">NEW ARSENAL UNLOCKED!</div>
            <div className="text-base font-black text-white uppercase">{unlockedNewWeapon}</div>
          </div>
        )}

        {/* BUTTONS */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onNextLevel}
            className="w-full py-3.5 bg-[#C41E3A] hover:bg-[#d92343] font-black rounded-lg text-white tracking-widest uppercase flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(196,30,58,0.5)] transition"
          >
            СЛЕДУЮЩИЙ ЭТАП <ArrowRight className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={onRestartLevel}
              className="py-2.5 bg-[#121212] hover:bg-[#1f1f1f] border border-white/10 rounded-lg text-xs font-bold text-gray-300 flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcw className="w-4 h-4 text-gray-400" /> Переиграть
            </button>
            <button
              onClick={onBackToGrid}
              className="py-2.5 bg-[#121212] hover:bg-[#1f1f1f] border border-white/10 rounded-lg text-xs font-bold text-gray-300 transition"
            >
              Сетка уровней
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
