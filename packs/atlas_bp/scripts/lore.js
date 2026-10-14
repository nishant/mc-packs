// Atlas of the Realm: the words. Region names, the 60 Starwright tablets (5 tiers of 12, read in order;
// a tier reads in full once the player has finished that many acts of the main story: tier 1 always,
// tier 2 after Act I, ... tier 5 after Act IV), Fenn's survey notes and the site kinds' names.
// The tablets follow docs/STORY_BIBLE.md section 2 in order (spoilers). Plain ASCII only.

/** 24 adjectives for region names. */
export const ADJECTIVES = [
  "Gray", "Lantern", "Drowned", "Brine", "Hollow", "Ember", "Saltmarsh", "Silver",
  "Whispering", "Old", "Quiet", "Bell", "Starfall", "Ash", "Raven", "Amber",
  "Thorn", "Gull", "Cinder", "Moon", "Wren", "Iron", "Weeping", "Golden",
];

/** The land groups the region name's noun comes from (guessed from blocks, as the Field Journal does). */
export const GROUPS = ["plains", "forest", "high", "dry", "wet", "sea"];

/** 30 nouns: 5 per group, in GROUPS order. */
export const NOUNS = [
  ["Downs", "Wolds", "Reach", "Leas", "Vale"],
  ["Weald", "Holt", "Wildwood", "Thicket", "Greenwood"],
  ["Spires", "Crags", "Fells", "Tors", "Heights"],
  ["Barrens", "Dunes", "Wastes", "Flats", "Scarps"],
  ["Fen", "Mire", "Marsh", "Bog", "Carr"],
  ["Shallows", "Deeps", "Sound", "Strand", "Narrows"],
];

/** Site kinds, in the order their index is saved (never reorder; add at the end). */
export const KINDS = /** @type {const} */ (["shrine", "tablet", "cairn", "camp", "hermit", "wreck", "watch", "fossil", "pool", "survey"]);

/** @type {Record<string, string>} */
export const KIND_NAMES = {
  shrine: "Wayside Shrine",
  tablet: "Starwright Tablet",
  cairn: "Choir Cairn",
  camp: "Abandoned Camp",
  hermit: "Hermit Hut",
  wreck: "Sunken Wreck",
  watch: "Fallen Watch Post",
  fossil: "Fossil Dig",
  pool: "Starglass Pool",
  survey: "Fenn's Survey Marker",
};

/** What to do at each kind, said when you first find one. @type {Record<string, string>} */
export const KIND_HINTS = {
  shrine: "Tap the carved stone for its blessing (once a day).",
  tablet: "Tap the carved stone to read it.",
  cairn: "The Gray Choir rang this bell. Break it, and be ready for its keepers.",
  camp: "Open the barrel: someone left in a hurry.",
  hermit: "Someone lives out here. Wanderers sometimes stop by.",
  wreck: "Open the chest in the hull, if the drowned let you.",
  watch: "Ring the bell to call the attack, then hold the post for 60 seconds.",
  fossil: "Mine the 12 bone blocks in the pit.",
  pool: "Tap the amethyst by the water: star-dust settles here.",
  survey: "Tap the post to read Fenn's note.",
};

