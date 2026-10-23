// Build-selected experiment profile. No player-count multiplier or extra native ledger.
/** @typedef {{palette:"native"|"material",rolling?:boolean,estimateRadiusBlocks?:number,persistence:boolean,preview:boolean,centerFirst:boolean,ops:number,scanMs:number,rebuildMs:number,drawMs:number,featureMs:number,renderReserve:number,renderTicks:number,planTicks:number,checkEvery:number,checks:number,replayLimit:number,flushTicks:number,id:string,label:string}} MapProfile */
/** @type {Readonly<MapProfile>} */
export const SPEED = Object.freeze({
  rolling:true,
  "palette": "native",
  "persistence": false,
  "preview": false,
  "centerFirst": false,
  "ops": 96,
  "scanMs": 6,
  "rebuildMs": 2,
  "drawMs": 1,
  "featureMs": 11,
  "renderReserve": 2.5,
  "renderTicks": 2,
  "planTicks": 2,
  "checkEvery": 4,
  "checks": 12,
  "replayLimit": 128,
  "flushTicks": 10,
  "id": "v1_speed",
  "label": "V1 SPEED / NO TERRAIN PERSISTENCE"
});
/** @type {Readonly<MapProfile>} */
export const BALANCED = Object.freeze({
  "palette": "native",
  "persistence": false,
  "preview": true,
  "centerFirst": false,
  "ops": 32,
  "scanMs": 1.5,
  "rebuildMs": 0.75,
  "drawMs": 0.4,
  "featureMs": 4,
  "renderReserve": 1,
  "renderTicks": 3,
  "planTicks": 4,
  "checkEvery": 8,
  "checks": 6,
  "replayLimit": 128,
  "flushTicks": 10,
  "id": "v2_balanced",
  "label": "V2 BALANCED"
});
export const SURVEY = Object.freeze({...SPEED,id:"v1_survey",label:"PARCHMENT SURVEY / MARKED DISPLAY ESTIMATES",estimateRadiusBlocks:8});
export const INTEGRATED=Object.freeze({...SURVEY,id:"oak_integrated",label:"OAK INTEGRATED / RAY / MARKED CONSENSUS"});
export const MAP_PROFILE = INTEGRATED;
