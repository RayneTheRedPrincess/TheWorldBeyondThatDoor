export const KEPT_IMPRESSION_CAPACITY = 7;
export const CLASSLESS_ID = 'KI-182';

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function buildKeptImpressionIndex(entries = []) {
  return new Map(entries.map(entry => [entry.id, entry]));
}

export function getEquippedKeptIds(slot) {
  return Array.isArray(slot?.loadout?.keptImpressions) ? [...slot.loadout.keptImpressions] : [];
}

export function getKeptImpressionChoices(slot) {
  return clone(slot?.loadout?.keptImpressionChoices || {});
}

export function getKeptSlotCost(ids, entries = []) {
  const index = buildKeptImpressionIndex(entries);
  return ids.reduce((sum, id) => sum + Number(index.get(id)?.slots || 0), 0);
}

export function validateKeptLoadout(slot, account, entries = []) {
  const equipped = getEquippedKeptIds(slot);
  const owned = new Set(account?.unlocks?.keptImpressions || []);
  const index = buildKeptImpressionIndex(entries);
  const errors = [];
  if (new Set(equipped).size !== equipped.length) errors.push('The same Kept Impression cannot be equipped more than once.');
  for (const id of equipped) {
    if (!index.has(id)) errors.push(`${id} is not part of the canonical Kept Impression catalogue.`);
    if (!owned.has(id)) errors.push(`${id} is not kept by this account.`);
  }
  const used = getKeptSlotCost(equipped, entries);
  if (used > KEPT_IMPRESSION_CAPACITY) errors.push(`Kept Impression capacity exceeded: ${used}/${KEPT_IMPRESSION_CAPACITY}.`);
  return { ok: errors.length === 0, errors, used, capacity: KEPT_IMPRESSION_CAPACITY };
}

export function equipKeptImpression(slot, account, id, entries = []) {
  if (slot?.campaign?.active || slot?.campaign?.settlement) return { ok:false, error:"Kept Impressions can only be changed at Krass's Magical Library between campaigns." };
  const index = buildKeptImpressionIndex(entries);
  const owned = new Set(account?.unlocks?.keptImpressions || []);
  if (!index.has(id)) return { ok: false, error: 'That Kept Impression does not exist.' };
  if (!owned.has(id)) return { ok: false, error: 'That Kept Impression has not been kept by this account.' };
  const equipped = getEquippedKeptIds(slot);
  if (equipped.includes(id)) return { ok: false, error: 'That Kept Impression is already equipped.' };
  const nextIds = [...equipped, id];
  const used = getKeptSlotCost(nextIds, entries);
  if (used > KEPT_IMPRESSION_CAPACITY) return { ok: false, error: `Not enough capacity. This loadout would use ${used}/${KEPT_IMPRESSION_CAPACITY} slots.` };
  const next = clone(slot);
  next.loadout = { ...(next.loadout || {}), keptImpressions: nextIds, keptImpressionChoices: clone(next.loadout?.keptImpressionChoices || {}) };
  return { ok: true, slot: next, used, capacity: KEPT_IMPRESSION_CAPACITY };
}

export function unequipKeptImpression(slot, id, entries = []) {
  if (slot?.campaign?.active || slot?.campaign?.settlement) return { ok:false, error:"Kept Impressions can only be changed at Krass's Magical Library between campaigns." };
  const equipped = getEquippedKeptIds(slot);
  if (!equipped.includes(id)) return { ok: false, error: 'That Kept Impression is not equipped.' };
  const next = clone(slot);
  const choices=clone(next.loadout?.keptImpressionChoices || {}); delete choices[id];
  next.loadout = { ...(next.loadout || {}), keptImpressions: equipped.filter(value => value !== id), keptImpressionChoices: choices };
  return { ok: true, slot: next, used: getKeptSlotCost(next.loadout.keptImpressions, entries), capacity: KEPT_IMPRESSION_CAPACITY };
}


export function setKeptImpressionChoice(slot, id, choiceKey, value, runtimeEntries = []) {
  if (slot?.campaign?.active || slot?.campaign?.settlement) return { ok:false, error:"Kept Impression choices can only be changed at Krass's Magical Library between campaigns." };
  if (!getEquippedKeptIds(slot).includes(id)) return { ok:false, error:'Equip that Kept Impression before configuring it.' };
  const runtime=runtimeEntries.find(entry=>entry.id===id);
  const schema=runtime?.choice;
  if (!schema) return { ok:false, error:'That Kept Impression has no Tavern choice.' };
  if (schema.key!==choiceKey) return { ok:false, error:'Unknown Kept Impression choice.' };
  let valid=false;
  if(schema.type==='single') valid=(schema.options||[]).includes(value);
  else if(schema.type==='multiple') valid=Array.isArray(value)&&value.length===Number(schema.count||0)&&new Set(value).size===value.length&&value.every(v=>(schema.options||[]).includes(v));
  else if(schema.type==='party-ally') valid=typeof value==='string'&&value.length>0;
  else if(schema.type==='combat-start-toggle') valid=typeof value==='boolean';
  if(!valid)return {ok:false,error:'That choice is not legal for this Kept Impression.'};
  const next=clone(slot); const all=clone(next.loadout?.keptImpressionChoices||{}); all[id]={...(all[id]||{}),[choiceKey]:clone(value)};
  next.loadout={...(next.loadout||{}),keptImpressionChoices:all}; return {ok:true,slot:next};
}

export function unlockKeptImpression(account, id, entries = []) {
  const index = buildKeptImpressionIndex(entries);
  if (!index.has(id)) throw new Error(`Unknown Kept Impression: ${id}`);
  const next = clone(account);
  const unlocks = next.unlocks || {};
  next.unlocks = { ...unlocks, keptImpressions: [...new Set([...(unlocks.keptImpressions || []), id])] };
  return next;
}

export function isClasslessEquipped(slot) {
  return getEquippedKeptIds(slot).includes(CLASSLESS_ID);
}