/** The tablets: 60, tier = Math.floor(n / 12) + 1. @type {{ title: string, text: string }[]} */
export const TABLETS = [
  // Tier 1: the Starwrights themselves (readable from the start)
  { title: "The Sky-Readers", text: "We are the Starwrights. We read the sky the way a farmer reads the soil, and we write down what it says, so our children will know when to plant and when to hide." },
  { title: "Towers on the Heights", text: "On the high places we built our towers, to be nearer the stars. Nobody climbs so high for nothing. We climbed to listen." },
  { title: "Houses of Green Stone", text: "Under the sea we raised houses of green stone, with lamps that never go out. The water keeps them quiet. Quiet was what we wanted." },
  { title: "Cities Under the Stone", text: "Deep under the rock we built cities where no wind could reach. We carved them so carefully that a whisper carries from one end to the other." },
  { title: "Writing in Sound", text: "We do not write with ink. Ink fades. We write with sound and freeze it in crystal, and the crystal keeps it. If you find an echo, hold it to your ear." },
  { title: "Names for Stars", text: "Count the stars by their names, not their numbers. A star with a name is a friend. A star without one is only a light." },
  { title: "Where Sound Goes", text: "Every sound goes somewhere. A footstep, a song, a bell. It goes down into the stone, and down, and down. We have never found the bottom." },
  { title: "Walk Softly", text: "Teach the children to walk softly in the deep places. Not out of fear. Out of manners. You are a guest down there." },
  { title: "The Four Turns", text: "Our year has four turns: the thaw, the high sun, the harvest and the long dark. Keep the feasts. A people who forget their feasts forget each other." },
  { title: "The Slow Stars", text: "The sky is a clock with no hands. Watch it long enough and you will see the slow things: the wandering stars, the ones that come back." },
  { title: "Standing Stones", text: "We marked the world with standing stones so that no traveler would be lost. If you are reading this, a Starwright stood here once and thought of you." },
  { title: "Leave the Stone", text: "Write your name on nothing. Stone outlasts names. Leave the stone, and let the stone remember for you." },
  // Tier 2: the Hollow, the seals and the Lantern (after Act I)
  { title: "The Hunger Below", text: "At the bottom of the world there is a hunger. We call it the Hollow. It is not a beast. It has no teeth. It only listens, and wants, and waits." },
  { title: "The Sculk's Root", text: "The sculk is the Hollow's root. It grows toward the deep the way a vine grows toward the sun. Where it spreads, the Hollow hears more." },
  { title: "Its Ears", text: "The great blind guardians of the deep dark are its ears. Do not call them monsters. They are only listening for it. Do not let them hear you." },
  { title: "Sky-Readers, Not Soldiers", text: "We could not kill the Hollow. We are sky-readers, not soldiers. So we did what sky-readers do: we waited for the right star." },
  { title: "Three Seals", text: "Three seals hold it: the Tide Seal under the sea, the Stone Seal under the rock, the Sky Seal above the clouds. Each is a lock. None is a key." },
  { title: "A Song Held Still", text: "A seal is a song held still. Ours were sung in water, in stone and in air, so the Hollow would hear them from every side and fall asleep." },
  { title: "A Colder Light", text: "The seals need light to keep singing. Not sunlight. A colder, older light, from the wandering star we call the Lantern." },
  { title: "Forty Years", text: "Every forty years the Lantern passes over the world. When its light falls through the seals, they are relit, and the Hollow sleeps for forty more." },
  { title: "Keep the Count", text: "Forty years is a long time for a person and no time at all for a star. Keep the count. If the count is lost, the Lantern will come and nobody will be waiting." },
  { title: "The Empty Cities", text: "Our deep cities are empty now. The sculk crept in through the cracks in the floor, and the whispers in the halls were no longer ours. We left them to it." },
  { title: "The Tide Vaults", text: "The green houses under the sea are the Tide vaults. Their guardians are wardens of the water. They will not let you in. That is their whole job." },
  { title: "The Humming Crystal", text: "We wrote this in echoes too, in case the stone is broken. If you hear us humming in the crystal, now you know what the song is for." },
  // Tier 3: the broken note, the Choir, the buried truth (after Act II)
  { title: "The Broken Note", text: "There is a note the Hollow loves. We call it the broken note. Rung while the Lantern passes, it cracks the light like a cup. Never let it be sounded." },
  { title: "What It Promises", text: "The Hollow cannot climb. It cannot reach. It can only promise. And it promises the one thing a grieving heart cannot refuse: that nothing lost stays lost." },
  { title: "Nothing Lost", text: "Beware the ones who say 'nothing lost, nothing missed'. They have heard the Hollow and taken its hunger for kindness. They will sing for it gladly." },
  { title: "Bells", text: "Where a bell rings, the Hollow listens hardest. A bell is a voice that carries to the bottom of the world. Ring them for weddings. Never for the Hollow." },
  { title: "Falling Light", text: "If the Lantern cracks, its pieces will fall for years: stars that land and burn. Every one is a little of the light, lost to the ground." },
  { title: "The Keepers", text: "Our keepers sleep beside the listening stones, so that if the Hollow whispers, it whispers to someone who knows what it is. A keeper who forgets is a door left open." },
  { title: "The Counter-Song", text: "There is a counter-song for the broken note. It is old and simple, and every Starwright mother knew it. Sing it low. Sing it at the bell." },
  { title: "Rings of Gray Stone", text: "Those who hear the Hollow will gather. They will meet in rings of gray stone, and sing, and call it hope. Do not hate them. Stop them." },
  { title: "A Newer Hand", text: "Under the carving someone has scratched newer, clumsy words: 'Measured again. The line holds. Told the mayor. He said forget it, for the town's sake. - A.F.'" },
  { title: "Buried Truths", text: "Do not bury the truth to spare the living. A buried truth does not rot. It waits, and it is waiting still when the grandchildren dig it up." },
  { title: "Empty Graves", text: "A grave the Hollow wants is a grave that stays empty. If you find one, do not fill it. Ask who it was for." },
  { title: "Voices Kept", text: "The Hollow does not keep the dead. It keeps voices. A voice it keeps can be made to sing whatever it likes." },
  // Tier 4: the Long Storm, the shards, the Herald, the last Starwright (after Act III)
  { title: "Fenn Saw It", text: "Scratched under the carving with a knife: 'Forty winters ago the keeper rang the harbor bell with the broken note. The Lantern cracked. The tower fell. I saw it from the cliff. - A.F.'" },
  { title: "Still Falling", text: "The cracked Lantern fell as stars, and it still falls. The meteors you see are the last pieces of it coming home, one by one." },
  { title: "Tools That Remember", text: "The light in the fallen pieces is not dead. A smith with the right hands can forge it into tools that remember. Such tools feel warm. They are." },
  { title: "Bent, Not Broken", text: "The seals did not break when the Lantern cracked. They bent. They hold on the little light left in the shards, the way a lamp holds on its last oil." },
  { title: "The Keys", text: "Each seal has a key, and each key wants the Lantern's light. If the Lantern is broken, carry a piece of it to the key yourself." },
  { title: "The Herald", text: "The Hollow keeps the keeper who rang the note. Drowned and dreaming, he is its voice now: the Herald. What he says is not his. Remember that when he speaks." },
  { title: "Other Mouths", text: "The Herald cannot ring the bell again if the bell is silent. So he looks for other mouths: dreamers, keepers, anyone who sleeps beside the stone." },
  { title: "The One Who Stayed", text: "One of our line was always to stay behind and watch the stones between passes. A sliver of the Lantern kept her young. She will not tell you. Ask about her apron." },
  { title: "Grief Is Not a Crime", text: "The watcher's guilt is not hers to carry alone. The note was rung by a grieving man. Grief is not a crime. Listening to the Hollow is a mistake." },
  { title: "Under the Rock", text: "The Stone Seal sits under the rock, below the place where the deep cities end. Its guardians are gone. Its door is chained. Its song is very tired." },
  { title: "One Line", text: "Fenn's hand again, shakier: 'Three seals. Three pins. One line. The line runs through the chapel. The chapel sits on their listening stone. Someone should tell the keeper.'" },
  { title: "Wake Him", text: "A keeper who hears the Herald is not lost. Wake him. Sing to him. A voice the Hollow borrows can still be given back." },
  // Tier 5: Lantern Night (after Act IV)
  { title: "All Three at Once", text: "When the Lantern returns, all three seals must stand open to its light at once: tide, stone and sky. One closed seal, and the Hollow wakes in the dark between." },
  { title: "Lantern Night", text: "The night of the pass is called Lantern Night. Light every lamp. Ring no bell. Keep the doors of the town shut and the hearts inside open." },
  { title: "The Gate", text: "Where the Hollow is nearest the surface it makes a gate: black stone that weeps, and sculk, and a pit of cold fire. Do not go through it alone." },
  { title: "A Living Seal", text: "A seal can be made of a person. We know this. We have done it once, and wept for a hundred years. A living seal holds a thousand winters, not forty." },
  { title: "The Other Bargain", text: "There is another bargain, and the Herald will offer it: take his place, and the Hollow will give you power over every grief. The town will be saved. You will not be you." },
  { title: "Let Him Speak", text: "If the Herald is freed, he will be himself again for a little while. Let him speak. The dead have things to say to the living, and seldom the time." },
  { title: "Enough", text: "Relight the Lantern and the Hollow sleeps forty years. It is not forever. It is enough. Forty years is a whole life, for someone." },
  { title: "Write the Count Down", text: "Write the next count somewhere the town will see it. Not in a sealed desk. In the square, on the wall of the inn, in the children's songs." },
  { title: "To the Last Reader", text: "To the one who reads this last: we did not save the world. We only kept it until you got here. That was always the plan." },
  { title: "A Lullaby", text: "The Lantern's light is not a weapon. It is a lullaby. Do not fight the Hollow on Lantern Night. Sing it to sleep, and hold the line while it listens." },
  { title: "When It Sleeps", text: "When the Hollow sleeps, the sculk slows, the wardens rest, and the deep dark is only dark. Go down then, and listen. You will hear us humming." },
  { title: "The Last Tablet", text: "Here ends the last tablet. If you have read them all, you know as much as the Starwrights did. Pass it on. That is the only seal that never cracks." },
];

