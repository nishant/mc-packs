// Pure fixed-circle work for the CURRENT 33-grid snapshot; no Store, Native or clock reads.
// Keep original raster indices and 34-piece wire rows while visiting only the 797 visible pixels.
export const RADAR_PIXELS = Object.freeze(Array.from({length:1089},(_,index)=>({index,piece:Math.floor(index/33)*34+index%33})).filter(({index})=>(index%33-16)**2+(Math.floor(index/33)-16)**2<=256).map(pixel=>Object.freeze(pixel)));

/** Counters describe this immutable raster snapshot, never newer shared terrain records.
 * Flags: genuine1, persisted2, valid-empty4, preview8, invalid16, mask32, estimated64.
 * nextExpiry is only the next time an eligible live-native count can change without a new raster.
 * @param {{coarseX:ArrayLike<number>,coarseZ:ArrayLike<number>}} geometry
 * @param {Uint8Array} flags @param {Float64Array} ticks @param {{x:number,z:number}} at
 * @param {number} radius @param {number} now @param {number} maxAge */
export function snapshotCoverage(geometry,flags,ticks,at,radius,now,maxAge){
 const out={firstTick:now,detailCells:0,previewCells:0,unknownCells:0,eligibleCells:0,
  eligibleKnownCells:0,eligibleDetailCells:0,sampled2:0,live2:0,persisted2:0,validEmpty2:0,
  invalidated2:0,totalCells:0,maskExcludedCells:flags.length-RADAR_PIXELS.length,
  estimatedCells:0,eligibleEstimatedCells:0,nextExpiry:Infinity};
 for(const{index:i}of RADAR_PIXELS){
  const f=flags[i];if(f&32){out.maskExcludedCells++;continue;}out.totalCells++;
  const valid=!!(f&1),preview=!!(f&8),estimated=!!(f&64);
  if(valid)out.detailCells++;else if(preview)out.previewCells++;else if(estimated)out.estimatedCells++;else out.unknownCells++;
  if((geometry.coarseX[i]-at.x)**2+(geometry.coarseZ[i]-at.z)**2>radius*radius)continue;
  out.eligibleCells++;if(estimated)out.eligibleEstimatedCells++;
  if(f&16)out.invalidated2++;
  if(valid||preview)out.eligibleKnownCells++;
  if(!valid)continue;
  out.eligibleDetailCells++;out.sampled2++;
  if(f&2)out.persisted2++;else if(now-ticks[i]<=maxAge){out.live2++;out.nextExpiry=Math.min(out.nextExpiry,ticks[i]+maxAge+1);}
  if(f&4)out.validEmpty2++;
 }
 return out;
}

/** Origin/key changes bypass stationary sample batching; caller still enforces feature/rebuild budgets.
 * @param {string|undefined} previousGeometry @param {string} wantedGeometry
 * @param {number|undefined} builtAt @param {number} now @param {number} stationaryTicks */
export function rasterCadenceReady(previousGeometry,wantedGeometry,builtAt,now,stationaryTicks){
 return previousGeometry!==wantedGeometry||builtAt===undefined||now-builtAt>=Math.max(2,stationaryTicks);
}
