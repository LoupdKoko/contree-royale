import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Trophy, Users, Play, Copy, Check, MessageSquare, History,
  ShieldAlert, Sparkles, RotateCcw,
  UserPlus, Bot, Crown, HelpCircle, ChevronRight, LogOut, Flame, Wifi,
  Settings, Maximize, Minimize, BarChart3
} from 'lucide-react';
import { Peer } from 'peerjs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

import './App.css';
import { soundEngine } from './audio/SoundEngine';
import {
  SUITS,
  SUIT_INFO,
  BID_VALUES,
  SEATS,
  SEAT_NAMES,
  BOT_DIFFICULTIES,
  BOT_SPEEDS,
  GAME_VARIANTS,
  SCORING_MODES,
  TARGET_SCORE_OPTIONS,
  TABLE_THEMES,
  CARD_BACK_THEMES,
  DEFAULT_PLAYER_STATS,
  QUICK_CHATS
} from './engine/constants';
import {
  getTeam,
  getNextSeat,
  getCardPoints,
  sortHand,
  createAndDealDeck,
  getTrickWinner,
  getPlayableCardIds,
  cryptoRandomInt,
  resolveTableDeclarations,
  normalizeRoundPoints,
  calculateRoundScore
} from './engine/rules';
import { decideBotBid, decideBotCard } from './engine/botAI';
import { assignBotNamesForSeats, pickSingleBotName } from './engine/botNames';
import { PlayingCard, CardBack } from './components/PlayingCard';
import {
  PlayerAvatarBadge,
  BiddingCenterPanel,
  LobbySeatCard,
  TrumpTrackerWidget
} from './components/TableWidgets';
import {
  SettingsModal,
  StatsModal,
  RulesModal,
  DesktopExportModal
} from './components/Modals';

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

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateShortCode(length = 5) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[cryptoRandomInt(ROOM_CODE_CHARS.length)];
  }
  return code;
}

function createBubbleId() {
  return generateShortCode(8);
}

function createSoundEventId() {
  return 'snd_' + generateShortCode(10);
}

function playRemoteSoundEvent(soundEvt, nextState, myUid) {
  if (!soundEvt || !nextState) return;
  const guestSeat = SEATS.find((s) => nextState.seats?.[s]?.uid === myUid) || 'S';

  if (soundEvt.kind === 'BID') {
    if (soundEvt.actorSeat !== guestSeat) {
      soundEngine.playBidSound(soundEvt.bidType);
    }
  } else if (soundEvt.kind === 'CARD') {
    if (soundEvt.actorSeat !== guestSeat) {
      soundEngine.playCardSlap();
    }
    if (soundEvt.isBelote) {
      soundEngine.playBidSound('BID');
    }
  } else if (soundEvt.kind === 'TRICK_SWEEP') {
    soundEngine.playTrickSweep();
  } else if (soundEvt.kind === 'ROUND_END') {
    soundEngine.playTrickSweep();
    if (soundEvt.isFanny) {
      soundEngine.playFannySound(getTeam(guestSeat) === soundEvt.winnerTeam);
    } else {
      soundEngine.playRoundEnd(soundEvt.isContractMade);
    }
  } else if (soundEvt.kind === 'CHAT' || soundEvt.kind === 'CLICK') {
    if (soundEvt.actorSeat !== guestSeat) {
      soundEngine.playClick();
    }
  }
}

async function authenticateFirebaseUser(fallbackUid) {
  if (!auth) return fallbackUid;
  if (auth.currentUser) return auth.currentUser.uid;
  try {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      const cred = await signInWithCustomToken(auth, __initial_auth_token);
      return cred.user.uid;
    } else {
      const cred = await signInAnonymously(auth);
      return cred.user.uid;
    }
  } catch {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  }
}

