/**
 * ELO tier definitions and helpers for the beer backing (staking) system.
 */

const STARTING_ELO = 0;
const YG_ELO_CAP = 1500;
const LEGEND_THRESHOLD = 1600;

const ELO_TIERS = [
  { name: 'Unranked',      min: 0,    max: 999  },
  { name: 'Local Pick',    min: 1000, max: 1199 },
  { name: 'Regional Gem',  min: 1200, max: 1399 },
  { name: 'Craft Classic', min: 1400, max: 1599 },
  { name: 'Legend',         min: 1600, max: Infinity },
];

function getTier(eloScore) {
  const score = Number(eloScore) || 0;
  for (const tier of ELO_TIERS) {
    if (score >= tier.min && score <= tier.max) return tier;
  }
  return ELO_TIERS[0];
}

function getTierName(eloScore) {
  return getTier(eloScore).name;
}

function hasRisen(previousElo, currentElo) {
  const oldTier = getTier(previousElo);
  const newTier = getTier(currentElo);
  return ELO_TIERS.indexOf(newTier) > ELO_TIERS.indexOf(oldTier);
}

function hasFallen(previousElo, currentElo) {
  const oldTier = getTier(previousElo);
  const newTier = getTier(currentElo);
  return ELO_TIERS.indexOf(newTier) < ELO_TIERS.indexOf(oldTier);
}

module.exports = { ELO_TIERS, STARTING_ELO, YG_ELO_CAP, LEGEND_THRESHOLD, getTier, getTierName, hasRisen, hasFallen };
