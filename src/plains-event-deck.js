function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function tierForDepth(depth){if(depth<=5)return 1;if(depth<=9)return 2;if(depth<=14)return 3;if(depth<=19)return 4;if(depth<=25)return 5;return 6;}
function bloodMoonRareBonus(expedition){const value=Math.max(0,Math.min(100,Number(expedition?.bloodMoon||0)));const tiers=expedition?.regionalMechanic?.tiers||[];const tier=tiers.find(t=>value>=Number(t.min||0)&&value<=Number(t.max||100));return Math.max(0,Number(tier?.rareEventWeightBonusPct||0));}
function pickWeighted(list,rng,rareBonus=0){if(!list.length)return null;const weights=list.map(e=>Math.max(0,Number(e.weight||1))*(e.rareEvent?1+rareBonus/100:1)),total=weights.reduce((a,b)=>a+b,0);let roll=unit(rng)*total;for(let i=0;i<list.length;i++){roll-=weights[i];if(roll<0)return list[i];}return list.at(-1);}
function token(runId,depth,ordinal,rng){return `${runId}-plains-d${depth}-c${ordinal}-${Math.floor(unit(rng)*0xffffff).toString(36).padStart(5,'0')}`;}
function card(e,runId,depth,ordinal,rng){const payload=e.eventPayload||{};return{id:token(runId,depth,ordinal,rng),ordinal,depth,eventId:e.id,kind:e.kind,label:e.label,description:e.description,combat:Boolean(e.combat||e.kind==='combat'),noncombat:!(e.combat||e.kind==='combat'),trainer:false,check:e.check?clone(e.check):null,checkmark:Boolean(e.checkmark),combatProfile:e.combatProfile||null,rareEvent:Boolean(e.rareEvent),eventPayload:{success:clone(payload.success||e.success||{}),failure:clone(payload.failure||e.failure||{}),criticalSuccess:clone(payload.criticalSuccess||e.criticalSuccess||{}),criticalFailure:clone(payload.criticalFailure||e.criticalFailure||{})}};}
export function createPlainsEventCards({runId,depth,plainsEvents,expedition,rng=Math.random}={}){
 const events=plainsEvents?.events||[],used=new Set(expedition?.usedEventIds||[]),count=3,tier=tierForDepth(depth);let chosen=[];
 if(depth===1&&!(expedition?.history||[]).length)chosen=events.filter(e=>String(e.id).startsWith('plains-intro-')).slice(0,3);
 else {const pool=events.filter(e=>!String(e.id).startsWith('plains-intro-')&&!used.has(e.id)&&Number(e.minTier||tier)<=tier&&Number(e.maxTier||tier)>=tier);const rareBonus=bloodMoonRareBonus(expedition);while(chosen.length<count){const avail=pool.filter(e=>!chosen.includes(e));if(!avail.length)break;const x=pickWeighted(avail,rng,rareBonus);if(x)chosen.push(x);}}
 if(chosen.length!==count)throw new Error(`Ruined Vampiric Plains event authority cannot supply ${count} unique cards at Depth ${depth}.`);
 for(let i=chosen.length-1;i>0;i--){const j=Math.floor(unit(rng)*(i+1));[chosen[i],chosen[j]]=[chosen[j],chosen[i]];}
 chosen.forEach(e=>used.add(e.id));return{cards:chosen.map((e,i)=>card(e,runId,depth,i+1,rng)),usedEventIds:[...used],shownTrainerIds:[]};
}
