import "./diag.js";
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, ScriptEventSource, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// Each party is one world property (party:p:<code>), so members who are offline stay in theirs and however many
// parties a big server collects, none gets near a property's size limit. Every member
// carries the tag `realm_party:<code>` while they're in a party: other packs share credit through it
// (same tag, same dimension, within 64 blocks), and this pack puts the tag right whenever a player
// joins and every 2 seconds, so a player kicked while offline loses it on their next visit.
//
// The stable Script API can't stop damage before it happens, so party mates can still hurt each other.

/** @typedef {{ l: string, m: [string, string][] }} Party leader id; members as [player id, gamertag when last seen], in joining order */

const PREFIX = "party:p:"; // world: one JSON Party per party, keyed by its code
const LEGACY = "party:data"; // world, older versions: JSON { <code>: Party } of every party (moved to PREFIX on load)
const TAG = "realm_party:";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const HUD_TICKS = 40;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DIMENSION_NAMES = /** @type {Record<string, string>} */ ({
  "minecraft:overworld": "the Overworld",
  "minecraft:nether": "the Nether",
  "minecraft:the_end": "the End",
});
const DISABLED = "Parties are disabled on this realm. An operator can enable them in /realm:config (Parties).";

const enabled = () => get("enabled") === true;

// ---------------------------------------------------------------------------
// Saved parties (cached: this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<string, Party> | undefined} */
let cache;
/** player id -> party code, rebuilt after every change. @type {Map<string, string> | undefined} */
let index;

/** @param {unknown} p @returns {Party | undefined} */
function parse(p) {
  const any = /** @type {any} */ (p);
  if (!any || typeof any.l !== "string" || !Array.isArray(any.m)) return undefined;
  /** @type {[string, string][]} */
  const members = any.m.filter((/** @type {any} */ m) => Array.isArray(m) && typeof m[0] === "string").map((/** @type {any[]} */ m) => [m[0], String(m[1] ?? "")]);
  if (!members.length) return undefined;
  return { l: members.some((m) => m[0] === any.l) ? any.l : members[0][0], m: members };
}

/** @returns {Map<string, Party>} code -> party */
function parties() {
  if (cache) return cache;
  /** @type {Map<string, Party>} */
  const map = new Map();
  let ids;
  try {
    ids = world.getDynamicPropertyIds();
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  for (const key of ids) {
    if (!key.startsWith(PREFIX)) continue;
    try {
      const raw = world.getDynamicProperty(key);
      const p = parse(typeof raw === "string" ? JSON.parse(raw) : undefined);
      if (p) map.set(key.slice(PREFIX.length), p);
    } catch {
      console.warn(`[party] ${key} is corrupt; that party is gone`);
    }
  }
  // Worlds from older versions kept every party in one property: move each to its own, then drop the old one.
  try {
    const raw = world.getDynamicProperty(LEGACY);
    if (typeof raw === "string") {
      for (const [code, p] of Object.entries(JSON.parse(raw) ?? {})) {
        const party = parse(p);
        if (!party || map.has(code)) continue;
        map.set(code, party);
        world.setDynamicProperty(PREFIX + code, JSON.stringify(party));
      }
      world.setDynamicProperty(LEGACY, undefined);
    }
  } catch (e) {
    console.warn(`[party] ${LEGACY}: ${e}`);
  }
  index = undefined;
  return (cache = map);
}

/** Writes one party (or removes it once it's gone), without telling anyone. @param {string} code */
function write(code) {
  index = undefined;
  const p = parties().get(code);
  try {
    world.setDynamicProperty(PREFIX + code, p ? JSON.stringify(p) : undefined);
  } catch (e) {
    console.warn(`[party] save ${code}: ${e}`);
  }
}

/** Saves a party and tells other packs it changed. @param {string} code */
function save(code) {
  write(code);
  system.sendScriptEvent("realm:party_changed", JSON.stringify({ code }));
  sendMembers(code);
}

// Other packs that need the whole party, offline members included (Land Claims, Realm Mail), hear its member list:
//   realm:party_members      { code, l, m: [[player id, gamertag], ...] }  after every change (m empty: the party is gone)
//   realm:party_members_ping {}                                          → realm:party_members for every party
// One message per party (at most 12 members, well under 2048 characters). Also sent for every party once the world loads
// (spread over a few ticks).
/** @param {string} code */
function sendMembers(code) {
  const p = parties().get(code);
  const msg = { code, l: p?.l ?? "", m: (p?.m ?? []).map(([id, name]) => [id, name.slice(0, 32)]) };
  system.sendScriptEvent("realm:party_members", JSON.stringify(msg));
}
/** Every party's list, spread over ticks by the game's job budget (a world with many parties isn't sent in one tick). */
function sendAllMembers() {
  const codes = [...parties().keys()];
  system.runJob(
    (function* () {
      for (const code of codes) {
        try {
          sendMembers(code);
        } catch (e) {
          console.warn(`[party] members: ${e}`);
        }
        yield;
      }
    })()
  );
}
system.runTimeout(() => {
  try {
    sendAllMembers();
  } catch (e) {
    console.warn(`[party] members: ${e}`);
  }
}, 40);

/** The code of the player's party, or undefined. @param {string} id */
function partyOf(id) {
  const all = parties();
  if (!index) {
    index = new Map();
    for (const [code, p] of all) for (const [member] of p.m) index.set(member, code);
  }
  return index.get(id);
}

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!parties().has(code)) return code;
  }
}

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** Gives the player their party's tag, and takes away any other party tag. @param {Player} player */
function syncTag(player) {
  try {
    const code = partyOf(player.id);
    const want = code ? TAG + code : undefined;
    for (const t of player.getTags()) if (t.startsWith(TAG) && t !== want) player.removeTag(t);
    if (want && !player.hasTag(want)) player.addTag(want);
  } catch (e) {
    console.warn(`[party] tag: ${e}`);
  }
}

