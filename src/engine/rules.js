import {
  SUITS,
  SUIT_INFO,
  RANKS,
  RANK_LABELS,
  NON_TRUMP_POWER,
  TRUMP_POWER,
  SEQUENCE_ORDER,
  NON_TRUMP_POINTS,
  TRUMP_POINTS,
  SEATS
} from './constants';

// ==========================================
// FONCTIONS UTILITAIRES & MOTEUR DE JEU
// ==========================================

export function getTeam(seat) {
  return (seat === 'S' || seat === 'N') ? 'NS' : 'EW';
}

export function getPartner(seat) {
  const map = { 'S': 'N', 'N': 'S', 'E': 'W', 'W': 'E' };
  return map[seat];
}

export function getNextSeat(seat) {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

export function isCardTrump(card, trumpSuit) {
  if (!card || !trumpSuit || trumpSuit === 'SA') return false;
  if (trumpSuit === 'TA') return true;
  return card.suit === trumpSuit;
}

export function getCardPoints(card, trumpSuit) {
  if (trumpSuit === 'TA') return TRUMP_POINTS[card.rank];
  if (trumpSuit === 'SA') return NON_TRUMP_POINTS[card.rank];
  return card.suit === trumpSuit ? TRUMP_POINTS[card.rank] : NON_TRUMP_POINTS[card.rank];
}

export function getCardPower(card, trumpSuit) {
  if (trumpSuit === 'TA') return TRUMP_POWER[card.rank];
  if (trumpSuit === 'SA') return NON_TRUMP_POWER[card.rank];
  return card.suit === trumpSuit ? TRUMP_POWER[card.rank] : NON_TRUMP_POWER[card.rank];
}

// Tri des cartes en main : Atouts tout à gauche, et ordre décroissant (plus forte à gauche, plus faible à droite)
export function sortHand(cards, trumpSuit = null) {
  return [...cards].sort((a, b) => {
    if (trumpSuit && trumpSuit !== 'TA' && trumpSuit !== 'SA') {
      const aIsTrump = a.suit === trumpSuit;
      const bIsTrump = b.suit === trumpSuit;
      if (aIsTrump && !bIsTrump) return -1;
      if (!aIsTrump && bIsTrump) return 1;
    }
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    const powerA = getCardPower(a, trumpSuit);
    const powerB = getCardPower(b, trumpSuit);
    return powerB - powerA;
  });
}

// Générateur de nombres aléatoires cryptographique (CSPRNG) sans biais
export function cryptoRandomInt(maxExclusive) {
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
export function createAndDealDeck(dealerSeat = 'E') {
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

// Détermine quelle carte remporte le pli en cours (Gère Couleur, Tout Atout et Sans Atout)
export function getTrickWinner(trick, trumpSuit) {
  if (!trick || trick.length === 0) return null;
  const leadSuit = trick[0].card.suit;
  let bestPlay = trick[0];

  // En Tout Atout (TA) ou Sans Atout (SA), seule la couleur d'entame peut remporter le pli
  if (trumpSuit === 'TA' || trumpSuit === 'SA') {
    const powerMap = trumpSuit === 'TA' ? TRUMP_POWER : NON_TRUMP_POWER;
    for (let i = 1; i < trick.length; i++) {
      const current = trick[i];
      if (current.card.suit === leadSuit) {
        if (powerMap[current.card.rank] > powerMap[bestPlay.card.rank]) {
          bestPlay = current;
        }
      }
    }
    return bestPlay;
  }

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

// Validation stricte des règles de pose (Couleur classique, Tout Atout, Sans Atout)
export function getPlayableCardIds(hand, currentTrick, trumpSuit, mySeat) {
  if (!hand || hand.length === 0) return [];
  if (!currentTrick || currentTrick.length === 0) {
    return hand.map(c => c.id);
  }

  const leadSuit = currentTrick[0].card.suit;
  const sameSuitCards = hand.filter(c => c.suit === leadSuit);

  // Mode SANS ATOUT (SA) : obligation de fournir à la couleur demandée uniquement
  if (trumpSuit === 'SA') {
    if (sameSuitCards.length > 0) {
      return sameSuitCards.map(c => c.id);
    }
    return hand.map(c => c.id);
  }

  // Mode TOUT ATOUT (TA) : obligation de fournir ET de monter à la couleur demandée
  if (trumpSuit === 'TA') {
    if (sameSuitCards.length > 0) {
      const leadSuitInTrick = currentTrick.filter(t => t.card.suit === leadSuit);
      const maxPower = Math.max(...leadSuitInTrick.map(t => TRUMP_POWER[t.card.rank]));
      const higherCards = sameSuitCards.filter(c => TRUMP_POWER[c.rank] > maxPower);
      if (higherCards.length > 0) {
        return higherCards.map(c => c.id);
      }
      return sameSuitCards.map(c => c.id);
    }
    return hand.map(c => c.id);
  }

  // Mode COULEUR CLASSIQUE (S, H, D, C)
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
// ANNONCES DE LA COINCHE (CARRÉS, TIERCES, 50, 100)
// ==========================================
export function detectHandDeclarations(hand, trumpSuit) {
  if (!hand || hand.length === 0 || trumpSuit === 'SA') return [];
  const declarations = [];

  // 1. Détection des Carrés (4 cartes de même hauteur : V, 9, A, 10, R, D)
  const byRank = {};
  hand.forEach(c => {
    byRank[c.rank] = (byRank[c.rank] || 0) + 1;
  });

  const carrePointsMap = {
    'J': 200,
    '9': 150,
    'A': 100,
    '10': 100,
    'K': 100,
    'Q': 100
  };
  const carreOrderMap = { 'J': 6, '9': 5, 'A': 4, '10': 3, 'K': 2, 'Q': 1 };

  Object.keys(byRank).forEach(rank => {
    if (byRank[rank] === 4 && carrePointsMap[rank]) {
      declarations.push({
        type: 'CARRE',
        label: `Carré de ${RANK_LABELS[rank]}`,
        points: carrePointsMap[rank],
        height: carreOrderMap[rank],
        isTrump: false
      });
    }
  });

  // 2. Détection des Séquences par couleur (Tierce = 3, Cinquante = 4, Cent = 5+)
  SUITS.forEach(suit => {
    const suitRanks = hand
      .filter(c => c.suit === suit)
      .map(c => SEQUENCE_ORDER.indexOf(c.rank))
      .sort((a, b) => a - b);

    if (suitRanks.length < 3) return;

    let runStart = 0;
    for (let i = 1; i <= suitRanks.length; i++) {
      if (i === suitRanks.length || suitRanks[i] !== suitRanks[i - 1] + 1) {
        const runLen = i - runStart;
        if (runLen >= 3) {
          const topIdx = suitRanks[i - 1];
          const topRank = SEQUENCE_ORDER[topIdx];
          const pts = runLen >= 5 ? 100 : runLen === 4 ? 50 : 20;
          const name = runLen >= 5 ? 'Cent' : runLen === 4 ? 'Cinquante' : 'Tierce';
          declarations.push({
            type: 'SEQUENCE',
            label: `${name} (${RANK_LABELS[topRank]}${SUIT_INFO[suit].symbol})`,
            points: pts,
            height: topIdx,
            isTrump: suit === trumpSuit || trumpSuit === 'TA'
          });
        }
        runStart = i;
      }
    }
  });

  return declarations;
}

// Résout les annonces entre les deux équipes selon la règle officielle de la Coinche :
// L'équipe ayant la combinaison la plus forte valide toutes les annonces de son camp.
export function resolveTableDeclarations(hands, trumpSuit, dealerSeat) {
  const bySeat = { S: [], W: [], N: [], E: [] };
  SEATS.forEach(s => {
    bySeat[s] = detectHandDeclarations(hands[s] || [], trumpSuit);
  });

  const allDecls = [];
  let cur = getNextSeat(dealerSeat);
  for (let order = 0; order < 4; order++) {
    bySeat[cur].forEach(d => {
      allDecls.push({ ...d, seat: cur, team: getTeam(cur), speakOrder: order });
    });
    cur = getNextSeat(cur);
  }

  if (allDecls.length === 0) {
    return { winningTeam: null, pointsNS: 0, pointsEW: 0, detailsBySeat: bySeat };
  }

  // Comparaison de deux annonces : points > type (Carré > Séquence) > hauteur > atout > ordre de parole
  allDecls.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.type !== b.type) return a.type === 'CARRE' ? -1 : 1;
    if (b.height !== a.height) return b.height - a.height;
    if (a.isTrump !== b.isTrump) return a.isTrump ? -1 : 1;
    return a.speakOrder - b.speakOrder;
  });

  const bestDecl = allDecls[0];
  const winningTeam = bestDecl.team;
  const totalWinnerPts = allDecls
    .filter(d => d.team === winningTeam)
    .reduce((sum, d) => sum + d.points, 0);

  return {
    winningTeam,
    pointsNS: winningTeam === 'NS' ? totalWinnerPts : 0,
    pointsEW: winningTeam === 'EW' ? totalWinnerPts : 0,
    detailsBySeat: bySeat,
    bestDeclaration: bestDecl
  };
}

// Normalise les points des plis sur une base de 162 pts (utile en Tout Atout = 258 bruts et Sans Atout = 130 bruts)
export function normalizeRoundPoints(rawPointsNS, rawPointsEW, tricksNS, tricksEW, trumpSuit) {
  if (trumpSuit !== 'TA' && trumpSuit !== 'SA') {
    return { pointsNS: rawPointsNS, pointsEW: rawPointsEW };
  }
  const totalRaw = rawPointsNS + rawPointsEW;
  if (totalRaw <= 0) return { pointsNS: 0, pointsEW: 0 };

  // Si Capot (8 plis à 0), l'équipe qui fait tous les plis prend 162
  if (tricksNS === 8) return { pointsNS: 162, pointsEW: 0 };
  if (tricksEW === 8) return { pointsNS: 0, pointsEW: 162 };

  const scaledNS = Math.round((rawPointsNS * 162) / totalRaw);
  const scaledEW = 162 - scaledNS;
  return { pointsNS: scaledNS, pointsEW: scaledEW };
}

// Calcule le score final de la manche selon le mode de comptage choisi
export function calculateRoundScore({
  contract,
  pointsNS,
  pointsEW,
  tricksNS,
  tricksEW,
  beloteNS,
  beloteEW,
  declarationsNS = 0,
  declarationsEW = 0,
  scoringMode = 'POINTS_PLUS_CONTRACT'
}) {
  const attackingTeam = contract.team;
  const defendingTeam = attackingTeam === 'NS' ? 'EW' : 'NS';
  const mult = contract.coinche || 1;

  const totalPointsNS = pointsNS + beloteNS + declarationsNS;
  const totalPointsEW = pointsEW + beloteEW + declarationsEW;

  const attackTotal = attackingTeam === 'NS' ? totalPointsNS : totalPointsEW;
  const attackTricks = attackingTeam === 'NS' ? tricksNS : tricksEW;

  let isContractMade = false;
  if (contract.value === 250) {
    isContractMade = attackTricks === 8;
  } else {
    isContractMade = attackTotal >= contract.value && attackTricks > 0;
  }

  let deltaNS = 0;
  let deltaEW = 0;
  let effectiveBeloteNS = beloteNS;
  let effectiveBeloteEW = beloteEW;
  let effectiveDeclNS = declarationsNS;
  let effectiveDeclEW = declarationsEW;

  if (isContractMade) {
    if (mult > 1) {
      // Contrat contré ou surcontré réussi
      const baseGain = scoringMode === 'CONTRACT_ONLY'
        ? contract.value * mult
        : (160 + contract.value) * mult;
      const bonusAttack = attackingTeam === 'NS'
        ? (beloteNS + declarationsNS * mult)
        : (beloteEW + declarationsEW * mult);

      if (attackingTeam === 'NS') {
        deltaNS = baseGain + bonusAttack;
        effectiveBeloteEW = 0;
        effectiveDeclEW = 0;
      } else {
        deltaEW = baseGain + bonusAttack;
        effectiveBeloteNS = 0;
        effectiveDeclNS = 0;
      }
    } else {
      // Contrat normal réussi selon le mode de comptage
      if (scoringMode === 'CONTRACT_ONLY') {
        if (attackingTeam === 'NS') {
          deltaNS = contract.value + beloteNS + declarationsNS;
          deltaEW = beloteEW + declarationsEW;
        } else {
          deltaEW = contract.value + beloteEW + declarationsEW;
          deltaNS = beloteNS + declarationsNS;
        }
      } else if (scoringMode === 'POINTS_ONLY') {
        deltaNS = contract.value === 250 && attackingTeam === 'NS' ? 250 + beloteNS + declarationsNS : totalPointsNS;
        deltaEW = contract.value === 250 && attackingTeam === 'EW' ? 250 + beloteEW + declarationsEW : totalPointsEW;
      } else {
        // POINTS_PLUS_CONTRACT (Classique)
        if (attackingTeam === 'NS') {
          deltaNS = totalPointsNS + contract.value;
          deltaEW = totalPointsEW;
        } else {
          deltaEW = totalPointsEW + contract.value;
          deltaNS = totalPointsNS;
        }
      }
    }
  } else {
    // Contrat chuté ("Dedans") : la défense rafle tout (160 + contrat selon mode) * multiplicateur + toutes les belotes & annonces
    const totalBelote = beloteNS + beloteEW;
    const totalDecl = declarationsNS + declarationsEW;
    const baseDefense = scoringMode === 'CONTRACT_ONLY'
      ? contract.value * mult
      : scoringMode === 'POINTS_ONLY' && mult === 1
      ? 160
      : (160 + contract.value) * mult;
    const defenseGain = baseDefense + totalBelote + totalDecl;

    if (defendingTeam === 'NS') {
      deltaNS = defenseGain;
      deltaEW = 0;
      effectiveBeloteNS = totalBelote;
      effectiveBeloteEW = 0;
      effectiveDeclNS = totalDecl;
      effectiveDeclEW = 0;
    } else {
      deltaEW = defenseGain;
      deltaNS = 0;
      effectiveBeloteEW = totalBelote;
      effectiveBeloteNS = 0;
      effectiveDeclEW = totalDecl;
      effectiveDeclNS = 0;
    }
  }

  return {
    isContractMade,
    deltaNS,
    deltaEW,
    effectiveBeloteNS,
    effectiveBeloteEW,
    effectiveDeclNS,
    effectiveDeclEW
  };
}
