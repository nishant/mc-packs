/** @param {string[]} a */
const mc = (a) => a.map((b) => `minecraft:${b}`);

/**
 * Copies of Town Projects' NATURAL and WILD sets (packs/town_bp/scripts/sites.js): the only blocks a town needs to hear
 * about, because it treats every other block as man-made already. tools/build-placed-report.test.mjs keeps them equal.
 */
export const NATURAL = new Set(
    mc([
        "grass_block", "dirt", "coarse_dirt", "podzol", "mycelium", "dirt_with_roots", "mud", "sand", "red_sand", "gravel", "clay", "stone",
        "granite", "diorite", "andesite", "deepslate", "tuff", "calcite", "sandstone", "red_sandstone", "snow", "snow_layer",
    ]),
);
export const WILD = new Set(
    mc([
        "short_grass", "tall_grass", "fern", "large_fern", "deadbush", "leaf_litter", "pink_petals", "wildflowers", "bush", "firefly_bush",
        "short_dry_grass", "tall_dry_grass", "brown_mushroom", "red_mushroom", "vine", "poppy", "dandelion", "cornflower", "azure_bluet", "oxeye_daisy",
        "allium", "lily_of_the_valley", "orange_tulip", "red_tulip", "white_tulip", "pink_tulip", "blue_orchid", "sunflower", "lilac", "rose_bush",
        "peony", "torchflower", "open_eyeblossom", "closed_eyeblossom", "snow_layer",
    ]),
);

/** @param {string | undefined} id */
export const isNaturalKind = (id) => !!id && (NATURAL.has(id) || WILD.has(id));
