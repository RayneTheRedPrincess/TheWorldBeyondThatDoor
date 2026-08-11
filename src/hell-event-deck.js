function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function tierForDepth(depth){if(depth<=5)return 1;if(depth<=9)return 2;if(depth<=15)return 3;if(depth<=20)return 4;if(depth<=25)return 5;return 6;}
function weightedPick(list,rng){if(!list.length)return null;const total=list.reduce((s,e)=>s+Math.max(0,Number(e.weight||1)),0);let roll=unit(rng)*total;for(const e of list){roll-=Math.max(0,Number(e.weight||1));if(roll<0)return e;}return list.at(-1);}
function token(runId,depth,ordinal,rng){return `${runId}-hell-d${depth}-c${ordinal}-${Math.floor(unit(rng)*0xffffff).toString(36).padStart(5,'0')}`;}
function card(e,runId,depth,ordinal,rng){const payload=e.eventPayload||{};return{id:token(runId,depth,ordinal,rng),ordinal,depth,eventId:e.id,kind:e.kind,label:e.label,description:e.description,combat:Boolean(e.combat||e.kind==='combat'),noncombat:!(e.combat||e.kind==='combat'),trainer:false,check:e.check?clone(e.check):null,combatProfile:e.combatProfile||null,hellMerchant:Boolean(e.hellMerchant),merchantId:e.merchantId||null,eventPayload:{success:clone(payload.success||e.success||{}),failure:clone(payload.failure||e.failure||{}),criticalSuccess:clone(payload.criticalSuccess||e.criticalSuccess||{}),criticalFailure:clone(payload.criticalFailure||e.criticalFailure||{})}};}
export function createHellEventCards({runId,depth,hellEvents,expedition,rng=Math.random}={}){
 const events=hellEvents?.events||[],used=new Set(expedition?.usedEventIds||[]),count=3,tier=tierForDepth(depth);let chosen=[];
 if(depth===1&&!(expedition?.history||[]).length)chosen=events.filter(e=>String(e.id).startsWith('hell-intro-')).slice(0,3);
 else {const pool=events.filter(e=>!String(e.id).startsWith('hell-intro-')&&!used.has(e.id)&&Number(e.minTier||tier)<=tier&&Number(e.maxTier||tier)>=tier);while(chosen.length<count){const avail=pool.filter(e=>!chosen.includes(e));if(!avail.length)break;const x=weightedPick(avail,rng);if(x)chosen.push(x);}}
 if(chosen.length!==count)throw new Error(`Caverns to Hell event authority cannot supply ${count} unique cards at Depth ${depth}.`);
 for(let i=chosen.length-1;i>0;i--){const j=Math.floor(unit(rng)*(i+1));[chosen[i],chosen[j]]=[chosen[j],chosen[i]];}
 chosen.forEach(e=>used.add(e.id));return{cards:chosen.map((e,i)=>card(e,runId,depth,i+1,rng)),usedEventIds:[...used],shownTrainerIds:[]};
}
