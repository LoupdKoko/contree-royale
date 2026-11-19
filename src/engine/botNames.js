import { BOT_NAME_POOLS, SEATS } from './constants';
import { cryptoRandomInt } from './rules';

// Mélange de Fisher-Yates sans biais via CSPRNG
function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Tire aléatoirement `count` noms uniques de bots depuis le pool associé à `difficulty`,
 * en évitant toute collision avec `usedNames` (insensible à la casse).
 * Si `count` dépasse le nombre de noms disponibles dans le pool principal, un repli sûr
 * complète depuis les autres pools puis avec des noms génériques numérotés.
 */
export function pickUniqueBotNames(difficulty = 'PRO', count = 1, usedNames = []) {
  const taken = new Set(
    usedNames
      .filter(Boolean)
      .map((name) => String(name).trim().toLowerCase())
  );

  const primaryPool = BOT_NAME_POOLS[difficulty] || BOT_NAME_POOLS.PRO;
  const fallbackPool = Object.entries(BOT_NAME_POOLS)
    .filter(([key]) => key !== difficulty)
    .flatMap(([, names]) => names);

  const selected = [];

  const drawFrom = (candidates) => {
    for (const candidate of shuffleArray(candidates)) {
      if (selected.length >= count) break;
      const key = candidate.trim().toLowerCase();
      if (!taken.has(key)) {
        taken.add(key);
        selected.push(candidate);
      }
    }
  };

  drawFrom(primaryPool);
  if (selected.length < count) {
    drawFrom(fallbackPool);
  }

  let fallbackIndex = 1;
  while (selected.length < count) {
    const fallbackName = `Ancien #${fallbackIndex++}`;
    const key = fallbackName.toLowerCase();
    if (!taken.has(key)) {
      taken.add(key);
      selected.push(fallbackName);
    }
  }

  return selected;
}

/**
 * Réattribue dynamiquement des noms uniques du pool correspondant à `difficulty`
 * à tous les sièges occupés par des bots classiques (préserve les joueurs humains
 * ainsi que les bots temporaires de relais qui conservent le pseudo d'un ami déconnecté).
 */
export function assignBotNamesForSeats(seats, difficulty = 'PRO') {
  const nextSeats = {};
  const preservedNames = [];
  const regularBotSeatKeys = [];

  SEATS.forEach((seatKey) => {
    const occupant = seats?.[seatKey];
    if (occupant && occupant.isBot && !occupant.isTempBot) {
      regularBotSeatKeys.push(seatKey);
      nextSeats[seatKey] = { ...occupant };
    } else if (occupant) {
      nextSeats[seatKey] = { ...occupant };
      if (occupant.name) preservedNames.push(occupant.name);
      if (occupant.originalName) preservedNames.push(occupant.originalName);
    }
  });

  const drawnNames = pickUniqueBotNames(difficulty, regularBotSeatKeys.length, preservedNames);
  regularBotSeatKeys.forEach((seatKey, idx) => {
    nextSeats[seatKey] = {
      ...nextSeats[seatKey],
      name: drawnNames[idx]
    };
  });

  return nextSeats;
}

/**
 * Tire un seul nom de bot unique pour un siège donné, en garantissant l'absence
 * de doublon avec tous les autres sièges de la table.
 */
export function pickSingleBotName(seats, difficulty = 'PRO', excludeSeat = null) {
  const usedNames = SEATS
    .filter((seatKey) => seatKey !== excludeSeat)
    .map((seatKey) => seats?.[seatKey]?.name)
    .filter(Boolean);

  return pickUniqueBotNames(difficulty, 1, usedNames)[0];
}