/** Tells every online member. @param {string} code @param {string} text */
function tell(code, text) {
  const p = parties().get(code);
  if (!p) return;
  for (const [id] of p.m) online(id)?.sendMessage(text);
}

// ---------------------------------------------------------------------------
// Joining and leaving
// ---------------------------------------------------------------------------

/** @param {Player} player @returns {string} the new party's code */
function create(player) {
  const code = newCode();
  parties().set(code, { l: player.id, m: [[player.id, player.name]] });
  save(code);
  syncTag(player);
  return code;
}

/** @param {Player} player @param {string} code */
function join(player, code) {
  const p = parties().get(code);
  if (!p) return;
  tell(code, `§d[Party] ${player.name} joined the party.`);
  p.m.push([player.id, player.name]);
  save(code);
  syncTag(player);
}

/**
 * Takes a member out of their party: the next member (online first) leads when the leader goes, and
 * a party with nobody left is gone. `why` is told to the rest.
 * @param {string} id @param {string} why
 */
function remove(id, why) {
  const code = partyOf(id);
  if (!code) return;
  const p = /** @type {Party} */ (parties().get(code));
  p.m = p.m.filter((m) => m[0] !== id);
  if (!p.m.length) parties().delete(code);
  else if (p.l === id) {
    const next = p.m.find((m) => online(m[0])) ?? p.m[0];
    p.l = next[0];
    why += ` ${next[1]} leads the party now.`;
  }
  save(code);
  const gone = online(id);
  if (gone) syncTag(gone);
  if (p.m.length) tell(code, `§d[Party] ${why}`);
}

/** Pending invites: invitee id -> the party, who invited, and until when (tick). @type {Map<string, { code: string, from: string, until: number }>} */
const invites = new Map();

/** The player's invite if it's still good. @param {Player} player */
function inviteFor(player) {
  const inv = invites.get(player.id);
  if (!inv) return undefined;
  if (system.currentTick > inv.until || !parties().has(inv.code)) {
    invites.delete(player.id);
    return undefined;
  }
  return inv;
}

