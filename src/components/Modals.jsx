import React, { useState } from 'react';
import {
  Settings,
  Monitor,
  Maximize,
  Minimize,
  VolumeX,
  Volume2,
  Bot,
  Award,
  Download,
  Trophy,
  Sparkles,
  Palette,
  Gauge,
  GraduationCap,
  BarChart3,
  RotateCcw,
  Check,
  Lock
} from 'lucide-react';
import {
  BOT_DIFFICULTIES,
  BOT_SPEEDS,
  GAME_VARIANTS,
  SCORING_MODES,
  TARGET_SCORE_OPTIONS,
  TABLE_THEMES,
  CARD_BACK_THEMES,
  ACHIEVEMENTS
} from '../engine/constants';
import { soundEngine } from '../audio/SoundEngine';

export const SettingsModal = ({
  onClose,
  isFullscreen,
  onToggleFullscreen,
  audioSettings,
  setAudioSettings,
  botDifficulty,
  setBotDifficulty,
  isBotDifficultyLocked = false,
  botDifficultyLockReason = '',
  botSpeed = 'NORMAL',
  setBotSpeed,
  gameVariant = 'CONTREE',
  setGameVariant,
  scoringMode = 'POINTS_PLUS_CONTRACT',
  setScoringMode,
  targetScore = 1500,
  setTargetScore,
  isRulesLocked = false,
  rulesLockReason = '',
  tableTheme = 'EMERALD',
  setTableTheme,
  cardBackTheme = 'ROYAL_BLUE',
  setCardBackTheme,
  trainingTrumpHelper = false,
  setTrainingTrumpHelper,
  onOpenRules
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
        className="bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-2xl w-full text-white shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 pb-4">
          <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
            <Settings className="w-6 h-6" /> Paramètres & Règles
          </h3>
          <div className="flex items-center gap-2">
            {onOpenRules && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onOpenRules();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 text-amber-300 font-black text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Award className="w-4 h-4" /> Lire le Règlement
              </button>
            )}
            <button onClick={onClose} className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer px-1">
              ✕
            </button>
          </div>
        </div>

        {/* SECTION 1 : PERSONNALISATION DU TAPIS & DU DOS DES CARTES */}
        {(setTableTheme || setCardBackTheme) && (
          <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-4">
            <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Palette className="w-4 h-4" /> Personnalisation du Tapis & des Cartes
            </div>

            {setTableTheme && (
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Couleur de la Feutrine du Tapis
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(TABLE_THEMES).map((t) => {
                    const active = tableTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { soundEngine.playClick(); setTableTheme(t.id); }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${
                          active
                            ? 'bg-amber-500/15 border-amber-400 text-white ring-1 ring-amber-400'
                            : 'bg-stone-900/80 border-stone-800 text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${t.previewClass}`} />
                        <span className="font-bold text-xs truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {setCardBackTheme && (
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Motif du Dos des Cartes
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(CARD_BACK_THEMES).map((cb) => {
                    const active = cardBackTheme === cb.id;
                    return (
                      <button
                        key={cb.id}
                        type="button"
                        onClick={() => { soundEngine.playClick(); setCardBackTheme(cb.id); }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${
                          active
                            ? 'bg-amber-500/15 border-amber-400 text-white ring-1 ring-amber-400'
                            : 'bg-stone-900/80 border-stone-800 text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        <span className={`w-4 h-6 rounded bg-gradient-to-br border shrink-0 ${cb.outerClass}`} />
                        <span className="font-bold text-xs truncate">{cb.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2 : BOTS, VITESSE DE JEU & MODE ENTRAÎNEMENT */}
        <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Bot className="w-4 h-4" /> Intelligence Artificielle, Vitesse & Entraînement
            </div>
            {isBotDifficultyLocked && (
              <span className="text-[10px] font-bold bg-stone-800/90 text-stone-300 border border-stone-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                {botDifficultyLockReason || 'Difficulté verrouillée en cours de partie'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.values(BOT_DIFFICULTIES).map((lvl) => {
              const active = botDifficulty === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  disabled={isBotDifficultyLocked}
                  onClick={() => {
                    if (isBotDifficultyLocked) return;
                    soundEngine.playClick();
                    setBotDifficulty(lvl.id);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    isBotDifficultyLocked
                      ? active
                        ? 'bg-amber-500/15 border-amber-400/70 text-white opacity-85 cursor-not-allowed'
                        : 'bg-stone-900/50 border-stone-800/70 text-stone-500 opacity-50 cursor-not-allowed'
                      : active
                      ? 'bg-amber-500/15 border-amber-400 text-white cursor-pointer'
                      : 'bg-stone-900/80 border-stone-800 text-stone-300 hover:bg-stone-800 cursor-pointer'
                  }`}
                >
                  <div className="font-black text-xs flex items-center justify-between">
                    <span>{lvl.label}</span>
                    {active && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5 leading-snug">{lvl.shortDesc}</div>
                </button>
              );
            })}
          </div>

          {setBotSpeed && (
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Vitesse de Jeu des Bots & Ramassage des Plis
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(BOT_SPEEDS).map((sp) => {
                  const active = botSpeed === sp.id;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => { soundEngine.playClick(); setBotSpeed(sp.id); }}
                      className={`py-2 px-3 rounded-xl border text-center transition cursor-pointer ${
                        active
                          ? 'bg-emerald-500 text-stone-950 font-black border-white shadow'
                          : 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-stone-800 font-bold'
                      }`}
                    >
                      <div className="text-xs">{sp.label}</div>
                      <div className={`text-[9px] ${active ? 'text-stone-900' : 'text-stone-400'}`}>
                        {sp.botDelayMs}ms
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {setTrainingTrumpHelper && (
            <div className="pt-2 border-t border-stone-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-sky-300 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-sky-400" /> Indicateur des Cartes Restantes à l'Atout
                  <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-400/40 px-1.5 py-0.5 rounded-full uppercase">
                    Solo uniquement
                  </span>
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  Affiche un aide-mémoire des 8 atouts (tombés / en main / dehors). Désactivé automatiquement en multijoueur.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setTrainingTrumpHelper(!trainingTrumpHelper);
                }}
                className={`px-3.5 py-2 rounded-xl font-black text-xs shrink-0 transition cursor-pointer ${
                  trainingTrumpHelper
                    ? 'bg-sky-400 text-stone-950 shadow'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                {trainingTrumpHelper ? 'Activé ✓' : 'Désactivé'}
              </button>
            </div>
          )}
        </div>

        {/* SECTION 3 : RÈGLES DE JEU, COMPTAGE & SCORE CIBLE */}
        {(setGameVariant || setScoringMode || setTargetScore) && (
          <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Variantes de Règles & Comptage
              </div>
              {isRulesLocked && (
                <span className="text-[10px] font-bold bg-stone-800/90 text-stone-300 border border-stone-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  {rulesLockReason || 'Règles verrouillées en cours de partie'}
                </span>
              )}
            </div>

            {setGameVariant && (
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Variante de Jeu
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.values(GAME_VARIANTS).map((v) => {
                    const active = gameVariant === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={isRulesLocked}
                        onClick={() => {
                          if (isRulesLocked) return;
                          soundEngine.playClick();
                          setGameVariant(v.id);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          isRulesLocked
                            ? active
                              ? 'bg-amber-500/15 border-amber-400/70 text-white opacity-85 cursor-not-allowed'
                              : 'bg-stone-900/50 border-stone-800/70 text-stone-500 opacity-50 cursor-not-allowed'
                            : active
                            ? 'bg-amber-500/15 border-amber-400 text-white cursor-pointer'
                            : 'bg-stone-900/80 border-stone-800 text-stone-300 hover:bg-stone-800 cursor-pointer'
                        }`}
                      >
                        <div className="font-black text-xs flex items-center justify-between">
                          <span>{v.label}</span>
                          {active && <span className="text-[9px] bg-amber-400 text-stone-950 px-1.5 py-0.5 rounded-full font-black">Actif</span>}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">{v.shortDesc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {setScoringMode && (
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Mode de Comptage des Points
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.values(SCORING_MODES).map((m) => {
                    const active = scoringMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isRulesLocked}
                        onClick={() => {
                          if (isRulesLocked) return;
                          soundEngine.playClick();
                          setScoringMode(m.id);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                          isRulesLocked
                            ? active
                              ? 'bg-emerald-500/15 border-emerald-400/70 text-white opacity-85 cursor-not-allowed'
                              : 'bg-stone-900/50 border-stone-800/70 text-stone-500 opacity-50 cursor-not-allowed'
                            : active
                            ? 'bg-emerald-500/15 border-emerald-400 text-white cursor-pointer'
                            : 'bg-stone-900/80 border-stone-800 text-stone-300 hover:bg-stone-800 cursor-pointer'
                        }`}
                      >
                        <div>
                          <div className="font-black text-xs">{m.label}</div>
                          <div className="text-[11px] text-stone-400">{m.shortDesc}</div>
                        </div>
                        <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ml-2 ${active ? 'bg-emerald-400 border-white' : 'border-stone-600'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {setTargetScore && (
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  Score Cible de Victoire
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_SCORE_OPTIONS.map((pts) => {
                    const active = targetScore === pts;
                    return (
                      <button
                        key={pts}
                        type="button"
                        disabled={isRulesLocked}
                        onClick={() => {
                          if (isRulesLocked) return;
                          soundEngine.playClick();
                          setTargetScore(pts);
                        }}
                        className={`py-2 px-3 rounded-xl font-black text-xs border transition ${
                          isRulesLocked
                            ? active
                              ? 'bg-amber-400/80 text-stone-950 border-white/70 opacity-85 cursor-not-allowed'
                              : 'bg-stone-900/50 text-stone-500 border-stone-800 opacity-50 cursor-not-allowed'
                            : active
                            ? 'bg-amber-400 text-stone-950 border-white shadow cursor-pointer'
                            : 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-stone-800 cursor-pointer'
                        }`}
                      >
                        {pts} pts
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 4 : AFFICHAGE & VOLUMES AUDIO */}
        <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              {audioSettings.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              Affichage & Volumes Sonores
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleFullscreen(!isFullscreen)}
                className="px-3 py-1 rounded-lg text-xs font-black bg-stone-800 hover:bg-stone-700 text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                <span>{isFullscreen ? 'Fenêtré' : 'Plein Écran'}</span>
              </button>
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
                {audioSettings.muted ? 'Son Coupé (Activer)' : 'Couper le son'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <span className="text-stone-300">Annonces, Contres & Fanfares</span>
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

export const StatsModal = ({ stats, onReset, onClose }) => {
  const winRate = stats.gamesPlayed > 0
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
    : 0;
  const contractRate = stats.contractsTaken > 0
    ? Math.round((stats.contractsMade / stats.contractsTaken) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-2xl w-full text-white shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 pb-4">
          <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Statistiques & Trophées du Joueur
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer">
            ✕
          </button>
        </div>

        {/* Cartes de statistiques principales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3.5 text-center">
            <div className="text-[10px] font-bold uppercase text-stone-400">Parties Gagnées</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {stats.gamesWon} <span className="text-xs text-stone-500">/ {stats.gamesPlayed}</span>
            </div>
            <div className="text-[11px] font-bold text-amber-300 mt-0.5">{winRate}% de victoire</div>
          </div>

          <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3.5 text-center">
            <div className="text-[10px] font-bold uppercase text-stone-400">Réussite Preneur</div>
            <div className="text-2xl font-black text-amber-400 mt-1">
              {stats.contractsMade} <span className="text-xs text-stone-500">/ {stats.contractsTaken}</span>
            </div>
            <div className="text-[11px] font-bold text-emerald-300 mt-0.5">{contractRate}% réussis</div>
          </div>

          <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3.5 text-center">
            <div className="text-[10px] font-bold uppercase text-stone-400">Capots & Coinches</div>
            <div className="text-2xl font-black text-white mt-1">
              {stats.capotsMade} <span className="text-xs text-amber-400">Capots</span>
            </div>
            <div className="text-[11px] font-bold text-rose-400 mt-0.5">{stats.coinchesWon} Contres gagnés</div>
          </div>

          <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3.5 text-center">
            <div className="text-[10px] font-bold uppercase text-stone-400">Fannys (1500 à 0)</div>
            <div className="text-2xl font-black text-pink-400 mt-1">
              🍑 {stats.fannysInflicted}
            </div>
            <div className="text-[11px] font-bold text-stone-400 mt-0.5">
              Subies : {stats.fannysSuffered} • Record : +{stats.bestRoundScore}
            </div>
          </div>
        </div>

        {/* Trophées / Succès */}
        <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4" /> Trophées Débloqués
            </span>
            <span className="text-stone-400">
              {ACHIEVEMENTS.filter((a) => a.check(stats)).length} / {ACHIEVEMENTS.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ACHIEVEMENTS.map((ach) => {
              const unlocked = ach.check(stats);
              return (
                <div
                  key={ach.id}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition ${
                    unlocked
                      ? 'bg-amber-500/10 border-amber-400/60 text-white'
                      : 'bg-stone-900/50 border-stone-800 text-stone-500 opacity-65'
                  }`}
                >
                  <div className="text-2xl shrink-0">{ach.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black flex items-center gap-1.5">
                      <span className="truncate">{ach.title}</span>
                      {unlocked && (
                        <span className="bg-amber-400 text-stone-950 text-[9px] px-1.5 py-0.5 rounded-full font-black">
                          Débloqué
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] opacity-80 leading-snug mt-0.5">{ach.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onReset();
            }}
            className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-rose-950 hover:text-rose-300 text-stone-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser mes stats
          </button>

          <button
            type="button"
            onClick={() => { soundEngine.playClick(); onClose(); }}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs shadow-lg cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export const RulesModal = ({ onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-2xl w-full text-white max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
        <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
          <Award className="w-6 h-6" /> Règles Officielles (Contrée & Coinche)
        </h3>
        <button onClick={onClose} className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer">✕</button>
      </div>

      <div className="space-y-4 text-xs sm:text-sm text-stone-300 leading-relaxed">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-stone-950 p-4 rounded-2xl border border-amber-500/30">
            <h4 className="font-black text-amber-400 mb-2 uppercase">À l'Atout & Tout Atout (TA)</h4>
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
            <h4 className="font-black text-emerald-400 mb-2 uppercase">Hors Atout & Sans Atout (SA)</h4>
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
          <p>• <strong>Distribution :</strong> Les 8 cartes sont distribuées (par paquets de 3 + 2 + 3) avant le début des enchères.</p>
          <p>• <strong>Enchères :</strong> De <strong>80 à 160</strong> points ou <strong>Capot (250 pts)</strong> pour les 8 plis. Le total des plis est ramené sur une base de <strong>162 points</strong> (152 pts + 10 de Der).</p>
          <p>• <strong>Belote & Rebelote (+20 pts) :</strong> Si un joueur possède le Roi et la Dame d'atout, son équipe gagne 20 points supplémentaires qui comptent pour aider à remplir le contrat.</p>
          <p>• <strong>Pose des cartes :</strong> Obligation de fournir à la couleur demandée. À l'atout (et en Tout Atout), obligation de monter. Si on n'a pas la couleur demandée en contrat couleur et que l'adversaire est maître, obligation de couper (et surcouper si possible).</p>
          <p>• <strong>La Fanny (🍑) :</strong> Si une équipe remporte la partie alors que l'équipe adverse est restée à <strong>0 point</strong>, les perdants sont « Fanny » !</p>
        </div>

        <div className="bg-stone-950 p-4 rounded-2xl border border-indigo-500/30 space-y-1.5">
          <h4 className="font-black text-indigo-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Variante Coinche (Tout Atout / Sans Atout & Annonces) :
          </h4>
          <p>• <strong>Tout Atout (TA) & Sans Atout (SA) :</strong> En TA, toutes les couleurs suivent l'ordre et l'obligation de monter à l'atout (sans coupe d'une couleur sur une autre). En SA, aucune couleur ne coupe. Les points sont ramenés proportionnellement sur 162 pts.</p>
          <p>• <strong>Combinaisons (Annonces) :</strong> <strong>Tierce</strong> (3 cartes qui se suivent = 20 pts), <strong>Cinquante</strong> (4 cartes = 50 pts), <strong>Cent</strong> (5 cartes = 100 pts), <strong>Carré</strong> (4 Valets = 200 pts, 4 Neufs = 150 pts, 4 As/10/Rois/Dames = 100 pts). L'équipe détenant la plus forte annonce valide toutes les combinaisons de son camp.</p>
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

export const DesktopExportModal = ({ onClose, onDownloadBat, onDownloadHtml }) => {
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
                onClick={() => onDownloadHtml()}
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
