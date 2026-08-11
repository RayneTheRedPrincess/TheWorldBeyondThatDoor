export const MAX_RECENT_CAMPAIGN_HISTORY_ENTRIES = 64;
export const MAX_RECENT_CRAFT_HISTORY_ENTRIES = 64;

function clone(value) {
  return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
}
function record(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function nonNegativeInt(value,fallback=0){return Math.max(0,Math.trunc(finite(value,fallback)));}

export function compactEncounterHistoryEntry(value={}) {
  const entry=record(value);
  const out={
    id: typeof entry.id==='string'?entry.id:'',
    depth: Math.max(1,nonNegativeInt(entry.depth,1)),
    source: typeof entry.source==='string'?entry.source:null,
    eventId: typeof entry.eventId==='string'?entry.eventId:null,
    trainerId: typeof entry.trainerId==='string'?entry.trainerId:null,
    kind: typeof entry.kind==='string'?entry.kind:null,
    boss: Boolean(entry.boss),
    miniboss: Boolean(entry.miniboss),
    state: typeof entry.state==='string'?entry.state:'resolved',
    resolution: entry.resolution&&typeof entry.resolution==='object'?clone(entry.resolution):null
  };
  if(entry.triggeredByEncounterId)out.triggeredByEncounterId=String(entry.triggeredByEncounterId);
  if(entry.triggeredByOutcome)out.triggeredByOutcome=String(entry.triggeredByOutcome);
  return out;
}

export function compactEncounterHistory(entries=[]) {
  return Array.isArray(entries)?entries.filter(x=>x&&typeof x==='object').map(compactEncounterHistoryEntry):[];
}

export function compactMaterialInventory(materials={}) {
  const out={};
  for(const [id,raw] of Object.entries(record(materials))){
    const item=record(raw),quantity=Math.max(0,finite(item.quantity,0));
    if(quantity<=0)continue;
    out[id]={quantity};
    if(typeof item.name==='string'&&item.name)out[id].name=item.name;
  }
  return out;
}

export function compactRegionSummary(summary={}) {
  const source=record(summary);
  return {
    ...source,
    ...(Array.isArray(source.history)?{history:compactEncounterHistory(source.history)}:{}),
    ...(source.materialsSnapshot&&typeof source.materialsSnapshot==='object'?{materialsSnapshot:compactMaterialInventory(source.materialsSnapshot)}:{})
  };
}

export function compactRegionSummaries(summaries={}) {
  return Object.fromEntries(Object.entries(record(summaries)).map(([id,summary])=>[id,compactRegionSummary(summary)]));
}

export function compactRegionBaselines(baselines={}) {
  return Object.fromEntries(Object.entries(record(baselines)).map(([id,base])=>{
    const source=record(base);return [id,{...source,...(source.materials&&typeof source.materials==='object'?{materials:compactMaterialInventory(source.materials)}:{})}];
  }));
}

export function compactCraftRecord(value={}) {
  const source=record(value),output=record(source.output);
  return {
    recipeId: typeof source.recipeId==='string'?source.recipeId:'',
    output: {
      type: typeof output.type==='string'?output.type:'',
      id: typeof output.id==='string'?output.id:'',
      quantity: Math.max(1,nonNegativeInt(output.quantity,1))
    },
    at: typeof source.at==='string'?source.at:null
  };
}

export function normalizeCraftingLedger(crafting={}) {
  const source=record(crafting),raw=Array.isArray(source.crafted)?source.crafted.filter(x=>x&&typeof x==='object'):[];
  const priorCount=nonNegativeInt(source.craftedCount,0),craftedCount=Math.max(priorCount,raw.length);
  return {...source,craftedCount,crafted:raw.slice(-MAX_RECENT_CRAFT_HISTORY_ENTRIES).map(compactCraftRecord)};
}

export function getCraftedCount(runOrCrafting={}) {
  const crafting=runOrCrafting?.crafting&&typeof runOrCrafting.crafting==='object'?runOrCrafting.crafting:runOrCrafting;
  const source=record(crafting),raw=Array.isArray(source.crafted)?source.crafted:[];
  return Math.max(nonNegativeInt(source.craftedCount,0),raw.length);
}

export function appendCraftRecord(crafting={},recordValue={}) {
  const next=normalizeCraftingLedger(crafting),recordEntry=compactCraftRecord(recordValue);
  next.craftedCount=getCraftedCount(next)+1;
  next.crafted=[...(next.crafted||[]),recordEntry].slice(-MAX_RECENT_CRAFT_HISTORY_ENTRIES);
  return next;
}

function campaignOutcomeStats(campaigns=[]){
  let victories=0,defeats=0;
  for(const entry of campaigns){if(entry?.outcome==='defeat')defeats++;else if(entry?.outcome==='victory'||entry?.outcome==='return')victories++;}
  return{victories,defeats};
}

export function normalizeCampaignHistory(history={}) {
  const source=record(history),raw=Array.isArray(source.campaigns)?source.campaigns.filter(x=>x&&typeof x==='object'):[];
  const existing=record(source.campaignStats),derived=campaignOutcomeStats(raw);
  const total=Math.max(nonNegativeInt(existing.total,0),raw.length);
  const victories=Math.max(nonNegativeInt(existing.victories,0),derived.victories);
  const defeats=Math.max(nonNegativeInt(existing.defeats,0),derived.defeats);
  return {...source,campaignStats:{total,victories,defeats},campaigns:raw.slice(-MAX_RECENT_CAMPAIGN_HISTORY_ENTRIES)};
}

export function getCampaignStats(history={}) {
  const normalized=normalizeCampaignHistory(history);return normalized.campaignStats;
}

export function appendCampaignHistory(history={},entry={}) {
  const next=normalizeCampaignHistory(history),stats={...next.campaignStats};
  stats.total+=1;
  if(entry?.outcome==='defeat')stats.defeats+=1;else if(entry?.outcome==='victory'||entry?.outcome==='return')stats.victories+=1;
  next.campaignStats=stats;
  next.campaigns=[...(next.campaigns||[]),clone(entry)].slice(-MAX_RECENT_CAMPAIGN_HISTORY_ENTRIES);
  return next;
}