/** @param {Player} from @param {Player} target */
function invite(from, target) {
  if (target.id === from.id) return from.sendMessage("§cYou can't invite yourself.");
  let code = partyOf(from.id);
  if (code && code === partyOf(target.id)) return from.sendMessage(`§c${target.name} is already in your party.`);
  if (partyOf(target.id)) return from.sendMessage(`§c${target.name} is already in a party. They can leave it with /realm:party_leave.`);
  if (code && (parties().get(code)?.m.length ?? 0) >= get("maxSize")) return from.sendMessage(`§cYour party is full (${get("maxSize")} players).`);
  if (!code) {
    code = create(from);
    from.sendMessage("§dYou started a party.");
  }
  invites.set(target.id, { code, from: from.name, until: system.currentTick + get("inviteSeconds") * 20 });
  from.sendMessage(`§dInvited ${target.name}. §7The invite lasts ${get("inviteSeconds")} seconds.`);
  target.sendMessage(`§d[Party] ${from.name} invited you to their party. §7Accept with /realm:party_accept or in /realm:party`);
  target.playSound("random.orb", { pitch: 1.4, volume: 0.6 });
}

/** @param {Player} player */
function accept(player) {
  const inv = inviteFor(player);
  if (!inv) return player.sendMessage("§cYou have no party invite (they last " + get("inviteSeconds") + " seconds).");
  if (partyOf(player.id)) return player.sendMessage("§cLeave your party first: /realm:party_leave");
  const p = parties().get(inv.code);
  if (!p) return player.sendMessage("§cThat party is gone.");
  if (p.m.length >= get("maxSize")) return player.sendMessage(`§cThat party is full (${get("maxSize")} players).`);
  invites.delete(player.id);
  join(player, inv.code);
  player.sendMessage(`§dYou joined the party. §7Talk to it with /realm:party_chat "message", see it with /realm:party`);
}

/** @param {Player} player */
function leave(player) {
  if (!partyOf(player.id)) return player.sendMessage("§cYou're not in a party.");
  remove(player.id, `${player.name} left the party.`);
  player.sendMessage("§dYou left the party.");
}

/** Tick each player last sent a party chat message: one a second at most. @type {Map<string, number>} */
const lastChat = new Map();

/** @param {Player} player @param {string} text */
function chat(player, text) {
  const code = partyOf(player.id);
  if (!code) return player.sendMessage("§cYou're not in a party. Start one with /realm:party");
  const msg = text.replace(/§/g, "").trim().slice(0, get("chatMaxLength"));
  if (!msg) return player.sendMessage('§cType a message: /realm:party_chat "see you there"');
  const now = system.currentTick;
  if (now - (lastChat.get(player.id) ?? -Infinity) < 20) return player.sendMessage("§7Slow down: one party message a second.");
  lastChat.set(player.id, now);
  tell(code, `§d[Party] ${player.name}: §f${msg}`);
}

// ---------------------------------------------------------------------------
// Where mates are
// ---------------------------------------------------------------------------

/** @param {Player} p */
function health(p) {
  try {
    return Math.ceil(p.getComponent("minecraft:health")?.currentValue ?? 0);
  } catch {
    return 0;
  }
}

/** "40m NE" from one player to another in the same dimension. @param {Player} from @param {Player} to */
function where(from, to) {
  const a = from.location;
  const b = to.location;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.round(Math.hypot(dx, b.y - a.y, dz));
  // North is -z, east is +x.
  const angle = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const dir = COMPASS[(Math.round(angle / 45) + 8) % 8];
  return { dist, text: dist < 2 ? `${dist}m` : `${dist}m ${dir}` };
}

/** How a member is doing, as seen by `viewer`. @param {Player} viewer @param {string} id */
function status(viewer, id) {
  if (id === viewer.id) return `§7you, ${health(viewer)}hp`;
  const p = online(id);
  if (!p) return "§8offline";
  if (p.dimension.id !== viewer.dimension.id) return `§7${health(p)}hp, in ${DIMENSION_NAMES[p.dimension.id] ?? p.dimension.id}`;
  return `§c${health(p)}hp §f${where(viewer, p).text}`;
}

/** player id -> tick until which another pack's note (`realm:actionbar`) holds the bar. */
const barHeld = new Map();
/** Players who see the Coordinates HUD (its realm:hud_state), and when it last said so: their party line goes under it. */
let hudPlayers = new Set();
let hudHeard = -Infinity;
/** The Coordinates HUD repeats its state every 5 seconds: after 10 without one, it's gone. */
const HUD_STALE_TICKS = 200;

