/** @typedef {'observe'|'collect'|'use'|'speak'|'reach'|'hit'|'distract'|'sneak'} InteractionVerb */
/** Client intentions only; completion, rewards and physics events come from the server. */
export const PROTOCOL_VERSION = 4;
/** @param {string} target @param {InteractionVerb} verb @param {string} text */
export function interaction(target, verb, text = '') {
  return { type: 'interact', target, verb, text: text.slice(0, 600) };
}
