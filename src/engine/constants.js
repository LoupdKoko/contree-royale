// ==========================================
// CONSTANTES & RÈGLES DE LA CONTRÉE / COINCHE
// ==========================================
export const SUITS = ['H', 'C', 'D', 'S']; // Cœur, Trèfle, Carreau, Pique
export const SPECIAL_SUITS = ['TA', 'SA']; // Tout Atout, Sans Atout

export const SUIT_INFO = {
  'S': { name: 'Pique', symbol: '♠', color: 'text-slate-900', bg: 'bg-slate-100', border: 'border-slate-300', badgeBg: 'bg-slate-800 text-white' },
  'H': { name: 'Cœur', symbol: '♥', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badgeBg: 'bg-red-600 text-white' },
  'D': { name: 'Carreau', symbol: '♦', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badgeBg: 'bg-red-600 text-white' },
  'C': { name: 'Trèfle', symbol: '♣', color: 'text-slate-900', bg: 'bg-slate-100', border: 'border-slate-300', badgeBg: 'bg-slate-800 text-white' },
  'TA': { name: 'Tout Atout', symbol: 'TA', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-300', badgeBg: 'bg-amber-500 text-stone-950' },
  'SA': { name: 'Sans Atout', symbol: 'SA', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-300', badgeBg: 'bg-indigo-600 text-white' }
};

export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_LABELS = {
  '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'V', 'Q': 'D', 'K': 'R', 'A': 'A'
};

// Ordre de force (index 0 = plus faible, index 7 = plus fort)
export const NON_TRUMP_POWER = { '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7 };
export const TRUMP_POWER     = { '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7 };

// Ordre d'affichage des atouts du plus fort au plus faible
export const TRUMP_RANKS_DESC = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

// Ordre des séquences pour les annonces (Tierce, Cinquante, Cent)
export const SEQUENCE_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Valeur en points des cartes
export const NON_TRUMP_POINTS = { '7': 0, '8': 0, '9': 0, 'J': 2, 'Q': 3, 'K': 4, '10': 10, 'A': 11 };
export const TRUMP_POINTS     = { '7': 0, '8': 0, 'Q': 3, 'K': 4, '10': 10, 'A': 11, '9': 14, 'J': 20 };

export const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160, 250]; // 250 = Capot
export const SEATS = ['S', 'W', 'N', 'E']; // Sens de jeu (horaire : Sud -> Ouest -> Nord -> Est)
export const SEAT_NAMES = { 'S': 'Sud', 'W': 'Ouest', 'N': 'Nord', 'E': 'Est' };

export const TARGET_SCORE_OPTIONS = [1000, 1500, 2000];

export const SCORING_MODES = {
  POINTS_PLUS_CONTRACT: {
    id: 'POINTS_PLUS_CONTRACT',
    label: 'Points faits + Contrat',
    shortDesc: 'Règle classique : on additionne les points réalisés et la valeur du contrat annoncé.'
  },
  CONTRACT_ONLY: {
    id: 'CONTRACT_ONLY',
    label: 'Contrat annoncé seul',
    shortDesc: 'Si le contrat est réussi, l’attaque marque uniquement son contrat annoncé (+ Belote/Annonces).'
  },
  POINTS_ONLY: {
    id: 'POINTS_ONLY',
    label: 'Points faits seuls',
    shortDesc: 'Chaque camp marque les points de ses plis réalisés (sauf en cas de chute ou de contre).'
  }
};

export const GAME_VARIANTS = {
  CONTREE: {
    id: 'CONTREE',
    label: 'Contrée Classique',
    shortDesc: '4 couleurs d’atout (♠ ♥ ♦ ♣), sans annonces de combinaisons ni TA/SA.'
  },
  COINCHE: {
    id: 'COINCHE',
    label: 'Coinche (TA/SA + Annonces)',
    shortDesc: 'Ajoute Tout Atout (TA), Sans Atout (SA) et les annonces (Tierce, 50, 100, Carré).'
  }
};

export const BOT_DIFFICULTIES = {
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
    shortDesc: 'Comptage des 32 cartes, Capot, appels en défense et mémoire totale',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-400/40'
  }
};

export const BOT_SPEEDS = {
  SLOW: {
    id: 'SLOW',
    label: 'Lente',
    shortDesc: 'Prend le temps de bien voir chaque carte jouée',
    botDelayMs: 1200,
    trickSweepMs: 1900
  },
  NORMAL: {
    id: 'NORMAL',
    label: 'Normale',
    shortDesc: 'Rythme naturel et fluide autour de la table',
    botDelayMs: 750,
    trickSweepMs: 1350
  },
  FAST: {
    id: 'FAST',
    label: 'Rapide',
    shortDesc: 'Enchaînement nerveux pour les joueurs aguerris',
    botDelayMs: 320,
    trickSweepMs: 750
  }
};

export const TABLE_THEMES = {
  EMERALD: {
    id: 'EMERALD',
    label: 'Émeraude Royal',
    outerBg: 'from-emerald-950 via-emerald-900 to-emerald-950',
    feltBg: 'from-emerald-600 via-emerald-800 to-emerald-950',
    woodBorder: 'border-amber-950',
    previewClass: 'bg-emerald-700 border-amber-800'
  },
  BURGUNDY: {
    id: 'BURGUNDY',
    label: 'Bordeaux Casino',
    outerBg: 'from-rose-950 via-stone-950 to-rose-950',
    feltBg: 'from-rose-700 via-rose-900 to-stone-950',
    woodBorder: 'border-amber-950',
    previewClass: 'bg-rose-800 border-amber-800'
  },
  MIDNIGHT: {
    id: 'MIDNIGHT',
    label: 'Bleu Nuit Prestige',
    outerBg: 'from-slate-950 via-indigo-950 to-slate-950',
    feltBg: 'from-indigo-700 via-indigo-900 to-slate-950',
    woodBorder: 'border-stone-900',
    previewClass: 'bg-indigo-800 border-stone-700'
  },
  SLATE: {
    id: 'SLATE',
    label: 'Noir Onyx & Or',
    outerBg: 'from-stone-950 via-neutral-900 to-stone-950',
    feltBg: 'from-stone-700 via-stone-900 to-stone-950',
    woodBorder: 'border-amber-900',
    previewClass: 'bg-stone-800 border-amber-600'
  }
};

export const CARD_BACK_THEMES = {
  ROYAL_BLUE: {
    id: 'ROYAL_BLUE',
    label: 'Bleu Royal & Or',
    outerClass: 'from-blue-900 via-indigo-950 to-slate-900 border-amber-300/60',
    innerClass: 'border-amber-400/30 bg-[radial-gradient(#f59e0b_1px,transparent_1px)]'
  },
  CRIMSON_GOLD: {
    id: 'CRIMSON_GOLD',
    label: 'Rouge Impérial',
    outerClass: 'from-red-900 via-rose-950 to-stone-900 border-amber-300/70',
    innerClass: 'border-amber-300/40 bg-[radial-gradient(#fbbf24_1px,transparent_1px)]'
  },
  EMERALD_CROWN: {
    id: 'EMERALD_CROWN',
    label: 'Émeraude & Couronne',
    outerClass: 'from-emerald-800 via-teal-950 to-stone-950 border-emerald-300/60',
    innerClass: 'border-emerald-300/40 bg-[radial-gradient(#34d399_1px,transparent_1px)]'
  },
  OBSIDIAN: {
    id: 'OBSIDIAN',
    label: 'Noir Obsidienne',
    outerClass: 'from-stone-800 via-neutral-950 to-black border-amber-400/80',
    innerClass: 'border-amber-400/40 bg-[radial-gradient(#f59e0b_1px,transparent_1px)]'
  }
};

export const DEFAULT_PLAYER_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  roundsPlayed: 0,
  contractsTaken: 0,
  contractsMade: 0,
  capotsMade: 0,
  coinchesWon: 0,
  fannysInflicted: 0,
  fannysSuffered: 0,
  bestRoundScore: 0
};

export const ACHIEVEMENTS = [
  {
    id: 'FIRST_WIN',
    title: 'Première Couronne',
    desc: 'Remporter votre première partie complète.',
    icon: '👑',
    check: (s) => s.gamesWon >= 1
  },
  {
    id: 'MAITRE_PRENEUR',
    title: 'Maître Preneur',
    desc: 'Réussir au moins 10 contrats annoncés.',
    icon: '🎯',
    check: (s) => s.contractsMade >= 10
  },
  {
    id: 'ROI_COINCHE',
    title: 'Roi de la Coinche',
    desc: 'Gagner au moins 3 manches contrées ou surcontrées.',
    icon: '⚡',
    check: (s) => s.coinchesWon >= 3
  },
  {
    id: 'CAPOT_ROYAL',
    title: 'Capot Royal',
    desc: 'Réaliser les 8 plis d’une manche (Capot).',
    icon: '🔥',
    check: (s) => s.capotsMade >= 1
  },
  {
    id: 'FANNY_LEGENDAIRE',
    title: 'Fanny Légendaire !',
    desc: 'Infliger une Fanny (gagner une partie en laissant l’adversaire à 0 point).',
    icon: '🍑',
    check: (s) => s.fannysInflicted >= 1
  },
  {
    id: 'VETERAN',
    title: 'Vétéran du Tapis',
    desc: 'Jouer au moins 25 manches de Contrée Royale.',
    icon: '🏆',
    check: (s) => s.roundsPlayed >= 25
  }
];

export const QUICK_CHATS = [
  "Bien joué ! 👏",
  "Super combat ! 👍",
  "Merci partenaire ! 🤝",
  "Aïe aïe aïe... 😬",
  "Oups, pardon ! 😅",
  "À toi de jouer ! ⏳",
  "Belle annonce ! 🔥",
  "On les tient ! 💪",
  "Bien tenté ! 😉"
];

export const BOT_NAME_POOLS = {
  BEGINNER: [
    'Pépé Toussaint',
    'Tonton Ange',
    'Ziu Battì',
    'Nonnu Santu'
  ],
  INTERMEDIATE: [
    'Paulu de la Balagne',
    "Ghjuvan'Carlu",
    "L'Oncle Saveriu",
    'Mattea du Maquis'
  ],
  PRO: [
    'Don Pasquale',
    'Le Vieux Petru',
    "Antò l'Ancien",
    'Nonnu Ghjaseppu'
  ]
};