// Other packs' notes and steady lines (an expedition's run line, the Elytra HUD) hold the bar: the
// party line waits, so the two don't take turns.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:actionbar" && id !== "realm:hud_state") return;
    try {
      const m = JSON.parse(message);
      if (id === "realm:hud_state") {
        if (m && Array.isArray(m.players)) {
          hudPlayers = new Set(m.players.map(String));
          hudHeard = system.currentTick;
        }
        return;
      }
      if (!m || typeof m.player !== "string" || m.from === "party_bp") return;
      // The longest hold wins: a short request doesn't cut a long note short.
      const until = system.currentTick + Math.min(200, Math.max(0, Number(m.ticks) || 0));
      barHeld.set(m.player, Math.max(barHeld.get(m.player) ?? 0, until));
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);

// The HUD, every 2 seconds: mates within hudRange, nearest first. Nothing is written when nobody is
// near, so the HUD doesn't cover other notes for nothing. Tags are put right at the same time.
system.runInterval(() => {
  const players = world.getAllPlayers();
  for (const player of players) syncTag(player);
  if (!enabled() || !parties().size) return;
  for (const player of players) {
    try {
      const code = partyOf(player.id);
      if (!code || getFor(player, "partyHud") !== true) continue;
      const p = parties().get(code);
      if (!p || p.m.length < 2) continue;
      const near = [];
      for (const [id] of p.m) {
        if (id === player.id) continue;
        const mate = players.find((x) => x.id === id);
        if (!mate || mate.dimension.id !== player.dimension.id) continue;
        const w = where(player, mate);
        if (w.dist <= get("hudRange")) near.push({ mate, w });
      }
      if (!near.length) continue;
      near.sort((a, b) => a.w.dist - b.w.dist);
      const text = near
        .slice(0, Math.max(1, get("hudMates")))
        .map(({ mate, w }) => `§d${mate.name} §c${health(mate)}hp §f${w.text}`)
        .join(" §7| ");
      // The Coordinates HUD is on for this player: the party line goes under it (realm:hud_line), as Stats' does,
      // so the two don't fight over the bar (it waits for notes itself).
      if (hudPlayers.has(player.id) && system.currentTick - hudHeard < HUD_STALE_TICKS) {
        system.sendScriptEvent("realm:hud_line", JSON.stringify({ player: player.id, key: "party", text, ticks: HUD_TICKS + 20 }));
        continue;
      }
      if ((barHeld.get(player.id) ?? 0) > system.currentTick) continue;
      // Ask the Coordinates HUD, if installed, to step aside until the next update. `background`: a steady
      // line, so other packs' steady lines (an expedition's) needn't wait for it.
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: HUD_TICKS + 10, from: "party_bp", background: true }));
      player.onScreenDisplay.setActionBar(text);
    } catch (e) {
      console.warn(`[party] hud: ${e}`);
    }
  }
}, HUD_TICKS);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    syncTag(player);
    const code = partyOf(player.id);
    const p = code ? parties().get(code) : undefined;
    const me = p?.m.find((m) => m[0] === player.id);
    if (code && me && me[1] !== player.name) {
      me[1] = player.name; // keep the saved gamertag current for offline lists
      write(code);
      sendMembers(code);
    }
  } catch (e) {
    console.warn(`[party] ${e}`);
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  lastChat.delete(playerId);
  invites.delete(playerId);
  barHeld.delete(playerId);
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** @param {Player} player */
async function mainMenu(player) {
  if (!enabled()) return player.sendMessage(`§c${DISABLED}`);
  const code = partyOf(player.id);
  const p = code ? parties().get(code) : undefined;
  const inv = inviteFor(player);
  if (!code || !p) {
    const form = new ActionFormData().title("§lParty").body(
      [
        "You're not in a party.",
        "Party mates see each other's health, distance and direction above the hotbar, can chat with the party only, and share credit in packs that offer it.",
        inv ? `\n§d${inv.from} invited you to their party.` : "",
      ].join("\n")
    );
    /** @type {(() => Promise<void> | void)[]} */
    const actions = [];
    if (inv) {
      form.button(`Accept ${inv.from}'s invite`);
      actions.push(() => accept(player));
    }
    form.button("Start a party\n§8Then invite players");
    actions.push(async () => {
      if (partyOf(player.id)) return;
      create(player);
      player.sendMessage("§dYou started a party. §7Invite players from /realm:party");
      await inviteMenu(player);
    });
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    await actions[res.selection]?.();
    return;
  }

  const lines = [`Party §d${code}§r: ${p.m.length} of ${get("maxSize")} players.`, ""];
  for (const [id, name] of p.m) lines.push(`§e${name}${id === p.l ? " §6(leader)" : ""} ${status(player, id)}`);
  const leader = p.l === player.id;
  const form = new ActionFormData().title("§lParty").body(lines.join("\n"));
  /** @type {(() => Promise<void> | void)[]} */
  const actions = [];
  if (p.m.length < get("maxSize")) {
    form.button("Invite players");
    actions.push(() => inviteMenu(player));
  }
  form.button("Send a message\n§8To the party only");
  actions.push(() => chatMenu(player));
  if (leader && p.m.length > 1) {
    form.button("Remove a member\n§8Leader only");
    actions.push(() => kickMenu(player));
  }
  form.button("Leave the party");
  actions.push(() => leave(player));
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.();
}

/** Online players to invite, nearest first. @param {Player} player */
async function inviteMenu(player) {
  const code = partyOf(player.id);
  const others = world
    .getAllPlayers()
    .filter((p) => p.id !== player.id && (!code || partyOf(p.id) !== code))
    .map((p) => ({ p, same: p.dimension.id === player.dimension.id, dist: p.dimension.id === player.dimension.id ? where(player, p).dist : Infinity }))
    .sort((a, b) => a.dist - b.dist || a.p.name.localeCompare(b.p.name));
  if (!others.length) return player.sendMessage("§7Nobody else is online to invite.");
  const labels = others.map(({ p, same, dist }) => {
    const busy = partyOf(p.id) ? ", in a party" : "";
    return same ? `${p.name} (${dist}m${busy})` : `${p.name} (${DIMENSION_NAMES[p.dimension.id] ?? "elsewhere"}${busy})`;
  });
  const form = new ModalFormData().title("§lInvite to party").dropdown("Player", labels, { defaultValueIndex: 0 }).submitButton("Invite");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const index = res.formValues.find((v) => typeof v === "number");
  const target = others[typeof index === "number" ? index : -1]?.p;
  if (!target?.isValid) return player.sendMessage("§cThat player left.");
  invite(player, target);
}

/** @param {Player} player */
async function chatMenu(player) {
  const form = new ModalFormData().title("§lParty message").textField("Message (party only)", "Meet at the portal").submitButton("Send");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const text = res.formValues.find((v) => typeof v === "string");
  if (typeof text === "string") chat(player, text);
}

/** @param {Player} player */
async function kickMenu(player) {
  const code = partyOf(player.id);
  const p = code ? parties().get(code) : undefined;
  if (!code || !p || p.l !== player.id) return;
  const members = p.m.filter((m) => m[0] !== player.id);
  if (!members.length) return;
  const form = new ActionFormData().title("§lRemove a member").body("Tap a member to remove them from the party. They can be invited again.");
  for (const [id, name] of members) form.button(`${name}\n§8${online(id) ? "online" : "offline"}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const picked = members[res.selection];
  if (!picked) return mainMenu(player);
  if (partyOf(picked[0]) !== code || parties().get(code)?.l !== player.id) return;
  remove(picked[0], `${player.name} removed ${picked[1]} from the party.`);
  online(picked[0])?.sendMessage(`§d${player.name} removed you from the party.`);
  player.sendMessage(`§dRemoved ${picked[1]}.`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** "Steve" -> the online player with that gamertag or name tag, or the only one whose name starts with it. @param {string} name */
function findPlayer(name) {
  const want = name.trim().toLowerCase();
  if (!want) return undefined;
  const players = world.getAllPlayers();
  const names = (/** @type {Player} */ p) => [p.name.toLowerCase(), (p.nameTag.split("\n")[0] ?? "").replace(/§./g, "").trim().toLowerCase()];
  const exact = players.find((p) => names(p).includes(want));
  if (exact) return exact;
  const starts = players.filter((p) => names(p).some((n) => n.startsWith(want)));
  return starts.length === 1 ? starts[0] : undefined;
}

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/**
 * A command's callback: checks the caller, then does the work a tick later (commands run in a
 * read-only context).
 * @param {string} name @param {(player: Player, ...args: any[]) => unknown} run
 * @returns {(origin: import("@minecraft/server").CustomCommandOrigin, ...args: any[]) => import("@minecraft/server").CustomCommandResult}
 */
function handler(name, run) {
  return (origin, ...args) => {
    const player = playerOf(origin);
    if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
    if (!enabled()) return { status: CustomCommandStatus.Failure, message: DISABLED };
    system.run(async () => {
      try {
        await run(player, ...args);
      } catch (e) {
        console.warn(`[party] ${name}: ${e}`);
      }
    });
    return { status: CustomCommandStatus.Success };
  };
}

/** @param {Player} player @param {string} name */
function inviteByName(player, name) {
  const target = findPlayer(String(name ?? ""));
  if (!target) return player.sendMessage(`§cNo online player called "${String(name ?? "").replace(/§/g, "")}". Put names with spaces in quotes.`);
  invite(player, target);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry: r }) => {
  const any = { permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false };
  r.registerCommand(
    { name: "realm:party", description: "Parties: your party, its members and where they are; invite, accept, chat, leave", ...any },
    handler("party", (p) => mainMenu(p))
  );
  r.registerCommand(
    { name: "realm:party_invite", description: "Invite a player to your party (starts one if you have none)", ...any, mandatoryParameters: [{ name: "player", type: CustomCommandParamType.String }] },
    handler("party_invite", (p, /** @type {string} */ name) => inviteByName(p, name))
  );
  r.registerCommand({ name: "realm:party_accept", description: "Join the party you were invited to", ...any }, handler("party_accept", (p) => accept(p)));
  r.registerCommand({ name: "realm:party_leave", description: "Leave your party", ...any }, handler("party_leave", (p) => leave(p)));
  r.registerCommand(
    { name: "realm:party_chat", description: 'Send a message to your party only (in quotes: "see you there")', ...any, mandatoryParameters: [{ name: "message", type: CustomCommandParamType.String }] },
    handler("party_chat", (p, /** @type {string} */ text) => chat(p, String(text ?? "")))
  );
});

// Scenario tests (BDS harness), only from the server console: `fill` the world with that many parties of two offline
// players (a big server after a few months), save one party (`legacy`: its code) the way older versions did (read
// after the next restart), or `report` in chat how many parties there are and whether that code is one.
// /scriptevent realm:party_test {"fill":400}
system.afterEvents.scriptEventReceive.subscribe(
  (ev) => {
    if (ev.id !== "realm:party_test" || ev.sourceType !== ScriptEventSource.Server) return;
    try {
      const m = JSON.parse(ev.message);
      if (typeof m?.legacy === "string") {
        world.setDynamicProperty(LEGACY, JSON.stringify({ [m.legacy]: { l: "-4294960000", m: [["-4294960000", "OldLeader"], ["-4294960001", "OldFriend"]] } }));
        return;
      }
      if (typeof m?.report === "string") {
        const p = parties().get(m.report);
        world.sendMessage(`party_test: ${parties().size} parties; ${m.report} ${p ? `has ${p.m.map((x) => x[1]).join(", ")}` : "is missing"}`);
        return;
      }
      const n = Math.max(0, Math.min(2000, Math.floor(Number(m?.fill) || 0)));
      for (let i = 0; i < n; i++) {
        const a = `-${4294967000 - 2 * i}`;
        const code = newCode();
        parties().set(code, { l: a, m: [[a, `OfflinePlayer${i}a`], [`-${4294966999 - 2 * i}`, `OfflinePlayer${i}b`]] });
        write(code);
      }
    } catch (e) {
      console.warn(`[party] test: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "party_bp");
    else if (id === "realm:party_members_ping") {
      try {
        sendAllMembers();
      } catch (e) {
        console.warn(`[party] members: ${e}`);
      }
    }
  },
  { namespaces: ["realm"] }
);
