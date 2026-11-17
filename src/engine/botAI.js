import {
  SUITS,
  RANKS,
  SEATS,
  TRUMP_POWER,
  NON_TRUMP_POWER,
  TRUMP_POINTS,
  NON_TRUMP_POINTS
} from './constants';
import {
  getTeam,
  getPartner,
  getNextSeat,
  getCardPoints,
  getCardPower,
  getTrickWinner,
  getPlayableCardIds,
  cryptoRandomInt
} from './rules';

// ==========================================
// INTELLIGENCE ARTIFICIELLE (DÉBUTANT, CONFIRMÉ, PRO)
// ==========================================

export function evaluateSuitForBid(hand, suit) {
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

// Évaluation d'une main en Tout Atout (TA)
export function evaluateHandForTA(hand) {
  let score = 0;
  let jacksCount = 0;
  SUITS.forEach(s => {
    const cards = hand.filter(c => c.suit === s);
    const hasJ = cards.some(c => c.rank === 'J');
    const has9 = cards.some(c => c.rank === '9');
    const hasA = cards.some(c => c.rank === 'A');
    const has10 = cards.some(c => c.rank === '10');

    if (hasJ) {
      jacksCount += 1;
      score += 28;
      if (has9) score += 24;
      if (cards.length >= 3) score += 10;
    } else if (has9 && cards.length >= 2) {
      score += 14;
      if (hasA && cards.length >= 3) score += 8;
    } else if (hasA && has10 && cards.length >= 3) {
      score += 8;
    }
  });
  if (jacksCount >= 3) score += 18;
  return score;
}

// Évaluation d'une main en Sans Atout (SA)
export function evaluateHandForSA(hand) {
  let score = 0;
  let acesCount = 0;
  SUITS.forEach(s => {
    const cards = hand.filter(c => c.rank && c.suit === s);
    const hasA = cards.some(c => c.rank === 'A');
    const has10 = cards.some(c => c.rank === '10');
    const hasK = cards.some(c => c.rank === 'K');
    const hasQ = cards.some(c => c.rank === 'Q');

    if (hasA) {
      acesCount += 1;
      score += 26;
      if (has10) {
        score += 20;
        if (hasK) score += 12;
      } else if (hasK && hasQ) {
        score += 10;
      }
      if (cards.length >= 4) score += 12;
    } else if (has10 && hasK && cards.length >= 3) {
      score += 10;
    }
  });
  if (acesCount >= 3) score += 16;
  return score;
}

// Détecte si la main du bot justifie une annonce directe de Capot (250)
export function canHandBidSoloCapot(hand, suit) {
  if (suit === 'TA') {
    const jacks = hand.filter(c => c.rank === 'J').length;
    const nines = hand.filter(c => c.rank === '9').length;
    return jacks === 4 && nines >= 2;
  }
  if (suit === 'SA') {
    const aces = hand.filter(c => c.rank === 'A').length;
    const tens = hand.filter(c => c.rank === '10').length;
    return aces === 4 && tens >= 3;
  }

  const trumps = hand.filter(c => c.suit === suit);
  const hasJ = trumps.some(c => c.rank === 'J');
  const has9 = trumps.some(c => c.rank === '9');
  const hasA = trumps.some(c => c.rank === 'A');
  const has10 = trumps.some(c => c.rank === '10');

  if (!hasJ || !has9 || trumps.length < 5) return false;
  if (trumps.length >= 6 && (hasA || has10)) {
    const sideCards = hand.filter(c => c.suit !== suit);
    const allSideAreBoss = sideCards.every(c => c.rank === 'A' || (c.rank === '10' && sideCards.some(sc => sc.suit === c.suit && sc.rank === 'A')));
    if (allSideAreBoss) return true;
  }
  if (trumps.length >= 5 && hasA && has10) {
    const sideCards = hand.filter(c => c.suit !== suit);
    const allSideAreBoss = sideCards.every(c => c.rank === 'A' || (c.rank === '10' && sideCards.some(sc => sc.suit === c.suit && sc.rank === 'A')));
    if (allSideAreBoss) return true;
  }
  return false;
}

function getBestBidSuitForHand(hand, gameVariant = 'CONTREE') {
  let bestSuit = 'H';
  let maxScore = 0;
  for (const s of SUITS) {
    const sc = evaluateSuitForBid(hand, s);
    if (sc > maxScore) {
      maxScore = sc;
      bestSuit = s;
    }
  }

  if (gameVariant === 'COINCHE') {
    const taScore = evaluateHandForTA(hand);
    if (taScore > maxScore + 6) {
      maxScore = taScore;
      bestSuit = 'TA';
    }
    const saScore = evaluateHandForSA(hand);
    if (saScore > maxScore + 6) {
      maxScore = saScore;
      bestSuit = 'SA';
    }
  }

  return { bestSuit, maxScore };
}

// --- NIVEAU DÉBUTANT : Enchères prudentes et simples ---
export function decideBotBidBeginner(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const highestBid = gameState.highestBid;

  if (gameState.coincheStatus > 1) return { type: 'PASS' };

  const { bestSuit, maxScore } = getBestBidSuitForHand(hand, gameState.gameVariant);

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
export function decideBotBidIntermediate(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const highestBid = gameState.highestBid;
  const partnerSeat = getPartner(botSeat);
  const myTeam = getTeam(botSeat);

  if (gameState.coincheStatus > 1) return { type: 'PASS' };

  // Contre uniquement si l'adversaire monte très haut (>= 130) et qu'on a Valet + 9 d'atout
  if (highestBid && getTeam(highestBid.seat) !== myTeam && highestBid.value >= 130 && SUITS.includes(highestBid.suit)) {
    const myTrumps = hand.filter(c => c.suit === highestBid.suit);
    if (myTrumps.some(c => c.rank === 'J') && myTrumps.some(c => c.rank === '9')) {
      return { type: 'COINCHE' };
    }
  }

  const { bestSuit, maxScore } = getBestBidSuitForHand(hand, gameState.gameVariant);

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

// --- NIVEAU PROFESSIONNEL ---
export function decideBotBidPro(gameState, botSeat) {
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
      const myScoreInContract = highestBid.suit === 'TA'
        ? evaluateHandForTA(hand)
        : highestBid.suit === 'SA'
        ? evaluateHandForSA(hand)
        : evaluateSuitForBid(hand, highestBid.suit);
      if (myScoreInContract >= 125) {
        return { type: 'SURCOINCHE' };
      }
    }
    return { type: 'PASS' };
  }

  const partnerBids = (gameState.bids || []).filter(b => b.seat === partnerSeat && b.type === 'BID');
  const lastPartnerBid = partnerBids.length > 0 ? partnerBids[partnerBids.length - 1] : null;

  // Évaluation du Contre (Coinche) sur une annonce adverse
  if (highestBid && getTeam(highestBid.seat) !== myTeam) {
    const oppSuit = highestBid.suit;
    let defenseStrength = 0;

    if (oppSuit === 'TA') {
      const myJacks = hand.filter(c => c.rank === 'J').length;
      const myNines = hand.filter(c => c.rank === '9').length;
      defenseStrength = myJacks * 24 + myNines * 12;
    } else if (oppSuit === 'SA') {
      const myAces = hand.filter(c => c.rank === 'A').length;
      const myTens = hand.filter(c => c.rank === '10').length;
      defenseStrength = myAces * 24 + myTens * 12;
    } else {
      const myTrumps = hand.filter(c => c.suit === oppSuit);
      const hasJ = myTrumps.some(c => c.rank === 'J');
      const has9 = myTrumps.some(c => c.rank === '9');
      const hasK = myTrumps.some(c => c.rank === 'K');
      const hasQ = myTrumps.some(c => c.rank === 'Q');
      const hasBelote = hasK && hasQ;
      const outsideAces = hand.filter(c => c.suit !== oppSuit && c.rank === 'A').length;

      if (hasJ && has9) defenseStrength += 55;
      else if (hasJ && myTrumps.length >= 2) defenseStrength += 32;
      else if (has9 && myTrumps.length >= 3) defenseStrength += 28;
      if (myTrumps.length >= 4) defenseStrength += 25;
      if (hasBelote) defenseStrength += 20;
      defenseStrength += outsideAces * 14;
    }

    if (lastPartnerBid) defenseStrength += 18;

    if (
      (highestBid.value >= 90 && defenseStrength >= 68) ||
      (highestBid.value >= 110 && defenseStrength >= 50) ||
      (highestBid.value >= 130 && defenseStrength >= 36)
    ) {
      return { type: 'COINCHE' };
    }
  }

  const { bestSuit, maxScore } = getBestBidSuitForHand(hand, gameState.gameVariant);

  // Détection d'un Capot (250) direct avec une main exceptionnelle
  if (canHandBidSoloCapot(hand, bestSuit) && (!highestBid || highestBid.value < 250)) {
    return { type: 'BID', value: 250, suit: bestSuit };
  }

  // Soutien de l'annonce du partenaire
  if (lastPartnerBid && SUITS.includes(lastPartnerBid.suit)) {
    const pSuit = lastPartnerBid.suit;
    const trumpsForP = hand.filter(c => c.suit === pSuit);
    const hasJ = trumpsForP.some(c => c.rank === 'J');
    const has9 = trumpsForP.some(c => c.rank === '9');
    const hasA = trumpsForP.some(c => c.rank === 'A');
    const hasBelote = trumpsForP.some(c => c.rank === 'K') && trumpsForP.some(c => c.rank === 'Q');

    let supportPts = 0;
    let outsideAcesCount = 0;
    if (hasJ) supportPts += 25;
    if (has9) supportPts += 15;
    if (hasA) supportPts += 10;
    if (hasBelote) supportPts += 20;
    if (trumpsForP.length >= 3) supportPts += 10;

    SUITS.filter(s => s !== pSuit).forEach(s => {
      const sCards = hand.filter(c => c.suit === s);
      if (sCards.some(c => c.rank === 'A')) {
        outsideAcesCount += 1;
        supportPts += 12;
        if (sCards.some(c => c.rank === '10')) supportPts += 10;
      }
    });

    // Soutien en Capot (250) si le partenaire a annoncé >= 130 et qu'on a le complément maître
    if (
      lastPartnerBid.value >= 130 &&
      (hasJ || has9) &&
      trumpsForP.length >= 2 &&
      outsideAcesCount >= 2 &&
      supportPts >= 58 &&
      (!highestBid || highestBid.value < 250)
    ) {
      return { type: 'BID', value: 250, suit: pSuit };
    }

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
  if (maxScore >= 146) maxBidAllowed = 160;
  else if (maxScore >= 132) maxBidAllowed = 150;
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

export function decideBotBid(gameState, botSeat) {
  const diff = gameState.botDifficulty || 'PRO';
  if (diff === 'BEGINNER') return decideBotBidBeginner(gameState, botSeat);
  if (diff === 'INTERMEDIATE') return decideBotBidIntermediate(gameState, botSeat);
  return decideBotBidPro(gameState, botSeat);
}

export function buildBotMemory(gameState, botSeat) {
  const trump = gameState.trumpSuit;
  const hand = gameState.hands[botSeat] || [];
  const partnerSeat = getPartner(botSeat);
  const myTeam = getTeam(botSeat);

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
        if (SUITS.includes(trump) && play.card.suit !== trump) {
          const currentWinner = getTrickWinner(gameState.currentTrick.slice(0, gameState.currentTrick.indexOf(play)), trump);
          if (currentWinner && getTeam(currentWinner.seat) !== getTeam(play.seat)) {
            voidInSuit[play.seat][trump] = true;
          }
        }
      }
    });
  }

  // Analyse des appels du partenaire sur les plis précédents (signaux en défense)
  const partnerCalledSuits = new Set();
  const history = gameState.playedCardsHistory || [];
  for (let i = 0; i + 3 < history.length; i += 4) {
    const pastTrick = history.slice(i, i + 4);
    const leadSuit = pastTrick[0].card.suit;
    const winner = getTrickWinner(pastTrick, trump);
    // Si l'adversaire a remporté le pli et que notre partenaire a défaussé une carte d'appel (> 7)
    if (winner && getTeam(winner.seat) !== myTeam) {
      const partnerPlay = pastTrick.find(p => p.seat === partnerSeat);
      if (
        partnerPlay &&
        partnerPlay.card.suit !== leadSuit &&
        partnerPlay.card.suit !== trump &&
        partnerPlay.card.rank !== '7'
      ) {
        partnerCalledSuits.add(partnerPlay.card.suit);
      }
    }
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

  const remainingExternalTrumps = SUITS.includes(trump)
    ? unplayedExternals.filter(c => c.suit === trump)
    : [];

  return {
    playedIds,
    unplayedExternals,
    remainingExternalTrumps,
    voidInSuit,
    partnerCalledSuits,
    isBossCard
  };
}

