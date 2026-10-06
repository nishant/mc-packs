# Vanilla sources for tools/gen-rain

Unmodified copies from Mojang's [bedrock-samples](https://github.com/Mojang/bedrock-samples) `resource_pack/`, release **1.26.50.4** (commit `46ba6ea`). The generators read them so `packs/rain_rp` changes only what it means to:

| File | Used by | For |
|---|---|---|
| `weather.png` | `textures.mjs` | The 32×32 weather atlas. The four swatches (rows 20–30) are kept pixel-identical at 4×; the rain rows (5–19) are redrawn, and each of the 8 snowflakes (rows 0–2) is redrawn inside its own 3×3 cell |
| `fogs/*_fog_setting.json` | `fogs.mjs` | The vanilla fogs that define a `weather` (rain/snow) fog in the overworld, plus the fogs of the biomes where it always snows (cold beach, cold taiga ×3, frozen ocean, frozen river, ice mountains, ice plains, ice spikes), which have none. Each override is this file with only `distance.weather` changed or added |
| `biomes/grove.client_biome.json`, `biomes/snowy_slopes.client_biome.json` | `fogs.mjs` | The snowy biomes that use `minecraft:fog_default` (shared with rainy biomes). Each override is this file with only its fog identifier changed |

Which biomes always snow comes from `behavior_pack/biomes/*.biome.json` (`minecraft:climate` temperature below 0.15) and which fog each uses from `resource_pack/biomes/*.client_biome.json`; neither is copied.

Not copied: the vanilla weather sounds (`sounds/ambient/weather/rain1-4.fsb`, `thunder1-3.fsb`, `sounds/random/explode1-4.fsb`, FMOD ADPCM). `sounds.mjs` only uses numbers measured from them once, decoded: rain clips are 2.0 s at −15.1 LUFS (played at volume 0.02), and −41.3 LUFS when stacked the way the game plays them (`layered()`, `VANILLA_RAIN_LAYERED`); thunder is 7–8 s at −17.3 LUFS and the lightning impact (`explode1`) 2.5 s at −12.6 LUFS.

When Mojang changes one of these, copy the new file over the old one, run `npm run gen:rain`, and check the diff.