/** The act each tier needs (finished main acts): tier 1 none, tier 2 Act I, ... tier 5 Act IV. */
export const TIER_ACT = [0, 1, 2, 3, 4];
/** The act names, for "reads in full after ...". */
export const ACT_NAMES = ["", "Act I: Signs in the Sky", "Act II: The Gray Choir", "Act III: Into the Deep", "Act IV: The Three Seals"];

/** Fenn's survey notes (prologue-level knowledge only). */
export const SURVEY = [
  "Survey mark 1. 'Started again from the chapel. Everything starts from the chapel. I wish I knew why.' - A. Fenn",
  "Survey mark 2. 'Mara drew her first contour line today. Wobbly. Proud of her. Didn't say so. Should have.' - A. Fenn",
  "Survey mark 3. 'Old stones here, set by someone who knew the stars. They point the same way my instruments do.' - A. Fenn",
  "Survey mark 4. 'Rained all day. Measured anyway. The rain does not care about my angles, and my angles do not care about the rain.' - A. Fenn",
  "Survey mark 5. 'Three pins on the big map now. They make a line. Lines are just lines. Aren't they?' - A. Fenn",
  "Survey mark 6. 'Met a hermit who says the stone listens. Wrote it down. Did not laugh. Did not sleep well either.' - A. Fenn",
  "Survey mark 7. 'Someone at the inn asked what I'm measuring. I said the weather. Nobody asked again. That is the trouble with this town.' - A. Fenn",
  "Survey mark 8. 'If you are reading this, you have walked far. Good. Rest your feet. Then keep going. The map isn't done.' - A. Fenn",
  "Survey mark 9. 'Mara, if this is you: the compass lies near iron, the stars never lie, and you should eat something.' - A. Fenn",
  "Survey mark 10. 'Last mark of the season. Knees hurt. Heart full. The world is bigger than any map, and that is the best news I know.' - A. Fenn",
];
