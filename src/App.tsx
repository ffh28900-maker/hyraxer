import { useEffect, useRef, useState } from 'react';
import { PlayerProgress, LevelResult, WeaponId, RankGrade } from './types';
import { GameEngine, HudState } from './game/GameEngine';
import { MainMenu } from './components/MainMenu';
import { LevelSelect } from './components/LevelSelect';
import { HUD } from './components/HUD';
import { VictoryModal } from './components/VictoryModal';
import { AudioEngine } from './audio/AudioEngine';

const LOCAL_STORAGE_KEY = 'SAVIOUR_OF_DOMANIA_PROGRESS_V1';

const DEFAULT_PROGRESS: PlayerProgress = {
  completedLevels: {},
  unlockedWeapons: {
    peacemaker: true,
    trembler: false,
    punisher: false,
    grapple: true,
  },
  highScore: 0,
  settings: {
    sensitivity: 0.002,
    soundVolume: 0.8,
    musicVolume: 0.5,
    invertY: false,
    fov: 85,
  },
};

export default function App() {
  const [gameState, setGameState] = useState<'menu' | 'level_select' | 'playing'>('menu');
  const [progress, setProgress] = useState<PlayerProgress>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          unlockedWeapons: {
            peacemaker: true,
            grapple: true,
            trembler: Boolean(parsed.unlockedWeapons?.trembler),
            punisher: Boolean(parsed.unlockedWeapons?.punisher),
          },
        };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_PROGRESS;
  });

  const [activeLevelNumber, setActiveLevelNumber] = useState<number>(1);
  const [hudState, setHudState] = useState<HudState | null>(null);
  const [levelResult, setLevelResult] = useState<LevelResult | null>(null);
  const [unlockedWeaponBanner, setUnlockedWeaponBanner] = useState<WeaponId | undefined>(undefined);
  const [isPlayerDead, setIsPlayerDead] = useState<boolean>(false);
  const [cheatMessage, setCheatMessage] = useState<string | null>(null);
  const [sessionNonce, setSessionNonce] = useState<number>(0);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);

  // Developer Cheat Codes ('god', 'dick', 'вшсл')
  useEffect(() => {
    let keyBuffer = '';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (key.length === 1) {
        keyBuffer += key;
        if (keyBuffer.length > 10) keyBuffer = keyBuffer.slice(-10);

        if (keyBuffer.endsWith('god') || keyBuffer.endsWith('пщв')) {
          keyBuffer = '';

          const allLevels: Record<number, any> = {};
          for (let i = 1; i <= 17; i++) {
            allLevels[i] = {
              completed: true,
              rank: 'S',
              score: 9999,
              timeSec: 15,
              kills: 25,
              totalEnemies: 25,
            };
          }

          setProgress((prev) => ({
            ...prev,
            completedLevels: allLevels,
            unlockedWeapons: {
              peacemaker: true,
              trembler: true,
              punisher: true,
              grapple: true,
            },
          }));

          AudioEngine.playCoinToss();
          setCheatMessage('GOD MODE ACTIVATED — ВСЕ 17 УРОВНЕЙ И АРСЕНАЛ РАЗБЛОКИРОВАНЫ!');

          setTimeout(() => {
            setCheatMessage(null);
          }, 3500);
        }

        if (keyBuffer.endsWith('dick') || keyBuffer.endsWith('вшсл')) {
          keyBuffer = '';
          AudioEngine.playCoinToss();
          setCheatMessage('⚡ СЕКРЕТНАЯ ВЫСТАВКА ВСЕХ МОБОВ И БОССОВ ОТКРЫТА! ⚡');

          setTimeout(() => {
            setCheatMessage(null);
          }, 4000);

          startLevel(99);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save Progress
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // ignore
    }
  }, [progress]);

  // Audio Engine Volumes
  useEffect(() => {
    AudioEngine.setVolumes(progress.settings.soundVolume, progress.settings.musicVolume);
  }, [progress.settings]);

  // Safe Pointer Lock Request helper
  const safeRequestPointerLock = (element: HTMLElement | null) => {
    if (!element || document.pointerLockElement === element) return;
    try {
      const res = element.requestPointerLock();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {
          // Gracefully handle browser rejection when exiting lock recently
        });
      }
    } catch {
      // Ignore synchronous pointer lock errors
    }
  };

  // Start Level
  const startLevel = (levelNum: number) => {
    setActiveLevelNumber(levelNum);
    setLevelResult(null);
    setUnlockedWeaponBanner(undefined);
    setIsPlayerDead(false);
    setGameState('playing');
    setSessionNonce((prev) => prev + 1);

    setTimeout(() => {
      safeRequestPointerLock(canvasContainerRef.current);
    }, 150);
  };

  // Setup GameEngine instance when entering 'playing' state
  useEffect(() => {
    if (gameState !== 'playing' || !canvasContainerRef.current) return;

    const engine = new GameEngine(
      canvasContainerRef.current,
      (hud) => setHudState(hud),
      (result, unlockedNewWeapon) => {
        setLevelResult(result);
        if (unlockedNewWeapon) {
          setUnlockedWeaponBanner(unlockedNewWeapon);
          setProgress((prev) => ({
            ...prev,
            unlockedWeapons: {
              ...prev.unlockedWeapons,
              [unlockedNewWeapon]: true,
            },
          }));
        }

        // Save Completed Level Result
        setProgress((prev) => {
          const prevRes = prev.completedLevels[activeLevelNumber];
          let bestRank: RankGrade = result.rank;
          if (prevRes?.rank === 'S') bestRank = 'S';

          return {
            ...prev,
            completedLevels: {
              ...prev.completedLevels,
              [activeLevelNumber]: {
                completed: true,
                rank: bestRank,
                score: Math.max(prevRes?.score || 0, result.score),
                timeSec: result.timeSec,
                kills: result.kills,
                totalEnemies: result.totalEnemies,
              },
            },
          };
        });
      },
      () => {
        setIsPlayerDead(true);
      }
    );

    gameEngineRef.current = engine;
    const effectiveUnlockedWeapons = {
      peacemaker: true,
      grapple: true,
      trembler: Boolean(progress.unlockedWeapons?.trembler),
      punisher: Boolean(progress.unlockedWeapons?.punisher),
    };
    engine.loadLevel(activeLevelNumber, effectiveUnlockedWeapons);
    engine.start();

    // PointerLock
    const handleCanvasClick = () => {
      safeRequestPointerLock(canvasContainerRef.current);
    };
    canvasContainerRef.current.addEventListener('click', handleCanvasClick);

    const handlePointerLockError = (e: Event) => {
      e.stopPropagation();
    };
    document.addEventListener('pointerlockerror', handlePointerLockError);

    // Keyboard & Mouse Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!engine.player) return;
      const code = e.code;
      const key = e.key.toLowerCase();

      if (code === 'KeyW' || key === 'w' || key === 'ц') engine.player.moveInput.forward = true;
      if (code === 'KeyS' || key === 's' || key === 'ы') engine.player.moveInput.backward = true;
      if (code === 'KeyA' || key === 'a' || key === 'ф') engine.player.moveInput.left = true;
      if (code === 'KeyD' || key === 'd' || key === 'в') engine.player.moveInput.right = true;

      if ((code === 'ShiftLeft' || code === 'ShiftRight') && !e.repeat) engine.player.triggerDash();
      if (code === 'Space') engine.player.triggerJump();
      if (code === 'ControlLeft' || code === 'ControlRight') engine.player.startGroundPoundOrSlide();

      if ((code === 'KeyF' || key === 'f' || key === 'а') && !e.repeat) engine.handlePunchStart();
      if ((code === 'KeyQ' || key === 'q' || key === 'й') && !e.repeat) engine.handleGrapple();
      if (code === 'KeyR' || key === 'r' || key === 'к') startLevel(activeLevelNumber);

      if (code === 'Digit1' || code === 'Numpad1' || key === '1' || key === '!') {
        engine.switchWeapon('peacemaker');
      }
      if (code === 'Digit2' || code === 'Numpad2' || key === '2' || key === '"' || key === '@') {
        engine.switchWeapon('trembler');
      }
      if (code === 'Digit3' || code === 'Numpad3' || key === '3' || key === '№' || key === '#') {
        engine.switchWeapon('punisher');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!engine.player) return;
      const code = e.code;
      const key = e.key.toLowerCase();

      if (code === 'KeyW' || key === 'w' || key === 'ц') engine.player.moveInput.forward = false;
      if (code === 'KeyS' || key === 's' || key === 'ы') engine.player.moveInput.backward = false;
      if (code === 'KeyA' || key === 'a' || key === 'ф') engine.player.moveInput.left = false;
      if (code === 'KeyD' || key === 'd' || key === 'в') engine.player.moveInput.right = false;

      if (code === 'ControlLeft' || code === 'ControlRight') engine.player.stopSlide();
      if (code === 'KeyF' || key === 'f' || key === 'а') engine.handlePunchRelease();
    };

    const handleWheel = (e: WheelEvent) => {
      if (!engine.player) return;
      const weapons: WeaponId[] = ['peacemaker', 'trembler', 'punisher'];
      const available = weapons.filter((w) => engine.player.unlockedWeapons[w]);
      if (available.length <= 1) return;

      const currIdx = available.indexOf(engine.player.currentWeapon);
      if (currIdx === -1) return;

      let nextIdx = currIdx;
      if (e.deltaY > 0) {
        nextIdx = (currIdx + 1) % available.length;
      } else if (e.deltaY < 0) {
        nextIdx = (currIdx - 1 + available.length) % available.length;
      }

      if (nextIdx !== currIdx) {
        engine.switchWeapon(available[nextIdx]);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement && engine.player) {
        engine.player.mouseDelta.x += e.movementX;
        engine.player.mouseDelta.y += e.movementY;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      if (e.button === 0) {
        engine.isPrimaryMouseDown = true;
        engine.handlePrimaryFire();
      }
      if (e.button === 2) engine.handleSecondarySkill();
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        engine.isPrimaryMouseDown = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      canvasContainerRef.current?.removeEventListener('click', handleCanvasClick);
      engine.destroy();
      gameEngineRef.current = null;
    };
  }, [gameState, activeLevelNumber, progress.unlockedWeapons, sessionNonce]);

  const handleResetProgress = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.clear();
    } catch {
      // ignore
    }

    const resetState: PlayerProgress = {
      completedLevels: {},
      unlockedWeapons: {
        peacemaker: true,
        trembler: false,
        punisher: false,
        grapple: true,
      },
      highScore: 0,
      settings: progress.settings,
    };

    setProgress(resetState);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(resetState));
    } catch {
      // ignore
    }

    setActiveLevelNumber(1);
    setHudState(null);
    setLevelResult(null);
    setUnlockedWeaponBanner(undefined);
    setIsPlayerDead(false);
    setGameState('menu');
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden font-mono relative">
      {/* Dev Cheat Notification */}
      {cheatMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-[#C41E3A] text-white px-6 py-3 rounded-lg font-mono font-black border border-white shadow-[0_0_30px_rgba(196,30,58,0.9)] tracking-widest uppercase animate-bounce text-xs md:text-sm text-center">
          ⚡ {cheatMessage} ⚡
        </div>
      )}

      {gameState === 'menu' && (
        <MainMenu
          progress={progress}
          onPlayClick={() => setGameState('level_select')}
          onUpdateSettings={(newSettings) =>
            setProgress((prev) => ({ ...prev, settings: newSettings }))
          }
          onResetProgress={handleResetProgress}
        />
      )}

      {gameState === 'level_select' && (
        <LevelSelect
          progress={progress}
          onSelectLevel={(lvl) => startLevel(lvl)}
          onBackToMenu={() => setGameState('menu')}
        />
      )}

      {gameState === 'playing' && (
        <div className="relative w-full h-full">
          {/* 3D Canvas Container */}
          <div ref={canvasContainerRef} className="w-full h-full cursor-crosshair" />

          {/* HUD Overlay */}
          {hudState && (
            <HUD
              hud={hudState}
              onRestartLevel={() => startLevel(activeLevelNumber)}
              onExitToMenu={() => setGameState('menu')}
            />
          )}

          {/* Death Popup Overlay */}
          {isPlayerDead && (
            <div className="absolute inset-0 bg-red-950/90 backdrop-blur-md z-50 flex items-center justify-center p-6 text-center text-white">
              <div className="bg-neutral-900 border border-red-600 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <h2 className="text-3xl font-black text-red-500 tracking-wider mb-2">ВЫ ПОГИБЛИ (DESTROYED)</h2>
                <p className="text-xs text-gray-400 mb-6">ДОМАНЫ ПЕРЕХВАТИЛИ ИНИЦИАТИВУ</p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => startLevel(activeLevelNumber)}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 font-black rounded-xl text-white tracking-wider transition"
                  >
                    ПОВТОРИТЬ УРОВЕНЬ
                  </button>
                  <div className="flex gap-2.5">
                    <button
                      onClick={() => setGameState('level_select')}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-bold rounded-xl text-gray-300 text-xs transition"
                    >
                      МЕНЮ УРОВНЕЙ
                    </button>
                    <button
                      onClick={() => setGameState('menu')}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-bold rounded-xl text-gray-300 text-xs transition"
                    >
                      ГЛАВНОЕ МЕНЮ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Victory Modal */}
          {levelResult && (
            <VictoryModal
              result={levelResult}
              unlockedNewWeapon={unlockedWeaponBanner}
              onNextLevel={() => {
                if (activeLevelNumber < 17) startLevel(activeLevelNumber + 1);
                else setGameState('level_select');
              }}
              onRestartLevel={() => startLevel(activeLevelNumber)}
              onBackToGrid={() => setGameState('level_select')}
            />
          )}
        </div>
      )}
    </div>
  );
}
