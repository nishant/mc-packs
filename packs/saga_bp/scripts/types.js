// Types for Story Questlines content (JSDoc, checked by tsc). Story files import them with
// `@typedef {import("../types.js").Story} Story`. See docs/STORY_BIBLE.md section 9 for the meaning
// of every field. Keep this file free of code: it is shared by the engine and every story file.

/**
 * Flag conditions: every key must match. Keys: a story's own flag, `g:<name>` (player-wide),
 * `<storyId>.<flag>` (another story's) or `pack:<folder>` (`"on"` while that pack is installed: it
 * answered the `realm:help_ping` scan; `"off"` otherwise). Set by other packs: `g:aff_<npc>` (Townsfolk
 * affinity level, 0 Stranger to 4 Confidant, saved), `g:calling_ready` ("1") and `g:calling` (the Calling id or
 * "none"; Skills' realm:calling, saved) and the live `cal:day`, `cal:season`, `cal:festival`. Values: an exact value, `"!x"` (anything
 * but x) or `">=n"` (a number at least n, for counters such as `g:mercy`).
 * @typedef {Record<string, string>} When
 */

/**
 * A page of a dialogue. A string always shows; `{ text, when }` shows only when `when` matches.
 * @typedef {string | { text: string, when: When }} Page
 */

/** @typedef {"miners" | "growers" | "wardens" | "wayfarers"} Guild */

/**
 * Reputation sent to the Guilds pack (`realm:rep_add`).
 * @typedef {{ guild: Guild, amount: number, when?: When }} Rep
 */

/**
 * What must hold before a story, chapter or choice is offered. All given parts must hold.
 * @typedef {object} Requires
 * @property {string[]} [stories] stories finished
 * @property {string[]} [chapters] chapters finished, as "story/chapter"
 * @property {When} [flags]
 * @property {Partial<Record<Guild, number>>} [rep] at least this much reputation
 * @property {Record<string, number>} [minCount] counters at least this high (`{ "g:mercy": 3 }`)
 */

/** @typedef {{ dim?: string, x: number, z: number }} At */
/** A chapter's camp: Wanderers of the Wilds. `near`: "wanderer" (where the player met them) or a place name. @typedef {{ prefab: "camp_road" | "camp_peak" | "camp_deep" | "camp_ruin", near: string }} Camp */
/** @typedef {{ x: number, z: number }} Offset */

/**
 * Where something is: a named place, fixed coordinates or an offset: from the town in the town stories (TOWN_STORIES in places.js), else from world spawn.
 * @typedef {object} Where
 * @property {string} [place]
 * @property {At} [at]
 * @property {Offset} [offset]
 * @property {string} [mark] the tracker's name for an at/offset spot
 * @property {number} [radius]
 */

/**
 * A story character the engine spawns for a scene (not a townsfolk). A `minecraft:villager_v2` spawns as a
 * village's newcomer (no job, the biome's clothes); `look` is the vanilla event that dresses them for a job
 * (`minecraft:become_cleric`). `invul`: an escorted character who can't be hurt (and so never runs back).
 * @typedef {{ id: string, name: string, entity: string, look?: string, invul?: boolean }} Who
 */

/** @typedef {{ mobs: string[], count: number }} MobGroup */

/**
 * A champion for a `defeat` objective. `tag` must start with `realm:` (`realm:saga:bell_warden`).
 * @typedef {object} Champion
 * @property {string} tag
 * @property {string} mob
 * @property {string} name
 * @property {string} [trait]
 * @property {string} [warn] chat line when it appears
 * @property {number} [health] extra health
 * @property {MobGroup} [adds] minions that join at half health
 */

/**
 * One scene of a `vision` cutscene.
 * @typedef {{ title?: string, text: string, sound?: string, seconds?: number }} Scene
 */

/**
 * One clue of an `inspect` objective: offset from the place, and what reading it says.
 * @typedef {{ dx: number, dy?: number, dz: number, text: Page }} Clue
 */

/**
 * Sky event kinds an `event` objective counts (`realm:sky_event`, from the world-event packs).
 * @typedef {"meteor" | "blood_moon" | "harvest_moon" | "rainbow" | "storm_cell" | "tornado" | "aurora"} SkyKind
 */

