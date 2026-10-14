// Every story file, in log order: the main acts, then the side questlines. stories.js adds the prologue.
import { STORIES as act1 } from "./act1_signs.js";
import { STORIES as act2 } from "./act2_choir.js";
import { STORIES as act3 } from "./act3_deep.js";
import { STORIES as act4 } from "./act4_seals.js";
import { STORIES as act5 } from "./act5_lantern.js";
import { STORIES as dark } from "./side_dark.js";
import { STORIES as bright } from "./side_bright.js";
import { STORIES as bold } from "./side_bold.js";
import { STORIES as deep } from "./side_deep.js";
import { STORIES as heart } from "./side_heart.js";
import { STORIES as wander } from "./wanderers.js";

/** @typedef {import("../types.js").Story} Story */

/** @type {Story[]} */
export const MORE_STORIES = [...act1, ...act2, ...act3, ...act4, ...act5, ...dark, ...bright, ...bold, ...deep, ...heart, ...wander];

export { FAVORS } from "./favors.js";
export { WANDERERS } from "./wanderers.js";
export { HOSTILES, WANDER_TEMPLATES } from "./wander_oneoffs.js";
