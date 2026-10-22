import test from "node:test";
import assert from "node:assert/strict";
import {selectNetherLayer} from "../packs/map_bp/scripts/nether-layer.js";

test("canonical layers use floor for positive and negative heights",()=>{
  for(const [y,expected] of [[0,4],[7.9,4],[8,12],[-0.1,-4],[-4,-4],[-8,-4],[-8.1,-12]])assert.equal(selectNetherLayer(y),expected);
});

test("2-block oscillation around canonical 44/52 boundary stays on 44",()=>{
  let previous=44;
  for(const y of [47.9,48,47.9,49,48,47.9]) {
    previous=selectNetherLayer(y,previous);
    assert.equal(previous,44);
  }
  assert.equal(selectNetherLayer(50,previous),52);
});

test("upper hysteresis limit is inclusive below 50 and switches at 50",()=>{
  assert.equal(selectNetherLayer(47.9,44),44);
  assert.equal(selectNetherLayer(48,44),44);
  assert.equal(selectNetherLayer(49,44),44);
  assert.equal(selectNetherLayer(50,44),52);
});

test("lower hysteresis limit is inclusive at 46 and switches below it",()=>{
  assert.equal(selectNetherLayer(46,52),52);
  assert.equal(selectNetherLayer(46.0001,52),52);
  assert.equal(selectNetherLayer(45.9999,52),44);
});

test("first crossing near 40 retains 36 until its hysteresis edge",()=>{
  assert.equal(selectNetherLayer(39.9,36),36);
  assert.equal(selectNetherLayer(40,36),36);
  assert.equal(selectNetherLayer(41.9,36),36);
  assert.equal(selectNetherLayer(42,36),44);
});

test("large jumps choose the canonical layer immediately",()=>{
  assert.equal(selectNetherLayer(1000,44),1004);
  assert.equal(selectNetherLayer(-1000,1004),-996);
});

test("invalid previous state is ignored and custom bands work",()=>{
  assert.equal(selectNetherLayer(47.9,45),44);
  assert.equal(selectNetherLayer(6,5,10,1),5);
  assert.equal(selectNetherLayer(11,5,10,1),15);
});

test("invalid heights and selector parameters fail closed",()=>{
  for(const y of [NaN,Infinity,-Infinity])assert.equal(selectNetherLayer(y),undefined);
  for(const [band,margin] of [[0,2],[-8,2],[Infinity,2],[8,-1],[8,Infinity]])assert.equal(selectNetherLayer(10,undefined,band,margin),undefined);
});