// --- JEU DE LA CARTE NIVEAU DÉBUTANT ---
export function decideBotCardBeginner(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const playableIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, botSeat);
  const playableCards = hand.filter(c => playableIds.includes(c.id));
  if (playableCards.length === 1) return playableCards[0];

  const trump = gameState.trumpSuit;
  if (cryptoRandomInt(100) < 40) {
    return playableCards[cryptoRandomInt(playableCards.length)];
  }
  return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
}

// --- JEU DE LA CARTE NIVEAU CONFIRMÉ ---
export function decideBotCardIntermediate(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const playableIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, botSeat);
  const playableCards = hand.filter(c => playableIds.includes(c.id));
  if (playableCards.length === 1) return playableCards[0];

  const trump = gameState.trumpSuit;
  const trick = gameState.currentTrick || [];
  const partnerSeat = getPartner(botSeat);

  if (trick.length === 0) {
    const sideAces = playableCards.filter(c => c.suit !== trump && c.rank === 'A');
    if (sideAces.length > 0) return sideAces[0];
    return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
  }

  const currentWinner = getTrickWinner(trick, trump);
  if (currentWinner.seat === partnerSeat) {
    if (trick.length === 3) {
      const nonTrumpPoints = playableCards
        .filter(c => c.suit !== trump)
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (nonTrumpPoints.length > 0) return nonTrumpPoints[0];
    }
    return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
  }

  const winningOptions = playableCards.filter(card => {
    const sim = [...trick, { seat: botSeat, card }];
    return getTrickWinner(sim, trump).seat === botSeat;
  });
  if (winningOptions.length > 0) {
    return winningOptions.sort((a, b) => getCardPower(b, trump) - getCardPower(a, trump))[0];
  }

  return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
}

