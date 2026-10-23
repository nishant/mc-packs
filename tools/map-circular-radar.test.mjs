import{radarBadgeCells}from"../packs/map_bp/scripts/terrain-work.js";
import path from "node:path";
import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";import{fixture}from"./map-movement-fixture.mjs";import{insideRadar}from"../packs/map_bp/scripts/terrain-work.js";import{G}from"../packs/map_bp/scripts/glyphs.js";import{COL}from"../packs/map_bp/scripts/terrain.js";import{decode}from"./gen-rain/png.mjs";
function scene(){const f=fixture(1),p=f.roster[0],s=f.api.terrain.store(p.state.dim.id);f.api.playerStore.set(p.id,s);p.state.at={x:.1,y:64,z:.1};for(let x=-49;x<=49;x+=2)for(let z=-49;z<=49;z+=2)f.api.terrain.put(s,x,z,{kind:"stone",y:64,depth:0,palette:44},1,COL);return{f,p,s};}
test("outside fixed circle has a reserved transparent tile, never fake unknown ground or markers",()=>{const{f,p}=scene();assert.equal(typeof G.Q_OUTSIDE,"string");const text=f.api.radarOf(0,[{kind:"party",x:100,z:100,clamp:true}],36,true,p.state.at,p.state.dim.id,true,p.id,true,10),rows=text.split("\n");let outside=0,inside=0;for(let r=-16;r<=16;r++)for(let c=-16;c<=16;c++){if(insideRadar(c,r)){inside++;assert.notEqual(rows[r+16][c+16],G.Q_OUTSIDE);}else{outside++;assert.equal(rows[r+16][c+16],G.Q_OUTSIDE);}}assert.equal(inside,797);assert.equal(outside,292);assert.equal(f.queries.filter(x=>x[0]!=="entities").length,0);});
test("telemetry labels circular display separately from full canonical read-circle",()=>{const{f,p}=scene();f.api.radarOf(0,[],36,true,p.state.at,p.state.dim.id,true,p.id,true,10);f.event("realm:map_debug",{action:"detail",player:p.id});const d=JSON.parse(f.messages.filter(x=>x[0]==="event"&&x[1]==="realm:map_state").at(-1)[2]).detail;assert.equal(d.rasterShape,"circle");assert.equal(d.displayCells,797);assert.equal(d.maskOutside,292);assert.equal(d.fullCircleTotal,1020);assert.equal(d.fullCircleSampled,1020);assert.ok(d.eligible<=d.displayCells);});
test("exact external oak art keeps transparent corners and leaves the full terrain footprint unobstructed", () => {
  const ui = JSON.parse(fs.readFileSync(new URL("../packs/hud_rp/ui/hud_screen.json", import.meta.url)));
  const children = Object.fromEntries(ui.realm_radar_panel.controls[0].radar_widget.controls.map((x) => Object.entries(x)[0]));
  assert.equal(children.radar_bg.texture, "textures/ui/radar_shade");
  const artRoot = path.resolve(process.env.MINIMAP_ART_ROOT ?? path.resolve(import.meta.dirname, ".."), "packs/hud_rp/textures/ui");
  for (const file of ["radar_frame.png", "radar_shade.png"]) {
    const p = decode(fs.readFileSync(path.join(artRoot, file)));
    assert.deepEqual([p.width, p.height], [238, 248]);
    for (const [x, y] of [[0, 0], [p.width - 1, 0], [0, p.height - 1], [p.width - 1, p.height - 1]])
      assert.equal(p.data[(y * p.width + x) * 4 + 3], 0);
    if (file === "radar_frame.png") {
      const inside = (x, y, rx, ry) => ((Math.floor(x / 2) * 2 + 1 - 119) / rx) ** 2 + ((Math.floor(y / 2) * 2 + 1 - 124) / ry) ** 2 <= 1;
      let x0 = 999, x1 = -1, y0 = 999, y1 = -1, bevel = 0;
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        const a = p.data[(y * p.width + x) * 4 + 3];
        if (inside(x, y, 99, 105)) {
          assert.equal(a, 0, "approved 99x105 opening never paints over encoded map cells");
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        } else if (inside(x, y, 102, 108)) { assert.equal(a, 255, "102x108 bevel is opaque"); bevel++; }
      }
      assert.deepEqual([x1 - x0 + 1, y1 - y0 + 1], [198, 212], "quantized hole is 198x212");
      assert.ok(bevel > 0);
      assert.equal(p.data[(124 * p.width + 119) * 4 + 3], 0, "centre is open");
      assert.equal(p.data[(124 * p.width + 2) * 4 + 3] > 0 || p.data[(124 * p.width + 4) * 4 + 3] > 0, true, "opaque gutter outside the bevel");      assert.ok(99 * children.radar_border.size[0] / 238 >= children.radar_clip.size[0] / 2 - 0.05);
      assert.ok(105 * children.radar_border.size[1] / 248 >= children.radar_clip.size[1] / 2 - 0.05);
    }
  }
});

test("transparent tile reserves a unique PUA mapping and full encoded extent, with native advance explicitly unverified",()=>{const n=G.Q_OUTSIDE.charCodeAt(0);assert.equal(n,0xf3ff);assert.notEqual(G.Q_OUTSIDE,G.Q_EMPTY);const image=decode(fs.readFileSync(new URL("../packs/hud_rp/font/glyph_F3.png",import.meta.url))),alphas=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++)alphas.push(image.data[((240+y)*image.width+240+x)*4+3]);assert.equal(Math.max(...alphas),1);assert.equal(alphas.filter(x=>x>0).length,2);assert.equal(alphas[0],1);assert.equal(alphas[255],1);assert.equal(new Set(Object.values(G)).size,Object.keys(G).length);});
test("cardinal UI badge cells remain terrain and an edge party arrow uses an inward-safe neighbor",()=>{const{f,p}=scene(),plain=f.api.radarOf(0,[],36,true,p.state.at,p.state.dim.id,true,p.id,true,10).split("\n"),marked=f.api.radarOf(0,[{kind:"party",x:p.state.at.x,z:-100,clamp:true}],36,true,p.state.at,p.state.dim.id,true,p.id,false,11).split("\n");for(const cell of radarBadgeCells())assert.equal(marked[cell.z+16][cell.x+16],plain[cell.z+16][cell.x+16]);let changed=0;for(let r=0;r<33;r++)for(let c=0;c<33;c++)if(marked[r][c]!==plain[r][c]){changed++;assert.ok(insideRadar(c-16,r-16));}assert.ok(changed>0,"protected badge must not swallow the edge marker");});
