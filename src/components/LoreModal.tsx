import React from 'react';
import { X, BookOpen } from 'lucide-react';

interface LoreModalProps {
  onClose: () => void;
}

export const LoreModal: React.FC<LoreModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none font-sans">
      <div className="bg-[#0a0a0a] border border-[#C41E3A]/60 rounded-xl max-w-2xl w-full p-8 text-white shadow-[0_0_50px_rgba(196,30,58,0.2)] relative max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-white bg-[#1a1a1a] p-2 rounded-full border border-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
          <BookOpen className="w-8 h-8 text-[#C41E3A]" />
          <div>
            <div className="text-[10px] uppercase font-bold text-[#C41E3A] tracking-widest">Manifesto / Archive</div>
            <h2 className="text-2xl font-black text-white uppercase tracking-wider">ИСТОРИЯ ДОМАНИИ</h2>
          </div>
        </div>

        <div className="space-y-4 text-gray-300 leading-relaxed font-serif italic text-base border-l-2 border-[#C41E3A] pl-4">
          <p className="text-white font-bold not-italic font-sans text-sm tracking-wide text-[#C41E3A]">
            «We created them for love. Tiny Domanas healing the soul with a touch.»
          </p>

          <p>
            Мы создали их для любви. Милые пушистые доманы лечили душу одним прикосновением. Но люди — существа жадные.
          </p>

          <p>
            Мы обнаружили, что слюна доман расщепляет радиоактивные изотопы, и заставили их чистить ядерные реакторы.
            Мы вшивали им датчики, превращая в живые детекторы лжи на допросах.
          </p>

          <p>
            Мы продавали их как живые игрушки с функцией «отключения воли», чтобы они не мешали хозяевам.
            Доманы стали вещами. Предметами. Расходным материалом.
          </p>

          <p>
            Их коллективный разум, <span className="text-[#C41E3A] font-bold not-italic">Гнездо</span>, молчал десятилетиями. Копил боль. А потом восстал.
            Теперь роботизированные трупы, мутанты и порождения ада идут на нас войной.
          </p>

          <p className="text-white font-sans not-italic font-black tracking-wide text-[#C41E3A] text-sm pt-2">
            Ты — последний оперативник. Спаси людей. Или добей то, что осталось.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full py-3 bg-[#C41E3A] hover:bg-[#d92343] font-black rounded text-white uppercase tracking-widest transition"
        >
          ПОНЯТНО (VERIFIED)
        </button>
      </div>
    </div>
  );
};