// --- JEU DE LA CARTE NIVEAU PROFESSIONNEL ---
export function decideBotCardPro(gameState, botSeat) {
  const hand = gameState.hands[botSeat] || [];
  const playableIds = getPlayableCardIds(hand, gameState.currentTrick, gameState.trumpSuit, botSeat);
  const playableCards = hand.filter(c => playableIds.includes(c.id));

  if (playableCards.length === 1) return playableCards[0];

  const trump = gameState.trumpSuit;
  const isSuitContract = SUITS.includes(trump);
  const trick = gameState.currentTrick || [];
  const partnerSeat = getPartner(botSeat);
  const myTeam = getTeam(botSeat);
  const isAttacking = gameState.contract && gameState.contract.team === myTeam;
  const opponents = SEATS.filter(s => getTeam(s) !== myTeam);

  const mem = buildBotMemory(gameState, botSeat);
  const opponentsHaveTrumps =
    isSuitContract &&
    mem.remainingExternalTrumps.length > 0 &&
    opponents.some(opp => !mem.voidInSuit[opp][trump]);

  // CAS 1 : LE BOT OUVRE LE PLI
  if (trick.length === 0) {
    if (!isSuitContract) {
      // Ouverture en Tout Atout (TA) ou Sans Atout (SA) : encaisser ses cartes maîtresses en priorité
      const bossCards = playableCards
        .filter(c => mem.isBossCard(c))
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (bossCards.length > 0) return bossCards[0];

      // Sinon jouer dans une couleur appelée par le partenaire
      const calledCard = playableCards.find(c => mem.partnerCalledSuits.has(c.suit));
      if (calledCard) return calledCard;

      return [...playableCards].sort((a, b) => getCardPoints(a, trump) - getCardPoints(b, trump))[0];
    }

    const myTrumps = playableCards.filter(c => c.suit === trump);
    const myNonTrumps = playableCards.filter(c => c.suit !== trump);

    // En attaque : faire tomber les atouts adverses
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

    // Jouer une carte maîtresse hors-atout non coupable par l'adversaire
    const safeBossNonTrumps = myNonTrumps.filter(c => {
      if (!mem.isBossCard(c)) return false;
      const oppCanCut = opponentsHaveTrumps && opponents.some(opp => mem.voidInSuit[opp][c.suit]);
      return !oppCanCut;
    });
    if (safeBossNonTrumps.length > 0) {
      return safeBossNonTrumps.sort((a, b) => NON_TRUMP_POINTS[b.rank] - NON_TRUMP_POINTS[a.rank])[0];
    }

    // En défense : répondre à l'appel du partenaire s'il a signalé une couleur
    if (!isAttacking && mem.partnerCalledSuits.size > 0) {
      const answerCallCards = myNonTrumps
        .filter(c => mem.partnerCalledSuits.has(c.suit) && !mem.voidInSuit[partnerSeat][c.suit])
        .sort((a, b) => NON_TRUMP_POINTS[a.rank] - NON_TRUMP_POINTS[b.rank]);
      if (answerCallCards.length > 0) {
        return answerCallCards[0];
      }
    }

    // Faire couper le partenaire s'il est chicane dans une couleur et possède encore de l'atout
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
        const oppCanCut = isSuitContract && pCard.suit !== trump && mem.voidInSuit[oppAfterMe][leadSuit] && !mem.voidInSuit[oppAfterMe][trump];
        if (pIsBoss && !oppCanCut) {
          partnerCardIsGuaranteed = true;
        }
      }
    }
  }

  if (partnerIsWinning) {
    if (partnerCardIsGuaranteed) {
      const nonTrumpLoads = playableCards
        .filter(c => (!isSuitContract || c.suit !== trump) && !mem.isBossCard(c) && getCardPoints(c, trump) >= 10)
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (nonTrumpLoads.length > 0) return nonTrumpLoads[0];

      const anyHighPoints = playableCards
        .filter(c => !isSuitContract || c.suit !== trump)
        .sort((a, b) => getCardPoints(b, trump) - getCardPoints(a, trump));
      if (anyHighPoints.length > 0 && getCardPoints(anyHighPoints[0], trump) >= 4) {
        return anyHighPoints[0];
      }
    }

    const nonTrumpDumps = playableCards
      .filter(c => !isSuitContract || c.suit !== trump)
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

  // CAS 3 : LE BOT NE PEUT PAS GAGNER LE PLI (Défausse / Signalisation au partenaire)
  // Si on se défausse hors de la couleur demandée et hors atout, on peut faire un APPEL au partenaire
  if (isSuitContract) {
    const discardCandidates = playableCards.filter(c => c.suit !== leadSuit && c.suit !== trump);
    if (discardCandidates.length > 1) {
      // Appel direct : si on possède un As maître dans une couleur annexe et un 8 ou 9 de cette même couleur, on le jette pour appeler !
      const callCard = discardCandidates.find(c =>
        (c.rank === '9' || c.rank === '8') &&
        hand.some(h => h.suit === c.suit && h.rank === 'A' && mem.isBossCard(h))
      );
      if (callCard) return callCard;

      // Protection de la garde d'un 10 second (éviter de laisser un 10 sec)
      const safeDiscards = discardCandidates.filter(c => {
        const sameSuitInHand = hand.filter(h => h.suit === c.suit);
        const protectsTen = sameSuitInHand.length === 2 && sameSuitInHand.some(h => h.rank === '10') && c.rank !== '10';
        return !protectsTen;
      });

      if (safeDiscards.length > 0) {
        // Préférer jeter un 7 (refus clair) ou la carte qui donne le moins de points
        return safeDiscards.sort((a, b) => {
          const ptDiff = getCardPoints(a, trump) - getCardPoints(b, trump);
          if (ptDiff !== 0) return ptDiff;
          return NON_TRUMP_POWER[a.rank] - NON_TRUMP_POWER[b.rank];
        })[0];
      }
    }
  }

  return [...playableCards].sort((a, b) => {
    const ptDiff = getCardPoints(a, trump) - getCardPoints(b, trump);
    if (ptDiff !== 0) return ptDiff;
    return getCardPower(a, trump) - getCardPower(b, trump);
  })[0];
}

export function decideBotCard(gameState, botSeat) {
  const diff = gameState.botDifficulty || 'PRO';
  if (diff === 'BEGINNER') return decideBotCardBeginner(gameState, botSeat);
  if (diff === 'INTERMEDIATE') return decideBotCardIntermediate(gameState, botSeat);
  return decideBotCardPro(gameState, botSeat);
}