/**
 * A finished quest from another pack (`realm:quest_done`) that counts for an `event` objective.
 * @typedef {object} QuestMatch
 * @property {string} pack the pack folder that sends it (`"expedition_bp"`)
 * @property {string} [id] the quest id, exact or ending in `*` for a prefix (`"expedition_crypt"`, `"expedition_*"`)
 * @property {number} [minLevel] Expeditions: at least this level
 * @property {"easy" | "normal" | "hard" | "nightmare"} [tier] Expeditions: this tier or a harder one
 * @property {boolean} [gauntlet] Expeditions: true = a gauntlet run only, false = never a gauntlet run
 */

/**
 * Something the story asks a world-event pack for (`realm:sky_request`). The pack decides whether to
 * honor it (its own switches and rate limits). x and z: the place's, else the player's.
 * @typedef {object} SkyRequest
 * @property {"meteor" | "blood_moon" | "harvest_moon" | "thunder" | "rain" | "shooting_star" | "rainbow"} kind
 * @property {string} [place]
 * @property {boolean} [burst] meteor: it breaks apart in the sky and breaks no blocks
 * @property {number} [minutes] thunder/rain: how long
 * @property {number} [within] thunder/rain: starts within this many real minutes
 * @property {"start" | "done"} [on] objective requests: when it starts counting (default) or when it is done
 */

/**
 * One thing to do in a chapter. See docs/STORY_BIBLE.md section 9 for each type's fields.
 * @typedef {object} Objective
 * @property {"talk" | "reach" | "deliver" | "collect" | "defeat" | "interact" | "survive" | "vigil" | "mine" | "fish" | "meet" | "inspect" | "stealth" | "escort" | "lead" | "defend" | "follow" | "answer" | "place" | "tend" | "tame" | "ride" | "sleep" | "vision" | "wear" | "use" | "wait" | "event"} type
 * @property {string} label
 * @property {boolean} [optional] doesn't count toward finishing the chapter; done before the turn-in, it gives `bonus` and sets `set`
 * @property {Reward} [bonus] optional: the reward when it is done
 * @property {Record<string, string>} [set] flags set when it is done (`g:` for player-wide), like a choice's
 * @property {string} [or] required objectives with the same id form an "either" group: one of them is enough
 * @property {SkyRequest} [sky] asked for when it starts counting (or, with `on: "done"`, when it is done)
 * @property {When} [when] the objective only exists when this matches
 * @property {string} [hint] overrides the chapter's hint for this step
 * @property {boolean} [secret] no tracker arrow until a hint is bought
 * @property {string} [npc]
 * @property {string} [item]
 * @property {string} [name] a custom item name (quest items, dishes)
 * @property {number} [count]
 * @property {number} [seconds]
 * @property {string} [place]
 * @property {At} [at]
 * @property {Offset} [offset]
 * @property {string} [mark]
 * @property {number} [radius]
 * @property {string} [dim] reach: a dimension id
 * @property {number} [belowY] reach: below this height
 * @property {number} [aboveY] reach: above this height
 * @property {string[]} [mobs]
 * @property {boolean} [night] defeat: only at night
 * @property {number} [within] seconds to finish once started, or progress resets (timed)
 * @property {Champion} [champion]
 * @property {{ count?: number, every?: number, mobs?: string[], warn?: string }} [spawn] defeat at a place: its mobs come there
 *   while the player is in the area, `count` (default 3) alive at a time, topped up every `every` (default 20)
 *   seconds; `mobs` (default the objective's) and a chat line `warn` when the first come
 * @property {boolean} [bounty] defeat: a Bounty Board champion target (any of the day's; nothing is spawned)
 * @property {number} [race] a race against a rival: defeat with `bounty` (a target within `radius`, default 300, of
 *   the player starts it) or event with `quest: { pack: "maps_bp" }` (the player's own last map leg within `radius`);
 *   done in time it counts, too late the bounty or the chest pays less and `lose` is set. Seconds.
 * @property {string} [rival] race: who you race, for the messages ("Rook")
 * @property {Record<string, string>} [lose] race: flags set when a race is lost (`g:` for player-wide)
 * @property {string} [tally] race: a player-wide counter (`g:rook_won`) that goes up by one with every race won
 * @property {string[]} [blocks]
 * @property {string[]} [items]
 * @property {"thunder" | "rain" | "any"} [weather] survive/vigil
 * @property {[number, number]} [timeOfDay] vigil: from, to (ticks of the day; 18000 = midnight)
 * @property {boolean} [outdoors] vigil: nothing over your head
 * @property {boolean} [sneaking] vigil: while sneaking
 * @property {Who} [who] meet/escort/defend: the character
 * @property {Page[]} [pages] meet: what they say
 * @property {Choice[]} [choices] meet: buttons on the last page
 * @property {Clue[]} [clues] inspect
 * @property {{ mob: string, count: number, name?: string }} [guards] stealth
 * @property {{ dx: number, dz: number }} [goal] stealth: the spot to reach, from the place
 * @property {number} [detect] stealth: guards see you this close when you aren't sneaking
 * @property {number} [detectSneak] stealth: ...and this close when you are
 * @property {"reset" | "ambush"} [onSpotted] stealth
 * @property {{ slot: "head" | "chest" | "legs" | "feet", item: string }} [disguise] stealth: worn, guards see you only at detectSneak
 * @property {Where} [from] escort/follow: start
 * @property {Where} [to] escort/follow/lead: destination
 * @property {{ mobs: string[], count: number, every: number }} [ambush] escort: mobs every `every` seconds
 * @property {string} [mob] lead: the animal
 * @property {Where} [spawnAt] lead: spawn the animal there
 * @property {MobGroup[]} [waves] defend
 * @property {Who} [ward] defend: who must survive
 * @property {string} [wisp] follow: what the light is called
 * @property {number} [stray] follow: how far ahead it waits
 * @property {Page} [question] answer
 * @property {string[]} [answers] answer: accepted answers (case and spaces ignored)
 * @property {MobGroup} [failSpawn] answer: spawned on a wrong answer
 * @property {number} [distance] ride
 * @property {Scene[]} [scenes] vision (and sleep's dream)
 * @property {boolean} [dark] vision: darkness during it
 * @property {Scene[]} [vision] sleep: the dream
 * @property {"head" | "chest" | "legs" | "feet"} [slot] wear
 * @property {number} [minutes] wait: real minutes; event: how long a `near` chase lasts (default 15)
 * @property {number} [days] wait: in-game days
 * @property {SkyKind[]} [events] event: the sky events that count
 * @property {QuestMatch} [quest] event: the finished quest that counts
 * @property {number} [near] event: come within this many blocks of where a sky event happens (meteor, rainbow, storm cell, tornado)
 */

