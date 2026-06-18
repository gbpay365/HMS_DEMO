'use strict';

const DEFAULT_BY_GENDER = {
  Male: '👨‍⚕️',
  Female: '👩‍⚕️',
};

const PICKER_EMOJIS = [
  '👨‍⚕️',
  '👩‍⚕️',
  '👨',
  '👩',
  '👨‍💼',
  '👩‍💼',
  '🧑‍⚕️',
  '🧑',
  '👨‍🔬',
  '👩‍🔬',
  '👨‍🏫',
  '👩‍🏫',
];

function normalizeGender(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'female' || g === 'f') return 'Female';
  if (g === 'male' || g === 'm') return 'Male';
  return '';
}

function defaultProfileEmoji(gender) {
  const norm = normalizeGender(gender);
  if (norm === 'Female') return DEFAULT_BY_GENDER.Female;
  if (norm === 'Male') return DEFAULT_BY_GENDER.Male;
  return '🧑';
}

function resolveProfileEmoji(stored, gender) {
  const emoji = String(stored || '').trim();
  if (emoji) return emoji.slice(0, 32);
  return defaultProfileEmoji(gender);
}

module.exports = {
  DEFAULT_BY_GENDER,
  PICKER_EMOJIS,
  normalizeGender,
  defaultProfileEmoji,
  resolveProfileEmoji,
};