export default function App() {
  // Identifiant persistant dans localStorage pour permettre la reconnexion automatique au même siège
  const [myUid, setMyUid] = useState(() => {
    try {
      const saved = localStorage.getItem('contree_my_uid');
      if (saved) return saved;
      const fresh = 'p2p_' + generateShortCode(8).toLowerCase();
      localStorage.setItem('contree_my_uid', fresh);
      return fresh;
    } catch {
      return 'p2p_' + generateShortCode(8).toLowerCase();
    }
  });

  const [pseudo, setPseudo] = useState(() => {
    try {
      return localStorage.getItem('contree_pseudo') || 'Joueur 1';
    } catch {
      return 'Joueur 1';
    }
  });

  const [mode, setMode] = useState('HOME'); // 'HOME' | 'LOCAL' | 'ONLINE' | 'WEBRTC_SETUP'
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [activeRoomAppId] = useState(rawAppId);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [p2pStatus, setP2pStatus] = useState('IDLE');

  // Paramètres Globaux (Difficulté Bots, Vitesse, Variante, Comptage, Score Cible, Thèmes, Entraînement, Audio)
  const [botDifficulty, setBotDifficulty] = useState(() => {
    try {
      return localStorage.getItem('contree_bot_diff') || 'PRO';
    } catch {
      return 'PRO';
    }
  });

  const [botSpeed, setBotSpeed] = useState(() => {
    try {
      return localStorage.getItem('contree_bot_speed') || 'NORMAL';
    } catch {
      return 'NORMAL';
    }
  });

  const [gameVariant, setGameVariant] = useState(() => {
    try {
      return localStorage.getItem('contree_game_variant') || 'CONTREE';
    } catch {
      return 'CONTREE';
    }
  });

  const [scoringMode, setScoringMode] = useState(() => {
    try {
      return localStorage.getItem('contree_scoring_mode') || 'POINTS_PLUS_CONTRACT';
    } catch {
      return 'POINTS_PLUS_CONTRACT';
    }
  });

  const [targetScore, setTargetScore] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('contree_target_score'));
      return TARGET_SCORE_OPTIONS.includes(saved) ? saved : 1500;
    } catch {
      return 1500;
    }
  });

  const [tableTheme, setTableTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('contree_table_theme');
      return TABLE_THEMES[saved] ? saved : 'EMERALD';
    } catch {
      return 'EMERALD';
    }
  });

  const [cardBackTheme, setCardBackTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('contree_card_back');
      return CARD_BACK_THEMES[saved] ? saved : 'ROYAL_BLUE';
    } catch {
      return 'ROYAL_BLUE';
    }
  });

  const [trainingTrumpHelper, setTrainingTrumpHelper] = useState(() => {
    try {
      return localStorage.getItem('contree_training_trump_helper') === 'true';
    } catch {
      return false;
    }
  });

  const [playerStats, setPlayerStats] = useState(() => {
    try {
      const saved = localStorage.getItem('contree_player_stats');
      if (saved) return { ...DEFAULT_PLAYER_STATS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_PLAYER_STATS;
  });

  const [audioSettings, setAudioSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('contree_audio_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
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
  const [showStatsModal, setShowStatsModal] = useState(false);

  // États pour le Pont Direct WebRTC & PeerJS multi-joueurs
  const [rtcRole, setRtcRole] = useState(null);
  const [rtcLocalToken, setRtcLocalToken] = useState('');
  const [rtcRemoteInput, setRtcRemoteInput] = useState('');
  const [rtcStep, setRtcStep] = useState(1);
  const rtcPeerRef = useRef(null);
  const rtcConnectionsRef = useRef([]);
  const peerJsInstanceRef = useRef(null);

  const [gameState, setGameState] = useState(null);

  const unsubscribeRef = useRef(null);
  const gameStateRef = useRef(null);
  const peerMessageHandlerRef = useRef(null);
  const lastRecordedRoundIdRef = useRef(null);
  const lastPlayedSoundIdRef = useRef(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    try {
      localStorage.setItem('contree_pseudo', pseudo);
    } catch {}
  }, [pseudo]);

  // Synchronisation avec le moteur audio et localStorage
  useEffect(() => {
    soundEngine.updateSettings(audioSettings);
    try {
      localStorage.setItem('contree_audio_settings', JSON.stringify(audioSettings));
    } catch {}
  }, [audioSettings]);

  useEffect(() => {
    try {
      localStorage.setItem('contree_bot_diff', botDifficulty);
      localStorage.setItem('contree_bot_speed', botSpeed);
      localStorage.setItem('contree_game_variant', gameVariant);
      localStorage.setItem('contree_scoring_mode', scoringMode);
      localStorage.setItem('contree_target_score', String(targetScore));
      localStorage.setItem('contree_table_theme', tableTheme);
      localStorage.setItem('contree_card_back', cardBackTheme);
      localStorage.setItem('contree_training_trump_helper', String(trainingTrumpHelper));
    } catch {}
    if (gameStateRef.current && (mode === 'LOCAL' || gameStateRef.current.hostId === myUid)) {
      const isLobby = gameStateRef.current.status === 'LOBBY';
      const updated = {
        ...gameStateRef.current,
        botDifficulty: isLobby ? botDifficulty : gameStateRef.current.botDifficulty,
        botSpeed,
        gameVariant: isLobby ? gameVariant : gameStateRef.current.gameVariant,
        scoringMode: isLobby ? scoringMode : gameStateRef.current.scoringMode,
        targetScore: isLobby ? targetScore : gameStateRef.current.targetScore
      };
      gameStateRef.current = updated;
      setGameState(updated);
    }
  }, [botDifficulty, botSpeed, gameVariant, scoringMode, targetScore, tableTheme, cardBackTheme, trainingTrumpHelper, mode, myUid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUnlockAudio = () => soundEngine.unlock();
    window.addEventListener('pointerdown', handleUnlockAudio, { passive: true });
    window.addEventListener('keydown', handleUnlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlockAudio);
      window.removeEventListener('keydown', handleUnlockAudio);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
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

  const ensureAuthenticated = () => authenticateFirebaseUser(myUid);

  useEffect(() => {
    if (!auth) return;
    let isMounted = true;
    authenticateFirebaseUser('').then((uid) => {
      if (isMounted && uid) {
        setMyUid(uid);
      }
    });
    const unsub = onAuthStateChanged(auth, (user) => {
      if (isMounted && user) {
        setMyUid(user.uid);
      }
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const [bidSelection, setBidSelection] = useState({ key: '', value: 80 });
  const [showLastTrickModal, setShowLastTrickModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDesktopModal, setShowDesktopModal] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

  const botTimeoutRef = useRef(null);

  const mySeat = useMemo(() => {
    if (!gameState) return 'S';
    const found = SEATS.find(s => gameState.seats[s]?.uid === myUid);
    return found || 'S';
  }, [gameState, myUid]);

  // Enregistrement automatique des statistiques locales à chaque fin de manche / fin de partie
  useEffect(() => {
    if (!gameState || !gameState.roundSummary) return;
    if (gameState.status !== 'ROUND_SUMMARY' && gameState.status !== 'GAME_OVER') return;

    const roundId = gameState.roundSummary.roundId;
    if (!roundId || lastRecordedRoundIdRef.current === roundId) return;
    lastRecordedRoundIdRef.current = roundId;

    const summary = gameState.roundSummary;
    const myTeam = getTeam(mySeat);
    const ourDelta = myTeam === 'NS' ? summary.deltaNS : summary.deltaEW;
    const ourTricks = myTeam === 'NS' ? summary.tricksNS : summary.tricksEW;
    const weTookContract = summary.contract.team === myTeam;
    const weWonRound = weTookContract ? summary.isContractMade : !summary.isContractMade;
    const isGameOver = gameState.status === 'GAME_OVER';
    const ourTotal = myTeam === 'NS' ? gameState.scores.NS : gameState.scores.EW;
    const theirTotal = myTeam === 'NS' ? gameState.scores.EW : gameState.scores.NS;
    const weWonGame = isGameOver && ourTotal > theirTotal;
    const isFannyInflicted = isGameOver && weWonGame && theirTotal <= 0;
    const isFannySuffered = isGameOver && !weWonGame && ourTotal <= 0;

    setPlayerStats((prev) => {
      const next = {
        ...prev,
        roundsPlayed: prev.roundsPlayed + 1,
        contractsTaken: prev.contractsTaken + (weTookContract ? 1 : 0),
        contractsMade: prev.contractsMade + (weTookContract && summary.isContractMade ? 1 : 0),
        capotsMade: prev.capotsMade + (ourTricks === 8 ? 1 : 0),
        coinchesWon: prev.coinchesWon + (summary.contract.coinche > 1 && weWonRound ? 1 : 0),
        bestRoundScore: Math.max(prev.bestRoundScore || 0, ourDelta),
        gamesPlayed: prev.gamesPlayed + (isGameOver ? 1 : 0),
        gamesWon: prev.gamesWon + (weWonGame ? 1 : 0),
        fannysInflicted: prev.fannysInflicted + (isFannyInflicted ? 1 : 0),
        fannysSuffered: prev.fannysSuffered + (isFannySuffered ? 1 : 0)
      };
      try {
        localStorage.setItem('contree_player_stats', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [gameState, mySeat]);

  const resetPlayerStats = () => {
    setPlayerStats(DEFAULT_PLAYER_STATS);
    try {
      localStorage.setItem('contree_player_stats', JSON.stringify(DEFAULT_PLAYER_STATS));
    } catch {}
  };

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

  const sendToAllPeers = (payloadObj) => {
    const serialized = JSON.stringify(payloadObj);
    rtcConnectionsRef.current.forEach((conn) => {
      if (conn && conn.readyState === 'open') {
        try {
          conn.send(serialized);
        } catch (err) {
          console.error('Erreur envoi P2P:', err);
        }
      }
    });
  };

  const cleanupP2P = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    rtcConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch {}
    });
    rtcConnectionsRef.current = [];
    if (rtcPeerRef.current) {
      try { rtcPeerRef.current.close(); } catch {}
      rtcPeerRef.current = null;
    }
    if (peerJsInstanceRef.current) {
      try { peerJsInstanceRef.current.destroy(); } catch {}
      peerJsInstanceRef.current = null;
    }
    lastPlayedSoundIdRef.current = null;
    setP2pStatus('IDLE');
  };

  // Remplacement automatique d'un joueur déconnecté par un Bot de secours (sans bloquer la partie)
  const handlePeerDisconnected = (disconnectedWrapper) => {
    rtcConnectionsRef.current = rtcConnectionsRef.current.filter((c) => c !== disconnectedWrapper);
    const current = gameStateRef.current;
    if (!current || current.hostId !== myUid) return;

    const targetUid = disconnectedWrapper.playerUid;
    if (!targetUid) return;

    const seatKey = SEATS.find((s) => current.seats[s]?.uid === targetUid);
    if (!seatKey) return;

    const updated = JSON.parse(JSON.stringify(current));
    const oldSeat = updated.seats[seatKey];

    if (updated.status === 'LOBBY') {
      updated.seats[seatKey] = {
        uid: `bot_${seatKey}`,
        name: pickSingleBotName(updated.seats, updated.botDifficulty || botDifficulty, seatKey),
        isBot: true
      };
    } else {
      // En pleine partie : un bot prend le relais en gardant l'identité d'origine pour permettre la reconnexion !
      updated.seats[seatKey] = {
        uid: `tempbot_${targetUid}`,
        originalUid: targetUid,
        originalName: oldSeat.name,
        name: `${oldSeat.name}`,
        isBot: true,
        isTempBot: true
      };
      updated.bubbles = {
        ...(updated.bubbles || {}),
        [seatKey]: {
          text: `${oldSeat.name} déconnecté — Bot en relais 🤖`,
          type: 'info',
          id: createBubbleId()
        }
      };
    }

    updateGameState(updated);
  };

  // ==========================================
  // MODE SALON RAPIDE PC (.EXE) AVEC CODE À 5 LETTRES (PEERJS LOCAL)
  // ==========================================
  const getPeerConstructor = () => {
    if (typeof Peer !== 'undefined') return Peer;
    if (typeof window !== 'undefined' && window.Peer) return window.Peer;
    throw new Error('PeerJS non disponible');
  };

  const registerConnectionWrapper = (wrapper) => {
    rtcConnectionsRef.current = [
      ...rtcConnectionsRef.current.filter((c) => c.readyState === 'open' && c !== wrapper),
      wrapper
    ];
  };

  const createPeerJsRoom = async () => {
    soundEngine.playClick();
    cleanupP2P();
    setErrorMsg('');
    setP2pStatus('CONNECTING');
    try {
      const PeerClass = getPeerConstructor();
      const shortCode = generateShortCode(5);
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
        const wrapper = {
          id: conn.peer || generateShortCode(6),
          playerUid: null,
          playerName: null,
          get readyState() {
            return conn.open ? 'open' : 'closed';
          },
          send: (data) => conn.send(data),
          close: () => conn.close()
        };

        conn.on('open', () => {
          registerConnectionWrapper(wrapper);
          if (gameStateRef.current) {
            conn.send(JSON.stringify({ type: 'SYNC_STATE', state: gameStateRef.current }));
          }
        });

        conn.on('data', (rawData) => {
          if (peerMessageHandlerRef.current) {
            peerMessageHandlerRef.current(rawData, wrapper);
          }
        });

        conn.on('close', () => {
          handlePeerDisconnected(wrapper);
        });
      });

      peer.on('error', () => {
        setErrorMsg("Impossible de joindre le serveur de signalisation PeerJS. Utilisez le bouton 'Pont Direct WebRTC' (Code 1 / Code 2) !");
        setP2pStatus('IDLE');
      });
    } catch {
      setErrorMsg("Utilisez le Pont Direct WebRTC ou vérifiez votre connexion réseau.");
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
      const PeerClass = getPeerConstructor();
      const peer = new PeerClass();
      peerJsInstanceRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect('CONTREE-ROYALE-' + clean, { reliable: true });
        const wrapper = {
          id: conn.peer || 'host',
          get readyState() {
            return conn.open ? 'open' : 'closed';
          },
          send: (data) => conn.send(data),
          close: () => conn.close()
        };

        conn.on('open', () => {
          registerConnectionWrapper(wrapper);
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
          if (peerMessageHandlerRef.current) {
            peerMessageHandlerRef.current(rawData, wrapper);
          }
        });

        conn.on('close', () => {
          rtcConnectionsRef.current = rtcConnectionsRef.current.filter((c) => c !== wrapper);
        });
      });

      peer.on('error', () => {
        setErrorMsg("Code introuvable ou connexion directe bloquée. Essayez le Pont Direct (Code 1 / Code 2).");
        setP2pStatus('IDLE');
      });
    } catch {
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
    } catch {
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
    const wrapper = {
      id: 'webrtc-direct',
      playerUid: null,
      playerName: null,
      get readyState() {
        return channel.readyState;
      },
      send: (data) => channel.send(data),
      close: () => channel.close()
    };

    channel.onopen = () => {
      registerConnectionWrapper(wrapper);
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
      if (peerMessageHandlerRef.current) {
        peerMessageHandlerRef.current(event.data, wrapper);
      }
    };

    channel.onclose = () => {
      handlePeerDisconnected(wrapper);
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
    } catch {
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
    } catch {
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
    } catch {
      setErrorMsg("Code Réponse invalide. Vérifie que ton pote a tout copié.");
    }
  };

  const getRoomDocRef = (code, targetAppId = activeRoomAppId) => {
    return doc(db, 'artifacts', targetAppId, 'public', 'data', 'rooms', code);
  };

  const updateGameState = async (newState) => {
    gameStateRef.current = newState;
    setGameState(newState);

    if (rtcConnectionsRef.current.some((c) => c.readyState === 'open')) {
      sendToAllPeers({ type: 'SYNC_STATE', state: newState });
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

  const handleChangeBotDifficulty = (nextDifficulty) => {
    // Une fois la partie lancée (Solo ou Multijoueur), personne ne peut plus modifier la difficulté des bots
    if (mode !== 'HOME') {
      const current = gameStateRef.current;
      if (!current || current.status !== 'LOBBY' || current.hostId !== myUid) {
        return;
      }
      setBotDifficulty(nextDifficulty);
      const updatedSeats = assignBotNamesForSeats(current.seats, nextDifficulty);
      updateGameState({
        ...current,
        botDifficulty: nextDifficulty,
        seats: updatedSeats
      });
      return;
    }
    setBotDifficulty(nextDifficulty);
  };

  const handleChangeGameRuleSetting = (field, nextValue, setter) => {
    if (mode !== 'HOME') {
      const current = gameStateRef.current;
      if (!current || current.status !== 'LOBBY' || current.hostId !== myUid) {
        return;
      }
      setter(nextValue);
      updateGameState({
        ...current,
        [field]: nextValue
      });
      return;
    }
    setter(nextValue);
  };

  const handleChangeGameVariant = (nextVariant) =>
    handleChangeGameRuleSetting('gameVariant', nextVariant, setGameVariant);
  const handleChangeScoringMode = (nextMode) =>
    handleChangeGameRuleSetting('scoringMode', nextMode, setScoringMode);
  const handleChangeTargetScore = (nextTarget) =>
    handleChangeGameRuleSetting('targetScore', nextTarget, setTargetScore);

  const createInitialState = (hostId, hostName, isLocal = false) => {
    const hands = createAndDealDeck('E');
    const initialSeats = assignBotNamesForSeats(
      {
        S: { uid: hostId, name: hostName || 'Joueur 1', isBot: false },
        W: { uid: 'bot_W', name: '', isBot: true },
        N: { uid: 'bot_N', name: '', isBot: true },
        E: { uid: 'bot_E', name: '', isBot: true }
      },
      botDifficulty
    );
    return {
      hostId,
      createdAt: Date.now(),
      dealNumber: 1,
      status: isLocal ? 'BIDDING' : 'LOBBY',
      botDifficulty,
      botSpeed,
      gameVariant,
      scoringMode,
      targetScore,
      dealer: 'E',
      currentTurn: 'S',
      seats: initialSeats,
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
      declarationsResult: null,
      readySeats: {},
      bubbles: {},
      lastSoundEvent: null,
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

  const isHostOrLocal = !gameState || mode === 'LOCAL' || gameState.hostId === myUid;

  const claimSeatInLobby = async (targetSeat, claimantUid = myUid, claimantName = pseudo.trim() || 'Joueur') => {
    soundEngine.playClick();
    const current = gameStateRef.current;
    if (!current) return;

    if (!isHostOrLocal && claimantUid === myUid) {
      sendToAllPeers({
        type: 'GUEST_ACTION',
        actionType: 'CLAIM_SEAT',
        targetSeat,
        uid: myUid,
        name: claimantName
      });
      return;
    }

    const currentSeat = SEATS.find(s => current.seats[s].uid === claimantUid);
    const targetOccupant = current.seats[targetSeat];

    if (!targetOccupant.isBot && targetOccupant.uid !== claimantUid) return;

    const newSeats = { ...current.seats };
    const activeDifficulty = current.botDifficulty || botDifficulty;
    newSeats[targetSeat] = { uid: claimantUid, name: claimantName, isBot: false, isTempBot: false };
    if (currentSeat) {
      const canRecycleTargetBotName =
        targetOccupant?.isBot &&
        !targetOccupant.isTempBot &&
        targetOccupant.name &&
        targetOccupant.name.trim().toLowerCase() !== claimantName.trim().toLowerCase();
      const botNameForOldSeat = canRecycleTargetBotName
        ? targetOccupant.name
        : pickSingleBotName(newSeats, activeDifficulty, currentSeat);
      newSeats[currentSeat] = { uid: `bot_${currentSeat}`, name: botNameForOldSeat, isBot: true };
    }

    await updateGameState({
      ...current,
      seats: newSeats,
      lastSoundEvent: {
        id: createSoundEventId(),
        kind: 'CLICK',
        actorSeat: targetSeat
      }
    });
  };

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

  const bidTurnKey = gameState?.status === 'BIDDING'
    ? `${gameState.createdAt || 0}_${gameState.dealNumber || 1}_${gameState.bids?.length || 0}_${gameState.currentTurn || ''}`
    : 'IDLE';

  const activeBidValue = useMemo(() => {
    const nextMin = gameState?.highestBid ? gameState.highestBid.value + 10 : 80;
    const validNext = BID_VALUES.find(v => v >= nextMin) || 250;
    if (bidSelection.key === bidTurnKey && bidSelection.value >= validNext) {
      return bidSelection.value;
    }
    return validNext;
  }, [gameState?.highestBid, bidSelection, bidTurnKey]);

  const startNewDeal = async (stateSnapshot, nextDealerSeat, resetMatchScores = false, soundEventOverride = null) => {
    soundEngine.playClick();
    const current = stateSnapshot || gameStateRef.current;
    if (!current) return;

    if (mode === 'ONLINE' && current.hostId !== myUid) {
      sendToAllPeers({
        type: 'GUEST_ACTION',
        actionType: 'TOGGLE_READY',
        seat: mySeat,
        resetMatchScores
      });
      return;
    }

    const newHands = createAndDealDeck(nextDealerSeat);
    const firstBidder = getNextSeat(nextDealerSeat);

    const nextState = {
      ...current,
      dealNumber: (current.dealNumber || 1) + 1,
      scores: resetMatchScores ? { NS: 0, EW: 0 } : current.scores,
      status: 'BIDDING',
      botDifficulty: current.botDifficulty || botDifficulty,
      botSpeed: current.botSpeed || botSpeed,
      gameVariant: current.gameVariant || gameVariant,
      scoringMode: current.scoringMode || scoringMode,
      targetScore: current.targetScore || targetScore,
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
      declarationsResult: null,
      readySeats: {},
      bubbles: {},
      lastSoundEvent: soundEventOverride,
      roundSummary: null
    };

    await updateGameState(nextState);
  };

  // Système "Prêt / Revanche" synchronisé en Multijoueur
  const handleToggleReadyForNextDeal = async (seat = mySeat, resetMatchScores = false, isFromRemote = false) => {
    soundEngine.playClick();
    const current = gameStateRef.current;
    if (!current) return;

    if (mode === 'LOCAL') {
      await startNewDeal(current, getNextSeat(current.dealer), resetMatchScores);
      return;
    }

    if (current.hostId !== myUid && !isFromRemote) {
      sendToAllPeers({
        type: 'GUEST_ACTION',
        actionType: 'TOGGLE_READY',
        seat,
        resetMatchScores
      });
      return;
    }

    const updatedReady = { ...(current.readySeats || {}), [seat]: true };
    const humanSeats = SEATS.filter((s) => !current.seats[s]?.isBot);
    const allHumansReady = humanSeats.every((s) => updatedReady[s]);

    if (allHumansReady) {
      await startNewDeal(current, getNextSeat(current.dealer), resetMatchScores);
    } else {
      await updateGameState({
        ...current,
        readySeats: updatedReady
      });
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

    stateObj.beloteHolder = null;
    stateObj.beloteTeam = null;
    stateObj.beloteStep = 0;

    SEATS.forEach(s => {
      stateObj.hands[s] = sortHand(stateObj.hands[s], trump);
      if (SUITS.includes(trump)) {
        const hasK = stateObj.hands[s].some(c => c.suit === trump && c.rank === 'K');
        const hasQ = stateObj.hands[s].some(c => c.suit === trump && c.rank === 'Q');
        if (hasK && hasQ) {
          stateObj.beloteHolder = s;
          stateObj.beloteTeam = getTeam(s);
        }
      }
    });

    if (stateObj.gameVariant === 'COINCHE') {
      const declResult = resolveTableDeclarations(stateObj.hands, trump, stateObj.dealer);
      stateObj.declarationsResult = declResult;
      if (declResult.winningTeam) {
        SEATS.forEach(s => {
          const seatDecls = declResult.detailsBySeat[s] || [];
          if (getTeam(s) === declResult.winningTeam && seatDecls.length > 0) {
            const summaryLabel = seatDecls.map(d => `${d.label} (+${d.points})`).join(' • ');
            stateObj.bubbles[s] = {
              text: `Annonce : ${summaryLabel} ✨`,
              type: 'declaration',
              id: Date.now()
            };
          }
        });
      }
    } else {
      stateObj.declarationsResult = null;
    }

    stateObj.currentTurn = getNextSeat(stateObj.dealer);
    await updateGameState(stateObj);
  };

  const handleBidAction = async (seat, action, isFromRemote = false) => {
    const current = gameStateRef.current;
    if (!current || current.status !== 'BIDDING' || current.currentTurn !== seat) return;

    if (mode === 'ONLINE' && current.hostId !== myUid && !isFromRemote) {
      soundEngine.playBidSound(action.type);
      sendToAllPeers({
        type: 'GUEST_ACTION',
        actionType: 'BID',
        seat,
        action
      });
      return;
    }

    soundEngine.playBidSound(action.type);
    const newState = JSON.parse(JSON.stringify(current));
    let nextTurn = getNextSeat(seat);

    if (action.type === 'PASS') {
      newState.bids.push({ seat, type: 'PASS' });
      newState.consecutivePasses += 1;
      newState.bubbles[seat] = { text: 'Passe', type: 'pass', id: Date.now() };

      if (!newState.highestBid && newState.consecutivePasses >= 4) {
        newState.bubbles[seat] = { text: '4 Passe ! On redistribue', type: 'info', id: Date.now() };
        await startNewDeal(newState, getNextSeat(newState.dealer), false, {
          id: createSoundEventId(),
          kind: 'BID',
          bidType: 'PASS',
          actorSeat: seat
        });
        return;
      }

      if (
        newState.coincheStatus === 2 &&
        newState.highestBid &&
        newState.consecutivePasses < 3 &&
        getTeam(nextTurn) !== getTeam(newState.highestBid.seat)
      ) {
        newState.bids.push({ seat: nextTurn, type: 'PASS' });
        newState.consecutivePasses += 1;
        nextTurn = getNextSeat(nextTurn);
      }

      newState.lastSoundEvent = {
        id: createSoundEventId(),
        kind: 'BID',
        bidType: 'PASS',
        actorSeat: seat
      };

      if (newState.highestBid && newState.consecutivePasses >= 3) {
        return finalizeBiddingPhase(newState);
      }

      newState.currentTurn = nextTurn;
      await updateGameState(newState);
      return;
    }

    if (action.type === 'BID') {
      if (newState.coincheStatus > 1) return;
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
      newState.lastSoundEvent = {
        id: createSoundEventId(),
        kind: 'BID',
        bidType: 'BID',
        actorSeat: seat
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
      newState.lastSoundEvent = {
        id: createSoundEventId(),
        kind: 'BID',
        bidType: 'COINCHE',
        actorSeat: seat
      };
      newState.currentTurn = nextTurn;
      await updateGameState(newState);
      return;
    }

    if (action.type === 'SURCOINCHE') {
      if (!newState.highestBid || newState.coincheStatus !== 2 || getTeam(newState.highestBid.seat) !== getTeam(seat)) return;
      newState.coincheStatus = 4;
      newState.bids.push({ seat, type: 'SURCOINCHE' });
      newState.bubbles[seat] = { text: 'SURCONTRÉ ! 🔥🔥', type: 'surcoinche', id: Date.now() };
      newState.lastSoundEvent = {
        id: createSoundEventId(),
        kind: 'BID',
        bidType: 'SURCOINCHE',
        actorSeat: seat
      };
      return finalizeBiddingPhase(newState);
    }
  };

  const handlePlayCard = async (seat, card, isFromRemote = false) => {
    const current = gameStateRef.current;
    if (!current || current.status !== 'PLAYING' || current.currentTurn !== seat) return;

    const hand = current.hands[seat] || [];
    const legalIds = getPlayableCardIds(hand, current.currentTrick, current.trumpSuit, seat);
    if (!legalIds.includes(card.id)) return;

    if (mode === 'ONLINE' && current.hostId !== myUid && !isFromRemote) {
      soundEngine.playCardSlap();
      sendToAllPeers({
        type: 'GUEST_ACTION',
        actionType: 'PLAY_CARD',
        seat,
        card
      });
      return;
    }

    soundEngine.playCardSlap();

    const newState = JSON.parse(JSON.stringify(current));
    newState.hands[seat] = newState.hands[seat].filter(c => c.id !== card.id);
    newState.currentTrick.push({ seat, card });

    let triggeredBelote = false;
    if (
      newState.beloteHolder === seat &&
      card.suit === newState.trumpSuit &&
      (card.rank === 'K' || card.rank === 'Q')
    ) {
      soundEngine.playBidSound('BID');
      if (newState.beloteStep === 0) {
        newState.beloteStep = 1;
        triggeredBelote = true;
        newState.bubbles[seat] = { text: 'Belote ! 👑', type: 'belote', id: Date.now() };
      } else if (newState.beloteStep === 1) {
        newState.beloteStep = 2;
        triggeredBelote = true;
        newState.bubbles[seat] = { text: 'Rebelote ! (+20 pts) 👑', type: 'belote', id: Date.now() };
      }
    } else if (newState.bubbles[seat]?.type !== 'declaration') {
      delete newState.bubbles[seat];
    }

    newState.lastSoundEvent = {
      id: createSoundEventId(),
      kind: 'CARD',
      actorSeat: seat,
      isBelote: triggeredBelote
    };

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
          if (SUITS.includes(trump) && play.card.suit !== trump) {
            const trickSoFar = newState.currentTrick.slice(0, idx);
            const curWin = getTrickWinner(trickSoFar, trump);
            if (curWin && getTeam(curWin.seat) !== getTeam(play.seat)) {
              newState.voidMatrix[play.seat][trump] = true;
            }
          }
        }
      });
    }

    SEATS.forEach(s => {
      if (newState.bubbles?.[s]?.type === 'declaration') {
        delete newState.bubbles[s];
      }
    });

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
      newState.lastSoundEvent = {
        id: createSoundEventId(),
        kind: 'TRICK_SWEEP'
      };
      await updateGameState(newState);
      return;
    }

    const contract = newState.contract;
    const beloteBonusNS = newState.beloteTeam === 'NS' && newState.beloteStep === 2 ? 20 : 0;
    const beloteBonusEW = newState.beloteTeam === 'EW' && newState.beloteStep === 2 ? 20 : 0;
    const declPointsNS = newState.declarationsResult?.pointsNS || 0;
    const declPointsEW = newState.declarationsResult?.pointsEW || 0;

    const normalized = normalizeRoundPoints(
      newState.roundPoints.NS,
      newState.roundPoints.EW,
      newState.roundTricksCount.NS,
      newState.roundTricksCount.EW,
      trump
    );

    const scoreOutcome = calculateRoundScore({
      contract,
      pointsNS: normalized.pointsNS,
      pointsEW: normalized.pointsEW,
      tricksNS: newState.roundTricksCount.NS,
      tricksEW: newState.roundTricksCount.EW,
      beloteNS: beloteBonusNS,
      beloteEW: beloteBonusEW,
      declarationsNS: declPointsNS,
      declarationsEW: declPointsEW,
      scoringMode: newState.scoringMode || scoringMode
    });

    newState.scores.NS += scoreOutcome.deltaNS;
    newState.scores.EW += scoreOutcome.deltaEW;
    newState.readySeats = {};

    const matchTarget = newState.targetScore || targetScore || 1500;
    const isGameOver = newState.scores.NS >= matchTarget || newState.scores.EW >= matchTarget;
    const isFanny = isGameOver && (newState.scores.NS <= 0 || newState.scores.EW <= 0);

    if (isFanny) {
      const myTeam = getTeam(mySeat);
      const weWon = myTeam === 'NS' ? newState.scores.NS > newState.scores.EW : newState.scores.EW > newState.scores.NS;
      soundEngine.playFannySound(weWon);
    } else {
      soundEngine.playRoundEnd(scoreOutcome.isContractMade);
    }

    newState.roundSummary = {
      roundId: Date.now(),
      contract,
      isContractMade: scoreOutcome.isContractMade,
      rawPointsNS: normalized.pointsNS,
      rawPointsEW: normalized.pointsEW,
      beloteNS: scoreOutcome.effectiveBeloteNS,
      beloteEW: scoreOutcome.effectiveBeloteEW,
      declarationsNS: scoreOutcome.effectiveDeclNS,
      declarationsEW: scoreOutcome.effectiveDeclEW,
      tricksNS: newState.roundTricksCount.NS,
      tricksEW: newState.roundTricksCount.EW,
      deltaNS: scoreOutcome.deltaNS,
      deltaEW: scoreOutcome.deltaEW,
      isFanny
    };

    newState.status = isGameOver ? 'GAME_OVER' : 'ROUND_SUMMARY';
    newState.lastSoundEvent = {
      id: createSoundEventId(),
      kind: 'ROUND_END',
      isContractMade: scoreOutcome.isContractMade,
      isFanny,
      winnerTeam: newState.scores.NS >= newState.scores.EW ? 'NS' : 'EW'
    };

    await updateGameState(newState);
  };

  const sendQuickChat = async (text, targetSeat = mySeat, isFromRemote = false) => {
    soundEngine.playClick();
    const current = gameStateRef.current;
    if (!current) return;
    setShowChatMenu(false);

    if (mode === 'ONLINE' && current.hostId !== myUid && !isFromRemote) {
      sendToAllPeers({
        type: 'GUEST_ACTION',
        actionType: 'QUICK_CHAT',
        seat: targetSeat,
        text
      });
      return;
    }

    const newState = JSON.parse(JSON.stringify(current));
    newState.bubbles[targetSeat] = { text, type: 'chat', id: Date.now() };
    newState.lastSoundEvent = {
      id: createSoundEventId(),
      kind: 'CHAT',
      actorSeat: targetSeat
    };
    await updateGameState(newState);
  };

  // Gestionnaire centralisé des messages P2P (Hôte et Invités) avec Reconnexion Automatique
  useEffect(() => {
    peerMessageHandlerRef.current = (rawData, senderWrapper = null) => {
      try {
        const msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (!msg) return;

        if (msg.type === 'SYNC_STATE' && msg.state) {
          const prevState = gameStateRef.current;
          const soundEvt = msg.state.lastSoundEvent;
          if (!prevState || prevState.createdAt !== msg.state.createdAt) {
            lastPlayedSoundIdRef.current = soundEvt?.id || null;
          } else if (soundEvt?.id && soundEvt.id !== lastPlayedSoundIdRef.current) {
            lastPlayedSoundIdRef.current = soundEvt.id;
            playRemoteSoundEvent(soundEvt, msg.state, myUid);
          }
          gameStateRef.current = msg.state;
          setGameState(msg.state);
          return;
        }

        const current = gameStateRef.current;
        if (!current || current.hostId !== myUid) return;

        if (msg.type === 'GUEST_JOIN') {
          if (senderWrapper) {
            senderWrapper.playerUid = msg.uid;
            senderWrapper.playerName = msg.name;
          }
          const updated = JSON.parse(JSON.stringify(current));

          // 1. Recherche d'une reconnexion sur un siège existant ou gardé par un Bot de relais
          const reconnectSeat = SEATS.find((s) => {
            const occ = updated.seats[s];
            if (!occ) return false;
            if (occ.uid === msg.uid || occ.originalUid === msg.uid) return true;
            if (occ.isTempBot && occ.originalName?.toLowerCase() === msg.name?.trim().toLowerCase()) return true;
            return false;
          });

          if (reconnectSeat) {
            updated.seats[reconnectSeat] = {
              uid: msg.uid,
              name: msg.name,
              isBot: false,
              isTempBot: false
            };
            updated.bubbles = {
              ...(updated.bubbles || {}),
              [reconnectSeat]: { text: `${msg.name} est de retour à sa place ! 🔄`, type: 'chat', id: Date.now() }
            };
            updateGameState(updated);
            return;
          }

          // 2. Nouveau joueur rejoignant la table (remplace un Bot libre)
          const preferredOrder = ['N', 'E', 'W', 'S'];
          const freeSeat = preferredOrder.find((s) => updated.seats[s]?.isBot);
          if (freeSeat) {
            updated.seats[freeSeat] = {
              uid: msg.uid,
              name: msg.name,
              isBot: false,
              isTempBot: false
            };
            // Évite toute collision si le pseudo de l'invité correspond au nom d'un bot encore assis
            SEATS.forEach((s) => {
              const occ = updated.seats[s];
              if (
                s !== freeSeat &&
                occ?.isBot &&
                !occ.isTempBot &&
                occ.name?.trim().toLowerCase() === msg.name?.trim().toLowerCase()
              ) {
                updated.seats[s] = {
                  ...occ,
                  name: pickSingleBotName(updated.seats, updated.botDifficulty || botDifficulty, s)
                };
              }
            });
            updated.bubbles = {
              ...(updated.bubbles || {}),
              [freeSeat]: { text: `${msg.name} a rejoint la table ! 🎉`, type: 'chat', id: Date.now() }
            };
          }
          updateGameState(updated);
          return;
        }

        if (msg.type === 'GUEST_ACTION') {
          if (msg.actionType === 'CLAIM_SEAT') {
            claimSeatInLobby(msg.targetSeat, msg.uid, msg.name);
          } else if (msg.actionType === 'BID') {
            handleBidAction(msg.seat, msg.action, true);
          } else if (msg.actionType === 'PLAY_CARD') {
            handlePlayCard(msg.seat, msg.card, true);
          } else if (msg.actionType === 'QUICK_CHAT') {
            sendQuickChat(msg.text, msg.seat, true);
          } else if (msg.actionType === 'TOGGLE_READY') {
            if (current.status === 'ROUND_SUMMARY' || current.status === 'GAME_OVER') {
              handleToggleReadyForNextDeal(msg.seat, Boolean(msg.resetMatchScores), true);
            }
          } else if (msg.actionType === 'NEXT_DEAL') {
            if (current.status === 'ROUND_SUMMARY' || current.status === 'GAME_OVER') {
              startNewDeal(current, getNextSeat(current.dealer), Boolean(msg.resetMatchScores));
            }
          }
        }
      } catch (err) {
        console.error('Erreur traitement message P2P:', err);
      }
    };
  });

  const botActionsRef = useRef({ collectFinishedTrick, handleBidAction, handlePlayCard });
  useEffect(() => {
    botActionsRef.current = { collectFinishedTrick, handleBidAction, handlePlayCard };
  });

  useEffect(() => {
    if (!gameState) return;

    const amIController = mode === 'LOCAL' || gameState.hostId === myUid;
    if (!amIController) return;

    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);

    const activeSpeedObj = BOT_SPEEDS[gameState.botSpeed || botSpeed] || BOT_SPEEDS.NORMAL;

    if (gameState.status === 'TRICK_END') {
      botTimeoutRef.current = setTimeout(() => {
        botActionsRef.current.collectFinishedTrick(gameState);
      }, activeSpeedObj.trickSweepMs);
      return;
    }

    const activeSeat = gameState.currentTurn;
    const activePlayer = gameState.seats?.[activeSeat];

    if (activePlayer?.isBot && (gameState.status === 'BIDDING' || gameState.status === 'PLAYING')) {
      botTimeoutRef.current = setTimeout(() => {
        if (gameState.status === 'BIDDING') {
          const decision = decideBotBid(gameState, activeSeat);
          botActionsRef.current.handleBidAction(activeSeat, decision, true);
        } else if (gameState.status === 'PLAYING') {
          const cardToPlay = decideBotCard(gameState, activeSeat);
          if (cardToPlay) {
            botActionsRef.current.handlePlayCard(activeSeat, cardToPlay, true);
          }
        }
      }, activeSpeedObj.botDelayMs);
    }

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, [gameState, mode, myUid, botSpeed]);

  const activeTableTheme = TABLE_THEMES[tableTheme] || TABLE_THEMES.EMERALD;

  // ==========================================
  // RENDU : ÉCRAN D'ACCUEIL & SALON
  // ==========================================

  if (mode === 'HOME') {
    return (
      <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 via-emerald-950 to-emerald-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 select-none">
        {/* Barre d'actions rapides en haut à droite (Statistiques, Paramètres & Plein écran) */}
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
          <button
            onClick={() => { soundEngine.playClick(); setShowStatsModal(true); }}
            className="px-3.5 py-2.5 rounded-2xl bg-stone-900/90 hover:bg-stone-800 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-2 shadow-xl transition cursor-pointer"
            title="Voir mes statistiques et trophées"
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span>Statistiques</span>
          </button>

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
            <span>Paramètres & Règles</span>
          </button>
        </div>

        <div className="max-w-5xl w-full flex flex-col items-center text-center mb-5">
          <div className="relative mb-2">
            <div className="flex items-center justify-center gap-2 bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 px-5 py-1.5 rounded-full font-black text-xs uppercase tracking-widest shadow-lg border border-amber-200">
              <Crown className="w-4 h-4 fill-stone-950" /> Édition Officielle Multijoueur
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-amber-100 to-amber-400 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
            CONTRÉE ROYALE
          </h1>
          <p className="text-emerald-200/90 mt-1.5 text-sm sm:text-base max-w-lg font-medium">
            Jouez à la vraie Belote Contrée ou Coinche avec vos amis en équipe Nord-Sud ou contre nos bots !
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
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Multijoueur en Direct (2 à 4 joueurs)
                  </span>
                  <Users className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-xl font-extrabold text-white mb-1">Partie Multijoueur</h2>
                <p className="text-xs text-stone-300 mb-4 leading-relaxed">
                  Utilisez le <strong>Code Rapide à 5 lettres</strong> (jusqu'à 4 joueurs humains avec reconnexion auto) ou le <strong>Pont Direct WebRTC</strong> !
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
                  Lancez immédiatement une table complète avec 3 anciens du bistrot réglés sur le niveau <strong>{BOT_DIFFICULTIES[botDifficulty]?.label}</strong>.
                </p>

                <ul className="text-xs text-stone-300 space-y-2 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Enchères 80 à 160, Capot, Contre & Surcontre
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" /> Belote / Rebelote (+20 pts) & 10 de Der
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" /> IA compétitive avec appels et mémoire des cartes
                  </li>
                </ul>
              </div>

              <button
                onClick={startQuickGame}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-white" />
                Jouer Maintenant
              </button>
            </div>
          </div>
        </div>

        {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}

        {showStatsModal && (
          <StatsModal
            stats={playerStats}
            onReset={resetPlayerStats}
            onClose={() => setShowStatsModal(false)}
          />
        )}

        {showSettingsModal && (
          <SettingsModal
            onClose={() => setShowSettingsModal(false)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            audioSettings={audioSettings}
            setAudioSettings={setAudioSettings}
            botDifficulty={botDifficulty}
            setBotDifficulty={handleChangeBotDifficulty}
            botSpeed={botSpeed}
            setBotSpeed={setBotSpeed}
            gameVariant={gameVariant}
            setGameVariant={setGameVariant}
            scoringMode={scoringMode}
            setScoringMode={setScoringMode}
            targetScore={targetScore}
            setTargetScore={setTargetScore}
            tableTheme={tableTheme}
            setTableTheme={setTableTheme}
            cardBackTheme={cardBackTheme}
            setCardBackTheme={setCardBackTheme}
            trainingTrumpHelper={trainingTrumpHelper}
            setTrainingTrumpHelper={setTrainingTrumpHelper}
            onOpenRules={() => {
              setShowSettingsModal(false);
              setShowRulesModal(true);
            }}
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
  // RENDU : ASSISTANT DE CONNEXION WEBRTC
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
  // RENDU : SALON D'ATTENTE (LOBBY MULTIJOUEUR 2 À 4 JOUEURS)
  // ==========================================
  if (gameState?.status === 'LOBBY') {
    const isHost = gameState.hostId === myUid;
    const humanCount = SEATS.filter((s) => !gameState.seats[s]?.isBot).length;

    const copyRoomCode = async () => {
      await safeCopyText(roomCode);
    };

    return (
      <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 via-emerald-950 to-emerald-950 text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="max-w-3xl w-full bg-stone-900/90 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-stone-800 pb-6 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                  Salon Privé Multijoueur
                </span>
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded-full font-black">
                  {humanCount} / 4 humains connectés
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-0.5">Choisissez vos places à la table</h2>
              <p className="text-xs text-stone-400 mt-1">
                Astuce : placez-vous en <strong>Sud</strong> et <strong>Nord</strong> pour jouer ensemble ! Jusqu'à 4 amis peuvent rejoindre ce code.
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
            <div className="mb-4 bg-stone-950/90 border border-stone-800 rounded-2xl p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
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
                          handleChangeBotDifficulty(lvl.id);
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-stone-800/80">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-[11px] font-bold text-stone-400">Variante :</span>
                  <div className="flex gap-1">
                    {Object.values(GAME_VARIANTS).map((v) => {
                      const active = (gameState.gameVariant || gameVariant) === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => {
                            soundEngine.playClick();
                            setGameVariant(v.id);
                            updateGameState({ ...gameState, gameVariant: v.id });
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                            active ? 'bg-emerald-400 text-stone-950' : 'bg-stone-800 text-stone-300'
                          }`}
                        >
                          {v.id === 'CONTREE' ? 'Contrée' : 'Coinche TA/SA'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-[11px] font-bold text-stone-400">Comptage :</span>
                  <select
                    value={gameState.scoringMode || scoringMode}
                    onChange={(e) => {
                      soundEngine.playClick();
                      setScoringMode(e.target.value);
                      updateGameState({ ...gameState, scoringMode: e.target.value });
                    }}
                    className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-[11px] font-bold text-white"
                  >
                    {Object.values(SCORING_MODES).map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <span className="text-[11px] font-bold text-stone-400">Cible :</span>
                  <div className="flex gap-1">
                    {TARGET_SCORE_OPTIONS.map((pts) => {
                      const active = (gameState.targetScore || targetScore) === pts;
                      return (
                        <button
                          key={pts}
                          onClick={() => {
                            soundEngine.playClick();
                            setTargetScore(pts);
                            updateGameState({ ...gameState, targetScore: pts });
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                            active ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-300'
                          }`}
                        >
                          {pts}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
              <span className="text-xs font-extrabold text-emerald-100">
                {(gameState.gameVariant || gameVariant) === 'COINCHE' ? 'Coinche TA/SA' : 'Tapis Royal'}
              </span>
              <span className="text-[10px] text-emerald-300/80">{gameState.targetScore || targetScore} pts</span>
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
                onClick={() => {
                  soundEngine.playClick();
                  updateGameState({
                    ...gameState,
                    status: 'BIDDING',
                    lastSoundEvent: {
                      id: createSoundEventId(),
                      kind: 'CLICK',
                      actorSeat: mySeat
                    }
                  });
                }}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-base shadow-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Play className="w-5 h-5 fill-stone-950" />
                {humanCount === 4 ? 'Lancer la Partie (4 Joueurs)' : 'Lancer la Partie (Les bots complètent)'}
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
            botDifficulty={gameState.botDifficulty || botDifficulty}
            setBotDifficulty={handleChangeBotDifficulty}
            isBotDifficultyLocked={!isHost}
            botDifficultyLockReason="Choisi uniquement par l'hôte dans le salon"
            botSpeed={botSpeed}
            setBotSpeed={setBotSpeed}
            gameVariant={gameState.gameVariant || gameVariant}
            setGameVariant={handleChangeGameVariant}
            scoringMode={gameState.scoringMode || scoringMode}
            setScoringMode={handleChangeScoringMode}
            targetScore={gameState.targetScore || targetScore}
            setTargetScore={handleChangeTargetScore}
            isRulesLocked={!isHost}
            rulesLockReason="Choisi uniquement par l'hôte dans le salon"
            tableTheme={tableTheme}
            setTableTheme={setTableTheme}
            cardBackTheme={cardBackTheme}
            setCardBackTheme={setCardBackTheme}
            trainingTrumpHelper={trainingTrumpHelper}
            setTrainingTrumpHelper={setTrainingTrumpHelper}
            onOpenRules={() => {
              setShowSettingsModal(false);
              setShowRulesModal(true);
            }}
          />
        )}
      </div>
    );
  }

  if (!gameState) return null;

  // ==========================================
  // RENDU : TABLE DE JEU PLEIN ÉCRAN
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

  const ourDeclBonus = myTeam === 'NS'
    ? (gameState.declarationsResult?.pointsNS || 0)
    : (gameState.declarationsResult?.pointsEW || 0);
  const theirDeclBonus = myTeam === 'NS'
    ? (gameState.declarationsResult?.pointsEW || 0)
    : (gameState.declarationsResult?.pointsNS || 0);

  const ourLiveRoundPoints = (myTeam === 'NS' ? gameState.roundPoints.NS : gameState.roundPoints.EW) +
    (gameState.beloteTeam === myTeam && gameState.beloteStep === 2 ? 20 : 0) +
    ourDeclBonus;
  const theirLiveRoundPoints = (myTeam === 'NS' ? gameState.roundPoints.EW : gameState.roundPoints.NS) +
    (gameState.beloteTeam && gameState.beloteTeam !== myTeam && gameState.beloteStep === 2 ? 20 : 0) +
    theirDeclBonus;

  const activeDifficultyObj = BOT_DIFFICULTIES[gameState.botDifficulty || botDifficulty] || BOT_DIFFICULTIES.PRO;
  const activeScoringLabel = SCORING_MODES[gameState.scoringMode || scoringMode]?.label;

  return (
    <div className={`fixed inset-0 w-screen h-screen overflow-hidden bg-gradient-to-b ${activeTableTheme.outerBg} flex flex-col justify-between select-none font-sans`}>
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
              {gameState.gameVariant === 'COINCHE' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">
                  Coinche TA/SA
                </span>
              )}
            </div>
            {mode === 'ONLINE' ? (
              <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <Wifi className="w-3 h-3" /> Salon P2P : <span className="text-white font-bold">{roomCode}</span>
              </div>
            ) : (
              <div className="text-[10px] text-stone-400 font-semibold">
                Cible : {gameState.targetScore || targetScore} pts • {activeScoringLabel}
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
                <span className={`px-2 py-0.5 rounded-md font-black text-sm flex items-center gap-1 ${SUIT_INFO[gameState.contract.suit]?.badgeBg}`}>
                  {gameState.contract.value === 250 ? 'CAPOT' : gameState.contract.value}
                  <span className="text-base leading-none">{SUIT_INFO[gameState.contract.suit]?.symbol}</span>
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
            onClick={() => { soundEngine.playClick(); setShowStatsModal(true); }}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 transition cursor-pointer"
            title="Statistiques & Trophées"
          >
            <BarChart3 className="w-4 h-4" />
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
            title="Paramètres (Tapis, Vitesse, Sons, Règles)"
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

      {/* ZONE CENTRALE : TAPIS PERSONNALISABLE OCCUPANT TOUTE LA LARGEUR */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-1.5 sm:p-3 overflow-hidden">
        <div className={`relative w-full h-full rounded-[28px] sm:rounded-[44px] border-[8px] sm:border-[14px] ${activeTableTheme.woodBorder} shadow-[inset_0_0_90px_rgba(0,0,0,0.85),0_12px_40px_rgba(0,0,0,0.8)] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${activeTableTheme.feltBg} flex flex-col justify-between p-2 sm:p-5`}>
          
          <div className="absolute inset-2.5 sm:inset-4 rounded-[20px] sm:rounded-[32px] border border-amber-400/25 pointer-events-none" />

          {/* WIDGET EN HAUT À GAUCHE DU TAPIS (+ INDICATEUR D'ATOUTS EN MODE ENTRAÎNEMENT SOLO UNIQUEMENT) */}
          {(gameState.status === 'PLAYING' || gameState.status === 'TRICK_END') && (
            <div className="absolute top-4 left-4 sm:top-6 sm:left-7 z-30 hidden sm:flex flex-col gap-2 min-w-[220px]">
              <div className="bg-stone-950/90 backdrop-blur-md border-2 border-amber-500/50 rounded-2xl px-4 py-2.5 shadow-2xl flex flex-col gap-2">
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
                      <span className={`text-xl font-black leading-none ${SUIT_INFO[gameState.contract.suit]?.color}`}>
                        {SUIT_INFO[gameState.contract.suit]?.symbol}
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

              {/* Indicateur des cartes restantes à l'atout : STRICTEMENT limité au mode Solo (LOCAL) */}
              {mode === 'LOCAL' && trainingTrumpHelper && (
                <TrumpTrackerWidget gameState={gameState} mySeat={mySeat} />
              )}
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
              <CardBack count={gameState.hands?.[relativeSeats.top]?.length || 0} theme={cardBackTheme} />
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
                <CardBack count={gameState.hands?.[relativeSeats.left]?.length || 0} theme={cardBackTheme} />
              </div>
            </div>

            <div className="relative flex-1 h-full flex items-center justify-center">
              {gameState.trumpSuit && (
                <div className={`absolute pointer-events-none opacity-15 flex flex-col items-center justify-center ${SUIT_INFO[gameState.trumpSuit]?.color}`}>
                  <span className="text-7xl sm:text-9xl font-black">{SUIT_INFO[gameState.trumpSuit]?.symbol}</span>
                </div>
              )}

              {gameState.status === 'BIDDING' && (
                <BiddingCenterPanel
                  gameState={gameState}
                  isMyTurn={isMyTurn}
                  mySeat={mySeat}
                  selectedBidValue={activeBidValue}
                  setSelectedBidValue={(val) => setBidSelection({ key: bidTurnKey, value: val })}
                  onBidAction={(action) => handleBidAction(mySeat, action)}
                />
              )}

              {(gameState.status === 'PLAYING' || gameState.status === 'TRICK_END') && (() => {
                let collectGlideClass = '';
                if (gameState.status === 'TRICK_END' && gameState.trickWinner) {
                  if (gameState.trickWinner === relativeSeats.bottom) {
                    collectGlideClass = 'translate-y-24 scale-75 opacity-0 transition-all duration-500 delay-500 ease-in';
                  } else if (gameState.trickWinner === relativeSeats.top) {
                    collectGlideClass = '-translate-y-24 scale-75 opacity-0 transition-all duration-500 delay-500 ease-in';
                  } else if (gameState.trickWinner === relativeSeats.left) {
                    collectGlideClass = '-translate-x-36 scale-75 opacity-0 transition-all duration-500 delay-500 ease-in';
                  } else if (gameState.trickWinner === relativeSeats.right) {
                    collectGlideClass = 'translate-x-36 scale-75 opacity-0 transition-all duration-500 delay-500 ease-in';
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
                <CardBack count={gameState.hands?.[relativeSeats.right]?.length || 0} theme={cardBackTheme} />
              </div>
            </div>
          </div>

          {/* JOUEUR BAS (UNIQUEMENT QUICK CHAT PRÉDÉFINI POUR ÉVITER LA TRICHE) */}
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
                  title="Expressions rapides autorisées"
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

      {/* MODAL RÉCAPITULATIF DE FIN DE MANCHE / FIN DE PARTIE (AVEC EFFET FANNY & SYSTÈME PRÊT SYNCHRONISÉ) */}
      {(gameState.status === 'ROUND_SUMMARY' || gameState.status === 'GAME_OVER') && gameState.roundSummary && (() => {
        const humanSeats = SEATS.filter((s) => !gameState.seats[s]?.isBot);
        const readyMap = gameState.readySeats || {};
        const amIReady = Boolean(readyMap[mySeat]);
        const isFannyGame = gameState.status === 'GAME_OVER' && (gameState.scores.NS <= 0 || gameState.scores.EW <= 0);
        const fannyLoserTeam = gameState.scores.NS <= 0 ? 'Nord-Sud' : 'Est-Ouest';

        return (
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

                <div className={`px-3 py-1.5 rounded-xl font-black text-sm flex items-center gap-1 ${SUIT_INFO[gameState.roundSummary.contract.suit]?.badgeBg}`}>
                  {gameState.roundSummary.contract.value === 250 ? 'CAPOT' : gameState.roundSummary.contract.value}
                  <span className="text-lg">{SUIT_INFO[gameState.roundSummary.contract.suit]?.symbol}</span>
                  {gameState.roundSummary.contract.coinche > 1 && (
                    <span className="ml-1 bg-black/40 px-1.5 py-0.5 rounded text-xs">
                      x{gameState.roundSummary.contract.coinche}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center bg-stone-950 rounded-2xl p-4 mb-5 border border-stone-800 text-xs sm:text-sm">
                <div className="text-left text-stone-400 space-y-2 font-medium">
                  <div className="h-6" />
                  <div>Plis remportés</div>
                  <div>Points des plis</div>
                  <div>Belote / Rebelote</div>
                  {(gameState.gameVariant === 'COINCHE' || gameState.roundSummary.declarationsNS > 0 || gameState.roundSummary.declarationsEW > 0) && (
                    <div>Annonces</div>
                  )}
                  <div className="pt-2 border-t border-stone-800 text-amber-400 font-bold">Gain Manche</div>
                  <div className="text-white font-black">Score Total</div>
                </div>

                <div className="space-y-2 font-bold">
                  <div className="h-6 text-emerald-400 font-black">Nord - Sud</div>
                  <div>{gameState.roundSummary.tricksNS} plis</div>
                  <div>{gameState.roundSummary.rawPointsNS} pts</div>
                  <div>+{gameState.roundSummary.beloteNS} pts</div>
                  {(gameState.gameVariant === 'COINCHE' || gameState.roundSummary.declarationsNS > 0 || gameState.roundSummary.declarationsEW > 0) && (
                    <div className="text-indigo-300">+{gameState.roundSummary.declarationsNS || 0} pts</div>
                  )}
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
                  {(gameState.gameVariant === 'COINCHE' || gameState.roundSummary.declarationsNS > 0 || gameState.roundSummary.declarationsEW > 0) && (
                    <div className="text-indigo-300">+{gameState.roundSummary.declarationsEW || 0} pts</div>
                  )}
                  <div className="pt-2 border-t border-stone-800 text-rose-400 text-base font-black">
                    +{gameState.roundSummary.deltaEW}
                  </div>
                  <div className="text-xl font-black text-white">{gameState.scores.EW}</div>
                </div>
              </div>

              {/* EFFET SPÉCIAL FANNY (1500 à 0) */}
              {isFannyGame && (
                <div className="mb-4 bg-gradient-to-r from-pink-600/30 via-amber-500/30 to-pink-600/30 border-2 border-pink-400 rounded-2xl p-3.5 text-center animate-bounce">
                  <div className="text-3xl mb-1">🍑🎺🍑</div>
                  <div className="text-base font-black text-pink-300 uppercase tracking-wide">
                    FANNY HISTORIQUE ! ({Math.max(gameState.scores.NS, gameState.scores.EW)} à 0)
                  </div>
                  <div className="text-xs font-bold text-amber-200 mt-0.5">
                    L'équipe {fannyLoserTeam} termine avec 0 point et doit embrasser Fanny !
                  </div>
                </div>
              )}

              {/* STATUT PRÊT / REVANCHE DES JOUEURS EN MULTIJOUEUR */}
              {mode === 'ONLINE' && humanSeats.length > 1 && (
                <div className="mb-4 bg-stone-950 border border-stone-800 rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-2 text-center">
                    Joueurs prêts pour la suite ({humanSeats.filter((s) => readyMap[s]).length} / {humanSeats.length})
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {humanSeats.map((s) => {
                      const isReady = Boolean(readyMap[s]);
                      return (
                        <span
                          key={s}
                          className={`px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1 border ${
                            isReady
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                              : 'bg-stone-900 text-stone-400 border-stone-700'
                          }`}
                        >
                          {isReady ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : '⏳'}
                          <span>{gameState.seats[s]?.name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {gameState.status === 'GAME_OVER' ? (
                <div className="text-center space-y-3">
                  {!isFannyGame && (
                    <div className="bg-amber-500/20 border border-amber-400 rounded-2xl p-4">
                      <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-1" />
                      <div className="text-lg font-black text-amber-300">
                        Victoire de l'équipe {gameState.scores.NS >= gameState.scores.EW ? 'Nord-Sud' : 'Est-Ouest'} !
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => handleToggleReadyForNextDeal(mySeat, true)}
                    disabled={mode === 'ONLINE' && amIReady}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 disabled:opacity-60 text-stone-950 font-black rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-5 h-5" />
                    {mode === 'ONLINE' && humanSeats.length > 1
                      ? amIReady
                        ? 'Prêt pour la Revanche ✓ (En attente des autres...)'
                        : 'Je suis Prêt pour la Revanche !'
                      : 'Rejouer une Partie'}
                  </button>
                  {mode === 'ONLINE' && gameState.hostId === myUid && amIReady && humanSeats.length > 1 && (
                    <button
                      onClick={() => startNewDeal(gameState, getNextSeat(gameState.dealer), true)}
                      className="text-xs font-bold text-amber-300 hover:underline cursor-pointer"
                    >
                      Forcer le lancement de la revanche (Hôte)
                    </button>
                  )}
                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      cleanupP2P();
                      setMode('HOME');
                    }}
                    className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-sm rounded-xl border border-stone-700 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" /> Retour au menu principal
                  </button>
                </div>
              ) : (
                <div className="space-y-2 text-center">
                  <button
                    onClick={() => handleToggleReadyForNextDeal(mySeat, false)}
                    disabled={mode === 'ONLINE' && amIReady}
                    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <span>
                      {mode === 'ONLINE' && humanSeats.length > 1
                        ? amIReady
                          ? 'Prêt ✓ (En attente des autres joueurs...)'
                          : 'Prêt pour la Manche Suivante'
                        : 'Manche Suivante'}
                    </span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  {mode === 'ONLINE' && gameState.hostId === myUid && amIReady && humanSeats.length > 1 && (
                    <button
                      onClick={() => startNewDeal(gameState, getNextSeat(gameState.dealer), false)}
                      className="text-xs font-bold text-emerald-300 hover:underline cursor-pointer"
                    >
                      Forcer la manche suivante maintenant (Hôte)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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

      {showStatsModal && (
        <StatsModal
          stats={playerStats}
          onReset={resetPlayerStats}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          audioSettings={audioSettings}
          setAudioSettings={setAudioSettings}
          botDifficulty={gameState.botDifficulty || botDifficulty}
          setBotDifficulty={handleChangeBotDifficulty}
          isBotDifficultyLocked={true}
          botDifficultyLockReason="Verrouillé une fois la partie lancée"
          botSpeed={botSpeed}
          setBotSpeed={setBotSpeed}
          gameVariant={gameState.gameVariant || gameVariant}
          setGameVariant={handleChangeGameVariant}
          scoringMode={gameState.scoringMode || scoringMode}
          setScoringMode={handleChangeScoringMode}
          targetScore={gameState.targetScore || targetScore}
          setTargetScore={handleChangeTargetScore}
          isRulesLocked={true}
          rulesLockReason="Verrouillé une fois la partie lancée"
          tableTheme={tableTheme}
          setTableTheme={setTableTheme}
          cardBackTheme={cardBackTheme}
          setCardBackTheme={setCardBackTheme}
          trainingTrumpHelper={trainingTrumpHelper}
          setTrainingTrumpHelper={setTrainingTrumpHelper}
        />
      )}
    </div>
  );
}
