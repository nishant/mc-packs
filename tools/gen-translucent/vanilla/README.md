# Vanilla sources for tools/gen-translucent

Copies from Mojang's [bedrock-samples](https://github.com/Mojang/bedrock-samples) `resource_pack/`, release **1.26.50.4** (commit `46ba6ea`). `generate.mjs` reads them so `packs/translucent_rp` changes only how these items are drawn (material and opacity), not their shape, pose or animations.

| File | From | For |
|---|---|---|
| `<tier>_<tool>.png` (wood, stone, copper, iron, gold, diamond, netherite × sword, pickaxe, axe, shovel, hoe), `mace.png`, `bow_*.png`, `crossbow_*.png` | `textures/items/` | The item textures. Converted to 8-bit RGBA (a few are palette PNGs in Mojang's repo); the pixels are unchanged |
| `shield.png`, `trident.png` | `textures/entity/` | The shield and trident model textures (RGBA, unchanged) |
| `bow.json`, `crossbow.entity.json`, `shield.entity.json`, `trident.entity.json` | `attachables/` | The vanilla attachables. Each override is this file with only its materials, textures, render controller and (bow, crossbow) geometry ids swapped |
| `bow.geo.json`, `crossbow.geo.json` | `models/entity/` | The bow and crossbow frames (`texture_meshes`), renamed into `geometry.realm_translucent.*`. The bow's standby frame is also the mesh and placement every tool uses, since vanilla tools have no attachable of their own |
| `bow.animation.json` | `animations/` | `animation.bow.wield`, copied as `animation.realm_translucent.tool.wield`: how a held sprite sits in the hand, first and third person |
| `bow.render_controllers.json`, `crossbow.render_controllers.json` | `render_controllers/` | Their frame arrays, kept; only the material and the enchanted glint change |

When Mojang changes one of these, copy the new file over the old one (convert a PNG to 8-bit RGBA), run `npm run gen:translucent`, and check the diff.
