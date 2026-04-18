/**
 * EVE Online themed name generator for share links.
 * Hard limit: 100 adjectives × 100 ships = 10,000 unique combinations.
 * Pattern: {adjective}-{ship} e.g. "nebula-drake", "void-hurricane"
 */

// 100 adjectives (cosmic + combat + general)
const ADJECTIVES = [
  "astral", "binary", "celestial", "eclipsed", "flux",
  "galactic", "hyperspace", "interstellar", "jovian", "lunar",
  "nebula", "nova", "orbital", "pulsar", "quasar",
  "radiant", "solar", "stellar", "supernova", "tidal",
  "umbral", "void", "warp", "zenith", "crimson",
  "dark", "burning", "phantom", "ancient", "silent",
  "frozen", "shattered", "drifting", "fallen", "hidden",
  "iron", "obsidian", "scarlet", "spectral", "volatile",
  "armored", "charged", "elite", "flanking", "fortified",
  "primed", "ruthless", "savage", "tactical", "vanguard",
  "blazing", "bold", "brave", "bright", "cold",
  "dawn", "dusk", "ember", "fading", "golden",
  "hollow", "inner", "jagged", "keen", "last",
  "muted", "nether", "outer", "pale", "quiet",
  "rising", "shadow", "torn", "under", "veiled",
  "wicked", "ashen", "bitter", "covert", "dire",
  "errant", "feral", "grim", "hallowed", "ionic",
  "kinetic", "lethal", "molten", "null", "omega",
  "polar", "rogue", "stark", "thermal", "ultra",
  "vast", "wraith", "exiled", "haunted", "primal",
]

// 100 EVE Online ships
const SHIPS = [
  "abaddon", "absolution", "algos", "apocalypse", "arazu",
  "archon", "armageddon", "astero", "atron", "bantam",
  "barghest", "basilisk", "bellicose", "bifrost", "blackbird",
  "broadsword", "brutix", "caracal", "catalyst", "cerberus",
  "chimera", "claymore", "condor", "confessor", "corax",
  "cormorant", "crane", "crow", "crucifier", "cyclone",
  "damnation", "deimos", "devoter", "dominix", "drake",
  "dramiel", "eagle", "erebus", "ferox", "flycatcher",
  "gnosis", "golem", "gila", "harbinger", "harpy",
  "hawk", "hecate", "hel", "heron", "hookbill",
  "huginn", "hurricane", "hyperion", "incursus", "ishtar",
  "jackdaw", "jaguar", "kestrel", "kikimora", "kronos",
  "lachesis", "legion", "loki", "machariel", "maelstrom",
  "magnate", "manticore", "megathron", "merlin", "moa",
  "moros", "muninn", "myrmidon", "naga", "naglfar",
  "nemesis", "nidhoggur", "nightmare", "nyx", "omen",
  "oneiros", "oracle", "osprey", "paladin", "phantasm",
  "prophecy", "rattlesnake", "raven", "retribution", "rifter",
  "rokh", "sacrilege", "scorpion", "sleipnir", "stiletto",
  "stratios", "svipul", "tempest", "thanatos", "thorax",
]

export const MAX_COMBINATIONS = ADJECTIVES.length * SHIPS.length // 10,000

/**
 * Generate an EVE-themed name like "nebula-drake"
 * Uses crypto.getRandomValues for Workers-compatible randomness.
 */
export function generateName(): string {
  const bytes = new Uint32Array(2)
  crypto.getRandomValues(bytes)
  const adj = ADJECTIVES[bytes[0] % ADJECTIVES.length]
  const ship = SHIPS[bytes[1] % SHIPS.length]
  return `${adj}-${ship}`
}
