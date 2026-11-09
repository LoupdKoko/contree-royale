import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Trophy, Users, Play, Copy, Check, MessageSquare, History, 
  Award, ShieldAlert, Sparkles, RotateCcw, 
  UserPlus, Bot, Crown, HelpCircle, ChevronRight, LogOut, Flame, Wifi, Download, Monitor,
  Settings, Volume2, VolumeX, Maximize, Minimize, Sliders
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } from 'firebase/firestore';

// ==========================================
// 1. CONFIGURATION SYNCHRONISATION TEMPS RÉEL
// ==========================================
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const rawAppId = typeof __app_id !== 'undefined' && __app_id ? __app_id : 'contree-royale-p2p';
const SHARED_APP_IDS = Array.from(new Set([rawAppId, 'contree-royale-p2p', 'default-app-id']));

let app = null;
let auth = null;
let db = null;

if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.warn('Initialisation Firebase ignorée:', e);
  }
}

// ==========================================
// 1bis. MOTEUR AUDIO SYNTHÉTIQUE (WEB AUDIO API)
// ==========================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.settings = {
      muted: false,
      master: 80,
      cards: 85,
      announces: 90,
      ui: 75
    };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  getContext() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  getGain(category) {
    if (this.settings.muted) return 0;
    const master = (this.settings.master ?? 80) / 100;
    const cat = (this.settings[category] ?? 80) / 100;
    return master * cat;
  }

  // Son de clic d'interface
  playClick() {
    const vol = this.getGain('ui');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  // Son de pose de carte sur le tapis feutré
  playCardSlap() {
    const vol = this.getGain('cards');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;

    // Bruit blanc filtré (frottement carte sur feutrine)
    const bufferSize = ctx.sampleRate * 0.075;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.32));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, ctx.currentTime);
    filter.Q.setValueAtTime(1.2, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.075);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  }

  // Son de ramassage du pli
  playTrickSweep() {
    const vol = this.getGain('cards');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.22 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  // Son d'annonce / enchère
  playBidSound(type = 'BID') {
    const vol = this.getGain('announces');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (type === 'PASS') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
      g.gain.setValueAtTime(0.16 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'COINCHE' || type === 'SURCOINCHE') {
      [440, 554.37, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.055);
        g.gain.setValueAtTime(0.18 * vol, now + idx * 0.055);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.18);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.055);
        osc.stop(now + idx * 0.055 + 0.19);
      });
    } else {
      // Annonce normale ou Belote
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        g.gain.setValueAtTime(0.22 * vol, now + idx * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.12);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.13);
      });
    }
  }

  // Fanfare fin de manche
  playRoundEnd(success = true) {
    const vol = this.getGain('announces');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = success ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      g.gain.setValueAtTime(0.24 * vol, now + idx * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.24);
    });
  }
}

const soundEngine = new SoundEngine();

// ==========================================
// 2. CONSTANTES & RÈGLES DE LA CONTRÉE
// ==========================================
const SUITS = ['H', 'C', 'D', 'S']; // Cœur, Trèfle, Carreau, Pique
const SUIT_INFO = {
  'S': { name: 'Pique', symbol: '♠', color: 'text-slate-900', bg: 'bg-slate-100', border: 'border-slate-300', badgeBg: 'bg-slate-800 text-white' },
  'H': { name: 'Cœur', symbol: '♥', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badgeBg: 'bg-red-600 text-white' },
  'D': { name: 'Carreau', symbol: '♦', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badgeBg: 'bg-red-600 text-white' },
  'C': { name: 'Trèfle', symbol: '♣', color: 'text-slate-900', bg: 'bg-slate-100', border: 'border-slate-300', badgeBg: 'bg-slate-800 text-white' }
};

const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_LABELS = {
  '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'V', 'Q': 'D', 'K': 'R', 'A': 'A'
};

