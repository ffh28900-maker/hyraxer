import React, { useState } from 'react';
import { X, Settings, Volume2, Eye } from 'lucide-react';

interface SettingsModalProps {
  initialSettings: {
    sensitivity: number;
    soundVolume: number;
    musicVolume: number;
    invertY: boolean;
    fov: number;
  };
  onSave: (newSettings: {
    sensitivity: number;
    soundVolume: number;
    musicVolume: number;
    invertY: boolean;
    fov: number;
  }) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ initialSettings, onSave, onClose }) => {
  const [sensitivity, setSensitivity] = useState(initialSettings.sensitivity);
  const [soundVolume, setSoundVolume] = useState(initialSettings.soundVolume);
  const [musicVolume, setMusicVolume] = useState(initialSettings.musicVolume);
  const [invertY] = useState(initialSettings.invertY);
  const [fov, setFov] = useState(initialSettings.fov);

  const handleSave = () => {
    onSave({ sensitivity, soundVolume, musicVolume, invertY, fov });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none font-sans">
      <div className="bg-[#0a0a0a] border border-[#C41E3A]/60 rounded-xl max-w-lg w-full p-8 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-white bg-[#1a1a1a] p-2 rounded-full border border-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
          <Settings className="w-7 h-7 text-[#C41E3A]" />
          <div>
            <div className="text-[10px] uppercase font-bold text-[#C41E3A] tracking-widest">System Preferences</div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">НАСТРОЙКИ</h2>
          </div>
        </div>

        <div className="space-y-6 font-mono text-xs">
          {/* MOUSE SENSITIVITY */}
          <div>
            <div className="flex justify-between text-gray-300 font-bold mb-2">
              <span>ЧУВСТВИТЕЛЬНОСТЬ МЫШИ:</span>
              <span className="text-[#8B5CF6]">{(sensitivity * 1000).toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.0005"
              max="0.006"
              step="0.0001"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-full accent-[#C41E3A] cursor-pointer"
            />
          </div>

          {/* SOUND VOLUME */}
          <div>
            <div className="flex justify-between text-gray-300 font-bold mb-2">
              <span className="flex items-center gap-1"><Volume2 className="w-4 h-4" /> ЕФФЕКТЫ (SFX):</span>
              <span className="text-[#8B5CF6]">{Math.round(soundVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
              className="w-full accent-[#C41E3A] cursor-pointer"
            />
          </div>

          {/* MUSIC VOLUME */}
          <div>
            <div className="flex justify-between text-gray-300 font-bold mb-2">
              <span className="flex items-center gap-1"><Volume2 className="w-4 h-4" /> МУЗЫКА (DUBSTEP):</span>
              <span className="text-[#8B5CF6]">{Math.round(musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVolume}
              onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
              className="w-full accent-[#C41E3A] cursor-pointer"
            />
          </div>

          {/* FIELD OF VIEW */}
          <div>
            <div className="flex justify-between text-gray-300 font-bold mb-2">
              <span className="flex items-center gap-1"><Eye className="w-4 h-4" /> УГОЛ ОБЗОРА (FOV):</span>
              <span className="text-[#8B5CF6]">{fov}°</span>
            </div>
            <input
              type="range"
              min="70"
              max="110"
              step="1"
              value={fov}
              onChange={(e) => setFov(parseInt(e.target.value, 10))}
              className="w-full accent-[#C41E3A] cursor-pointer"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="mt-8 w-full py-3 bg-[#C41E3A] hover:bg-[#d92343] font-black rounded text-white tracking-widest uppercase transition"
        >
          СОХРАНИТЬ (SAVE)
        </button>
      </div>
    </div>
  );
};
