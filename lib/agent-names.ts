/**
 * Short, friendly 3–4 letter names assigned to each in-flight sub-agent so
 * the canvas and chat can say "Henk: Discover" instead of the generic
 * "Sub-agent is writing Discover". Makes concurrent parallel work feel like
 * a team of actual little workers rather than a faceless process.
 *
 * Assignment rules:
 * - Stable per `toolCallId` — calling `assignAgentName` twice with the same
 *   id returns the same name.
 * - Concurrent runs don't collide — while a name is "active" (between
 *   `assign` and `release`), future assigns prefer another name. If the
 *   pool exhausts, duplicates are allowed as a fallback.
 * - Past assignments persist so the chat tool card can look up the name
 *   for a completed tool call later in the session.
 */

const POOL = [
  // Dutch-leaning (nodding to the user's profile)
  "Henk",
  "Bram",
  "Pim",
  "Finn",
  "Thom",
  "Lars",
  "Luuk",
  "Kees",
  "Jan",
  "Rik",
  "Bart",
  "Stan",
  "Joep",
  "Ties",
  "Sem",
  "Piet",
  "Mees",
  "Koen",
  "Ruud",
  "Roel",
  // English-leaning
  "Bob",
  "Tim",
  "Tom",
  "Ben",
  "Max",
  "Sam",
  "Leo",
  "Roy",
  "Joe",
  "Pat",
  "Nate",
  "Otto",
  "Milo",
  "Axel",
  "Owen",
  "Ezra",
  // Mostly-feminine
  "May",
  "Jen",
  "Liv",
  "Mae",
  "Kate",
  "Mia",
  "Eli",
  "Luna",
  "Jade",
  "Nova",
  "Anya",
  "Ivy",
  "Iris",
  "Ada",
  "Eva",
  "Noa",
  "Lena",
  // Globally mixed
  "Rio",
  "Zoe",
  "Theo",
  "Kai",
  "Yuki",
  "Ren",
  "Sol",
  "Sage",
  "June",
  "Taro",
  "Nico",
  "Hugo",
  "Omar",
  "Ola",
  "Dev",
];

// Map of toolCallId → assigned name. Never cleared for the session, so the
// chat tool card can still label a completed delegate as "Henk: Discover"
// an hour later.
const assignedById = new Map<string, string>();
// Subset of POOL currently "in use" (between assign + release). Used to
// pick a non-colliding name for each new concurrent sub-agent.
const activeNames = new Set<string>();

function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Assign (or return the already-assigned) short name for this tool call.
 * Picks from the available pool — excluding names currently active on
 * other concurrent sub-agents — using a stable hash of the toolCallId so
 * the choice is deterministic per id.
 */
export function assignAgentName(toolCallId: string): string {
  const existing = assignedById.get(toolCallId);
  if (existing) {
    activeNames.add(existing);
    return existing;
  }
  const hash = stableHash(toolCallId);
  const available = POOL.filter((n) => !activeNames.has(n));
  const pool = available.length > 0 ? available : POOL;
  const picked = pool[hash % pool.length];
  assignedById.set(toolCallId, picked);
  activeNames.add(picked);
  return picked;
}

/**
 * Mark a name as no longer active. Future assignments will prefer it
 * again. The toolCallId→name mapping is preserved so stale tool cards
 * can still look their name up.
 */
export function releaseAgentName(toolCallId: string): void {
  const name = assignedById.get(toolCallId);
  if (!name) return;
  activeNames.delete(name);
}

/**
 * Look up the name assigned to a tool call, if any. Doesn't create one.
 */
export function getAgentName(toolCallId: string): string | undefined {
  return assignedById.get(toolCallId);
}