/**
 * @typedef {object} Reward
 * @property {number} [levels] XP levels
 * @property {{ item: string, amount: number, name?: string, lore?: string[] }[]} [items]
 * @property {number} [crowns] paid on the `crowns` scoreboard
 * @property {string} [relic] a relic id for the Relics pack (`realm:relic_give`)
 * @property {string} [title] a title for the Titles pack (`realm:title_unlock`)
 * @property {{ skill: "mining" | "woodcutting" | "farming" | "fishing" | "combat" | "exploration", amount: number }} [skill] skill XP for the Skills pack (`realm:skill_xp`)
 * @property {{ chance: number, relics: string[] }} [relicRoll] a chance (0-1) of one of these relics (`realm:relic_give`)
 * @property {{ entry: string, label: string }} [journal] a `story` page entry for the Journal pack
 * @property {{ id: string, title: string, text: string }} [codex] a lore entry for the story log's Codex
 */

/**
 * A choice button (after an intro, on an outro's last page, or in a `meet` scene).
 * @typedef {object} Choice
 * @property {string} id
 * @property {string} label
 * @property {Record<string, string>} [set] flags to set (`g:` for player-wide)
 * @property {Record<string, number>} [inc] player-wide counters to add to (`g:mercy`)
 * @property {Rep[]} [rep]
 * @property {Page[]} [reply]
 * @property {Requires} [requires] only offered when this holds
 * @property {{ crowns: number }} [cost] Crowns taken when picked; shown on the button, and refused (the form stays) without enough
 */

