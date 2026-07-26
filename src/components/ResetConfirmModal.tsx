import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

interface ResetConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 font-sans select-none">
      <div className="bg-[#0a0a0a] border border-[#C41E3A]/80 rounded-2xl max-w-md w-full p-6 text-white shadow-[0_0_50px_rgba(196,30,58,0.4)] relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white bg-[#1a1a1a] p-1.5 rounded-full border border-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-[#C41E3A]">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-[#C41E3A] tracking-widest">Внимание</div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">СБРОС ПРОГРЕССА</h2>
          </div>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed mb-6 bg-white/5 border border-white/10 p-3.5 rounded-lg font-sans">
          Вы действительно хотите сбросить весь пройденный прогресс?
          <br /><br />
          <strong className="text-red-400">• Будут аннулированы все пройденные уровни и полученные ранги (S, A, B...).</strong>
          <br />
          <strong className="text-red-400">• Будет заблокировано дополнительное оружие (Дробовик, Автомат).</strong>
          <br /><br />
          <span className="text-gray-400 italic">Это действие нельзя отменить.</span>
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-[#181818] hover:bg-[#252525] border border-white/20 rounded-xl text-xs font-bold text-gray-300 transition"
          >
            ОТМЕНА
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-3 bg-[#C41E3A] hover:bg-red-600 border border-red-400 rounded-xl text-xs font-black text-white tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(196,30,58,0.5)] transition"
          >
            <RotateCcw className="w-4 h-4" /> СБРОСИТЬ
          </button>
        </div>
      </div>
    </div>
  );
};
