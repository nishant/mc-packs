/** Pure Nether layer selection with small hysteresis; no game or persistence state. */

/**
 * Select the canonical vertical band center, retaining the previous center near its edges.
 * A previous finite canonical center is sticky on [center - band/2 - margin, center + band/2 + margin).
 * Invalid y/band/margin values fail closed with undefined; an invalid previous center is ignored.
 * @param {number} y
 * @param {number} [previous]
 * @param {number} [band=8]
 * @param {number} [margin=2]
 * @returns {number|undefined}
 */
export function selectNetherLayer(y,previous,band=8,margin=2) {
  if(!Number.isFinite(y)||!Number.isFinite(band)||band<=0||!Number.isFinite(margin)||margin<0)return undefined;
  if(previous!==undefined&&Number.isFinite(previous)) {
    const previousCanonical=Math.floor(previous/band)*band+band/2;
    if(Number.isFinite(previousCanonical)&&previous===previousCanonical&&y>=previous-band/2-margin&&y<previous+band/2+margin)return previous;
  }
  const selected=Math.floor(y/band)*band+band/2;
  return Number.isFinite(selected)?selected:undefined;
}