/**
 * @typedef {object} Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} [npc] who tells the intro (default: the story's giver)
 * @property {string} [end] who you report back to for the outro (default: `npc`)
 * @property {When} [when] the chapter only exists for players whose flags match (branches)
 * @property {Page[]} intro
 * @property {Choice[]} [introChoices] buttons after the intro, before the objectives start
 * @property {string[]} [teach] Kitchen recipes (id or name) taught when the chapter is accepted (`realm:recipe_learn`)
 * @property {Objective[]} objectives
 * @property {Page[]} outro
 * @property {Choice[]} [choices]
 * @property {Reward} [reward]
 * @property {Rep[]} [rep] reputation given when the chapter is finished
 * @property {string} [hint] what "Ask for a hint" says (the hint also reveals exact coordinates)
 * @property {boolean} [sequential] objectives count one at a time, in order (a boss's phases); by default they all count at once
 * @property {SkyRequest[]} [sky] asked for when the chapter is accepted
 * @property {Camp} [camp] Wanderers: accepting the chapter builds (or moves) the giver's camp, place `camp:<wanderer>`
 */

/**
 * @typedef {object} Story
 * @property {string} id
 * @property {string} title
 * @property {string} short the tracker's name for it
 * @property {string} giver the NPC id who starts it
 * @property {"main" | "side" | "heart" | "wander" | "festival"} [kind] default "side"; "heart": a townsfolk's heart story, for players Close with them (`g:aff_<npc>`); "wander": a Recurring Wanderer's chain (giver `w_<id>`); "festival": one chapter offered only while its festival runs (`requires.flags["cal:festival"]`, Realm Calendar), finishable after
 * @property {number} [act] main story act
 * @property {string[]} [tones]
 * @property {string} [summary] the log's line before the story starts
 * @property {Requires} [requires]
 * @property {Chapter[]} chapters
 */

/**
 * A daily favor template (stories/favors.js).
 * @typedef {object} Favor
 * @property {string} id
 * @property {string} npc
 * @property {string} label
 * @property {Objective} objective
 * @property {Reward} reward
 * @property {[string, string]} lines intro and thanks, spoken by the NPC
 */

/**
 * A Recurring Wanderer (stories/wanderers.js): `w_<id>` is their NPC id for stories.
 * @typedef {object} Wanderer
 * @property {string} id
 * @property {string} name
 * @property {string} short
 * @property {"miner" | "ghost" | "pilgrim" | "rival" | "hermit" | "storm" | "exile" | "traveler"} archetype
 * @property {Guild} guild
 * @property {string} entity
 * @property {Camp["prefab"]} camp the prefab of their camp when nothing else says
 */

/**
 * A one-off for a passing Stranger (stories/wander_oneoffs.js). Text and objectives may use `{name}` (the
 * stranger), `{item}` (the item param's name; an objective's `item: "{item}"` is its id), `{count}` (an
 * objective's `count: "{count}"` is the number), `npc: "{npc}"` (the stranger) and `at: "wanderer"` (where
 * you met them). Params are seeded per encounter.
 * @typedef {object} WanderTemplate
 * @property {string} id
 * @property {string} label the offer and the log's title
 * @property {string[]} archetypes who may ask it
 * @property {Guild} guild reputation for it (`realm:quest_done` kind `wander`)
 * @property {{ item?: string[], count?: [number, number] }} [params]
 * @property {Requires} [requires]
 * @property {Page[]} intro
 * @property {any[]} objectives Objectives, with the placeholders above
 * @property {Page[]} outro
 * @property {Reward} reward
 * @property {string} hint
 */

/**
 * A hostile wanderer: its disguise (talk) and its fight (an auto-accepted one-off at the spot where it turned).
 * @typedef {object} HostileWanderer
 * @property {"spy" | "toll" | "sailor" | "hermit"} id
 * @property {string} label the disguise's offer
 * @property {string} title the fight's title in the log
 * @property {Page[]} intro the disguise talking: carries the tell
 * @property {{ crowns: number }} [toll] a toll to pay instead of fighting
 * @property {string} reveal chat line when the disguise drops
 * @property {Champion} champion its true form (tag filled in per encounter)
 * @property {MobGroup} adds who fights beside it from the start (plus one per party mate, up to 3)
 * @property {Page[]} outro after the fight
 * @property {Reward} reward
 */

export {};
