import React from 'react';
import { X, ShieldAlert, CheckCircle, Lock } from 'lucide-react';
import { WeaponInfo } from '../types';

interface ArsenalModalProps {
  unlockedWeapons: Record<string, boolean>;
  onClose: () => void;
}

const WEAPONS_DATA: WeaponInfo[] = [
  {
    id: 'peacemaker',
    name: 'Пистолет «Миротворец»',
    code: 'P-1 PEACEMAKER',
    description: 'Высокоточный полуавтоматический пистолет с модулем рикошетных монет.',
    primaryName: 'Точный выстрел (12 патр.)',
    secondaryName: 'Залп из 3 монет (КД 4 сек)',
    secondaryCd: 4,
    unlockedBy: 'Доступен с самого начала',
    color: '#C41E3A',
  },
  {
    id: 'trembler',
    name: 'Дробовик «Сотрясатель»',
    code: 'SG-8 TREMBLER',
    description: 'Двуствольный дробовик ближнего боя с подствольным светошумовым гранатомётом.',
    primaryName: 'Картечь (8 дробин, 6 патр.)',
    secondaryName: 'Светошумовая граната (Ослепление 3s, КД 8s)',
    secondaryCd: 8,
    unlockedBy: 'Победа над Голиафом (Уровень 4)',
    color: '#8B5CF6',
  },
  {
    id: 'punisher',
    name: 'Автомат «Каратель»',
    code: 'AR-47 PUNISHER',
    description: 'Штурмовая винтовка с режимом разрывного Берсерка.',
    primaryName: 'Очередь (30 патр.)',
    secondaryName: 'Режим «Берсерк» (х3 скорострельность + AOE, КД 25s)',
    secondaryCd: 25,
    unlockedBy: 'Победа над Червём-Носителем (Уровень 8)',
    color: '#C41E3A',
  },
  {
    id: 'grapple',
    name: 'Крюк-кошка «Стяжатель»',
    code: 'GRAPPLING HOOK',
    description: 'Пневматический крюк для паркура и притягивания врагов.',
    primaryName: 'Притягивание / Крюк на клавишу [Q]',
    secondaryName: 'Оглушение врага на 1.0 сек',
    secondaryCd: 3,
    unlockedBy: 'Победа над Шахтёром-Подрывником (Уровень 12)',
    color: '#FFFFFF',
  },
];

export const ArsenalModal: React.FC<ArsenalModalProps> = ({ unlockedWeapons, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none font-sans">
      <div className="bg-[#0a0a0a] border border-[#C41E3A]/60 rounded-xl max-w-3xl w-full p-8 text-white shadow-[0_0_50px_rgba(196,30,58,0.2)] relative max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-white bg-[#1a1a1a] p-2 rounded-full border border-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
          <ShieldAlert className="w-8 h-8 text-[#C41E3A]" />
          <div>
            <div className="text-[10px] uppercase font-bold text-[#C41E3A] tracking-widest">Current Arsenal</div>
            <h2 className="text-2xl font-black text-white uppercase tracking-wider">ОРУЖЕЙНЫЙ АРСЕНАЛ</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {WEAPONS_DATA.map((w) => {
            const isUnlocked = unlockedWeapons[w.id];

            return (
              <div
                key={w.id}
                className={`p-4 border-l-2 ${
                  w.id === 'trembler' ? 'border-[#8B5CF6]' : 'border-[#C41E3A]'
                } p-4 bg-white/5 transition-all ${
                  !isUnlocked && 'opacity-50 grayscale'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold tracking-widest text-[#C41E3A]">{w.code}</span>
                    <h3 className="text-base font-black text-white">{w.name}</h3>
                  </div>
                  {isUnlocked ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#8B5CF6] border border-[#8B5CF6]/50 px-2 py-0.5 rounded">
                      <CheckCircle className="w-3 h-3" /> В АРСЕНАЛЕ
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 border border-neutral-700 px-2 py-0.5 rounded">
                      <Lock className="w-3 h-3" /> Z-LOCKED
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-300 mb-3">{w.description}</p>

                <div className="space-y-1 text-xs bg-black/60 p-2.5 rounded border border-white/10 font-mono">
                  <div><strong className="text-gray-400">ЛКМ:</strong> {w.primaryName}</div>
                  <div><strong className="text-[#8B5CF6]">ПКМ:</strong> {w.secondaryName}</div>
                </div>

                <div className="mt-3 text-[10px] text-gray-400 font-mono italic">
                  Условие: {w.unlockedBy}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-[#C41E3A] hover:bg-[#d92343] font-black rounded text-white uppercase tracking-widest transition"
        >
          ЗАКРЫТЬ (CLOSE)
        </button>
      </div>
    </div>
  );
};
