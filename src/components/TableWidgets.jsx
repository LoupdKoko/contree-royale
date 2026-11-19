import React from 'react';
import { Bot, Crown, Users, GraduationCap, WifiOff } from 'lucide-react';
import {
  SUITS,
  SPECIAL_SUITS,
  SUIT_INFO,
  BID_VALUES,
  SEATS,
  SEAT_NAMES,
  RANK_LABELS,
  TRUMP_RANKS_DESC,
  TRUMP_POINTS
} from '../engine/constants';
import { getTeam } from '../engine/rules';
import { soundEngine } from '../audio/SoundEngine';

export const PlayerAvatarBadge = ({ seat, player, isTurn, isDealer, isTaker, bubble, relationLabel }) => {
  if (!player) return null;

  return (
    <div className="relative flex flex-col items-center">
      {bubble && (
        <div
          key={bubble.id}
          className={`
            absolute -top-9 z-40 px-3 py-1 rounded-full text-xs font-black shadow-lg whitespace-nowrap border anim-bubble-pop flex items-center gap-1
            ${bubble.type === 'pass' ? 'bg-stone-800 text-stone-300 border-stone-600' : ''}
            ${bubble.type === 'bid' ? 'bg-white text-stone-950 border-amber-400' : ''}
            ${bubble.type === 'coinche' || bubble.type === 'surcoinche' ? 'bg-red-600 text-white border-amber-300' : ''}
            ${bubble.type === 'belote' ? 'bg-amber-400 text-stone-950 border-white' : ''}
            ${bubble.type === 'declaration' ? 'bg-indigo-600 text-white border-amber-300' : ''}
            ${bubble.type === 'chat' || bubble.type === 'info' ? 'bg-emerald-950 text-emerald-200 border-emerald-400' : ''}
          `}
        >
          {bubble.type === 'bid' && bubble.suit ? (
            <>
              <span className="text-stone-950 font-black">
                {bubble.value === 250 ? 'CAPOT' : bubble.value || bubble.text.replace(/[♠♥♦♣]/g, '').trim()}
              </span>
              <span className={`${SUIT_INFO[bubble.suit]?.color || 'text-stone-900'} text-sm font-black leading-none`}>
                {SUIT_INFO[bubble.suit]?.symbol || bubble.suit}
              </span>
            </>
          ) : (
            <span>{bubble.text}</span>
          )}
        </div>
      )}

      <div
        className={`
          flex items-center gap-2 px-3 py-1 rounded-2xl border-2 transition-all duration-300 shadow-lg
          ${isTurn 
            ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 border-white ring-4 ring-amber-400/50 scale-105' 
            : 'bg-stone-900/90 text-white border-stone-700'}
        `}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${isTurn ? 'bg-stone-950 text-amber-400' : 'bg-emerald-800 text-emerald-200'}`}>
          {player.isTempBot ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-300" title="Joueur déconnecté (Bot en relais)" />
          ) : player.isBot ? (
            <Bot className="w-3.5 h-3.5" />
          ) : (
            SEAT_NAMES[seat][0]
          )}
        </div>

        <div className="text-left leading-tight">
          <div className="font-extrabold text-xs flex items-center gap-1">
            {player.name}
            {player.isTempBot && (
              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-1 rounded">
                Relais Bot
              </span>
            )}
            {isTaker && <Crown className="w-3.5 h-3.5 text-amber-300 fill-amber-300" title="Preneur du contrat" />}
          </div>
          <div className={`text-[10px] font-semibold ${isTurn ? 'text-stone-800' : 'text-stone-400'}`}>
            {SEAT_NAMES[seat]} • {relationLabel}
          </div>
        </div>

        {isDealer && (
          <span className="w-4 h-4 rounded-full bg-amber-300 text-stone-950 font-black text-[9px] flex items-center justify-center shadow" title="Donneur">
            D
          </span>
        )}
      </div>
    </div>
  );
};

// Widget d'aide à l'entraînement (UNIQUEMENT en mode Solo LOCAL) : Indicateur d'atouts restants
export const TrumpTrackerWidget = ({ gameState, mySeat }) => {
  const trumpSuit = gameState.trumpSuit;
  if (!trumpSuit || !SUITS.includes(trumpSuit)) return null;

  const suitInfo = SUIT_INFO[trumpSuit];
  const myHand = gameState.hands?.[mySeat] || [];
  const myHandIds = new Set(myHand.map((c) => c.id));
  const playedList = [
    ...(gameState.playedCardsHistory || []),
    ...(gameState.currentTrick || [])
  ];
  const playedIds = new Set(playedList.map((p) => p.card.id));

  const trumpCardsStatus = TRUMP_RANKS_DESC.map((rank) => {
    const id = `${rank}${trumpSuit}`;
    const isPlayed = playedIds.has(id);
    const isInMyHand = myHandIds.has(id);
    return {
      rank,
      label: RANK_LABELS[rank],
      points: TRUMP_POINTS[rank],
      status: isPlayed ? 'PLAYED' : isInMyHand ? 'IN_HAND' : 'EXTERNAL'
    };
  });
  const externalRemainingCount = trumpCardsStatus.filter((c) => c.status === 'EXTERNAL').length;

  return (
    <div className="bg-stone-950/90 backdrop-blur-md border border-sky-400/50 rounded-2xl px-3 py-2 shadow-xl flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 flex items-center gap-1">
          <GraduationCap className="w-3.5 h-3.5 text-sky-400" /> Entraînement : Atouts ({suitInfo.symbol})
        </span>
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-400/30">
          Dehors : {externalRemainingCount}
        </span>
      </div>

      <div className="grid grid-cols-8 gap-1">
        {trumpCardsStatus.map((item) => {
          let boxStyle = '';
          let titleText = '';
          if (item.status === 'PLAYED') {
            boxStyle = 'bg-stone-900/60 text-stone-600 border-stone-800 line-through opacity-50';
            titleText = `${item.label}${suitInfo.symbol} (${item.points} pts) : Déjà tombé`;
          } else if (item.status === 'IN_HAND') {
            boxStyle = 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60';
            titleText = `${item.label}${suitInfo.symbol} (${item.points} pts) : Dans votre main`;
          } else {
            boxStyle = 'bg-amber-500/25 text-amber-300 border-amber-400 font-black animate-pulse';
            titleText = `${item.label}${suitInfo.symbol} (${item.points} pts) : Encore en jeu chez les autres joueurs !`;
          }

          return (
            <div
              key={item.rank}
              title={titleText}
              className={`px-1 py-0.5 rounded border text-center text-[10px] font-bold flex flex-col items-center leading-tight ${boxStyle}`}
            >
              <span>{item.label}</span>
              <span className="text-[8px] opacity-80">{item.points}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[9px] text-stone-400 px-0.5">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> En jeu ({externalRemainingCount})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> En main
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-stone-600 inline-block" /> Tombé
        </span>
      </div>
    </div>
  );
};

export const BiddingCenterPanel = ({ gameState, isMyTurn, mySeat, selectedBidValue, setSelectedBidValue, onBidAction }) => {
  const highestBid = gameState.highestBid;
  const minVal = highestBid ? highestBid.value + 10 : 80;
  const canCoinche = highestBid && getTeam(highestBid.seat) !== getTeam(mySeat) && gameState.coincheStatus === 1;
  const canSurcoinche = highestBid && getTeam(highestBid.seat) === getTeam(mySeat) && gameState.coincheStatus === 2;
  const isCoincheVariant = gameState.gameVariant === 'COINCHE';
  const availableBidSuits = isCoincheVariant ? [...SUITS, ...SPECIAL_SUITS] : SUITS;

  const lastBidBySeat = {};
  (gameState.bids || []).forEach((b) => {
    lastBidBySeat[b.seat] = b;
  });

  return (
    <div className="bg-stone-900/95 backdrop-blur-md border-2 border-amber-500/60 rounded-2xl p-3 sm:p-4 max-w-md w-full shadow-[0_12px_35px_rgba(0,0,0,0.85)] text-white z-30">
      <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block leading-none">
            {isCoincheVariant ? 'Enchères de la Coinche (TA/SA)' : 'Enchères de la Contrée'}
          </span>
          <div className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
            {isMyTurn ? "C'est à vous d'annoncer !" : `Au tour de ${gameState.seats[gameState.currentTurn]?.name}...`}
          </div>
        </div>

        {highestBid ? (
          <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-700 px-2.5 py-1 rounded-xl">
            <span className="text-[10px] text-stone-400">Contrat :</span>
            <span className="px-2 py-0.5 rounded font-black text-xs bg-white text-stone-950 flex items-center gap-1">
              <span>{highestBid.value === 250 ? 'CAPOT' : highestBid.value}</span>
              <span className={`${SUIT_INFO[highestBid.suit]?.color || 'text-stone-900'} text-sm font-black leading-none`}>
                {SUIT_INFO[highestBid.suit]?.symbol}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-[11px] font-semibold text-stone-400 bg-stone-950 px-2.5 py-1 rounded-xl">
            Aucune annonce
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-2.5 bg-stone-950/90 p-1.5 rounded-xl border border-stone-800">
        {SEATS.map((s) => {
          const b = lastBidBySeat[s];
          const isHighest = highestBid && highestBid.seat === s;
          const isTurnNow = gameState.currentTurn === s;
          return (
            <div
              key={s}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-lg border transition-all ${
                isHighest
                  ? 'bg-amber-500/20 border-amber-400'
                  : isTurnNow
                  ? 'bg-stone-800/90 border-amber-500/50'
                  : 'bg-stone-900/60 border-stone-800'
              }`}
            >
              <span
                className="text-[9px] font-bold text-stone-400 truncate max-w-full leading-tight"
                title={gameState.seats[s]?.name}
              >
                {SEAT_NAMES[s]} • {gameState.seats[s]?.name}
              </span>
              <div className="mt-0.5 h-5 flex items-center justify-center">
                {!b ? (
                  <span className="text-[10px] font-bold text-stone-600">—</span>
                ) : b.type === 'PASS' ? (
                  <span className="text-[10px] font-extrabold text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded">
                    Passe
                  </span>
                ) : b.type === 'COINCHE' ? (
                  <span className="text-[10px] font-black text-white bg-red-600 px-1.5 py-0.5 rounded">
                    Contré
                  </span>
                ) : b.type === 'SURCOINCHE' ? (
                  <span className="text-[10px] font-black text-white bg-amber-600 px-1.5 py-0.5 rounded">
                    Surcontré
                  </span>
                ) : (
                  <div className="bg-white px-2 py-0.5 rounded flex items-center gap-0.5 shadow-sm border border-amber-300">
                    <span className="font-black text-[11px] text-stone-950 leading-none">
                      {b.value === 250 ? 'CAP' : b.value}
                    </span>
                    <span className={`text-xs font-black leading-none ${SUIT_INFO[b.suit]?.color || 'text-stone-900'}`}>
                      {SUIT_INFO[b.suit]?.symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isMyTurn ? (
        <div className="space-y-2">
          {gameState.coincheStatus === 1 && minVal <= 250 && (
            <>
              <div className="grid grid-cols-5 gap-1">
                {BID_VALUES.map((val) => {
                  const disabled = val < minVal;
                  const active = selectedBidValue === val;
                  return (
                    <button
                      key={val}
                      disabled={disabled}
                      onClick={() => { soundEngine.playClick(); setSelectedBidValue(val); }}
                      className={`
                        py-1 rounded-lg font-black text-xs transition cursor-pointer
                        ${disabled ? 'bg-stone-950 text-stone-700 cursor-not-allowed' : ''}
                        ${!disabled && active ? 'bg-amber-400 text-stone-950 ring-2 ring-white shadow' : ''}
                        ${!disabled && !active ? 'bg-stone-800 hover:bg-stone-700 text-stone-200' : ''}
                      `}
                    >
                      {val === 250 ? 'CAPOT' : val}
                    </button>
                  );
                })}
              </div>

              <div className={`grid ${isCoincheVariant ? 'grid-cols-6' : 'grid-cols-4'} gap-1.5`}>
                {availableBidSuits.map((suitKey) => {
                  const info = SUIT_INFO[suitKey];
                  const isSpecial = suitKey === 'TA' || suitKey === 'SA';
                  return (
                    <button
                      key={suitKey}
                      onClick={() => onBidAction({ type: 'BID', value: selectedBidValue, suit: suitKey })}
                      title={info.name}
                      className={`
                        py-1.5 px-1.5 rounded-xl font-black text-xs flex flex-col items-center justify-center
                        bg-white hover:bg-amber-50 border-2 border-stone-200 hover:border-amber-400 shadow transition transform active:scale-95 cursor-pointer
                        ${info.color}
                      `}
                    >
                      <span className={`${isSpecial ? 'text-sm font-black tracking-tighter' : 'text-xl'} leading-none`}>
                        {info.symbol}
                      </span>
                      <span className="text-[10px] font-extrabold text-stone-800 mt-0.5">
                        {selectedBidValue === 250 ? 'Capot' : selectedBidValue}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => onBidAction({ type: 'PASS' })}
              className="flex-1 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-black text-xs border border-stone-600 transition cursor-pointer"
            >
              Passer
            </button>

            {canCoinche && (
              <button
                onClick={() => onBidAction({ type: 'COINCHE' })}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-xs shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                CONTRER (x2) ⚡
              </button>
            )}

            {canSurcoinche && (
              <button
                onClick={() => onBidAction({ type: 'SURCOINCHE' })}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 text-white font-black text-xs shadow-lg transition cursor-pointer"
              >
                SURCONTRER (x4) 🔥
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-stone-300 text-xs flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Réflexion de {gameState.seats[gameState.currentTurn]?.name}...</span>
        </div>
      )}
    </div>
  );
};

export const LobbySeatCard = ({ seat, team, teamColor, occupant, isMe, onClaim }) => {
  return (
    <div className={`bg-stone-950/90 border-2 rounded-2xl p-3.5 text-center flex flex-col items-center shadow-lg ${isMe ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-stone-800'}`}>
      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border mb-1.5 ${teamColor}`}>
        {SEAT_NAMES[seat]} • {team}
      </span>
      <div className="font-black text-sm sm:text-base text-white flex items-center justify-center gap-1.5 my-1 leading-tight">
        {occupant.isBot ? <Bot className="w-4 h-4 text-stone-400 shrink-0" /> : <Users className="w-4 h-4 text-amber-400 shrink-0" />}
        <span>{occupant.name}</span>
      </div>
      {isMe ? (
        <span className="mt-2 text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg">
          Votre place
        </span>
      ) : occupant.isBot ? (
        <button
          onClick={onClaim}
          className="mt-2 w-full py-1.5 px-3 rounded-xl bg-stone-800 hover:bg-emerald-600 text-xs font-bold text-white transition cursor-pointer"
        >
          {occupant.isTempBot ? 'Reprendre cette place' : 'Prendre cette place'}
        </button>
      ) : (
        <span className="mt-2 text-xs font-semibold text-emerald-400">Occupé par un ami</span>
      )}
    </div>
  );
};