// Ordre de force (index 0 = plus faible, index 7 = plus fort)
const NON_TRUMP_POWER = { '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7 };
const TRUMP_POWER     = { '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7 };

// Valeur en points des cartes
const NON_TRUMP_POINTS = { '7': 0, '8': 0, '9': 0, 'J': 2, 'Q': 3, 'K': 4, '10': 10, 'A': 11 };
const TRUMP_POINTS     = { '7': 0, '8': 0, 'Q': 3, 'K': 4, '10': 10, 'A': 11, '9': 14, 'J': 20 };

const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160, 250]; // 250 = Capot
const SEATS = ['S', 'W', 'N', 'E']; // Sens de jeu (horaire : Sud -> Ouest -> Nord -> Est)
const SEAT_NAMES = { 'S': 'Sud', 'W': 'Ouest', 'N': 'Nord', 'E': 'Est' };

const BOT_DIFFICULTIES = {
  BEGINNER: {
    id: 'BEGINNER',
    label: 'Débutant',
    shortDesc: 'Idéal pour découvrir la Contrée en douceur',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-400/40'
  },
  INTERMEDIATE: {
    id: 'INTERMEDIATE',
    label: 'Confirmé',
    shortDesc: 'Niveau intermédiaire équilibré et réaliste',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/40'
  },
  PRO: {
    id: 'PRO',
    label: 'Professionnel',
    shortDesc: 'Comptage des 32 cartes, appels et mémoire totale',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-400/40'
  }
};

const QUICK_CHATS = [
  "Bien joué ! 👏",
  "Merci partenaire ! 🤝",
  "Aïe aïe aïe... 😬",
  "Oups, pardon ! 😅",
  "À toi de jouer ! ⏳",
  "Belle annonce ! 🔥",
  "On les tient ! 💪",
  "Bien tenté ! 😉"
];

const BOT_NAMES = {
  'S': 'Marius (Bot)',
  'W': 'Fanny (Bot)',
  'N': 'César (Bot)',
  'E': 'Honoré (Bot)'
};

// ==========================================
// 3. FONCTIONS UTILITAIRES & MOTEUR DE JEU
// ==========================================

function getTeam(seat) {
  return (seat === 'S' || seat === 'N') ? 'NS' : 'EW';
}

function getPartner(seat) {
  const map = { 'S': 'N', 'N': 'S', 'E': 'W', 'W': 'E' };
  return map[seat];
}

function getNextSeat(seat) {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

function getCardPoints(card, trumpSuit) {
  return card.suit === trumpSuit ? TRUMP_POINTS[card.rank] : NON_TRUMP_POINTS[card.rank];
}

function getCardPower(card, trumpSuit) {
  return card.suit === trumpSuit ? TRUMP_POWER[card.rank] : NON_TRUMP_POWER[card.rank];
}

// Tri des cartes en main : Atouts tout à gauche, et ordre décroissant (plus forte à gauche, plus faible à droite)
function sortHand(cards, trumpSuit = null) {
  return [...cards].sort((a, b) => {
    if (trumpSuit) {
      const aIsTrump = a.suit === trumpSuit;
      const bIsTrump = b.suit === trumpSuit;
      if (aIsTrump && !bIsTrump) return -1;
      if (!aIsTrump && bIsTrump) return 1;
    }
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    const powerA = a.suit === trumpSuit ? TRUMP_POWER[a.rank] : NON_TRUMP_POWER[a.rank];
    const powerB = b.suit === trumpSuit ? TRUMP_POWER[b.rank] : NON_TRUMP_POWER[b.rank];
    return powerB - powerA;
  });
}

// Générateur de nombres aléatoires cryptographique (CSPRNG) sans biais
function cryptoRandomInt(maxExclusive) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    const maxUint = 0xffffffff;
    const limit = maxUint - (maxUint % maxExclusive);
    let rand;
    do {
      window.crypto.getRandomValues(array);
      rand = array[0];
    } while (rand >= limit);
    return rand % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

// Création, brassage cryptographique et distribution réaliste (3 + 2 + 3 cartes)
function createAndDealDeck(dealerSeat = 'E') {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}`, rank, suit });
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  const cutIndex = 8 + cryptoRandomInt(17);
  const cutDeck = [...deck.slice(cutIndex), ...deck.slice(0, cutIndex)];

  const hands = { S: [], W: [], N: [], E: [] };
  const dealOrder = [];
  let cur = getNextSeat(dealerSeat);
  for (let i = 0; i < 4; i++) {
    dealOrder.push(cur);
    cur = getNextSeat(cur);
  }

  let cardIdx = 0;
  const pattern = [3, 2, 3];
  for (const count of pattern) {
    for (const seat of dealOrder) {
      for (let c = 0; c < count; c++) {
        hands[seat].push(cutDeck[cardIdx++]);
      }
    }
  }

  return {
    S: sortHand(hands.S),
    W: sortHand(hands.W),
    N: sortHand(hands.N),
    E: sortHand(hands.E)
  };
}

// Détermine quelle carte remporte le pli en cours
function getTrickWinner(trick, trumpSuit) {
  if (!trick || trick.length === 0) return null;
  const leadSuit = trick[0].card.suit;
  let bestPlay = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const current = trick[i];
    const bestIsTrump = bestPlay.card.suit === trumpSuit;
    const currIsTrump = current.card.suit === trumpSuit;

    if (currIsTrump && !bestIsTrump) {
      bestPlay = current;
    } else if (currIsTrump && bestIsTrump) {
      if (TRUMP_POWER[current.card.rank] > TRUMP_POWER[bestPlay.card.rank]) {
        bestPlay = current;
      }
    } else if (!currIsTrump && !bestIsTrump && current.card.suit === leadSuit) {
      if (NON_TRUMP_POWER[current.card.rank] > NON_TRUMP_POWER[bestPlay.card.rank]) {
        bestPlay = current;
      }
    }
  }
  return bestPlay;
}

// Validation stricte des règles de pose de la Belote Contrée
function getPlayableCardIds(hand, currentTrick, trumpSuit, mySeat) {
  if (!hand || hand.length === 0) return [];
  if (!currentTrick || currentTrick.length === 0) {
    return hand.map(c => c.id);
  }

  const leadSuit = currentTrick[0].card.suit;
  const sameSuitCards = hand.filter(c => c.suit === leadSuit);
  const trumpsInHand = hand.filter(c => c.suit === trumpSuit);

  // CAS 1 : On possède la couleur demandée (obligation de fournir)
  if (sameSuitCards.length > 0) {
    if (leadSuit === trumpSuit) {
      const trumpsInTrick = currentTrick.filter(t => t.card.suit === trumpSuit);
      const maxTrumpPower = Math.max(...trumpsInTrick.map(t => TRUMP_POWER[t.card.rank]));
      const higherTrumps = sameSuitCards.filter(c => TRUMP_POWER[c.rank] > maxTrumpPower);
      if (higherTrumps.length > 0) {
        return higherTrumps.map(c => c.id);
      }
    }
    return sameSuitCards.map(c => c.id);
  }

  // CAS 2 : On n'a pas la couleur demandée
  if (trumpsInHand.length === 0) {
    return hand.map(c => c.id);
  }

  const currentWinner = getTrickWinner(currentTrick, trumpSuit);
  const partnerSeat = getPartner(mySeat);

  if (currentWinner.seat === partnerSeat) {
    const trumpsInTrick = currentTrick.filter(t => t.card.suit === trumpSuit);
    if (trumpsInTrick.length > 0) {
      const maxTrumpPower = Math.max(...trumpsInTrick.map(t => TRUMP_POWER[t.card.rank]));
      const higherTrumps = trumpsInHand.filter(c => TRUMP_POWER[c.rank] > maxTrumpPower);
      const nonTrumps = hand.filter(c => c.suit !== trumpSuit);
      if (higherTrumps.length > 0) {
        return [...nonTrumps, ...higherTrumps].map(c => c.id);
      }
    }
    return hand.map(c => c.id);
  }

  // L'adversaire est maître du pli : OBLIGATION DE COUPER (et de surcouper si possible)
  const trumpsInTrick = currentTrick.filter(t => t.card.suit === trumpSuit);
  if (trumpsInTrick.length > 0) {
    const maxTrumpPower = Math.max(...trumpsInTrick.map(t => TRUMP_POWER[t.card.rank]));
    const higherTrumps = trumpsInHand.filter(c => TRUMP_POWER[c.rank] > maxTrumpPower);
    if (higherTrumps.length > 0) {
      return higherTrumps.map(c => c.id);
    }
    return trumpsInHand.map(c => c.id);
  }

  return trumpsInHand.map(c => c.id);
}

// ==========================================
// 4. INTELLIGENCE ARTIFICIELLE (DÉBUTANT, CONFIRMÉ, PRO)
// ==========================================

function evaluateSuitForBid(hand, suit) {
  let score = 0;
  const trumps = hand.filter(c => c.suit === suit);
  const hasJ = trumps.some(c => c.rank === 'J');
  const has9 = trumps.some(c => c.rank === '9');
  const hasA = trumps.some(c => c.rank === 'A');
  const has10 = trumps.some(c => c.rank === '10');
  const hasK = trumps.some(c => c.rank === 'K');
  const hasQ = trumps.some(c => c.rank === 'Q');

  if (hasJ && has9) score += 62;
  else if (hasJ) score += 34;
  else if (has9 && trumps.length >= 3) score += 26;
  else if (has9 && trumps.length === 2) score += 14;

  if (hasA) score += 12;
  if (has10) score += 10;
  if (hasK && hasQ) score += 20;

  if (trumps.length === 4) score += 15;
  else if (trumps.length === 5) score += 30;
  else if (trumps.length >= 6) score += 45;

  SUITS.filter(s => s !== suit).forEach(sideSuit => {
    const sideCards = hand.filter(c => c.suit === sideSuit);
    const sHasA = sideCards.some(c => c.rank === 'A');
    const sHas10 = sideCards.some(c => c.rank === '10');
    const sHasK = sideCards.some(c => c.rank === 'K');

    if (sHasA) {
      score += 14;
      if (sHas10) score += 11;
      else if (sHasK) score += 4;
    } else if (sHas10 && sideCards.length >= 2) {
      score += 5;
    }

    if (trumps.length >= 3) {
      if (sideCards.length === 0) score += 15;
      else if (sideCards.length === 1 && !sHasA) score += 8;
    }
  });

  return score;
}

// --- NIVEAU DÉBUTANT : Enchères prudentes et simples ---
function decideBotBidBeginner(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const highestBid = gameState.highestBid;

  if (gameState.coincheStatus > 1) return { type: 'PASS' };

  let bestSuit = 'H';
  let maxScore = 0;
  for (const s of SUITS) {
    const sc = evaluateSuitForBid(hand, s);
    if (sc > maxScore) {
      maxScore = sc;
      bestSuit = s;
    }
  }

  let maxBidAllowed = 0;
  if (maxScore >= 98) maxBidAllowed = 100;
  else if (maxScore >= 76) maxBidAllowed = 90;
  else if (maxScore >= 58) maxBidAllowed = 80;

  const minNextBid = highestBid ? highestBid.value + 10 : 80;
  if (maxBidAllowed >= minNextBid && minNextBid <= 100) {
    return { type: 'BID', value: minNextBid, suit: bestSuit };
  }
  return { type: 'PASS' };
}

// --- NIVEAU CONFIRMÉ : Enchères intermédiaires ---
function decideBotBidIntermediate(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const highestBid = gameState.highestBid;
  const partnerSeat = getPartner(botSeat);
  const myTeam = getTeam(botSeat);

  if (gameState.coincheStatus > 1) return { type: 'PASS' };

  // Contre uniquement si l'adversaire monte très haut (>= 130) et qu'on a Valet + 9 d'atout
  if (highestBid && getTeam(highestBid.seat) !== myTeam && highestBid.value >= 130) {
    const myTrumps = hand.filter(c => c.suit === highestBid.suit);
    if (myTrumps.some(c => c.rank === 'J') && myTrumps.some(c => c.rank === '9')) {
      return { type: 'COINCHE' };
    }
  }

  let bestSuit = 'H';
  let maxScore = 0;
  for (const s of SUITS) {
    const sc = evaluateSuitForBid(hand, s);
    if (sc > maxScore) {
      maxScore = sc;
      bestSuit = s;
    }
  }

  let maxBidAllowed = 0;
  if (maxScore >= 120) maxBidAllowed = 130;
  else if (maxScore >= 104) maxBidAllowed = 120;
  else if (maxScore >= 90) maxBidAllowed = 110;
  else if (maxScore >= 76) maxBidAllowed = 100;
  else if (maxScore >= 64) maxBidAllowed = 90;
  else if (maxScore >= 52) maxBidAllowed = 80;

  const minNextBid = highestBid ? highestBid.value + 10 : 80;
  if (highestBid && highestBid.seat === partnerSeat && maxBidAllowed <= highestBid.value + 10) {
    return { type: 'PASS' };
  }
  if (maxBidAllowed >= minNextBid && minNextBid <= 130) {
    return { type: 'BID', value: minNextBid, suit: bestSuit };
  }
  return { type: 'PASS' };
}

// --- NIVEAU PROFESSIONNEL (100% IDENTIQUE À L'ORIGINAL) ---
function decideBotBidPro(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const highestBid = gameState.highestBid;
  const partnerSeat = getPartner(botSeat);
  const myTeam = getTeam(botSeat);

  if (gameState.coincheStatus > 1) {
    if (
      gameState.coincheStatus === 2 &&
      highestBid &&
      getTeam(highestBid.seat) === myTeam
    ) {
      const myScoreInContract = evaluateSuitForBid(hand, highestBid.suit);
      if (myScoreInContract >= 125) {
        return { type: 'SURCOINCHE' };
      }
    }
    return { type: 'PASS' };
  }

  const partnerBids = (gameState.bids || []).filter(b => b.seat === partnerSeat && b.type === 'BID');
  const lastPartnerBid = partnerBids.length > 0 ? partnerBids[partnerBids.length - 1] : null;

  if (highestBid && getTeam(highestBid.seat) !== myTeam) {
    const oppSuit = highestBid.suit;
    const myTrumps = hand.filter(c => c.suit === oppSuit);
    const hasJ = myTrumps.some(c => c.rank === 'J');
    const has9 = myTrumps.some(c => c.rank === '9');
    const hasK = myTrumps.some(c => c.rank === 'K');
    const hasQ = myTrumps.some(c => c.rank === 'Q');
    const hasBelote = hasK && hasQ;
    const outsideAces = hand.filter(c => c.suit !== oppSuit && c.rank === 'A').length;

    let defenseStrength = 0;
    if (hasJ && has9) defenseStrength += 55;
    else if (hasJ && myTrumps.length >= 2) defenseStrength += 32;
    else if (has9 && myTrumps.length >= 3) defenseStrength += 28;
    if (myTrumps.length >= 4) defenseStrength += 25;
    if (hasBelote) defenseStrength += 20;
    defenseStrength += outsideAces * 14;
    if (lastPartnerBid) defenseStrength += 18;

    if (
      (highestBid.value >= 90 && defenseStrength >= 68) ||
      (highestBid.value >= 110 && defenseStrength >= 50) ||
      (highestBid.value >= 130 && defenseStrength >= 36)
    ) {
      return { type: 'COINCHE' };
    }
  }

  let bestSuit = 'H';
  let maxScore = 0;
  for (const s of SUITS) {
    const sc = evaluateSuitForBid(hand, s);
    if (sc > maxScore) {
      maxScore = sc;
      bestSuit = s;
    }
  }

  if (lastPartnerBid) {
    const pSuit = lastPartnerBid.suit;
    const trumpsForP = hand.filter(c => c.suit === pSuit);
    const hasJ = trumpsForP.some(c => c.rank === 'J');
    const has9 = trumpsForP.some(c => c.rank === '9');
    const hasA = trumpsForP.some(c => c.rank === 'A');
    const hasBelote = trumpsForP.some(c => c.rank === 'K') && trumpsForP.some(c => c.rank === 'Q');

    let supportPts = 0;
    if (hasJ) supportPts += 25;
    if (has9) supportPts += 15;
    if (hasA) supportPts += 10;
    if (hasBelote) supportPts += 20;
    if (trumpsForP.length >= 3) supportPts += 10;

    SUITS.filter(s => s !== pSuit).forEach(s => {
      const sCards = hand.filter(c => c.suit === s);
      if (sCards.some(c => c.rank === 'A')) {
        supportPts += 12;
        if (sCards.some(c => c.rank === '10')) supportPts += 10;
      }
    });

    const estimatedTeamTotal = lastPartnerBid.value + Math.floor(supportPts / 12) * 10;
    const cappedSupport = Math.min(160, estimatedTeamTotal);
    const minRequired = highestBid ? highestBid.value + 10 : 80;

    if (highestBid && highestBid.seat === partnerSeat) {
      if (supportPts >= 35 && highestBid.value < 120 && cappedSupport >= minRequired) {
        return { type: 'BID', value: Math.min(130, cappedSupport), suit: pSuit };
      }
    } else if (cappedSupport >= minRequired && supportPts >= 22) {
      return { type: 'BID', value: minRequired, suit: pSuit };
    }
  }

  let maxBidAllowed = 0;
  if (maxScore >= 132) maxBidAllowed = 150;
  else if (maxScore >= 120) maxBidAllowed = 140;
  else if (maxScore >= 108) maxBidAllowed = 130;
  else if (maxScore >= 96) maxBidAllowed = 120;
  else if (maxScore >= 84) maxBidAllowed = 110;
  else if (maxScore >= 72) maxBidAllowed = 100;
  else if (maxScore >= 62) maxBidAllowed = 90;
  else if (maxScore >= 50) maxBidAllowed = 80;

  const minNextBid = highestBid ? highestBid.value + 10 : 80;

  if (highestBid && highestBid.seat === partnerSeat && maxBidAllowed <= highestBid.value + 10) {
    return { type: 'PASS' };
  }

  if (maxBidAllowed >= minNextBid && minNextBid <= 160) {
    return { type: 'BID', value: minNextBid, suit: bestSuit };
  }

  return { type: 'PASS' };
}

function decideBotBid(gameState, botSeat) {
  const diff = gameState.botDifficulty || 'PRO';
  if (diff === 'BEGINNER') return decideBotBidBeginner(gameState, botSeat);
  if (diff === 'INTERMEDIATE') return decideBotBidIntermediate(gameState, botSeat);
  return decideBotBidPro(gameState, botSeat);
}

function buildBotMemory(gameState, botSeat) {
  const trump = gameState.trumpSuit;
  const hand = gameState.hands[botSeat] || [];
  const playedList = [
    ...(gameState.playedCardsHistory || []),
    ...(gameState.currentTrick || [])
  ];
  const playedIds = new Set(playedList.map(p => p.card.id));
  const myHandIds = new Set(hand.map(c => c.id));

  const voidInSuit = {
    S: { H: false, C: false, D: false, S: false },
    W: { H: false, C: false, D: false, S: false },
    N: { H: false, C: false, D: false, S: false },
    E: { H: false, C: false, D: false, S: false }
  };

  if (gameState.voidMatrix) {
    SEATS.forEach(s => {
      SUITS.forEach(suit => {
        if (gameState.voidMatrix[s]?.[suit]) voidInSuit[s][suit] = true;
      });
    });
  }

  if (gameState.currentTrick && gameState.currentTrick.length > 0) {
    const leadSuit = gameState.currentTrick[0].card.suit;
    gameState.currentTrick.slice(1).forEach(play => {
      if (play.card.suit !== leadSuit) {
        voidInSuit[play.seat][leadSuit] = true;
        if (play.card.suit !== trump) {
          const currentWinner = getTrickWinner(gameState.currentTrick.slice(0, gameState.currentTrick.indexOf(play)), trump);
          if (currentWinner && getTeam(currentWinner.seat) !== getTeam(play.seat)) {
            voidInSuit[play.seat][trump] = true;
          }
        }
      }
    });
  }

  const unplayedExternals = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      const id = `${r}${s}`;
      if (!playedIds.has(id) && !myHandIds.has(id)) {
        unplayedExternals.push({ id, rank: r, suit: s });
      }
    }
  }

  const isBossCard = (card) => {
    const myPower = getCardPower(card, trump);
    return !unplayedExternals.some(
      ext => ext.suit === card.suit && getCardPower(ext, trump) > myPower
    );
  };

  const remainingExternalTrumps = unplayedExternals.filter(c => c.suit === trump);

  return {
    playedIds,
    unplayedExternals,
    remainingExternalTrumps,
    voidInSuit,
    isBossCard
  };
}

// --- JEU DE LA CARTE NIVEAU DÉBUTANT ---
function decideBotCardBeginner(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const playableIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, botSeat);
  const playableCards = hand.filter(c => playableIds.includes(c.id));
  if (playableCards.length === 1) return playableCards[0];

  const trump = gameState.trumpSuit;
  // Un bot débutant ne compte pas les cartes tombées et joue parfois une petite carte ou une carte aléatoire légale
  if (cryptoRandomInt(100) < 40) {
    return playableCards[cryptoRandomInt(playableCards.length)];
  }
  // Sinon il joue simplement sa carte la plus faible en points pour ne pas donner de gros points
  return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
}

// --- JEU DE LA CARTE NIVEAU CONFIRMÉ ---
function decideBotCardIntermediate(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const playableIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, botSeat);
  const playableCards = hand.filter(c => playableIds.includes(c.id));
  if (playableCards.length === 1) return playableCards[0];

  const trump = gameState.trumpSuit;
  const trick = gameState.currentTrick || [];
  const partnerSeat = getPartner(botSeat);

  // En ouverture : joue un As hors atout s'il en a un, sinon une petite carte
  if (trick.length === 0) {
    const sideAces = playableCards.filter(c => c.suit !== trump && c.rank === 'A');
    if (sideAces.length > 0) return sideAces[0];
    return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
  }

  const currentWinner = getTrickWinner(trick, trump);
  if (currentWinner.seat === partnerSeat) {
    // Si le partenaire est maître en dernier joueur, il met des points
    if (trick.length === 3) {
      const nonTrumpPoints = playableCards
        .filter(c => c.suit !== trump)
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (nonTrumpPoints.length > 0) return nonTrumpPoints[0];
    }
    return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
  }

  // Essaie de prendre le pli avec sa carte gagnante la plus haute
  const winningOptions = playableCards.filter(card => {
    const sim = [...trick, { seat: botSeat, card }];
    return getTrickWinner(sim, trump).seat === botSeat;
  });
  if (winningOptions.length > 0) {
    return winningOptions.sort((a, b) => getCardPower(b, trump) - getCardPower(a, trump))[0];
  }

  return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
}

// --- JEU DE LA CARTE NIVEAU PROFESSIONNEL (100% IDENTIQUE À L'ORIGINAL) ---
function decideBotCardPro(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const playableIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, botSeat);
  const playableCards = hand.filter(c => playableIds.includes(c.id));

  if (playableCards.length === 1) return playableCards[0];

  const trump = gameState.trumpSuit;
  const trick = gameState.currentTrick || [];
  const partnerSeat = getPartner(botSeat);
  const myTeam = getTeam(botSeat);
  const isAttacking = gameState.contract && gameState.contract.team === myTeam;
  const opponents = SEATS.filter(s => getTeam(s) !== myTeam);

  const mem = buildBotMemory(gameState, botSeat);
  const opponentsHaveTrumps =
    mem.remainingExternalTrumps.length > 0 &&
    opponents.some(opp => !mem.voidInSuit[opp][trump]);

  // CAS 1 : LE BOT OUVRE LE PLI
  if (trick.length === 0) {
    const myTrumps = playableCards.filter(c => c.suit === trump);
    const myNonTrumps = playableCards.filter(c => c.suit !== trump);

    if (isAttacking && myTrumps.length > 0 && opponentsHaveTrumps) {
      const bossTrumps = myTrumps
        .filter(c => mem.isBossCard(c))
        .sort((a, b) => TRUMP_POWER[b.rank] - TRUMP_POWER[a.rank]);
      if (bossTrumps.length > 0) {
        return bossTrumps[0];
      }
      if (gameState.contract.seat === partnerSeat) {
        const smallTrump = [...myTrumps].sort((a, b) => TRUMP_POINTS[a.rank] - TRUMP_POINTS[b.rank]);
        return smallTrump[0];
      }
    }

    const safeBossNonTrumps = myNonTrumps.filter(c => {
      if (!mem.isBossCard(c)) return false;
      const oppCanCut = opponentsHaveTrumps && opponents.some(opp => mem.voidInSuit[opp][c.suit]);
      return !oppCanCut;
    });
    if (safeBossNonTrumps.length > 0) {
      return safeBossNonTrumps.sort((a, b) => NON_TRUMP_POINTS[b.rank] - NON_TRUMP_POINTS[a.rank])[0];
    }

    if (!mem.voidInSuit[partnerSeat][trump] && mem.remainingExternalTrumps.length > 0) {
      const suitPartnerIsVoid = myNonTrumps.find(c => mem.voidInSuit[partnerSeat][c.suit] && c.rank !== '10' && c.rank !== 'A');
      if (suitPartnerIsVoid) return suitPartnerIsVoid;
    }

    const anyBossNonTrump = myNonTrumps
      .filter(c => mem.isBossCard(c))
      .sort((a, b) => NON_TRUMP_POINTS[b.rank] - NON_TRUMP_POINTS[a.rank]);
    if (anyBossNonTrump.length > 0) {
      return anyBossNonTrump[0];
    }

    const safeLeadCards = myNonTrumps
      .filter(c => c.rank !== '10')
      .sort((a, b) => NON_TRUMP_POINTS[a.rank] - NON_TRUMP_POINTS[b.rank]);
    if (safeLeadCards.length > 0) {
      return safeLeadCards[0];
    }

    return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
  }

  // CAS 2 : LE BOT JOUE EN 2e, 3e OU 4e POSITION
  const leadSuit = trick[0].card.suit;
  const currentWinner = getTrickWinner(trick, trump);
  const partnerIsWinning = currentWinner.seat === partnerSeat;

  let partnerCardIsGuaranteed = false;
  if (partnerIsWinning) {
    if (trick.length === 3) {
      partnerCardIsGuaranteed = true;
    } else {
      const pCard = currentWinner.card;
      const pIsBoss = mem.isBossCard(pCard);
      const nextSeat = getNextSeat(botSeat);
      const oppAfterMe = getTeam(nextSeat) !== myTeam ? nextSeat : null;
      if (oppAfterMe) {
        const oppCanCut = pCard.suit !== trump && mem.voidInSuit[oppAfterMe][leadSuit] && !mem.voidInSuit[oppAfterMe][trump];
        if (pIsBoss && !oppCanCut) {
          partnerCardIsGuaranteed = true;
        }
      }
    }
  }

  if (partnerIsWinning) {
    if (partnerCardIsGuaranteed) {
      const nonTrumpLoads = playableCards
        .filter(c => c.suit !== trump && !mem.isBossCard(c) && getCardPoints(c, trump) >= 10)
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (nonTrumpLoads.length > 0) return nonTrumpLoads[0];

      const anyHighPoints = playableCards
        .filter(c => c.suit !== trump)
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (anyHighPoints.length > 0 && getCardPoints(anyHighPoints[0], trump) >= 4) {
        return anyHighPoints[0];
      }
    }

    const nonTrumpDumps = playableCards
      .filter(c => c.suit !== trump)
      .sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump));
    if (nonTrumpDumps.length > 0) return nonTrumpDumps[0];

    return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
  }

  const winningOptions = playableCards.filter(card => {
    const sim = [...trick, { seat: botSeat, card }];
    return getTrickWinner(sim, trump).seat === botSeat;
  });

  if (winningOptions.length > 0) {
    if (trick.length === 3) {
      return winningOptions.sort((a, b) => getCardPower(a, trump) - getCardPower(b, trump))[0];
    }

    const bossWinners = winningOptions.filter(c => mem.isBossCard(c));
    if (bossWinners.length > 0) {
      return bossWinners.sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump))[0];
    }

    return winningOptions.sort((a, b) => getCardPower(a, trump) - getCardPower(b, trump))[0];
  }

  return [...playableCards].sort((a, b) => {
    const ptDiff = getCardPoints(a, trump) - getCardPoints(b, trump);
    if (ptDiff !== 0) return ptDiff;
    return getCardPower(a, trump) - getCardPower(b, trump);
  })[0];
}

function decideBotCard(gameState, botSeat) {
  const diff = gameState.botDifficulty || 'PRO';
  if (diff === 'BEGINNER') return decideBotCardBeginner(gameState, botSeat);
  if (diff === 'INTERMEDIATE') return decideBotCardIntermediate(gameState, botSeat);
  return decideBotCardPro(gameState, botSeat);
}

// ==========================================
// 5. COMPOSANTS GRAPHIQUES (CARTES & TABLE)
// ==========================================

const PlayingCard = ({ card, isPlayable = false, isDisabled = false, onClick, size = 'md', isSelected = false, showTrumpBadge = false }) => {
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

const CardBack = ({ count = 8, orientation = 'horizontal' }) => {
  return (
    <div className="flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : orientation === 'horizontal' ? '-18px' : '-20px'
            }}
            className="w-8 h-12 sm:w-10 sm:h-14 rounded-md bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 border border-amber-300/60 shadow-md flex items-center justify-center"
          >
            <div className="w-6 h-9 sm:w-7 sm:h-11 rounded-sm border border-amber-400/30 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:6px_6px] opacity-60" />
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

// ==========================================
// 6. COMPOSANT PRINCIPAL DE L'APPLICATION
// ==========================================

export default function App() {
  const [myUid, setMyUid] = useState(() => 'p2p_' + Math.random().toString(36).substring(2, 10));
  const [authReady, setAuthReady] = useState(false);
  const [pseudo, setPseudo] = useState('Joueur 1');
  const [mode, setMode] = useState('HOME'); // 'HOME' | 'LOCAL' | 'ONLINE' | 'WEBRTC_SETUP'
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [activeRoomAppId, setActiveRoomAppId] = useState(rawAppId);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [p2pStatus, setP2pStatus] = useState('IDLE');

  // Paramètres Globaux (Difficulté Bots, Audio, Plein Écran)
  const [botDifficulty, setBotDifficulty] = useState(() => {
    try {
      return localStorage.getItem('contree_bot_diff') || 'PRO';
    } catch (e) {
      return 'PRO';
    }
  });

  const [audioSettings, setAudioSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('contree_audio_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      muted: false,
      master: 80,
      cards: 85,
      announces: 90,
      ui: 75
    };
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Synchronisation avec le moteur audio et localStorage
  useEffect(() => {
    soundEngine.updateSettings(audioSettings);
    try {
      localStorage.setItem('contree_audio_settings', JSON.stringify(audioSettings));
    } catch (e) {}
  }, [audioSettings]);

  useEffect(() => {
    try {
      localStorage.setItem('contree_bot_diff', botDifficulty);
    } catch (e) {}
    if (gameStateRef.current && (mode === 'LOCAL' || gameStateRef.current.hostId === myUid)) {
      const updated = { ...gameStateRef.current, botDifficulty };
      gameStateRef.current = updated;
      setGameState(updated);
    }
  }, [botDifficulty]);

  // Force la suppression de toute marge ou bordure noire sur le body/root (notamment dans Vite par défaut)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.margin = '0';
      document.documentElement.style.padding = '0';
      document.documentElement.style.width = '100%';
      document.documentElement.style.height = '100%';
      document.documentElement.style.backgroundColor = '#022c22';

      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.backgroundColor = '#022c22';

      const rootEl = document.getElementById('root');
      if (rootEl) {
        rootEl.style.maxWidth = 'none';
        rootEl.style.width = '100vw';
        rootEl.style.height = '100vh';
        rootEl.style.margin = '0';
        rootEl.style.padding = '0';
      }

      const handleFsChange = () => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      };
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }
  }, []);

  const toggleFullscreen = async (wantFullscreen) => {
    soundEngine.playClick();
    if (typeof document === 'undefined') return;
    try {
      const targetState = typeof wantFullscreen === 'boolean' ? wantFullscreen : !document.fullscreenElement;
      if (targetState && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else if (!targetState && document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      console.warn('Plein écran non supporté dans ce contexte:', e);
    }
  };

  // États pour le Pont Direct WebRTC
  const [rtcRole, setRtcRole] = useState(null);
  const [rtcLocalToken, setRtcLocalToken] = useState('');
  const [rtcRemoteInput, setRtcRemoteInput] = useState('');
  const [rtcStep, setRtcStep] = useState(1);
  const rtcPeerRef = useRef(null);
  const rtcChannelRef = useRef(null);
  const peerJsInstanceRef = useRef(null);

  const [gameState, setGameState] = useState(null);

  const unsubscribeRef = useRef(null);
  const gameStateRef = useRef(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const ensureAuthenticated = async () => {
    if (!auth) return myUid;
    if (auth.currentUser) return auth.currentUser.uid;
    try {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        const cred = await signInWithCustomToken(auth, __initial_auth_token);
        return cred.user.uid;
      } else {
        const cred = await signInAnonymously(auth);
        return cred.user.uid;
      }
    } catch (err) {
      const cred = await signInAnonymously(auth);
      return cred.user.uid;
    }
  };

  useEffect(() => {
    if (!auth) return;
    let isMounted = true;
    ensureAuthenticated().then((uid) => {
      if (isMounted && uid) {
        setMyUid(uid);
        setAuthReady(true);
      }
    });
    const unsub = onAuthStateChanged(auth, (user) => {
      if (isMounted && user) {
        setMyUid(user.uid);
        setAuthReady(true);
      }
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const [selectedBidValue, setSelectedBidValue] = useState(80);
  const [showLastTrickModal, setShowLastTrickModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDesktopModal, setShowDesktopModal] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

  const botTimeoutRef = useRef(null);

  const buildStandaloneHtmlString = () => {
    const lines = [
      '<!DOCTYPE html>',
      '<html lang="fr">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '  <title>Contrée Royale - Édition PC</title>',
      '  <script src="https://cdn.tailwindcss.com"><' + '/script>',
      '  <script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"><' + '/script>',
      '</head>',
      '<body class="bg-emerald-950 text-white m-0 p-0 overflow-hidden select-none font-sans">',
      '  <div class="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-b from-emerald-900 via-emerald-950 to-stone-950 p-6 text-center">',
      '    <div class="max-w-lg w-full bg-stone-900/95 border-2 border-amber-500/50 rounded-3xl p-8 shadow-2xl space-y-5">',
      '      <div class="inline-block bg-amber-400 text-stone-950 font-black text-xs uppercase px-4 py-1 rounded-full">Application PC Autonome</div>',
      '      <h1 class="text-4xl font-black text-amber-400">CONTRÉE ROYALE</h1>',
      '      <p class="text-sm text-stone-300 leading-relaxed">Collez ci-dessous le lien de votre salon une seule fois :</p>',
      '      <input id="appUrlInput" type="text" placeholder="Collez ici le lien..." class="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400" />',
      '      <button onclick="launchSavedUrl()" class="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-base shadow-lg cursor-pointer">Lancer Contrée Royale en Plein Écran</button>',
      '    </div>',
      '  </div>',
      '  <script>',
      '    const saved = localStorage.getItem("contree_royale_url");',
      '    if (saved) document.getElementById("appUrlInput").value = saved;',
      '    function launchSavedUrl() {',
      '      const val = document.getElementById("appUrlInput").value.trim();',
      '      if (!val) return;',
      '      localStorage.setItem("contree_royale_url", val);',
      '      window.location.href = val;',
      '    }',
      '  <' + '/script>',
      '</body>',
      '</html>'
    ];
    return lines.join('\r\n');
  };

  const downloadStandaloneHtmlFile = () => {
    const htmlContent = buildStandaloneHtmlString();
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ContreeRoyale.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDesktopLauncher = (customUrl = '') => {
    const targetUrl = (customUrl || window.location.href || '').trim();
    const htmlBase64 = btoa(unescape(encodeURIComponent(buildStandaloneHtmlString())));
    const batLines = [
      '@echo off',
      'chcp 65001 >nul',
      'title Contree Royale - Application PC',
      'set "HTML_FILE=%~dp0ContreeRoyale.html"',
      'if not exist "%HTML_FILE%" (',
      '  powershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllBytes(\'%HTML_FILE%\', [Convert]::FromBase64String(\'' + htmlBase64 + '\'))"',
      ')',
      targetUrl && targetUrl.startsWith('http') && !targetUrl.includes('scf.usercontent.goog')
        ? 'set "TARGET=' + targetUrl + '"'
        : 'set "TARGET=%HTML_FILE%"',
      'start "" msedge --app="%TARGET%" 2>nul || start "" chrome --app="%TARGET%" 2>nul || start "" "%TARGET%"',
      'exit'
    ];
    const batContent = batLines.join('\r\n');
    const blob = new Blob([batContent], { type: 'application/bat;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Lancer_Contree_Royale.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cleanupP2P = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (rtcChannelRef.current) {
      try { rtcChannelRef.current.close(); } catch (e) {}
      rtcChannelRef.current = null;
    }
    if (rtcPeerRef.current) {
      try { rtcPeerRef.current.close(); } catch (e) {}
      rtcPeerRef.current = null;
    }
    if (peerJsInstanceRef.current) {
      try { peerJsInstanceRef.current.destroy(); } catch (e) {}
      peerJsInstanceRef.current = null;
    }
    setP2pStatus('IDLE');
  };

  // ==========================================
  // MODE SALON RAPIDE PC (.EXE) AVEC CODE À 5 LETTRES (PEERJS)
  // ==========================================
  const loadPeerJsScript = () => {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.Peer) return resolve(window.Peer);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      script.onload = () => resolve(window.Peer);
      script.onerror = () => reject(new Error('Impossible de charger PeerJS'));
      document.head.appendChild(script);
    });
  };

  const createPeerJsRoom = async () => {
    soundEngine.playClick();
    cleanupP2P();
    setErrorMsg('');
    setP2pStatus('CONNECTING');
    try {
      const PeerClass = await loadPeerJsScript();
      const shortCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const peer = new PeerClass('CONTREE-ROYALE-' + shortCode);
      peerJsInstanceRef.current = peer;

      peer.on('open', () => {
        const initial = createInitialState(myUid, pseudo.trim() || 'Hôte', false);
        gameStateRef.current = initial;
        setGameState(initial);
        setRoomCode(shortCode);
        setP2pStatus('CONNECTED');
        setMode('ONLINE');
      });

      peer.on('connection', (conn) => {
        conn.on('open', () => {
          rtcChannelRef.current = {
            readyState: 'open',
            send: (data) => conn.send(data),
            close: () => conn.close()
          };
          if (gameStateRef.current) {
            conn.send(JSON.stringify({ type: 'SYNC_STATE', state: gameStateRef.current }));
          }
        });
        conn.on('data', (rawData) => {
          try {
            const msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            if (msg.type === 'SYNC_STATE' && msg.state) {
              gameStateRef.current = msg.state;
              setGameState(msg.state);
            } else if (msg.type === 'GUEST_JOIN' && gameStateRef.current) {
              const current = JSON.parse(JSON.stringify(gameStateRef.current));
              const preferredOrder = ['N', 'E', 'W', 'S'];
              const freeSeat = preferredOrder.find(s => current.seats[s]?.isBot) || 'N';
              current.seats[freeSeat] = { uid: msg.uid, name: msg.name, isBot: false };
              current.bubbles = {
                ...(current.bubbles || {}),
                [freeSeat]: { text: `${msg.name} a rejoint la table ! 🎉`, type: 'chat', id: Date.now() }
              };
              gameStateRef.current = current;
              setGameState(current);
              conn.send(JSON.stringify({ type: 'SYNC_STATE', state: current }));
            }
          } catch (e) {}
        });
      });

      peer.on('error', () => {
        setErrorMsg("Sur Gemini Web, utilisez le bouton 'Pont Direct WebRTC' ci-dessus. Le code à 5 lettres fonctionne dans votre version .EXE !");
        setP2pStatus('IDLE');
      });
    } catch (e) {
      setErrorMsg("Utilisez le Pont Direct WebRTC sur Gemini, ou compilez le .EXE pour le code court.");
      setP2pStatus('IDLE');
    }
  };

  const joinPeerJsRoom = async () => {
    soundEngine.playClick();
    const clean = roomCodeInput.trim().toUpperCase();
    if (!clean) {
      setErrorMsg("Entre le code à 5 lettres de ton pote !");
      return;
    }
    cleanupP2P();
    setErrorMsg('');
    setP2pStatus('CONNECTING');
    try {
      const PeerClass = await loadPeerJsScript();
      const peer = new PeerClass();
      peerJsInstanceRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect('CONTREE-ROYALE-' + clean, { reliable: true });
        conn.on('open', () => {
          rtcChannelRef.current = {
            readyState: 'open',
            send: (data) => conn.send(data),
            close: () => conn.close()
          };
          setRoomCode(clean);
          setP2pStatus('CONNECTED');
          setMode('ONLINE');
          conn.send(JSON.stringify({
            type: 'GUEST_JOIN',
            uid: myUid,
            name: pseudo.trim() || 'Mon Pote'
          }));
        });
        conn.on('data', (rawData) => {
          try {
            const msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            if (msg.type === 'SYNC_STATE' && msg.state) {
              gameStateRef.current = msg.state;
              setGameState(msg.state);
            }
          } catch (e) {}
        });
      });

      peer.on('error', () => {
        setErrorMsg("Code introuvable (ou bloqué par Gemini). Dans Gemini, utilisez le Pont Direct (Code 1 / Code 2).");
        setP2pStatus('IDLE');
      });
    } catch (e) {
      setErrorMsg("Impossible de se connecter.");
      setP2pStatus('IDLE');
    }
  };

  useEffect(() => {
    return () => cleanupP2P();
  }, []);

  const safeCopyText = async (text) => {
    soundEngine.playClick();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Fallback');
      }
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ==========================================
  // PONT WEBRTC DIRECT SANS SERVEUR
  // ==========================================
  const setupDataChannelEvents = (channel, role) => {
    rtcChannelRef.current = channel;
    channel.onopen = () => {
      setP2pStatus('CONNECTED');
      setRoomCode('DIRECT');
      setMode('ONLINE');
      if (role === 'HOST') {
        const initial = createInitialState(myUid, pseudo.trim() || 'Hôte', false);
        gameStateRef.current = initial;
        setGameState(initial);
        channel.send(JSON.stringify({ type: 'SYNC_STATE', state: initial }));
      } else {
        channel.send(JSON.stringify({
          type: 'GUEST_JOIN',
          uid: myUid,
          name: pseudo.trim() || 'Mon Pote'
        }));
      }
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SYNC_STATE' && msg.state) {
          gameStateRef.current = msg.state;
          setGameState(msg.state);
        } else if (msg.type === 'GUEST_JOIN' && gameStateRef.current) {
          const current = JSON.parse(JSON.stringify(gameStateRef.current));
          const preferredOrder = ['N', 'E', 'W', 'S'];
          const freeSeat = preferredOrder.find(s => current.seats[s]?.isBot) || 'N';
          current.seats[freeSeat] = {
            uid: msg.uid,
            name: msg.name,
            isBot: false
          };
          current.bubbles = {
            ...(current.bubbles || {}),
            [freeSeat]: { text: `${msg.name} est connecté en direct ! 🎉`, type: 'chat', id: Date.now() }
          };
          gameStateRef.current = current;
          setGameState(current);
          channel.send(JSON.stringify({ type: 'SYNC_STATE', state: current }));
        }
      } catch (err) {
        console.error('Erreur message WebRTC:', err);
      }
    };
  };

  const startWebRTCHost = async () => {
    soundEngine.playClick();
    cleanupP2P();
    setErrorMsg('');
    setRtcRole('HOST');
    setRtcStep(1);
    setRtcLocalToken('');
    setRtcRemoteInput('');
    setMode('WEBRTC_SETUP');
    setP2pStatus('CONNECTING');

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      rtcPeerRef.current = pc;
      const channel = pc.createDataChannel('contree-p2p');
      setupDataChannelEvents(channel, 'HOST');

      pc.onicecandidate = (e) => {
        if (!e.candidate && pc.localDescription) {
          const token = btoa(JSON.stringify(pc.localDescription));
          setRtcLocalToken(token);
          setP2pStatus('IDLE');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setTimeout(() => {
        if (pc.localDescription) {
          setRtcLocalToken(btoa(JSON.stringify(pc.localDescription)));
          setP2pStatus('IDLE');
        }
      }, 1800);
    } catch (e) {
      setErrorMsg("Erreur lors de la création du pont WebRTC.");
      setP2pStatus('IDLE');
    }
  };

  const startWebRTCGuest = () => {
    soundEngine.playClick();
    cleanupP2P();
    setErrorMsg('');
    setRtcRole('GUEST');
    setRtcStep(1);
    setRtcLocalToken('');
    setRtcRemoteInput('');
    setMode('WEBRTC_SETUP');
  };

  const handleGuestAcceptOffer = async () => {
    soundEngine.playClick();
    setErrorMsg('');
    if (!rtcRemoteInput.trim()) {
      setErrorMsg("Colle d'abord le Code 1 envoyé par ton pote !");
      return;
    }
    setP2pStatus('CONNECTING');
    try {
      const offerDesc = JSON.parse(atob(rtcRemoteInput.trim()));
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      rtcPeerRef.current = pc;

      pc.ondatachannel = (e) => {
        setupDataChannelEvents(e.channel, 'GUEST');
      };

      pc.onicecandidate = (e) => {
        if (!e.candidate && pc.localDescription) {
          setRtcLocalToken(btoa(JSON.stringify(pc.localDescription)));
          setRtcStep(2);
          setP2pStatus('IDLE');
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setTimeout(() => {
        if (pc.localDescription) {
          setRtcLocalToken(btoa(JSON.stringify(pc.localDescription)));
          setRtcStep(2);
          setP2pStatus('IDLE');
        }
      }, 1800);
    } catch (e) {
      setErrorMsg("Ce code d'invitation est invalide ou incomplet.");
      setP2pStatus('IDLE');
    }
  };

  const handleHostAcceptAnswer = async () => {
    soundEngine.playClick();
    setErrorMsg('');
    if (!rtcRemoteInput.trim() || !rtcPeerRef.current) {
      setErrorMsg("Colle le Code Réponse 2 envoyé par ton pote !");
      return;
    }
    try {
      const answerDesc = JSON.parse(atob(rtcRemoteInput.trim()));
      await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc));
    } catch (e) {
      setErrorMsg("Code Réponse invalide. Vérifie que ton pote a tout copié.");
    }
  };

  const getRoomDocRef = (code, targetAppId = activeRoomAppId) => {
    return doc(db, 'artifacts', targetAppId, 'public', 'data', 'rooms', code);
  };

  const updateGameState = async (newState) => {
    gameStateRef.current = newState;
    setGameState(newState);

    if (rtcChannelRef.current && rtcChannelRef.current.readyState === 'open') {
      try {
        rtcChannelRef.current.send(JSON.stringify({ type: 'SYNC_STATE', state: newState }));
      } catch (err) {
        console.error('Erreur envoi WebRTC:', err);
      }
      return;
    }

    if (mode === 'ONLINE' && db && roomCode && roomCode !== 'DIRECT') {
      try {
        await ensureAuthenticated();
        await Promise.allSettled(
          SHARED_APP_IDS.map((ns) => setDoc(getRoomDocRef(roomCode, ns), newState))
        );
      } catch (err) {
        console.error('Erreur synchronisation salon:', err);
      }
    }
  };

  const createInitialState = (hostId, hostName, isLocal = false) => {
    const hands = createAndDealDeck('E');
    return {
      hostId,
      createdAt: Date.now(),
      status: isLocal ? 'BIDDING' : 'LOBBY',
      botDifficulty,
      targetScore: 1500,
      dealer: 'E',
      currentTurn: 'S',
      seats: {
        S: { uid: hostId, name: hostName || 'Joueur 1', isBot: false },
        W: { uid: 'bot_W', name: BOT_NAMES.W, isBot: true },
        N: { uid: 'bot_N', name: BOT_NAMES.N, isBot: true },
        E: { uid: 'bot_E', name: BOT_NAMES.E, isBot: true }
      },
      scores: { NS: 0, EW: 0 },
      hands,
      bids: [],
      highestBid: null,
      coincheStatus: 1,
      coinchenBy: null,
      consecutivePasses: 0,
      contract: null,
      trumpSuit: null,
      currentTrick: [],
      lastTrick: [],
      playedCardsHistory: [],
      voidMatrix: {
        S: { H: false, C: false, D: false, S: false },
        W: { H: false, C: false, D: false, S: false },
        N: { H: false, C: false, D: false, S: false },
        E: { H: false, C: false, D: false, S: false }
      },
      trickWinner: null,
      roundPoints: { NS: 0, EW: 0 },
      roundTricksCount: { NS: 0, EW: 0 },
      beloteHolder: null,
      beloteTeam: null,
      beloteStep: 0,
      bubbles: {},
      roundSummary: null
    };
  };

  const startQuickGame = () => {
    soundEngine.playClick();
    cleanupP2P();
    const initial = createInitialState(myUid, pseudo.trim() || 'Sud', true);
    initial.bubbles = {
      N: { text: `Salut partenaire ! (Niveau ${BOT_DIFFICULTIES[botDifficulty]?.label})`, type: 'chat', id: Date.now() }
    };
    setMode('LOCAL');
    setGameState(initial);
  };

  const claimSeatInLobby = async (targetSeat) => {
    soundEngine.playClick();
    if (!gameState) return;
    const currentSeat = SEATS.find(s => gameState.seats[s].uid === myUid);
    const targetOccupant = gameState.seats[targetSeat];

    if (!targetOccupant.isBot && targetOccupant.uid !== myUid) return;

    const newSeats = { ...gameState.seats };
    if (currentSeat) {
      newSeats[currentSeat] = { uid: `bot_${currentSeat}`, name: BOT_NAMES[currentSeat], isBot: true };
    }
    newSeats[targetSeat] = { uid: myUid, name: pseudo.trim() || 'Joueur', isBot: false };

    await updateGameState({ ...gameState, seats: newSeats });
  };

  const mySeat = useMemo(() => {
    if (!gameState) return 'S';
    const found = SEATS.find(s => gameState.seats[s]?.uid === myUid);
    return found || 'S';
  }, [gameState, myUid]);

  const relativeSeats = useMemo(() => {
    const idx = SEATS.indexOf(mySeat);
    return {
      bottom: SEATS[idx],
      left: SEATS[(idx + 1) % 4],
      top: SEATS[(idx + 2) % 4],
      right: SEATS[(idx + 3) % 4]
    };
  }, [mySeat]);

  const myHand = gameState?.hands?.[mySeat] || [];

  useEffect(() => {
    if (gameState?.status === 'BIDDING') {
      const nextMin = gameState.highestBid ? gameState.highestBid.value + 10 : 80;
      const validNext = BID_VALUES.find(v => v >= nextMin) || 250;
      setSelectedBidValue(validNext);
    }
  }, [gameState?.highestBid, gameState?.status]);

  const startNewDeal = async (stateSnapshot, nextDealerSeat) => {
    soundEngine.playClick();
    const newHands = createAndDealDeck(nextDealerSeat);
    const firstBidder = getNextSeat(nextDealerSeat);

    const nextState = {
      ...stateSnapshot,
      status: 'BIDDING',
      botDifficulty: stateSnapshot.botDifficulty || botDifficulty,
      dealer: nextDealerSeat,
      currentTurn: firstBidder,
      hands: newHands,
      bids: [],
      highestBid: null,
      coincheStatus: 1,
      coinchenBy: null,
      consecutivePasses: 0,
      contract: null,
      trumpSuit: null,
      currentTrick: [],
      lastTrick: [],
      playedCardsHistory: [],
      voidMatrix: {
        S: { H: false, C: false, D: false, S: false },
        W: { H: false, C: false, D: false, S: false },
        N: { H: false, C: false, D: false, S: false },
        E: { H: false, C: false, D: false, S: false }
      },
      trickWinner: null,
      roundPoints: { NS: 0, EW: 0 },
      roundTricksCount: { NS: 0, EW: 0 },
      beloteHolder: null,
      beloteTeam: null,
      beloteStep: 0,
      bubbles: {},
      roundSummary: null
    };

    await updateGameState(nextState);
  };

  const handleBidAction = async (seat, action) => {
    if (!gameState || gameState.status !== 'BIDDING' || gameState.currentTurn !== seat) return;

    soundEngine.playBidSound(action.type);
    const newState = JSON.parse(JSON.stringify(gameState));
    const nextTurn = getNextSeat(seat);

    if (action.type === 'PASS') {
      newState.bids.push({ seat, type: 'PASS' });
      newState.consecutivePasses += 1;
      newState.bubbles[seat] = { text: 'Passe', type: 'pass', id: Date.now() };

      if (!newState.highestBid && newState.consecutivePasses >= 4) {
        newState.bubbles[seat] = { text: '4 Passe ! On redistribue', type: 'info', id: Date.now() };
        await startNewDeal(newState, getNextSeat(newState.dealer));
        return;
      }

      if (newState.highestBid && newState.consecutivePasses >= 3) {
        return finalizeBiddingPhase(newState);
      }

      newState.currentTurn = nextTurn;
      await updateGameState(newState);
      return;
    }

    if (action.type === 'BID') {
      const { value, suit } = action;
      const currentMax = newState.highestBid ? newState.highestBid.value : 70;
      if (value <= currentMax) return;

      newState.highestBid = { seat, value, suit };
      newState.bids.push({ seat, type: 'BID', value, suit });
      newState.consecutivePasses = 0;
      newState.coincheStatus = 1;
      newState.bubbles[seat] = {
        text: `${value === 250 ? 'CAPOT' : value}`,
        value,
        suit,
        type: 'bid',
        id: Date.now()
      };
      newState.currentTurn = nextTurn;
      await updateGameState(newState);
      return;
    }

    if (action.type === 'COINCHE') {
      if (!newState.highestBid || getTeam(newState.highestBid.seat) === getTeam(seat)) return;
      newState.coincheStatus = 2;
      newState.coinchenBy = seat;
      newState.consecutivePasses = 0;
      newState.bids.push({ seat, type: 'COINCHE' });
      newState.bubbles[seat] = { text: 'CONTRÉ ! ⚡', type: 'coinche', id: Date.now() };
      newState.currentTurn = nextTurn;
      await updateGameState(newState);
      return;
    }

    if (action.type === 'SURCOINCHE') {
      if (!newState.highestBid || newState.coincheStatus !== 2 || getTeam(newState.highestBid.seat) !== getTeam(seat)) return;
      newState.coincheStatus = 4;
      newState.bids.push({ seat, type: 'SURCOINCHE' });
      newState.bubbles[seat] = { text: 'SURCONTRÉ ! 🔥🔥', type: 'surcoinche', id: Date.now() };
      return finalizeBiddingPhase(newState);
    }
  };

  const finalizeBiddingPhase = async (stateObj) => {
    const trump = stateObj.highestBid.suit;
    stateObj.status = 'PLAYING';
    stateObj.trumpSuit = trump;
    stateObj.contract = {
      seat: stateObj.highestBid.seat,
      team: getTeam(stateObj.highestBid.seat),
      value: stateObj.highestBid.value,
      suit: trump,
      coinche: stateObj.coincheStatus
    };

    SEATS.forEach(s => {
      stateObj.hands[s] = sortHand(stateObj.hands[s], trump);
      const hasK = stateObj.hands[s].some(c => c.suit === trump && c.rank === 'K');
      const hasQ = stateObj.hands[s].some(c => c.suit === trump && c.rank === 'Q');
      if (hasK && hasQ) {
        stateObj.beloteHolder = s;
        stateObj.beloteTeam = getTeam(s);
      }
    });

    stateObj.currentTurn = getNextSeat(stateObj.dealer);
    await updateGameState(stateObj);
  };

  const handlePlayCard = async (seat, card) => {
    if (!gameState || gameState.status !== 'PLAYING' || gameState.currentTurn !== seat) return;

    const hand = gameState.hands[seat] || [];
    const legalIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, seat);
    if (!legalIds.includes(card.id)) return;

    soundEngine.playCardSlap();

    const newState = JSON.parse(JSON.stringify(gameState));
    newState.hands[seat] = newState.hands[seat].filter(c => c.id !== card.id);
    newState.currentTrick.push({ seat, card });

    if (
      newState.beloteHolder === seat &&
      card.suit === newState.trumpSuit &&
      (card.rank === 'K' || card.rank === 'Q')
    ) {
      soundEngine.playBidSound('BID');
      if (newState.beloteStep === 0) {
        newState.beloteStep = 1;
        newState.bubbles[seat] = { text: 'Belote ! 👑', type: 'belote', id: Date.now() };
      } else if (newState.beloteStep === 1) {
        newState.beloteStep = 2;
        newState.bubbles[seat] = { text: 'Rebelote ! (+20 pts) 👑', type: 'belote', id: Date.now() };
      }
    } else {
      delete newState.bubbles[seat];
    }

    if (newState.currentTrick.length < 4) {
      newState.currentTurn = getNextSeat(seat);
      await updateGameState(newState);
      return;
    }

    const winningPlay = getTrickWinner(newState.currentTrick, newState.trumpSuit);
    newState.status = 'TRICK_END';
    newState.trickWinner = winningPlay.seat;
    newState.currentTurn = winningPlay.seat;
    await updateGameState(newState);
  };

  const collectFinishedTrick = async (stateSnapshot) => {
    soundEngine.playTrickSweep();
    const newState = JSON.parse(JSON.stringify(stateSnapshot));
    const winnerSeat = newState.trickWinner;
    const winnerTeam = getTeam(winnerSeat);
    const trump = newState.trumpSuit;

    if (!newState.playedCardsHistory) newState.playedCardsHistory = [];
    if (!newState.voidMatrix) {
      newState.voidMatrix = {
        S: { H: false, C: false, D: false, S: false },
        W: { H: false, C: false, D: false, S: false },
        N: { H: false, C: false, D: false, S: false },
        E: { H: false, C: false, D: false, S: false }
      };
    }

    if (newState.currentTrick.length > 0) {
      const leadSuit = newState.currentTrick[0].card.suit;
      newState.currentTrick.forEach((play, idx) => {
        newState.playedCardsHistory.push(play);
        if (idx > 0 && play.card.suit !== leadSuit) {
          newState.voidMatrix[play.seat][leadSuit] = true;
          if (play.card.suit !== trump) {
            const trickSoFar = newState.currentTrick.slice(0, idx);
            const curWin = getTrickWinner(trickSoFar, trump);
            if (curWin && getTeam(curWin.seat) !== getTeam(play.seat)) {
              newState.voidMatrix[play.seat][trump] = true;
            }
          }
        }
      });
    }

    const trickPts = newState.currentTrick.reduce((sum, play) => sum + getCardPoints(play.card, trump), 0);
    const isLastTrick = newState.hands.S.length === 0;
    const dixDeDer = isLastTrick ? 10 : 0;

    newState.roundPoints[winnerTeam] += (trickPts + dixDeDer);
    newState.roundTricksCount[winnerTeam] += 1;
    newState.lastTrick = [...newState.currentTrick];
    newState.currentTrick = [];
    newState.trickWinner = null;

    if (!isLastTrick) {
      newState.status = 'PLAYING';
      newState.currentTurn = winnerSeat;
      await updateGameState(newState);
      return;
    }

    const contract = newState.contract;
    const attackingTeam = contract.team;
    const defendingTeam = attackingTeam === 'NS' ? 'EW' : 'NS';
    const mult = contract.coinche;

    const beloteBonusNS = newState.beloteTeam === 'NS' && newState.beloteStep === 2 ? 20 : 0;
    const beloteBonusEW = newState.beloteTeam === 'EW' && newState.beloteStep === 2 ? 20 : 0;

    const totalPointsNS = newState.roundPoints.NS + beloteBonusNS;
    const totalPointsEW = newState.roundPoints.EW + beloteBonusEW;

    const attackTotalWithBelote = attackingTeam === 'NS' ? totalPointsNS : totalPointsEW;
    const attackTricks = newState.roundTricksCount[attackingTeam];

    let isContractMade = false;
    if (contract.value === 250) {
      isContractMade = attackTricks === 8;
    } else {
      isContractMade = attackTotalWithBelote >= contract.value;
    }

    soundEngine.playRoundEnd(isContractMade);

    let deltaNS = 0;
    let deltaEW = 0;

    if (isContractMade) {
      if (mult > 1) {
        const gained = (160 + contract.value) * mult + (attackingTeam === 'NS' ? beloteBonusNS : beloteBonusEW);
        if (attackingTeam === 'NS') deltaNS = gained;
        else deltaEW = gained;
      } else {
        if (attackingTeam === 'NS') {
          deltaNS = totalPointsNS + contract.value;
          deltaEW = totalPointsEW;
        } else {
          deltaEW = totalPointsEW + contract.value;
          deltaNS = totalPointsNS;
        }
      }
    } else {
      const defenseGain = (160 + contract.value) * mult + beloteBonusNS + beloteBonusEW;
      if (defendingTeam === 'NS') {
        deltaNS = defenseGain;
        deltaEW = 0;
      } else {
        deltaEW = defenseGain;
        deltaNS = 0;
      }
    }

    newState.scores.NS += deltaNS;
    newState.scores.EW += deltaEW;

    newState.roundSummary = {
      contract,
      isContractMade,
      rawPointsNS: newState.roundPoints.NS,
      rawPointsEW: newState.roundPoints.EW,
      beloteNS: beloteBonusNS,
      beloteEW: beloteBonusEW,
      tricksNS: newState.roundTricksCount.NS,
      tricksEW: newState.roundTricksCount.EW,
      deltaNS,
      deltaEW
    };

    if (newState.scores.NS >= newState.targetScore || newState.scores.EW >= newState.targetScore) {
      newState.status = 'GAME_OVER';
    } else {
      newState.status = 'ROUND_SUMMARY';
    }

    await updateGameState(newState);
  };

  const sendQuickChat = async (text) => {
    soundEngine.playClick();
    if (!gameState) return;
    setShowChatMenu(false);
    const newState = JSON.parse(JSON.stringify(gameState));
    newState.bubbles[mySeat] = { text, type: 'chat', id: Date.now() };
    await updateGameState(newState);
  };

  useEffect(() => {
    if (!gameState) return;

    const amIController = mode === 'LOCAL' || gameState.hostId === myUid;
    if (!amIController) return;

    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);

    if (gameState.status === 'TRICK_END') {
      botTimeoutRef.current = setTimeout(() => {
        collectFinishedTrick(gameState);
      }, 1350);
      return;
    }

    const activeSeat = gameState.currentTurn;
    const activePlayer = gameState.seats?.[activeSeat];

    if (activePlayer?.isBot && (gameState.status === 'BIDDING' || gameState.status === 'PLAYING')) {
      botTimeoutRef.current = setTimeout(() => {
        if (gameState.status === 'BIDDING') {
          const decision = decideBotBid(gameState, activeSeat);
          handleBidAction(activeSeat, decision);
        } else if (gameState.status === 'PLAYING') {
          const cardToPlay = decideBotCard(gameState, activeSeat);
          if (cardToPlay) {
            handlePlayCard(activeSeat, cardToPlay);
          }
        }
      }, 750);
    }

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, [gameState, mode, myUid]);

  // ==========================================
  // 7. RENDU : ÉCRAN D'ACCUEIL & SALON (PLEIN ÉCRAN SANS BORDURE NOIRE)
  // ==========================================

  if (mode === 'HOME') {
    return (
      <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 via-emerald-950 to-emerald-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 select-none">
        {/* Barre d'actions rapides en haut à droite (Paramètres & Plein écran) */}
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
          <button
            onClick={() => toggleFullscreen()}
            className="px-3.5 py-2.5 rounded-2xl bg-stone-900/90 hover:bg-stone-800 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-2 shadow-xl transition cursor-pointer"
            title={isFullscreen ? 'Passer en mode Fenêtré' : 'Passer en Plein Écran'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Fenêtré' : 'Plein Écran'}</span>
          </button>

          <button
            onClick={() => { soundEngine.playClick(); setShowSettingsModal(true); }}
            className="px-3.5 py-2.5 rounded-2xl bg-stone-900/90 hover:bg-stone-800 border border-amber-500/40 text-white font-bold text-xs flex items-center gap-2 shadow-xl transition cursor-pointer"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span>Paramètres</span>
          </button>
        </div>

        <div className="max-w-5xl w-full flex flex-col items-center text-center mb-6">
          <div className="relative mb-2">
            <div className="flex items-center justify-center gap-2 bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 px-5 py-1.5 rounded-full font-black text-xs uppercase tracking-widest shadow-lg border border-amber-200">
              <Crown className="w-4 h-4 fill-stone-950" /> Édition Officielle Multijoueur
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-amber-100 to-amber-400 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            CONTRÉE ROYALE
          </h1>
          <p className="text-emerald-200/90 mt-1.5 text-sm sm:text-base max-w-lg font-medium">
            Jouez à la vraie Belote Contrée avec votre super pote en équipe Nord-Sud ou contre nos bots !
          </p>
        </div>

        <div className="max-w-4xl w-full bg-stone-900/85 backdrop-blur-md border-2 border-amber-500/40 rounded-3xl p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
          {/* Ligne Pseudo + Choix Difficulté des Bots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                Votre Pseudo autour de la table
              </label>
              <div className="flex items-center gap-3 bg-stone-950/90 border border-stone-700 rounded-2xl px-4 py-2.5 focus-within:border-amber-400 transition">
                <Users className="w-5 h-5 text-amber-400 shrink-0" />
                <input
                  type="text"
                  maxLength={16}
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  placeholder="Ex: Alex, Thomas..."
                  className="bg-transparent w-full text-white font-bold text-base focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                Niveau de difficulté des Bots
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-stone-950/90 p-1.5 rounded-2xl border border-stone-700">
                {Object.values(BOT_DIFFICULTIES).map((lvl) => {
                  const active = botDifficulty === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => { soundEngine.playClick(); setBotDifficulty(lvl.id); }}
                      className={`py-2 px-2 rounded-xl font-black text-xs transition cursor-pointer flex flex-col items-center justify-center ${
                        active
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-stone-950 shadow-md'
                          : 'text-stone-300 hover:bg-stone-800'
                      }`}
                    >
                      <span>{lvl.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-emerald-300/90 font-medium mt-1 px-1">
                {BOT_DIFFICULTIES[botDifficulty]?.shortDesc}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 bg-red-950/90 border border-red-500/60 text-red-200 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-b from-emerald-900/70 to-stone-900/90 border-2 border-emerald-400/60 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Multijoueur en Direct
                  </span>
                  <Users className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-xl font-extrabold text-white mb-1">Jouer avec mon Pote à distance</h2>
                <p className="text-xs text-stone-300 mb-4 leading-relaxed">
                  Utilisez le <strong>Code Rapide à 5 lettres</strong> (sur version .EXE / PC) ou le <strong>Pont Direct WebRTC</strong> !
                </p>
              </div>

              <div className="space-y-3">
                <div className="pb-3 border-b border-stone-700/80 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center justify-between">
                    <span>⚡ Salon Rapide (Code 5 lettres)</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={createPeerJsRoom}
                      className="px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs shrink-0 cursor-pointer shadow"
                    >
                      Créer Code
                    </button>
                    <input
                      type="text"
                      maxLength={6}
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                      placeholder="CODE"
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-2.5 py-2 text-xs font-mono font-black uppercase text-center text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      onClick={joinPeerJsRoom}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs shrink-0 cursor-pointer shadow"
                    >
                      Rejoindre
                    </button>
                  </div>
                </div>

                <button
                  onClick={startWebRTCHost}
                  className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Alternative : Créer Pont Manuel (Code 1)
                </button>

                <button
                  onClick={startWebRTCGuest}
                  className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Wifi className="w-4 h-4" />
                  Alternative : Coller Clé reçue (Code 2)
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-b from-stone-800/70 to-stone-900/90 border border-stone-700 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${BOT_DIFFICULTIES[botDifficulty]?.badgeColor}`}>
                    Mode : {BOT_DIFFICULTIES[botDifficulty]?.label}
                  </span>
                  <Bot className="w-6 h-6 text-amber-400" />
                </div>
                <h2 className="text-xl font-extrabold text-white mb-1">
                  Partie Solo vs Bots ({BOT_DIFFICULTIES[botDifficulty]?.label})
                </h2>
                <p className="text-xs text-stone-300 mb-4 leading-relaxed">
                  Lancez immédiatement une table complète avec nos 3 bots (César, Fanny et Honoré) réglés sur le niveau <strong>{BOT_DIFFICULTIES[botDifficulty]?.label}</strong>.
                </p>

                <ul className="text-xs text-stone-300 space-y-1.5 mb-5">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Enchères 80 à 160, Capot, Contre & Surcontre
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Belote / Rebelote (+20 pts) & 10 de Der
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Effets sonores & Plein Écran ajustable
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={startQuickGame}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-white" />
                  Jouer Maintenant
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { soundEngine.playClick(); setShowRulesModal(true); }}
                    className="w-full py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    Règles du jeu
                  </button>
                  <button
                    onClick={() => { soundEngine.playClick(); setShowSettingsModal(true); }}
                    className="w-full py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    Sons & Écran
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}

        {showSettingsModal && (
          <SettingsModal
            onClose={() => setShowSettingsModal(false)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            audioSettings={audioSettings}
            setAudioSettings={setAudioSettings}
            botDifficulty={botDifficulty}
            setBotDifficulty={setBotDifficulty}
          />
        )}

        {showDesktopModal && (
          <DesktopExportModal
            onClose={() => setShowDesktopModal(false)}
            onDownloadBat={downloadDesktopLauncher}
            onDownloadHtml={downloadStandaloneHtmlFile}
          />
        )}
      </div>
    );
  }

  // ==========================================
  // 7bis. RENDU : ASSISTANT DE CONNEXION WEBRTC
  // ==========================================
  if (mode === 'WEBRTC_SETUP') {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 via-emerald-950 to-emerald-950 text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="max-w-xl w-full bg-stone-900/95 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-stone-800 pb-4">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Connexion Directe PC à PC (Sans Serveur)
              </span>
              <h2 className="text-2xl font-black text-white mt-0.5">
                {rtcRole === 'HOST' ? 'Créer le Pont avec ton Pote' : 'Rejoindre le Pont de ton Pote'}
              </h2>
            </div>
            <button
              onClick={() => { cleanupP2P(); setMode('HOME'); }}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-300 cursor-pointer"
            >
              Annuler
            </button>
          </div>

          {errorMsg && (
            <div className="bg-red-950/90 border border-red-500/60 text-red-200 px-4 py-3 rounded-xl text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {rtcRole === 'HOST' ? (
            <div className="space-y-5">
              <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-black uppercase text-amber-400">
                  Étape 1 : Envoie cette Clé d'Invitation (Code 1) à ton pote sur Discord / WhatsApp
                </div>
                {rtcLocalToken ? (
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={rtcLocalToken}
                      className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs font-mono text-stone-300"
                    />
                    <button
                      onClick={() => safeCopyText(rtcLocalToken)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedCode ? 'Copié !' : 'Copier Code 1'}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-amber-300 animate-pulse py-2">
                    Génération de ta clé réseau directe en cours (2 secondes)...
                  </div>
                )}
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-black uppercase text-emerald-400">
                  Étape 2 : Colle ici le Code Réponse (Code 2) que ton pote va t'envoyer
                </div>
                <textarea
                  rows={3}
                  value={rtcRemoteInput}
                  onChange={(e) => setRtcRemoteInput(e.target.value)}
                  placeholder="Colle ici le Code 2 envoyé par ton pote..."
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                />
                <button
                  onClick={handleHostAcceptAnswer}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black rounded-xl text-sm shadow-lg cursor-pointer"
                >
                  Connecter nos 2 PC et Ouvrir la Table !
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {rtcStep === 1 && (
                <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-black uppercase text-amber-400">
                    Étape 1 : Colle ici la Clé d'Invitation (Code 1) envoyée par ton pote
                  </div>
                  <textarea
                    rows={3}
                    value={rtcRemoteInput}
                    onChange={(e) => setRtcRemoteInput(e.target.value)}
                    placeholder="Colle ici le Code 1 de ton pote..."
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={handleGuestAcceptOffer}
                    disabled={p2pStatus === 'CONNECTING'}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-xl text-sm shadow-lg cursor-pointer"
                  >
                    {p2pStatus === 'CONNECTING' ? 'Génération du Code Réponse...' : 'Valider et Générer mon Code Réponse (Code 2)'}
                  </button>
                </div>
              )}

              {rtcStep === 2 && (
                <div className="bg-stone-950 border border-emerald-500/50 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-black uppercase text-emerald-400">
                    Étape 2 : Copie ce Code Réponse (Code 2) et envoie-le à ton pote !
                  </div>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={rtcLocalToken}
                      className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs font-mono text-stone-300"
                    />
                    <button
                      onClick={() => safeCopyText(rtcLocalToken)}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs rounded-xl shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedCode ? 'Copié !' : 'Copier Code 2'}
                    </button>
                  </div>
                  <div className="text-xs text-amber-300 animate-pulse pt-2">
                    Dès que ton pote colle ce Code 2 sur son écran, la table s'ouvrira automatiquement sur vos deux PC !
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 8. RENDU : SALON D'ATTENTE (LOBBY MULTIJOUEUR)
  // ==========================================
  if (gameState?.status === 'LOBBY') {
    const isHost = gameState.hostId === myUid;

    const copyRoomCode = async () => {
      await safeCopyText(roomCode);
    };

    return (
      <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 via-emerald-950 to-emerald-950 text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="max-w-3xl w-full bg-stone-900/90 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-stone-800 pb-6 mb-6">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">Salon Privé Multijoueur</span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-0.5">Choisissez vos places à la table</h2>
              <p className="text-xs text-stone-400 mt-1">
                Astuce : placez-vous en <strong>Sud</strong> et <strong>Nord</strong> pour jouer dans la même équipe !
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-stone-950 border-2 border-amber-400/60 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                <div>
                  <div className="text-[10px] uppercase font-bold text-stone-400">Code du salon</div>
                  <div className="text-2xl font-mono font-black tracking-widest text-amber-400">{roomCode}</div>
                </div>
                <button
                  onClick={copyRoomCode}
                  className="p-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl font-bold transition cursor-pointer"
                  title="Copier le code"
                >
                  {copiedCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              <button
                onClick={() => { soundEngine.playClick(); setShowSettingsModal(true); }}
                className="p-3 rounded-2xl bg-stone-800 hover:bg-stone-700 border border-stone-600 text-amber-400 cursor-pointer"
                title="Paramètres"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {isHost && (
            <div className="mb-4 bg-stone-950/90 border border-stone-800 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-2">
                <Bot className="w-4 h-4" /> Difficulté des Bots qui complètent la table :
              </span>
              <div className="flex gap-1.5">
                {Object.values(BOT_DIFFICULTIES).map((lvl) => {
                  const active = (gameState.botDifficulty || botDifficulty) === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => {
                        soundEngine.playClick();
                        setBotDifficulty(lvl.id);
                        updateGameState({ ...gameState, botDifficulty: lvl.id });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                        active ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 items-center my-6 max-w-xl mx-auto">
            <div />
            <LobbySeatCard
              seat="N"
              team="Équipe Nord-Sud"
              teamColor="text-emerald-400 border-emerald-500/50"
              occupant={gameState.seats.N}
              isMe={gameState.seats.N.uid === myUid}
              onClaim={() => claimSeatInLobby('N')}
            />
            <div />

            <LobbySeatCard
              seat="W"
              team="Équipe Est-Ouest"
              teamColor="text-amber-400 border-amber-500/50"
              occupant={gameState.seats.W}
              isMe={gameState.seats.W.uid === myUid}
              onClaim={() => claimSeatInLobby('W')}
            />

            <div className="w-28 h-28 sm:w-36 sm:h-36 mx-auto rounded-full bg-emerald-900/80 border-4 border-amber-600/50 flex flex-col items-center justify-center text-center p-2 shadow-inner">
              <Sparkles className="w-6 h-6 text-amber-400 mb-1" />
              <span className="text-xs font-extrabold text-emerald-100">Tapis Royal</span>
              <span className="text-[10px] text-emerald-300/80">1500 pts</span>
            </div>

            <LobbySeatCard
              seat="E"
              team="Équipe Est-Ouest"
              teamColor="text-amber-400 border-amber-500/50"
              occupant={gameState.seats.E}
              isMe={gameState.seats.E.uid === myUid}
              onClaim={() => claimSeatInLobby('E')}
            />

            <div />
            <LobbySeatCard
              seat="S"
              team="Équipe Nord-Sud"
              teamColor="text-emerald-400 border-emerald-500/50"
              occupant={gameState.seats.S}
              isMe={gameState.seats.S.uid === myUid}
              onClaim={() => claimSeatInLobby('S')}
            />
            <div />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-stone-800">
            <button
              onClick={() => { cleanupP2P(); setMode('HOME'); }}
              className="px-5 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Quitter le salon
            </button>

            {isHost ? (
              <button
                onClick={() => updateGameState({ ...gameState, status: 'BIDDING' })}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-base shadow-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Play className="w-5 h-5 fill-stone-950" /> Lancer la Partie (Les bots complètent)
              </button>
            ) : (
              <div className="text-amber-300 font-bold text-sm animate-pulse flex items-center gap-2">
                En attente que l'hôte lance la partie...
              </div>
            )}
          </div>
        </div>

        {showSettingsModal && (
          <SettingsModal
            onClose={() => setShowSettingsModal(false)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            audioSettings={audioSettings}
            setAudioSettings={setAudioSettings}
            botDifficulty={botDifficulty}
            setBotDifficulty={setBotDifficulty}
          />
        )}
      </div>
    );
  }

  if (!gameState) return null;

  // ==========================================
  // 9. RENDU : TABLE DE JEU PLEIN ÉCRAN (SANS BORDURES NOIRES)
  // ==========================================
  const isMyTurn = gameState.currentTurn === mySeat;
  const playableIds = gameState.status === 'PLAYING' && isMyTurn
    ? getPlayableCardIds(myHand, gameState.currentTrick, gameState.trumpSuit, mySeat)
    : [];

  const myTeam = getTeam(mySeat);
  const ourScore = myTeam === 'NS' ? gameState.scores.NS : gameState.scores.EW;
  const theirScore = myTeam === 'NS' ? gameState.scores.EW : gameState.scores.NS;

  const ourTricks = myTeam === 'NS' ? gameState.roundTricksCount.NS : gameState.roundTricksCount.EW;
  const theirTricks = myTeam === 'NS' ? gameState.roundTricksCount.EW : gameState.roundTricksCount.NS;

  const ourLiveRoundPoints = (myTeam === 'NS' ? gameState.roundPoints.NS : gameState.roundPoints.EW) +
    (gameState.beloteTeam === myTeam && gameState.beloteStep === 2 ? 20 : 0);
  const theirLiveRoundPoints = (myTeam === 'NS' ? gameState.roundPoints.EW : gameState.roundPoints.NS) +
    (gameState.beloteTeam && gameState.beloteTeam !== myTeam && gameState.beloteStep === 2 ? 20 : 0);

  const activeDifficultyObj = BOT_DIFFICULTIES[gameState.botDifficulty || botDifficulty] || BOT_DIFFICULTIES.PRO;

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 flex flex-col justify-between select-none font-sans">
      <style>{`
        @keyframes cardDropBottom {
          0% { opacity: 0; transform: translateY(75px) scale(0.75); }
          100% { opacity: 1; transform: translateY(28px) scale(1); }
        }
        @keyframes cardDropTop {
          0% { opacity: 0; transform: translateY(-75px) scale(0.75); }
          100% { opacity: 1; transform: translateY(-28px) scale(1); }
        }
        @keyframes cardDropLeft {
          0% { opacity: 0; transform: translateX(-85px) rotate(-18deg) scale(0.75); }
          100% { opacity: 1; transform: translateX(-52px) rotate(-6deg) scale(1); }
        }
        @keyframes cardDropRight {
          0% { opacity: 0; transform: translateX(85px) rotate(18deg) scale(0.75); }
          100% { opacity: 1; transform: translateX(52px) rotate(6deg) scale(1); }
        }
        @keyframes bubblePop {
          0% { opacity: 0; transform: translateY(8px) scale(0.8); }
          70% { transform: translateY(-3px) scale(1.05); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .anim-drop-bottom { animation: cardDropBottom 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .anim-drop-top    { animation: cardDropTop 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .anim-drop-left   { animation: cardDropLeft 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .anim-drop-right  { animation: cardDropRight 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .anim-bubble-pop  { animation: bubblePop 0.25s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
      `}</style>
      
      {/* BARRE SUPÉRIEURE */}
      <header className="relative z-30 bg-gradient-to-b from-stone-900 via-stone-900/95 to-stone-900/85 border-b-2 border-amber-600/40 px-3 sm:px-6 py-2 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { soundEngine.playClick(); cleanupP2P(); setMode('HOME'); }}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
            title="Retour au menu"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className="hidden sm:block">
            <div className="text-sm font-black tracking-wider text-amber-400 flex items-center gap-1.5">
              <Crown className="w-4 h-4" /> CONTRÉE ROYALE
              <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full border ${activeDifficultyObj.badgeColor}`}>
                Bots : {activeDifficultyObj.label}
              </span>
            </div>
            {mode === 'ONLINE' && (
              <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <Wifi className="w-3 h-3" /> P2P Direct: <span className="text-white font-bold">{roomCode}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="bg-emerald-950/90 border border-emerald-500/40 rounded-xl px-3 py-1 flex items-center gap-2.5 shadow-inner">
            <div className="text-left">
              <div className="text-[10px] font-bold uppercase text-emerald-300">Nous ({myTeam})</div>
              <div className="text-base sm:text-xl font-black text-white leading-tight">{ourScore}</div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="bg-emerald-500/25 border border-emerald-400/40 px-2 py-0.5 rounded text-[11px] font-black text-amber-300">
                Manche : {ourLiveRoundPoints} pts
              </span>
              <span className="text-[10px] font-bold text-emerald-200/80">
                {ourTricks} {ourTricks > 1 ? 'plis' : 'pli'}
              </span>
            </div>
          </div>

          <div className="bg-stone-950 border-2 border-amber-500/50 rounded-2xl px-3 sm:px-4 py-1 flex flex-col items-center justify-center min-w-[125px] sm:min-w-[160px] shadow-md">
            {gameState.contract ? (
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-md font-black text-sm flex items-center gap-1 ${SUIT_INFO[gameState.contract.suit].badgeBg}`}>
                  {gameState.contract.value === 250 ? 'CAPOT' : gameState.contract.value}
                  <span className="text-base leading-none">{SUIT_INFO[gameState.contract.suit].symbol}</span>
                </span>
                <span className="text-xs font-bold text-stone-300">
                  par {SEAT_NAMES[gameState.contract.seat]}
                </span>
                {gameState.contract.coinche > 1 && (
                  <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse">
                    {gameState.contract.coinche === 4 ? 'x4' : 'x2'}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1 py-0.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" /> Phase d'Enchères
              </div>
            )}
          </div>

          <div className="bg-rose-950/90 border border-rose-500/40 rounded-xl px-3 py-1 flex items-center gap-2.5 shadow-inner">
            <div className="flex flex-col items-start gap-0.5">
              <span className="bg-rose-500/25 border border-rose-400/40 px-2 py-0.5 rounded text-[11px] font-black text-amber-300">
                Manche : {theirLiveRoundPoints} pts
              </span>
              <span className="text-[10px] font-bold text-rose-200/80">
                {theirTricks} {theirTricks > 1 ? 'plis' : 'pli'}
              </span>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-rose-300">Eux</div>
              <div className="text-base sm:text-xl font-black text-white leading-tight">{theirScore}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => { soundEngine.playClick(); setShowLastTrickModal(true); }}
            disabled={!gameState.lastTrick || gameState.lastTrick.length === 0}
            className="px-2.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-amber-300 font-bold text-xs flex items-center gap-1.5 border border-stone-700 transition cursor-pointer"
            title="Agrandir le dernier pli"
          >
            <History className="w-4 h-4" />
            <span className="hidden lg:inline">Dernier Pli</span>
          </button>

          <button
            onClick={() => toggleFullscreen()}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 transition cursor-pointer"
            title={isFullscreen ? 'Mode Fenêtré' : 'Mode Plein Écran'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          <button
            onClick={() => { soundEngine.playClick(); setShowSettingsModal(true); }}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white border border-stone-700 transition cursor-pointer"
            title="Paramètres (Sons, Écran, Difficulté)"
          >
            <Settings className="w-4 h-4 text-amber-400" />
          </button>

          <button
            onClick={() => { soundEngine.playClick(); setShowRulesModal(true); }}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition cursor-pointer"
            title="Règles et valeur des cartes"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ZONE CENTRALE : TAPIS VERT OCCUPANT TOUTE LA LARGEUR */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-1.5 sm:p-3 overflow-hidden">
        <div className="relative w-full h-full rounded-[28px] sm:rounded-[44px] border-[8px] sm:border-[14px] border-amber-950 shadow-[inset_0_0_90px_rgba(0,0,0,0.85),0_12px_40px_rgba(0,0,0,0.8)] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-600 via-emerald-800 to-emerald-950 flex flex-col justify-between p-2 sm:p-5">
          
          <div className="absolute inset-2.5 sm:inset-4 rounded-[20px] sm:rounded-[32px] border border-amber-400/25 pointer-events-none" />

          {/* WIDGET EN HAUT À GAUCHE DU TAPIS */}
          {(gameState.status === 'PLAYING' || gameState.status === 'TRICK_END') && (
            <div className="absolute top-4 left-4 sm:top-6 sm:left-7 z-30 bg-stone-950/90 backdrop-blur-md border-2 border-amber-500/50 rounded-2xl px-4 py-2.5 shadow-2xl hidden sm:flex flex-col gap-2 min-w-[210px]">
              {gameState.contract && (
                <div className="flex items-center justify-between gap-3 border-b border-stone-800 pb-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                      Contrat Annoncé
                    </div>
                    <div className="text-xs font-extrabold text-stone-200 mt-0.5">
                      Par <span className="text-white">{gameState.seats[gameState.contract.seat]?.name}</span> ({SEAT_NAMES[gameState.contract.seat]})
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-xl border-2 border-amber-400 shadow-md">
                    <span className="font-black text-lg text-stone-950 leading-none">
                      {gameState.contract.value === 250 ? 'CAPOT' : gameState.contract.value}
                    </span>
                    <span className={`text-2xl leading-none ${SUIT_INFO[gameState.contract.suit].color}`}>
                      {SUIT_INFO[gameState.contract.suit].symbol}
                    </span>
                    {gameState.contract.coinche > 1 && (
                      <span className="bg-red-600 text-white text-[11px] font-black px-1.5 py-0.5 rounded ml-0.5">
                        x{gameState.contract.coinche}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Points Manche (Live)
                </div>
                <div className="flex items-center justify-between text-xs font-extrabold">
                  <span className="text-emerald-300">Nous : <strong className="text-white text-sm">{ourLiveRoundPoints}</strong></span>
                  <span className="text-stone-600">|</span>
                  <span className="text-rose-300">Eux : <strong className="text-white text-sm">{theirLiveRoundPoints}</strong></span>
                </div>
                <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden flex mt-0.5">
                  <div
                    className="bg-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round((ourLiveRoundPoints / 162) * 100))}%` }}
                  />
                  <div
                    className="bg-rose-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round((theirLiveRoundPoints / 162) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* WIDGET EN HAUT À DROITE DU TAPIS : DERNIER PLI */}
          {gameState.lastTrick && gameState.lastTrick.length > 0 && (
            <div
              onClick={() => { soundEngine.playClick(); setShowLastTrickModal(true); }}
              className="absolute top-4 right-4 sm:top-6 sm:right-7 z-30 bg-stone-950/85 hover:bg-stone-900 backdrop-blur-md border border-amber-500/40 rounded-2xl px-3 py-2 shadow-xl cursor-pointer transition group hidden sm:flex flex-col items-center"
              title="Cliquer pour agrandir le dernier pli"
            >
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1">
                <History className="w-3 h-3" /> Dernier Pli
              </div>
              <div className="flex items-center -space-x-3 group-hover:-space-x-1 transition-all">
                {gameState.lastTrick.map((play) => (
                  <div key={play.card.id} className="transform scale-90">
                    <PlayingCard
                      card={play.card}
                      size="xs"
                      showTrumpBadge={play.card.suit === gameState.trumpSuit}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* JOUEUR HAUT */}
          <div className="relative z-20 flex flex-col items-center shrink-0">
            <PlayerAvatarBadge
              seat={relativeSeats.top}
              player={gameState.seats[relativeSeats.top]}
              isTurn={gameState.currentTurn === relativeSeats.top}
              isDealer={gameState.dealer === relativeSeats.top}
              isTaker={gameState.contract?.seat === relativeSeats.top}
              bubble={gameState.bubbles?.[relativeSeats.top]}
              relationLabel="Partenaire"
            />
            <div className="mt-1 hidden sm:block">
              <CardBack count={gameState.hands?.[relativeSeats.top]?.length || 0} />
            </div>
          </div>

          {/* RANGÉE MILIEU */}
          <div className="relative z-20 flex-1 min-h-0 flex items-center justify-between w-full my-1 px-2 sm:px-6">
            
            <div className="flex flex-col items-center gap-1.5">
              <PlayerAvatarBadge
                seat={relativeSeats.left}
                player={gameState.seats[relativeSeats.left]}
                isTurn={gameState.currentTurn === relativeSeats.left}
                isDealer={gameState.dealer === relativeSeats.left}
                isTaker={gameState.contract?.seat === relativeSeats.left}
                bubble={gameState.bubbles?.[relativeSeats.left]}
                relationLabel="Adversaire"
              />
              <div className="hidden sm:block">
                <CardBack count={gameState.hands?.[relativeSeats.left]?.length || 0} />
              </div>
            </div>

            <div className="relative flex-1 h-full flex items-center justify-center">
              {gameState.trumpSuit && (
                <div className={`absolute pointer-events-none opacity-15 flex flex-col items-center justify-center ${SUIT_INFO[gameState.trumpSuit].color}`}>
                  <span className="text-8xl sm:text-9xl">{SUIT_INFO[gameState.trumpSuit].symbol}</span>
                </div>
              )}

              {gameState.status === 'BIDDING' && (
                <BiddingCenterPanel
                  gameState={gameState}
                  isMyTurn={isMyTurn}
                  mySeat={mySeat}
                  selectedBidValue={selectedBidValue}
                  setSelectedBidValue={setSelectedBidValue}
                  onBidAction={(action) => handleBidAction(mySeat, action)}
                />
              )}

              {(gameState.status === 'PLAYING' || gameState.status === 'TRICK_END') && (() => {
                let collectGlideClass = '';
                if (gameState.status === 'TRICK_END' && gameState.trickWinner) {
                  if (gameState.trickWinner === relativeSeats.bottom) {
                    collectGlideClass = 'translate-y-24 scale-75 opacity-0 transition-all duration-500 delay-700 ease-in';
                  } else if (gameState.trickWinner === relativeSeats.top) {
                    collectGlideClass = '-translate-y-24 scale-75 opacity-0 transition-all duration-500 delay-700 ease-in';
                  } else if (gameState.trickWinner === relativeSeats.left) {
                    collectGlideClass = '-translate-x-36 scale-75 opacity-0 transition-all duration-500 delay-700 ease-in';
                  } else if (gameState.trickWinner === relativeSeats.right) {
                    collectGlideClass = 'translate-x-36 scale-75 opacity-0 transition-all duration-500 delay-700 ease-in';
                  }
                }

                return (
                  <div className={`relative w-56 h-48 sm:w-72 sm:h-60 flex items-center justify-center ${collectGlideClass}`}>
                    {gameState.currentTrick.map((play) => {
                      let animClass = '';
                      if (play.seat === relativeSeats.bottom) animClass = 'anim-drop-bottom z-30';
                      else if (play.seat === relativeSeats.top) animClass = 'anim-drop-top z-10';
                      else if (play.seat === relativeSeats.left) animClass = 'anim-drop-left z-20';
                      else if (play.seat === relativeSeats.right) animClass = 'anim-drop-right z-20';

                      const isWinning = gameState.trickWinner === play.seat;

                      return (
                        <div
                          key={play.card.id}
                          className={`absolute ${animClass}`}
                        >
                          <div className={`transition-transform duration-300 ${isWinning ? 'scale-110 ring-4 ring-amber-400 rounded-xl shadow-[0_0_25px_rgba(251,191,36,0.8)]' : ''}`}>
                            <PlayingCard
                              card={play.card}
                              size="sm"
                              showTrumpBadge={play.card.suit === gameState.trumpSuit}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <PlayerAvatarBadge
                seat={relativeSeats.right}
                player={gameState.seats[relativeSeats.right]}
                isTurn={gameState.currentTurn === relativeSeats.right}
                isDealer={gameState.dealer === relativeSeats.right}
                isTaker={gameState.contract?.seat === relativeSeats.right}
                bubble={gameState.bubbles?.[relativeSeats.right]}
                relationLabel="Adversaire"
              />
              <div className="hidden sm:block">
                <CardBack count={gameState.hands?.[relativeSeats.right]?.length || 0} />
              </div>
            </div>
          </div>

          {/* JOUEUR BAS */}
          <div className="relative z-30 flex flex-col items-center mt-auto shrink-0">
            <div className="flex items-center gap-3 mb-1.5">
              <PlayerAvatarBadge
                seat={mySeat}
                player={gameState.seats[mySeat]}
                isTurn={isMyTurn}
                isDealer={gameState.dealer === mySeat}
                isTaker={gameState.contract?.seat === mySeat}
                bubble={gameState.bubbles?.[mySeat]}
                relationLabel="Vous"
              />

              <div className="relative">
                <button
                  onClick={() => { soundEngine.playClick(); setShowChatMenu(!showChatMenu); }}
                  className="p-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg transition cursor-pointer"
                  title="Envoyer un message rapide"
                >
                  <MessageSquare className="w-4 h-4 fill-stone-950" />
                </button>
                {showChatMenu && (
                  <div className="absolute bottom-12 right-0 w-56 bg-stone-900 border-2 border-amber-400 rounded-2xl p-2 shadow-2xl z-50 grid grid-cols-1 gap-1">
                    {QUICK_CHATS.map((msg, i) => (
                      <button
                        key={i}
                        onClick={() => sendQuickChat(msg)}
                        className="text-left px-3 py-1.5 rounded-lg hover:bg-stone-800 text-xs font-bold text-white transition cursor-pointer"
                      >
                        {msg}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center px-2 pb-1">
              <div className="flex items-center justify-center -space-x-5 sm:-space-x-4 md:-space-x-3">
                {myHand.map((card) => {
                  const canPlay = gameState.status === 'PLAYING' && isMyTurn && playableIds.includes(card.id);
                  const dimCard = gameState.status === 'PLAYING' && isMyTurn && !playableIds.includes(card.id);

                  return (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      size="md"
                      isPlayable={canPlay}
                      isDisabled={dimCard}
                      showTrumpBadge={card.suit === gameState.trumpSuit}
                      onClick={(c) => handlePlayCard(mySeat, c)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* MODAL RÉCAPITULATIF DE FIN DE MANCHE */}
      {(gameState.status === 'ROUND_SUMMARY' || gameState.status === 'GAME_OVER') && gameState.roundSummary && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-stone-900 border-2 border-amber-400 rounded-3xl p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {gameState.status === 'GAME_OVER' ? 'Fin de la Partie !' : 'Résultat de la Manche'}
                </span>
                <h3 className="text-2xl font-black mt-0.5 flex items-center gap-2">
                  {gameState.roundSummary.isContractMade ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-6 h-6" /> Contrat Réussi !
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-6 h-6" /> Contrat Chuté ("Dedans") !
                    </span>
                  )}
                </h3>
              </div>

              <div className={`px-3 py-1.5 rounded-xl font-black text-sm flex items-center gap-1 ${SUIT_INFO[gameState.roundSummary.contract.suit].badgeBg}`}>
                {gameState.roundSummary.contract.value === 250 ? 'CAPOT' : gameState.roundSummary.contract.value}
                <span>{SUIT_INFO[gameState.roundSummary.contract.suit].symbol}</span>
                {gameState.roundSummary.contract.coinche > 1 && (
                  <span className="ml-1 bg-amber-400 text-stone-950 px-1.5 rounded text-xs">
                    x{gameState.roundSummary.contract.coinche}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-stone-950 rounded-2xl p-4 mb-6 text-center text-sm border border-stone-800">
              <div className="text-left text-stone-400 font-semibold space-y-2">
                <div className="h-6">Équipe</div>
                <div>Plis remportés</div>
                <div>Points des plis</div>
                <div>Belote / Rebelote</div>
                <div className="pt-2 border-t border-stone-800 text-amber-400 font-bold">Gain Manche</div>
                <div className="text-white font-black">Score Total</div>
              </div>

              <div className="space-y-2 font-bold">
                <div className="h-6 text-emerald-400 font-black">Nord - Sud</div>
                <div>{gameState.roundSummary.tricksNS} plis</div>
                <div>{gameState.roundSummary.rawPointsNS} pts</div>
                <div>+{gameState.roundSummary.beloteNS} pts</div>
                <div className="pt-2 border-t border-stone-800 text-emerald-400 text-base font-black">
                  +{gameState.roundSummary.deltaNS}
                </div>
                <div className="text-xl font-black text-white">{gameState.scores.NS}</div>
              </div>

              <div className="space-y-2 font-bold">
                <div className="h-6 text-rose-400 font-black">Est - Ouest</div>
                <div>{gameState.roundSummary.tricksEW} plis</div>
                <div>{gameState.roundSummary.rawPointsEW} pts</div>
                <div>+{gameState.roundSummary.beloteEW} pts</div>
                <div className="pt-2 border-t border-stone-800 text-rose-400 text-base font-black">
                  +{gameState.roundSummary.deltaEW}
                </div>
                <div className="text-xl font-black text-white">{gameState.scores.EW}</div>
              </div>
            </div>

            {gameState.status === 'GAME_OVER' ? (
              <div className="text-center space-y-4">
                <div className="bg-amber-500/20 border border-amber-400 rounded-2xl p-4">
                  <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-1" />
                  <div className="text-lg font-black text-amber-300">
                    Victoire de l'équipe {gameState.scores.NS >= gameState.scores.EW ? 'Nord-Sud' : 'Est-Ouest'} !
                  </div>
                </div>
                <button
                  onClick={() => {
                    const resetState = { ...gameState, scores: { NS: 0, EW: 0 } };
                    startNewDeal(resetState, getNextSeat(gameState.dealer));
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-black rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" /> Rejouer une Partie
                </button>
              </div>
            ) : (
              <button
                onClick={() => startNewDeal(gameState, getNextSeat(gameState.dealer))}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
              >
                Manche Suivante <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL VISUALISATION DU DERNIER PLI */}
      {showLastTrickModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={() => setShowLastTrickModal(false)}>
          <div className="bg-stone-900 border-2 border-amber-500/50 rounded-3xl p-6 max-w-md w-full text-white" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2 text-amber-400">
                <History className="w-5 h-5" /> Dernier Pli Ramassé
              </h3>
              <button onClick={() => setShowLastTrickModal(false)} className="text-stone-400 hover:text-white font-bold">✕</button>
            </div>
            <div className="flex items-center justify-center gap-3 py-4">
              {gameState.lastTrick.map((play) => (
                <div key={play.card.id} className="flex flex-col items-center gap-1.5">
                  <span className="text-xs font-bold text-stone-300">{SEAT_NAMES[play.seat]}</span>
                  <PlayingCard card={play.card} size="sm" showTrumpBadge={play.card.suit === gameState.trumpSuit} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          audioSettings={audioSettings}
          setAudioSettings={setAudioSettings}
          botDifficulty={botDifficulty}
          setBotDifficulty={setBotDifficulty}
        />
      )}
    </div>
  );
}

// ==========================================
// 11. SOUS-COMPOSANTS D'INTERFACE & SETTINGS
// ==========================================

const SettingsModal = ({
  onClose,
  isFullscreen,
  onToggleFullscreen,
  audioSettings,
  setAudioSettings,
  botDifficulty,
  setBotDifficulty
}) => {
  const handleSliderChange = (key, value) => {
    setAudioSettings((prev) => ({
      ...prev,
      [key]: Number(value)
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-lg w-full text-white shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 pb-4">
          <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
            <Settings className="w-6 h-6" /> Paramètres de l'Application
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer">
            ✕
          </button>
        </div>

        {/* SECTION 1 : AFFICHAGE PLEIN ÉCRAN / FENÊTRÉ */}
        <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <Monitor className="w-4 h-4" /> Mode d'Affichage (Sans bordures noires)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onToggleFullscreen(true)}
              className={`py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition cursor-pointer ${
                isFullscreen
                  ? 'bg-amber-400 text-stone-950 border-white shadow-lg'
                  : 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-stone-800'
              }`}
            >
              <Maximize className="w-4 h-4" /> Plein Écran
            </button>
            <button
              type="button"
              onClick={() => onToggleFullscreen(false)}
              className={`py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition cursor-pointer ${
                !isFullscreen
                  ? 'bg-amber-400 text-stone-950 border-white shadow-lg'
                  : 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-stone-800'
              }`}
            >
              <Minimize className="w-4 h-4" /> Mode Fenêtré
            </button>
          </div>
        </div>

        {/* SECTION 2 : VOLUMES AUDIO */}
        <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              {audioSettings.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              Volumes Sonores du Jeu
            </div>
            <button
              type="button"
              onClick={() => {
                const nextMuted = !audioSettings.muted;
                setAudioSettings((prev) => ({ ...prev, muted: nextMuted }));
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black cursor-pointer transition ${
                audioSettings.muted
                  ? 'bg-rose-600 text-white'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              {audioSettings.muted ? 'Son Coupé (Activer)' : 'Couper tout le son'}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-stone-300">Volume Général</span>
                <span className="text-amber-400">{audioSettings.master}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audioSettings.master}
                onChange={(e) => handleSliderChange('master', e.target.value)}
                onMouseUp={() => soundEngine.playClick()}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-stone-300">Bruitages des Cartes & Plis</span>
                <span className="text-emerald-400">{audioSettings.cards}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audioSettings.cards}
                onChange={(e) => handleSliderChange('cards', e.target.value)}
                onMouseUp={() => soundEngine.playCardSlap()}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-stone-300">Annonces, Contres & Fin de Manche</span>
                <span className="text-amber-300">{audioSettings.announces}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audioSettings.announces}
                onChange={(e) => handleSliderChange('announces', e.target.value)}
                onMouseUp={() => soundEngine.playBidSound('BID')}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-stone-300">Sons des Boutons & Interface</span>
                <span className="text-sky-300">{audioSettings.ui}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audioSettings.ui}
                onChange={(e) => handleSliderChange('ui', e.target.value)}
                onMouseUp={() => soundEngine.playClick()}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3 : NIVEAU DE DIFFICULTÉ DES BOTS */}
        <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <Bot className="w-4 h-4" /> Niveau de Difficulté des Bots
          </div>
          <div className="grid grid-cols-1 gap-2">
            {Object.values(BOT_DIFFICULTIES).map((lvl) => {
              const active = botDifficulty === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setBotDifficulty(lvl.id);
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                    active
                      ? 'bg-amber-500/15 border-amber-400 text-white'
                      : 'bg-stone-900/80 border-stone-800 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <div>
                    <div className="font-black text-sm flex items-center gap-2">
                      <span>{lvl.label}</span>
                      {active && (
                        <span className="text-[10px] bg-amber-400 text-stone-950 px-2 py-0.5 rounded-full font-black">
                          Actif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-400 mt-0.5">{lvl.shortDesc}</div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 ${active ? 'bg-amber-400 border-white' : 'border-stone-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => { soundEngine.playClick(); onClose(); }}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-sm shadow-lg cursor-pointer"
        >
          Enregistrer et Fermer
        </button>
      </div>
    </div>
  );
};

const PlayerAvatarBadge = ({ seat, player, isTurn, isDealer, isTaker, bubble, relationLabel }) => {
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
            ${bubble.type === 'chat' || bubble.type === 'info' ? 'bg-emerald-950 text-emerald-200 border-emerald-400' : ''}
          `}
        >
          {bubble.type === 'bid' && bubble.suit ? (
            <>
              <span className="text-stone-950 font-black">
                {bubble.value === 250 ? 'CAPOT' : bubble.value || bubble.text.replace(/[♠♥♦♣]/g, '').trim()}
              </span>
              <span className={`${SUIT_INFO[bubble.suit].color} text-sm leading-none`}>
                {SUIT_INFO[bubble.suit].symbol}
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
          {player.isBot ? <Bot className="w-3.5 h-3.5" /> : SEAT_NAMES[seat][0]}
        </div>

        <div className="text-left leading-tight">
          <div className="font-extrabold text-xs flex items-center gap-1">
            {player.name}
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

const BiddingCenterPanel = ({ gameState, isMyTurn, mySeat, selectedBidValue, setSelectedBidValue, onBidAction }) => {
  const highestBid = gameState.highestBid;
  const minVal = highestBid ? highestBid.value + 10 : 80;
  const canCoinche = highestBid && getTeam(highestBid.seat) !== getTeam(mySeat) && gameState.coincheStatus === 1;
  const canSurcoinche = highestBid && getTeam(highestBid.seat) === getTeam(mySeat) && gameState.coincheStatus === 2;

  const lastBidBySeat = {};
  (gameState.bids || []).forEach((b) => {
    lastBidBySeat[b.seat] = b;
  });

  return (
    <div className="bg-stone-900/95 backdrop-blur-md border-2 border-amber-500/60 rounded-2xl p-3 sm:p-4 max-w-md w-full shadow-[0_12px_35px_rgba(0,0,0,0.85)] text-white z-30">
      <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block leading-none">
            Enchères de la Contrée
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
              <span className={`${SUIT_INFO[highestBid.suit].color} text-sm leading-none`}>
                {SUIT_INFO[highestBid.suit].symbol}
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
              <span className="text-[9px] font-bold text-stone-400 truncate max-w-full leading-tight">
                {SEAT_NAMES[s]} • {gameState.seats[s]?.name.split(' ')[0]}
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
                    <span className={`text-xs leading-none ${SUIT_INFO[b.suit].color}`}>
                      {SUIT_INFO[b.suit].symbol}
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

              <div className="grid grid-cols-4 gap-1.5">
                {SUITS.map((suitKey) => {
                  const info = SUIT_INFO[suitKey];
                  return (
                    <button
                      key={suitKey}
                      onClick={() => onBidAction({ type: 'BID', value: selectedBidValue, suit: suitKey })}
                      className={`
                        py-1.5 px-2 rounded-xl font-black text-xs flex flex-col items-center justify-center
                        bg-white hover:bg-amber-50 border-2 border-stone-200 hover:border-amber-400 shadow transition transform active:scale-95 cursor-pointer
                        ${info.color}
                      `}
                    >
                      <span className="text-xl leading-none">{info.symbol}</span>
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

const LobbySeatCard = ({ seat, team, teamColor, occupant, isMe, onClaim }) => {
  return (
    <div className={`bg-stone-950/90 border-2 rounded-2xl p-3.5 text-center flex flex-col items-center shadow-lg ${isMe ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-stone-800'}`}>
      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border mb-1.5 ${teamColor}`}>
        {SEAT_NAMES[seat]} • {team}
      </span>
      <div className="font-black text-base text-white flex items-center gap-1.5 my-1">
        {occupant.isBot ? <Bot className="w-4 h-4 text-stone-400" /> : <Users className="w-4 h-4 text-amber-400" />}
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
          Prendre cette place
        </button>
      ) : (
        <span className="mt-2 text-xs font-semibold text-emerald-400">Occupé par un ami</span>
      )}
    </div>
  );
};

const RulesModal = ({ onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-2xl w-full text-white max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
        <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
          <Award className="w-6 h-6" /> Règles Officielles de la Belote Contrée
        </h3>
        <button onClick={onClose} className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer">✕</button>
      </div>

      <div className="space-y-4 text-xs sm:text-sm text-stone-300 leading-relaxed">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-stone-950 p-4 rounded-2xl border border-amber-500/30">
            <h4 className="font-black text-amber-400 mb-2 uppercase">À l'Atout (Ordre & Points)</h4>
            <ul className="space-y-1 font-semibold">
              <li className="flex justify-between"><span>1. Valet (Le plus fort)</span> <span className="text-amber-300 font-black">20 pts</span></li>
              <li className="flex justify-between"><span>2. Neuf (Le second)</span> <span className="text-amber-300 font-black">14 pts</span></li>
              <li className="flex justify-between"><span>3. As</span> <span>11 pts</span></li>
              <li className="flex justify-between"><span>4. Dix</span> <span>10 pts</span></li>
              <li className="flex justify-between"><span>5. Roi</span> <span>4 pts</span></li>
              <li className="flex justify-between"><span>6. Dame</span> <span>3 pts</span></li>
              <li className="flex justify-between text-stone-500"><span>7. Huit & Sept</span> <span>0 pt</span></li>
            </ul>
          </div>

          <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800">
            <h4 className="font-black text-emerald-400 mb-2 uppercase">Hors Atout (Ordre & Points)</h4>
            <ul className="space-y-1 font-semibold">
              <li className="flex justify-between"><span>1. As (Le plus fort)</span> <span className="text-emerald-300 font-black">11 pts</span></li>
              <li className="flex justify-between"><span>2. Dix</span> <span className="text-emerald-300 font-black">10 pts</span></li>
              <li className="flex justify-between"><span>3. Roi</span> <span>4 pts</span></li>
              <li className="flex justify-between"><span>4. Dame</span> <span>3 pts</span></li>
              <li className="flex justify-between"><span>5. Valet</span> <span>2 pts</span></li>
              <li className="flex justify-between text-stone-500"><span>6. Neuf, Huit & Sept</span> <span>0 pt</span></li>
            </ul>
          </div>
        </div>

        <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-2">
          <h4 className="font-black text-white">Déroulement & Spécificités de la Contrée :</h4>
          <p>• <strong>Distribution :</strong> Les 8 cartes sont distribuées d'un seul coup à chaque joueur avant le début des enchères.</p>
          <p>• <strong>Enchères :</strong> On annonce le nombre de points que son équipe s'engage à réaliser (de <strong>80 à 160</strong>, ou <strong>Capot = 250 pts</strong> pour les 8 plis) ainsi que la couleur d'atout. Le total des plis vaut 152 pts + <strong>10 de Der</strong> = <strong>162 points</strong>.</p>
          <p>• <strong>Belote & Rebelote (+20 pts) :</strong> Si un joueur possède le Roi et la Dame d'atout, son équipe gagne 20 points supplémentaires qui comptent pour aider à remplir le contrat !</p>
          <p>• <strong>Pose des cartes :</strong> Obligation de fournir à la couleur demandée. À l'atout, obligation de monter. Si on n'a pas la couleur demandée et que l'adversaire est maître, obligation de couper (et surcouper si possible). Si notre partenaire est maître, on peut se défausser ("pisser").</p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="mt-6 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm cursor-pointer"
      >
        J'ai compris, retour au tapis !
      </button>
    </div>
  </div>
);

const DesktopExportModal = ({ onClose, onDownloadBat, onDownloadHtml }) => {
  const [sharedLink, setSharedLink] = useState('');

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-stone-900 border-2 border-amber-400 rounded-3xl p-6 max-w-2xl w-full text-white max-h-[88vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
          <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
            <Monitor className="w-6 h-6" /> Transformer le jeu en Exécutable PC
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer">✕</button>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-stone-300 leading-relaxed">
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 space-y-3">
            <div className="bg-stone-950/90 border border-stone-800 rounded-xl p-3 space-y-2">
              <label className="block text-[11px] font-bold uppercase text-amber-400">
                Optionnel : Colle ici ton lien de partage Gemini :
              </label>
              <input
                type="text"
                value={sharedLink}
                onChange={(e) => setSharedLink(e.target.value)}
                placeholder="Ex: https://gemini.google.com/share/..."
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => onDownloadBat(sharedLink)}
                className="w-full py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" /> 1. Télécharger le .BAT Auto-Extractible
              </button>

              <button
                onClick={() => onDownloadHtml}
                className="w-full py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" /> 2. Télécharger ContreeRoyale.html
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-black text-xs cursor-pointer"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};