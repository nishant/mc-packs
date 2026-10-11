# Vanilla sources for tools/gen-translucent

Copies from Mojang's [bedrock-samples](https://github.com/Mojang/bedrock-samples) `resource_pack/`, release **1.26.50.4** (commit `46ba6ea`). `generate.mjs` reads them so `packs/translucent_rp` changes only how these items are drawn (material and opacity), not their shape, pose or animations. (Tools and the mace have no vanilla attachable: their held pose is the handheld-item transform written out in `generate.mjs`, `HANDHELD`.)

| File | From | For |
|---|---|---|
| `<tier>_<tool>.png` (wood, stone, copper, iron, gold, diamond, netherite × sword, pickaxe, axe, shovel, hoe), `mace.png`, `bow_*.png`, `crossbow_*.png` | `textures/items/` | The item textures. Converted to 8-bit RGBA (a few are palette PNGs in Mojang's repo); the pixels are unchanged |
| `shield.png`, `trident.png` | `textures/entity/` | The shield and trident model textures (RGBA, unchanged) |
| `bow.json`, `crossbow.entity.json`, `shield.entity.json`, `trident.entity.json` | `attachables/` | The vanilla attachables. Each override is this file with only its materials, textures, render controller and (bow, crossbow) geometry ids swapped, plus one `pre_animation` line that reads the solid-tools player property |
| `bow.geo.json`, `crossbow.geo.json` | `models/entity/` | The bow and crossbow frames (`texture_meshes`), renamed into `geometry.realm_translucent.*` |
| `bow.render_controllers.json`, `crossbow.render_controllers.json` | `render_controllers/` | Their frame arrays, kept, with each frame's opaque outline added for the solid look; the material follows the solid-tools property |

When Mojang changes one of these, copy the new file over the old one (convert a PNG to 8-bit RGBA), run `npm run gen:translucent`, and check the diff.
