import React from 'react';
import { Crown } from 'lucide-react';
import { SUIT_INFO, RANK_LABELS, CARD_BACK_THEMES } from '../engine/constants';

export const PlayingCard = ({
  card,
  isPlayable = false,
  isDisabled = false,
  onClick,
  size = 'md',
  isSelected = false,
  showTrumpBadge = false
}) => {
  if (!card) return null;
  const suitInfo = SUIT_INFO[card.suit];
  const label = RANK_LABELS[card.rank];

  const sizeConfig = {
    xs: {
      box: 'w-11 h-16 rounded-md p-1',
      cornerRank: 'text-[10px]',
      cornerSuit: 'text-[9px]',
      centerSymbol: 'text-lg',
      faceBox: 'w-7 h-9 rounded border',
      faceTitle: 'text-[6px]',
      faceSymbol: 'text-xs',
      crown: 'w-2 h-2'
    },
    sm: {
      box: 'w-16 h-24 sm:w-20 sm:h-28 rounded-xl p-1.5',
      cornerRank: 'text-xs sm:text-sm',
      cornerSuit: 'text-[10px] sm:text-xs',
      centerSymbol: 'text-2xl sm:text-3xl',
      faceBox: 'w-10 h-12 sm:w-12 sm:h-14 rounded-md border',
      faceTitle: 'text-[7px] sm:text-[8px]',
      faceSymbol: 'text-base sm:text-xl',
      crown: 'w-2.5 h-2.5'
    },
    md: {
      box: 'w-20 h-28 sm:w-24 sm:h-36 rounded-xl p-1.5 sm:p-2',
      cornerRank: 'text-xs sm:text-base',
      cornerSuit: 'text-[10px] sm:text-xs',
      centerSymbol: 'text-3xl sm:text-4xl',
      faceBox: 'w-11 h-14 sm:w-14 sm:h-18 rounded-lg border',
      faceTitle: 'text-[8px] sm:text-[10px]',
      faceSymbol: 'text-xl sm:text-2xl',
      crown: 'w-3 h-3'
    },
    lg: {
      box: 'w-24 h-36 sm:w-28 sm:h-40 rounded-xl p-2',
      cornerRank: 'text-sm sm:text-lg',
      cornerSuit: 'text-xs sm:text-sm',
      centerSymbol: 'text-4xl sm:text-5xl',
      faceBox: 'w-14 h-20 rounded-lg border',
      faceTitle: 'text-[10px] sm:text-xs',
      faceSymbol: 'text-2xl sm:text-3xl',
      crown: 'w-3.5 h-3.5'
    }
  }[size];

  return (
    <button
      type="button"
      disabled={!isPlayable && !onClick}
      onClick={() => isPlayable && onClick && onClick(card)}
      className={`
        relative bg-white select-none transition-all duration-200 overflow-hidden shrink-0
        shadow-[0_6px_16px_rgba(0,0,0,0.45)] border-2
        ${sizeConfig.box}
        ${isPlayable 
          ? 'cursor-pointer hover:-translate-y-5 hover:scale-105 hover:shadow-[0_16px_30px_rgba(250,204,21,0.5)] border-amber-400 ring-2 ring-amber-300/70 z-10' 
          : 'cursor-default border-stone-200'}
        ${isDisabled ? 'brightness-75 opacity-75 translate-y-1.5' : ''}
        ${isSelected ? '-translate-y-6 ring-4 ring-amber-400' : ''}
      `}
    >
      {showTrumpBadge && (
        <span className="absolute top-1 right-1 bg-amber-500 text-amber-950 text-[9px] font-black p-0.5 rounded-full shadow border border-white flex items-center justify-center z-20">
          <Crown className="w-2.5 h-2.5 fill-amber-950" />
        </span>
      )}

      <div className={`absolute top-1 left-1.5 flex flex-col items-center leading-none font-black ${suitInfo.color}`}>
        <span className={`${sizeConfig.cornerRank} tracking-tighter`}>{label}</span>
        <span className={sizeConfig.cornerSuit}>{suitInfo.symbol}</span>
      </div>

      <div className={`w-full h-full flex items-center justify-center ${suitInfo.color}`}>
        {['J', 'Q', 'K'].includes(card.rank) ? (
          <div className={`${sizeConfig.faceBox} ${suitInfo.border} ${suitInfo.bg} flex flex-col items-center justify-center relative overflow-hidden shadow-inner`}>
            <span className={`${sizeConfig.faceTitle} font-extrabold uppercase opacity-80 tracking-wider leading-none`}>
              {card.rank === 'J' ? 'Valet' : card.rank === 'Q' ? 'Dame' : 'Roi'}
            </span>
            <span className={`${sizeConfig.faceSymbol} leading-none my-0.5`}>{suitInfo.symbol}</span>
            <Crown className={`${sizeConfig.crown} opacity-40`} />
          </div>
        ) : (
          <span className={`${sizeConfig.centerSymbol} drop-shadow-sm leading-none`}>{suitInfo.symbol}</span>
        )}
      </div>

      <div className={`absolute bottom-1 right-1.5 flex flex-col items-center leading-none font-black rotate-180 ${suitInfo.color}`}>
        <span className={`${sizeConfig.cornerRank} tracking-tighter`}>{label}</span>
        <span className={sizeConfig.cornerSuit}>{suitInfo.symbol}</span>
      </div>
    </button>
  );
};

export const CardBack = ({ count = 8, orientation = 'horizontal', theme = 'ROYAL_BLUE' }) => {
  const themeObj = CARD_BACK_THEMES[theme] || CARD_BACK_THEMES.ROYAL_BLUE;

  return (
    <div className="flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : orientation === 'horizontal' ? '-18px' : '-20px'
            }}
            className={`w-8 h-12 sm:w-10 sm:h-14 rounded-md bg-gradient-to-br border shadow-md flex items-center justify-center ${themeObj.outerClass}`}
          >
            <div className={`w-6 h-9 sm:w-7 sm:h-11 rounded-sm border [background-size:6px_6px] opacity-60 ${themeObj.innerClass}`} />
          </div>
        ))}
        {count > 0 && (
          <span className="ml-2 bg-black/70 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
            {count}
          </span>
        )}
      </div>
    </div>
  );
};
