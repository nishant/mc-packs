# Vanilla sources for tools/gen-rain

Unmodified copies from Mojang's [bedrock-samples](https://github.com/Mojang/bedrock-samples) `resource_pack/`, release **1.26.50.4** (commit `46ba6ea`). The generators read them so `packs/rain_rp` changes only what it means to:

| File | Used by | For |
|---|---|---|
| `weather.png` | `textures.mjs` | The 32×32 weather atlas. Snow (rows 0–2) and the four swatches (rows 20–30) are kept pixel-identical at 4×; only the rain rows (5–19) are redrawn |
| `fogs/*_fog_setting.json` | `fogs.mjs` | The vanilla fogs that define a `weather` (rain/snow) fog in the overworld. Each override is this file with only `distance.weather` changed |

Not copied: the vanilla weather sounds (`sounds/ambient/weather/rain1-4.fsb`, `thunder1-3.fsb`, `sounds/random/explode1-4.fsb`, FMOD ADPCM). `sounds.mjs` only uses numbers measured from them once, decoded: rain clips are 2.0 s at −15.1 LUFS (played at volume 0.02), and −41.3 LUFS when stacked the way the game plays them (`layered()`, `VANILLA_RAIN_LAYERED`); thunder is 7–8 s at −17.3 LUFS and the lightning impact (`explode1`) 2.5 s at −12.6 LUFS.

When Mojang changes one of these, copy the new file over the old one, run `npm run gen:rain`, and check the diff.
