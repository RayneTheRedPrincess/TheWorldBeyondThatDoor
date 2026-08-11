export const LEGACY_MODIFIER_NAME = 'Legacy';
export const LEGACY_STAT_MULTIPLIER = 1.5;
export const LEGACY_ID_PREFIX = 'legacy::';

function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function scaled(value){return Math.round(finite(value)*LEGACY_STAT_MULTIPLIER*1000)/1000;}

export function isLegacyEquipmentId(itemId){return typeof itemId==='string'&&itemId.startsWith(LEGACY_ID_PREFIX);}
export function legacyBaseItemId(itemId){return isLegacyEquipmentId(itemId)?itemId.slice(LEGACY_ID_PREFIX.length):String(itemId||'');}
export function legacyEquipmentId(baseItemId){const base=legacyBaseItemId(baseItemId);return base?`${LEGACY_ID_PREFIX}${base}`:'';}

export function makeLegacyEquipmentItem(item={}){
  const baseId=legacyBaseItemId(item.baseItemId||item.id||'');
  const next=clone(item);
  next.id=legacyEquipmentId(baseId);
  next.baseItemId=baseId;
  next.modifier=LEGACY_MODIFIER_NAME;
  next.modifiers=[...new Set([...(Array.isArray(item.modifiers)?item.modifiers:[]),LEGACY_MODIFIER_NAME])];
  next.statMultiplier=LEGACY_STAT_MULTIPLIER;
  next.listedStats=Object.fromEntries(Object.entries(item.listedStats||{}).map(([key,value])=>[key,scaled(value)]));
  next.resistances=Object.fromEntries(Object.entries(item.resistances||{}).map(([key,value])=>[key,scaled(value)]));
  // Bespoke mechanics, abilities, set bonuses, passive descriptions, and other non-stat behavior
  // intentionally remain byte-for-byte equivalent to the base item.
  return next;
}

export function makeLegacyBorrowRecord(item={}){
  const baseId=legacyBaseItemId(item.baseItemId||item.id||'');
  return {id:baseId,baseItemId:baseId,name:item.name||baseId,modifier:LEGACY_MODIFIER_NAME,statMultiplier:LEGACY_STAT_MULTIPLIER};
}

export function isLegacyBorrowRecord(value){
  return Boolean(value&&typeof value==='object'&&value.modifier===LEGACY_MODIFIER_NAME&&Number(value.statMultiplier)===LEGACY_STAT_MULTIPLIER&&legacyBaseItemId(value.baseItemId||value.id));
}

export function legacyModifierLabel(){return `${LEGACY_MODIFIER_NAME} · +50% listed stats`;}
