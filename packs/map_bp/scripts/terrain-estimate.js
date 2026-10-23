// Bounded DISPLAY reconstruction only. No native queries, terrain writes, material identities or genuine validity.
// Astra's local consensus rule, combined with our marked glyphs and exact world-distance/read-circle bounds.
export const ESTIMATE_FLAG=64;
const MAX_SIDE=33,MAX_CELLS=MAX_SIDE*MAX_SIDE;
const OFFSETS=[[-1,0],[1,0],[0,-1],[0,1],[-2,0],[2,0],[0,-2],[0,2]];
/** @typedef {{width:number,height:number,targets:Uint16Array,donors:Int16Array}} EstimateScratch */
/** @typedef {{width:number,height:number,stride:number,flags:Uint8Array,ticks:Float64Array,heights:ArrayLike<number>,base:string[],worldX:ArrayLike<number>,worldZ:ArrayLike<number>,origin:{x:number,z:number},readRadius:number,worldRadius:number,step:number,now:number,maxAge?:number}} EstimateInput */
/** @param {number} width @param {number} height @returns {EstimateScratch} */
export function estimateScratch(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE)throw new RangeError('Estimate raster exceeds fixed33-grid bounds');
 const cx=(width-1)/2,cz=(height-1)/2;
 const targets=Array.from({length:width*height},(_,i)=>i).sort((a,b)=>(a%width-cx)**2+(Math.floor(a/width)-cz)**2-((b%width-cx)**2+(Math.floor(b/width)-cz)**2)||a-b);
 return{width,height,targets:Uint16Array.from(targets),donors:new Int16Array(8)};
}
/** At most128 center-first unknown targets and1024 donor inspections per rebuild.
 * TWO distinct fresh sampled native-color cells must agree on glyph and differ in height by at most2 blocks.
 * Estimates remain flags64, never flags1, cannot become donors and never enter Store or sample/publication counts.
 * @param {EstimateInput} input @param {(index:number)=>string} glyph @param {EstimateScratch} [scratch] */
export function reconstructRaster(input,glyph,scratch){
 const{width,height,stride,flags,ticks,heights,base,worldX,worldZ,origin,readRadius,worldRadius,step,now}=input,size=width*height;
 if(!scratch||scratch.width!==width||scratch.height!==height)scratch=estimateScratch(width,height);
 if(size>MAX_CELLS||flags.length!==size||ticks.length!==size||heights.length!==size||worldX.length!==size||worldZ.length!==size||stride<width||stride>width+1||base.length<(height-1)*stride+width)throw new RangeError('Mismatched estimate snapshot');
 if(!Number.isFinite(worldRadius)||worldRadius<0||worldRadius>12||!Number.isFinite(step)||step<=0||!Number.isFinite(readRadius)||readRadius<=0||!Number.isFinite(now)||!Number.isFinite(origin.x)||!Number.isFinite(origin.z))throw new RangeError('Invalid reconstruction bounds');
 const result={estimated:0,sources:0,visited:0,neighborChecks:0,attempted:0,scratch};
 if(worldRadius===0)return result;
 const maxAge=input.maxAge??2400,readSquared=readRadius*readRadius,worldSquared=worldRadius*worldRadius;
 let unknown=0;
 for(let i=0;i<size;i++){
  const f=flags[i],code=base[Math.floor(i/width)*stride+i%width]?.charCodeAt(0);
  if((f&1)&&!(f&(4|8|16|32|ESTIMATE_FLAG))&&Number.isFinite(ticks[i])&&Number.isFinite(heights[i])&&now-ticks[i]>=0&&now-ticks[i]<=maxAge&&code>=0xf400&&code<0xf600)result.sources++;
  else if(f===0)unknown++;
 }
 if(result.sources<2||unknown===0)return result;
 const{donors}=scratch;
 for(const target of scratch.targets){
  if(flags[target]!==0)continue;
  const rx=worldX[target]-origin.x,rz=worldZ[target]-origin.z;if(rx*rx+rz*rz>readSquared)continue;
  if(result.attempted>=128)break;result.attempted++;result.visited++;
  const x=target%width,z=Math.floor(target/width);let found=0,chosen=-1,partner=-1;
  for(const[dx,dz]of OFFSETS){
   const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=width||zz>=height)continue;
   const donor=zz*width+xx;result.neighborChecks++;
   const f=flags[donor];if(!(f&1)||f&(4|8|16|32|ESTIMATE_FLAG)||!Number.isFinite(ticks[donor])||!Number.isFinite(heights[donor])||now-ticks[donor]<0||now-ticks[donor]>maxAge)continue;
   const wx=worldX[donor]-worldX[target],wz=worldZ[donor]-worldZ[target];if(wx*wx+wz*wz>worldSquared)continue;
   const donorGlyph=base[zz*stride+xx],code=donorGlyph.charCodeAt(0);if(code<0xf400||code>=0xf600)continue;
   for(let j=0;j<found;j++){const other=donors[j],piece=Math.floor(other/width)*stride+other%width;if(base[piece]===donorGlyph&&Math.abs(heights[other]-heights[donor])<=2){chosen=donor;partner=other;break;}}
   if(chosen>=0)break;donors[found++]=donor;
  }
  if(chosen<0)continue;
  const index=base[Math.floor(chosen/width)*stride+chosen%width].charCodeAt(0)-0xf400,next=glyph(index);
  if(typeof next!=='string'||next.length!==1||next.charCodeAt(0)<0xf100||next.charCodeAt(0)>=0xf300)throw new TypeError('Estimate glyph must be one marked fixed-advance PUA cell');
  base[Math.floor(target/width)*stride+target%width]=next;flags[target]=ESTIMATE_FLAG;ticks[target]=Math.min(ticks[chosen],ticks[partner]);result.estimated++;
 }
 return result;
}
