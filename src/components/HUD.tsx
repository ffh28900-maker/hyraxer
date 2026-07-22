import React, { useState } from 'react';
import { HudState } from '../game/GameEngine';
import { HelpCircle, RotateCcw } from 'lucide-react';

interface HUDProps {
  hud: HudState;
  onRestartLevel?: () => void;
}

export const HUD: React.FC<HUDProps> = ({ hud, onRestartLevel }) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-6 font-sans text-white">
      {/* Flashbang Overlay */}
      {hud.flashbangIntensity > 0 && (
        <div
          className="absolute inset-0 bg-white z-50 transition-opacity duration-75"
          style={{ opacity: Math.min(1, hud.flashbangIntensity) }}
        />
      )}

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
        <div className="relative flex items-center justify-center">
          <div className="w-2 h-2 bg-[#C41E3A] rounded-full shadow-[0_0_8px_#C41E3A]" />
          <div className="absolute w-6 h-[2px] bg-[#C41E3A]/60" />
          <div className="absolute h-6 w-[2px] bg-[#C41E3A]/60" />
        </div>
      </div>

      {/* CHARGING PUNCH OVERLAY / HUD METER */}
      {hud.isChargingPunch && (
        <div className="absolute top-[78%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-40">
          <div className="w-64 h-3 bg-black/80 border border-[#00ffff] p-0.5 rounded shadow-[0_0_20px_#00ffff]">
            <div
              className={`h-full transition-all duration-75 shadow-[0_0_15px_#00ffff] ${
                hud.punchChargeRatio >= 0.95
                  ? 'bg-gradient-to-r from-[#00ffff] via-amber-400 to-[#C41E3A] animate-pulse'
                  : 'bg-gradient-to-r from-[#8B5CF6] to-[#00ffff]'
              }`}
              style={{ width: `${Math.round(hud.punchChargeRatio * 100)}%` }}
            />
          </div>
          <div className="text-[11px] font-mono font-bold mt-1 text-white/90 drop-shadow">
            {Math.round(hud.punchChargeRatio * 100)}% {hud.punchChargeRatio >= 0.95 ? '🔥 100%' : ''}
          </div>
        </div>
      )}

      {/* TOP BAR: Boss HP or Style Rank */}
      <div className="w-full flex items-start justify-between z-20">
        {/* TOP LEFT: Health & Dash */}
        <div className="bg-[#050505]/90 backdrop-blur border-l-2 border-[#C41E3A] border-y border-r border-white/10 p-4 rounded-r-lg shadow-2xl min-w-[260px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C41E3A]">NANO_FLUID [HEALTH]</span>
            <span className="text-xl font-black italic text-white">{hud.hp}%</span>
          </div>
          <div className="w-full h-3 bg-[#111] border border-white/20 relative overflow-hidden mb-3">
            <div
              className="h-full bg-[#C41E3A] transition-all duration-150 shadow-[0_0_15px_#C41E3A]"
              style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
            />
          </div>

          {/* DASH CHARGES (3 Segments) */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[9px] font-mono font-bold text-[#8B5CF6]">STAMINA_DRIVE</span>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-8 h-2 border border-white/20 transition-all ${
                    i < hud.dashCharges
                      ? 'bg-white shadow-[0_0_10px_white]'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* TOP CENTER: Boss Health Bar (If Boss Level) */}
        {hud.bossHpRatio !== undefined && (
          <div className="flex-1 max-w-lg mx-6 bg-[#050505]/95 border border-[#C41E3A] p-3 rounded shadow-2xl">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-black tracking-widest text-[#C41E3A] uppercase">{hud.bossName}</span>
              <span className="text-xs font-mono font-bold text-white">{Math.ceil(hud.bossHpRatio * 100)}%</span>
            </div>
            <div className="w-full h-4 bg-[#111] border border-red-900/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#C41E3A] to-red-500 transition-all duration-100 shadow-[0_0_20px_#C41E3A]"
                style={{ width: `${hud.bossHpRatio * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* TOP RIGHT: Style Rank Meter */}
        <div className="bg-[#050505]/90 backdrop-blur border-r-2 border-[#8B5CF6] border-y border-l border-white/10 p-4 text-right shadow-2xl min-w-[220px]">
          <div className="text-[10px] uppercase tracking-widest text-[#8B5CF6] font-bold">SYSTEM_RANK</div>
          <div
            className="text-3xl font-black italic tracking-tighter transition-all my-1 transform -skew-x-6"
            style={{ color: hud.styleRank.color }}
          >
            {hud.styleRank.name}
          </div>
          <div className="text-2xl font-black text-white font-mono">{hud.styleScore} PTS</div>
          <div className="text-[10px] text-amber-400 uppercase font-bold animate-pulse mt-1">
            + {hud.styleActionText}
          </div>
        </div>
      </div>

      {/* BOTTOM BAR: Weapons, Skill Cooldowns & Controls */}
      <div className="w-full flex items-end justify-between z-20">
        {/* BOTTOM LEFT: Abilities Cooldown (HVB & Grapple) */}
        <div className="flex gap-3">
          {/* HVB Punch (Key F) */}
          <div className="bg-[#050505]/90 border-l-2 border-[#8B5CF6] border-y border-r border-white/10 p-3 rounded text-center min-w-[110px]">
            <div className="text-[9px] text-[#8B5CF6] font-bold tracking-widest mb-1">HVB PUNCH [F]</div>
            <div className="w-full h-1.5 bg-black border border-white/20 overflow-hidden">
              <div
                className="h-full bg-[#8B5CF6] shadow-[0_0_8px_#8B5CF6]"
                style={{ width: `${(1 - hud.hvbCdRatio) * 100}%` }}
              />
            </div>
            <div className="text-[10px] font-bold text-gray-200 mt-1 font-mono">
              {hud.hvbCdRatio <= 0 ? 'READY' : 'CD'}
            </div>
          </div>

          {/* Grapple Hook (Key Q) */}
          <div className="bg-[#050505]/90 border-l-2 border-[#C41E3A] border-y border-r border-white/10 p-3 rounded text-center min-w-[110px]">
            <div className="text-[9px] text-[#C41E3A] font-bold tracking-widest mb-1">GRAPPLE [Q]</div>
            <div className="w-full h-1.5 bg-black border border-white/20 overflow-hidden">
              <div
                className="h-full bg-[#C41E3A] shadow-[0_0_8px_#C41E3A]"
                style={{ width: `${(1 - hud.grappleCdRatio) * 100}%` }}
              />
            </div>
            <div className="text-[10px] font-bold text-gray-200 mt-1 font-mono">
              {hud.grappleCdRatio <= 0 ? 'READY' : 'REELING'}
            </div>
          </div>
        </div>

        {/* BOTTOM RIGHT: Active Weapon & Skill CD */}
        <div className="bg-[#050505]/90 backdrop-blur border-r-2 border-[#C41E3A] border-y border-l border-white/10 p-4 text-right min-w-[240px] shadow-2xl">
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">ACTIVE ARSENAL</div>
          <div className="text-xl font-black text-white uppercase tracking-wider my-1 font-mono">
            {hud.currentWeapon.toUpperCase()}
          </div>
          {hud.berserkActive && (
            <div className="text-xs text-[#C41E3A] font-black animate-bounce tracking-widest">
              🔥 BERSERK OVERDRIVE
            </div>
          )}
          <div className="mt-2 text-[10px] text-gray-400 font-mono">
            ALT SKILL (RMB):{' '}
            <span className="text-[#8B5CF6] font-bold">
              {hud.skillCdRatio <= 0 ? 'READY' : 'CD'}
            </span>
          </div>
        </div>
      </div>

      {/* Top Center Quick Action Buttons */}
      <div className="pointer-events-auto absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="bg-[#050505]/90 hover:bg-[#121212] border border-white/20 text-gray-300 text-xs px-4 py-1.5 rounded-full flex items-center gap-2 shadow-xl backdrop-blur transition"
        >
          <HelpCircle className="w-4 h-4 text-[#C41E3A]" /> Управление
        </button>

        {onRestartLevel && (
          <button
            onClick={onRestartLevel}
            className="bg-[#C41E3A]/80 hover:bg-[#C41E3A] border border-white/30 text-white text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-xl backdrop-blur font-bold transition"
            title="Быстрый перезапуск [R]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Рестарт [R]
          </button>
        )}
      </div>

      {/* Controls Overlay */}
      {showHelp && (
        <div className="pointer-events-auto fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-[#0a0a0a] border border-[#C41E3A]/60 rounded-xl max-w-lg w-full p-6 text-white shadow-2xl">
            <h3 className="text-xl font-black text-[#C41E3A] mb-4 border-b border-white/10 pb-2 uppercase tracking-wider">
              Управление в игре (Controls)
            </h3>
            <ul className="space-y-2 text-xs font-mono text-gray-300">
              <li><strong className="text-[#C41E3A]">WASD:</strong> Движение (Movement)</li>
              <li><strong className="text-[#C41E3A]">Shift:</strong> Рывок (Dash) [3 заряда]</li>
              <li><strong className="text-[#C41E3A]">Space:</strong> Прыжок / Двойной прыжок / Wall Kick</li>
              <li><strong className="text-[#C41E3A]">Ctrl (удержание):</strong> Скольжение (Slide) / Ground Pound (в воздухе)</li>
              <li><strong className="text-[#C41E3A]">ЛКМ (LMB):</strong> Стрельба из основного оружия</li>
              <li><strong className="text-[#C41E3A]">ПКМ (RMB):</strong> Альтернативный навык (Монеты / Вспышка / Берсерк)</li>
              <li><strong className="text-[#8B5CF6]">Клавиша F:</strong> HVB Заряженный удар рукой (Rocket Punch)</li>
              <li><strong className="text-[#8B5CF6]">Клавиша Q:</strong> Крюк-кошка (Grappling Hook)</li>
              <li><strong className="text-[#C41E3A]">Клавиша R:</strong> Перезапуск уровня (Instant Restart)</li>
              <li><strong className="text-white">1, 2, 3:</strong> Смена оружия</li>
            </ul>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-3 bg-[#C41E3A] hover:bg-[#d92343] font-black rounded text-white transition uppercase tracking-widest text-xs"
            >
              Закрыть (Close)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
