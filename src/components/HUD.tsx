import React, { useState, useEffect } from 'react';
import { HudState } from '../game/GameEngine';
import { HelpCircle, RotateCcw, LogOut } from 'lucide-react';

interface HUDProps {
  hud: HudState;
  onRestartLevel?: () => void;
  onExitToMenu?: () => void;
  onResetProgress?: () => void;
}

/**
 * PERF: memoised so its twice-a-second state update repaints ONLY this small badge.
 *
 * It takes no props, so React.memo makes re-renders of the parent HUD free for it, and its
 * own setState can no longer bubble outward. Previously the counter's update lived in the
 * same component subtree as the whole HUD, so measuring the framerate itself forced HUD
 * reconciliation twice per second - the measurement was costing frames.
 */
const FpsCounter: React.FC = React.memo(() => {
  const [fps, setFps] = useState(60);
  const [frameTimeMs, setFrameTimeMs] = useState(16.6);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      frameCount++;
      const delta = now - lastTime;

      if (delta >= 500) { // Refresh twice per second
        const currentFps = Math.round((frameCount * 1000) / delta);
        const currentFrameTime = parseFloat((delta / frameCount).toFixed(1));
        setFps(currentFps);
        setFrameTimeMs(currentFrameTime);
        frameCount = 0;
        lastTime = now;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const getFpsColor = () => {
    if (fps >= 50) return 'text-emerald-400 border-emerald-500/40 shadow-emerald-500/20';
    if (fps >= 30) return 'text-amber-400 border-amber-500/40 shadow-amber-500/20';
    return 'text-red-500 border-red-500/40 shadow-red-500/20';
  };

  return (
    <div className={`mt-2.5 bg-[#050505]/90 border backdrop-blur px-2.5 py-1 rounded flex items-center justify-between font-mono text-[10px] shadow-lg transition-colors ${getFpsColor()}`}>
      <div className="flex items-center gap-1.5 font-bold tracking-wider">
        <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        <span>⚡ FPS: {fps}</span>
      </div>
      <span className="text-[9px] text-gray-400 font-normal">({frameTimeMs} ms)</span>
    </div>
  );
});
FpsCounter.displayName = 'FpsCounter';

const translateWeapon = (w: string) => {
  switch (w.toLowerCase()) {
    case 'peacemaker': return 'МИРОТВОРЕЦ';
    case 'trembler': return 'ДРОЖАТЕЛЬ';
    case 'punisher': return 'КАРАТЕЛЬ';
    default: return w.toUpperCase();
  }
};

const translateBossName = (name?: string) => {
  if (!name) return '';
  switch (name.toUpperCase()) {
    case 'GOLIATH': return 'ГОЛИАФ';
    case 'WORM': return 'ЧЕРВЬ';
    case 'MINER': return 'ШАХТЕР';
    case 'OVERLORD': return 'ОВЕРЛОРД';
    case 'ULTRADOMAN': return 'УЛЬТРАДОМАН';
    default: return name;
  }
};

export const HUD: React.FC<HUDProps> = ({ hud, onRestartLevel, onExitToMenu }) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-3 md:p-5 font-sans text-white">
      {/* Flashbang Overlay */}
      {hud.flashbangIntensity > 0 && (
        <div
          className="absolute inset-0 bg-white z-50 transition-opacity duration-75"
          style={{ opacity: Math.min(1, hud.flashbangIntensity) }}
        />
      )}

      {/* Crosshair (Pure Center - Clean Aiming) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
        <div className="relative flex items-center justify-center">
          <div className="w-2 h-2 bg-[#C41E3A] rounded-full shadow-[0_0_8px_#C41E3A]" />
          <div className="absolute w-6 h-[2px] bg-[#C41E3A]/60" />
          <div className="absolute h-6 w-[2px] bg-[#C41E3A]/60" />
        </div>
      </div>

      {/* Grapple Hook Radial Cooldown Ring (Lowered to Bottom Center) */}
      {hud.grappleCdRatio > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none z-30">
          <svg className="w-12 h-12 transform -rotate-90">
            {/* Track Ring */}
            <circle
              cx="24"
              cy="24"
              r="17"
              className="stroke-white/20"
              strokeWidth="2.5"
              fill="none"
            />
            {/* Cooldown Fill Ring */}
            <circle
              cx="24"
              cy="24"
              r="17"
              className="stroke-[#C41E3A] transition-all duration-75"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray={2 * Math.PI * 17}
              strokeDashoffset={(2 * Math.PI * 17) * hud.grappleCdRatio}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0px 0px 6px #C41E3A)' }}
            />
          </svg>
          <div className="absolute -bottom-4 text-[9px] font-mono font-bold text-[#C41E3A] bg-black/90 px-2 py-0.5 rounded border border-[#C41E3A]/50 shadow-lg whitespace-nowrap">
            КРЮК [Q] {Math.ceil(hud.grappleCdRatio * 100)}%
          </div>
        </div>
      )}

      {/* CHARGING PUNCH OVERLAY / HUD METER (Lowered to Bottom Center) */}
      {hud.isChargingPunch && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-40">
          <div className="w-64 h-3 bg-black/90 border border-[#00ffff] p-0.5 rounded shadow-[0_0_20px_#00ffff]">
            <div
              className={`h-full transition-all duration-75 shadow-[0_0_15px_#00ffff] ${
                hud.punchChargeRatio >= 0.95
                  ? 'bg-gradient-to-r from-[#00ffff] via-amber-400 to-[#C41E3A] animate-pulse'
                  : 'bg-gradient-to-r from-[#8B5CF6] to-[#00ffff]'
              }`}
              style={{ width: `${Math.round(hud.punchChargeRatio * 100)}%` }}
            />
          </div>
          <div className="text-[11px] font-mono font-bold mt-1 text-white/90 drop-shadow whitespace-nowrap">
            ЗАРЯД УДАРА: {Math.round(hud.punchChargeRatio * 100)}% {hud.punchChargeRatio >= 0.95 ? '🔥 МАКС' : ''}
          </div>
        </div>
      )}

      {/* TOP BAR: Boss HP or Style Rank */}
      <div className="w-full flex items-start justify-between z-20">
        {/* TOP LEFT: Health & Dash */}
        <div className="bg-[#050505]/90 backdrop-blur border-l-2 border-[#C41E3A] border-y border-r border-white/10 p-4 rounded-r-lg shadow-2xl min-w-[260px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C41E3A]">ЗДОРОВЬЕ</span>
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
            <span className="text-[9px] font-mono font-bold text-[#8B5CF6]">РЫВКИ</span>
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

          {/* REAL-TIME FPS COUNTER */}
          <FpsCounter />
        </div>

        {/* TOP CENTER: Boss Health Bar (If Boss Level) */}
        {hud.bossHpRatio !== undefined && (
          <div className="flex-1 max-w-lg mx-6 bg-[#050505]/95 border border-[#C41E3A] p-3 rounded shadow-2xl">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-black tracking-widest text-[#C41E3A] uppercase">БОСС: {translateBossName(hud.bossName)}</span>
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
          <div className="text-[10px] uppercase tracking-widest text-[#8B5CF6] font-bold">РАНГ СТИЛЯ</div>
          <div
            className="text-3xl font-black italic tracking-tighter transition-all my-1 transform -skew-x-6"
            style={{ color: hud.styleRank.color }}
          >
            {hud.styleRank.name}
          </div>
          <div className="text-2xl font-black text-white font-mono">{hud.styleScore} ОЧКОВ</div>
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
            <div className="text-[9px] text-[#8B5CF6] font-bold tracking-widest mb-1">УДАР [F]</div>
            <div className="w-full h-1.5 bg-black border border-white/20 overflow-hidden">
              <div
                className="h-full bg-[#8B5CF6] shadow-[0_0_8px_#8B5CF6]"
                style={{ width: `${(1 - hud.hvbCdRatio) * 100}%` }}
              />
            </div>
            <div className="text-[10px] font-bold text-gray-200 mt-1 font-mono">
              {hud.hvbCdRatio <= 0 ? 'ГОТОВ' : 'ПЕРЕЗАРЯДКА'}
            </div>
          </div>

          {/* Grapple Hook (Key Q) */}
          <div className="bg-[#050505]/90 border-l-2 border-[#C41E3A] border-y border-r border-white/10 p-3 rounded text-center min-w-[125px]">
            <div className="text-[9px] text-[#C41E3A] font-bold tracking-widest mb-1">КРЮК-КОШКА [Q]</div>
            <div className="w-full h-1.5 bg-black border border-white/20 overflow-hidden">
              <div
                className="h-full bg-[#C41E3A] shadow-[0_0_8px_#C41E3A] transition-all duration-75"
                style={{ width: `${(1 - hud.grappleCdRatio) * 100}%` }}
              />
            </div>
            <div className="text-[10px] font-bold mt-1 font-mono">
              {hud.grappleCdRatio <= 0 ? (
                <span className="text-emerald-400 font-black">ГОТОВ [Q]</span>
              ) : (
                <span className="text-[#C41E3A]">ЗАРЯДКА ({Math.ceil(hud.grappleCdRatio * 100)}%)</span>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM RIGHT: Active Weapon & Skill CD */}
        <div className="bg-[#050505]/90 backdrop-blur border-r-2 border-[#C41E3A] border-y border-l border-white/10 p-4 text-right min-w-[240px] shadow-2xl">
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">ОРУЖИЕ</div>
          <div className="text-xl font-black text-white uppercase tracking-wider my-1 font-mono">
            {translateWeapon(hud.currentWeapon)}
          </div>
          {hud.berserkActive && (
            <div className="text-xs text-[#C41E3A] font-black animate-bounce tracking-widest">
              🔥 РЕЖИМ БЕРСЕРКА
            </div>
          )}
          <div className="mt-2 text-[10px] text-gray-400 font-mono">
            НАВЫК (ПКМ):{' '}
            <span className="text-[#8B5CF6] font-bold">
              {hud.skillCdRatio <= 0 ? 'ГОТОВ' : 'ПЕРЕЗАРЯДКА'}
            </span>
          </div>
        </div>
      </div>

      {/* Top Center Quick Action Buttons & Enemy Counter */}
      <div className="pointer-events-auto absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {/* Enemy Counter Badge */}
        {hud.totalEnemiesCount > 0 && (
          <div className="bg-[#050505]/95 border border-[#C41E3A]/70 px-4 py-1.5 rounded-full flex items-center gap-2.5 shadow-[0_0_20px_rgba(196,30,58,0.35)] backdrop-blur">
            <span className="text-[11px] font-black uppercase tracking-widest text-[#C41E3A] flex items-center gap-1">
              💀 ВРАГОВ ОСТАЛОСЬ:
            </span>
            <span
              className={`text-sm font-black font-mono tracking-wider ${
                hud.aliveEnemiesCount === 0
                  ? 'text-emerald-400 animate-pulse drop-shadow-[0_0_8px_#10b981]'
                  : 'text-white'
              }`}
            >
              {hud.aliveEnemiesCount === 0
                ? 'ВСЕ УБИТЫ [0 / ' + hud.totalEnemiesCount + ']'
                : `${hud.aliveEnemiesCount} / ${hud.totalEnemiesCount}`}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 bg-[#050505]/90 border border-white/10 p-1.5 rounded-full shadow-2xl backdrop-blur">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="hover:bg-[#1f1f1f] border border-white/10 text-gray-300 text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition"
            title="Управление"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#C41E3A]" /> <span className="hidden sm:inline">Управление</span>
          </button>

          {onRestartLevel && (
            <button
              onClick={onRestartLevel}
              className="bg-[#C41E3A]/80 hover:bg-[#C41E3A] text-white text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 font-bold transition"
              title="Быстрый перезапуск [R]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Рестарт [R]</span>
            </button>
          )}

          {onExitToMenu && (
            <button
              onClick={onExitToMenu}
              className="bg-neutral-800 hover:bg-neutral-700 text-gray-200 hover:text-white text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10 font-bold transition"
              title="Выйти в главное меню"
            >
              <LogOut className="w-3.5 h-3.5 text-gray-300" /> <span className="hidden sm:inline">В меню</span>
            </button>
          )}
        </div>
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
