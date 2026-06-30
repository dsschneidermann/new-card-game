/**
 * Spells (Core Gaps: spell effects). The spell-resolution system that lands a cast spell's mechanical effect
 * (SpellDef.effect) — area damage, self heal, enemy teleport — reacting to the turn engine's SpellCast event.
 * A separate module so the cards/deck module keeps its no-import-of-combat seam; pure core (ADR-002).
 */
export { makeSpellSystem } from './system';
