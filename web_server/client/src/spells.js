// spells.js – mapping of gesture + voice command to spell identifiers
// Gesture codes from serial: '00' idle, '01' forward, '10' back, '11' jump
// Voice keywords are lower‑cased substrings detected in useVoice hook.

export const spellCombos = [
  {
    gesture: '01', // forward gesture
    voiceKeyword: 'fire',
    spellId: 'FIREBALL',
    description: 'Launch a fireball projectile',
  },
  {
    gesture: '10', // back gesture
    voiceKeyword: 'ice',
    spellId: 'ICE_SHARD',
    description: 'Throw an icy shard',
  },
  {
    gesture: '11', // jump/attack gesture
    voiceKeyword: 'heal',
    spellId: 'HEAL',
    description: 'Cast a healing aura',
  },
];

/**
 * Resolve a spell based on the current gesture signal and the last voice command.
 * @param {string} gestureSignal – two‑bit string from serial (e.g., '01')
 * @param {string} voiceCommand – full transcript lower‑cased
 * @returns {object|null} spell object or null if no match
 */
export function resolveSpell(gestureSignal, voiceCommand) {
  if (!gestureSignal || !voiceCommand) return null;
  const lower = voiceCommand.toLowerCase();
  for (const combo of spellCombos) {
    if (combo.gesture === gestureSignal && lower.includes(combo.voiceKeyword)) {
      return combo;
    }
  }
  return null;
}
