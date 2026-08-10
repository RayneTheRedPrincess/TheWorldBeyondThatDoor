function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function randint(min,max,rng){return Math.floor(unit(rng)*(max-min+1))+min;}
function pickOne(list,rng){return list.length?list[Math.floor(unit(rng)*list.length)]:null;}
function uniqueStrings(values){return [...new Set((values||[]).filter(Boolean).map(String))];}
function weightedPick(entries,weightOf,rng){
  if(!entries.length)return null;const weights=entries.map(e=>Math.max(0,Number(weightOf(e)||0))),total=weights.reduce((a,b)=>a+b,0);
  if(total<=0)return pickOne(entries,rng);let roll=unit(rng)*total;for(let i=0;i<entries.length;i++){roll-=weights[i];if(roll<0)return entries[i];}return entries.at(-1);
}

export function planBogTrainerRoster({bogTrainers,activeVesselBaseClass=null,partyBaseClasses=[],unlockedSubclasses=[],forcedTrainerIds=[],rng=Math.random}={}){
  const entries=bogTrainers?.entries||[];if(!entries.length)return{activeTrainerIds:[],anchorTrainerIds:[],scheduledByDepth:{},partyBaseClasses:uniqueStrings(partyBaseClasses),activeVesselBaseClass:activeVesselBaseClass||null,rosterSize:0};
  const rules=bogTrainers?.rules||{},min=Math.max(0,Number(rules.activeRosterMin||8)),max=Math.max(min,Number(rules.activeRosterMax||11));
  const desired=Math.min(entries.length,randint(min,max,rng)),party=uniqueStrings(partyBaseClasses),unlocked=new Set(unlockedSubclasses||[]);
  const selected=uniqueStrings(forcedTrainerIds).filter(id=>entries.some(t=>t.id===id)).slice(0,desired),anchors=[];
  if(activeVesselBaseClass&&unit(rng)<Number(rules.matchingBaseClassAnchorChancePct||95)/100){
    let candidates=entries.filter(t=>t.baseClass===activeVesselBaseClass&&!selected.includes(t.id));const locked=candidates.filter(t=>!unlocked.has(t.subclass));if(locked.length)candidates=locked;
    const chosen=pickOne(candidates,rng);if(chosen){selected.push(chosen.id);anchors.push(chosen.id);}
  }
  for(const baseClass of party){
    if(selected.length>=desired||baseClass===activeVesselBaseClass||unit(rng)>=Number(rules.matchingBaseClassAnchorChancePct||95)/100)continue;
    let candidates=entries.filter(t=>t.baseClass===baseClass&&!selected.includes(t.id));const locked=candidates.filter(t=>!unlocked.has(t.subclass));if(locked.length)candidates=locked;
    const chosen=pickOne(candidates,rng);if(chosen){selected.push(chosen.id);anchors.push(chosen.id);}
  }
  while(selected.length<desired){
    const candidates=entries.filter(t=>!selected.includes(t.id));if(!candidates.length)break;
    const chosen=weightedPick(candidates,t=>{let w=party.includes(t.baseClass)?Number(rules.matchingFamilyWeight||4):1;if(!unlocked.has(t.subclass))w*=1.25;return w;},rng);selected.push(chosen.id);
  }
  const byId=new Map(entries.map(t=>[t.id,t])),scheduledByDepth={},usedDepths=new Set();
  const earlyTarget=Math.min(selected.length,Math.max(2,Math.min(4,Math.ceil(selected.length/3)))),earlyIds=[];
  const earlyPool=selected.filter(id=>{const t=byId.get(id);return t&&Number(t.minDepth||3)<=14;}).sort((a,b)=>(anchors.includes(b)?1:0)-(anchors.includes(a)?1:0));
  while(earlyIds.length<earlyTarget&&earlyPool.length)earlyIds.push(earlyPool.splice(Math.floor(unit(rng)*earlyPool.length),1)[0]);
  const assign=(id,preferEarly=false)=>{const t=byId.get(id);if(!t)return;let depths=[];for(let d=Math.max(3,Number(t.minDepth||3));d<=Math.min(29,Number(t.maxDepth||29));d++){if(d===15||d===30||usedDepths.has(d))continue;if(preferEarly&&d>14)continue;if(!preferEarly&&d<16)continue;depths.push(d);}if(!depths.length){for(let d=3;d<=29;d++)if(d!==15&&!usedDepths.has(d))depths.push(d);}const depth=pickOne(depths,rng);if(depth!=null){usedDepths.add(depth);scheduledByDepth[String(depth)]=id;}};
  for(const id of earlyIds)assign(id,true);for(const id of selected)if(!earlyIds.includes(id))assign(id,false);
  return{activeTrainerIds:selected,anchorTrainerIds:anchors,scheduledByDepth,partyBaseClasses:party,activeVesselBaseClass:activeVesselBaseClass||null,rosterSize:selected.length};
}

function token(runId,depth,ordinal,rng){return `${runId}-d${depth}-c${ordinal}-${Math.floor(unit(rng)*0xffffff).toString(36).padStart(5,'0')}`;}
function cardFromEvent(e,runId,depth,ordinal,rng){return{id:token(runId,depth,ordinal,rng),ordinal,depth,eventId:e.id,kind:e.kind,label:e.label,description:e.description,combat:Boolean(e.combat||e.kind==='combat'),noncombat:!(e.combat||e.kind==='combat'),trainer:false,check:e.check?clone(e.check):null,checkmark:Boolean(e.checkmark),combatProfile:e.combatProfile||null,faction:e.faction||null,fogTouched:Boolean(e.fogTouched),majorHaunting:Boolean(e.majorHaunting),fogOnFailure:Number(e.fogOnFailure||0),eventPayload:{success:clone(e.success||{}),failure:clone(e.failure||{}),criticalSuccess:clone(e.criticalSuccess||{}),criticalFailure:clone(e.criticalFailure||{})}};}
function cardFromTrainer(t,runId,depth,ordinal,rng){return{id:token(runId,depth,ordinal,rng),ordinal,depth,eventId:`trainer:${t.id}`,kind:'trainer',label:`Trainer — ${t.name}`,description:`${t.description} They teach ${t.subclass}, a ${t.baseClass} subclass.`,combat:false,noncombat:true,trainer:true,trainerId:t.id,subclass:t.subclass,baseClass:t.baseClass,check:null,checkmark:false};}
function eligibleEvents(events,used,depth){return events.filter(e=>!e.introOnly&&!used.has(e.id)&&depth>=Number(e.minDepth||1)&&depth<=Number(e.maxDepth||29));}
function chooseEvent(candidates,pressure,rng,{requireFog=false,requireHaunting=false}={}){
  let pool=candidates;if(requireHaunting){const h=pool.filter(e=>e.majorHaunting);if(h.length)pool=h;}else if(requireFog){const f=pool.filter(e=>e.fogTouched);if(f.length)pool=f;}
  return weightedPick(pool,e=>{let w=Number(e.weight||1);if(pressure>=1&&(e.faction==='undead'||e.faction==='witch'||e.fogTouched))w*=1.75;return w;},rng);
}
export function createBogEventCards({runId,depth,bogEvents,bogTrainers,expedition,rng=Math.random}={}){
  const count=3,events=bogEvents?.events||[],used=new Set(expedition?.usedEventIds||[]),shown=new Set(expedition?.shownTrainerIds||[]),pressure=Math.max(0,Math.min(3,Number(expedition?.fogPressure||0)));let chosen=[];
  if(depth===1&&!(expedition?.history||[]).length){for(const id of bogEvents?.introCardIds||[]){const e=events.find(x=>x.id===id);if(e&&!used.has(e.id))chosen.push({type:'event',entry:e});}}
  else {
    const scheduledId=expedition?.trainerPlan?.scheduledByDepth?.[String(depth)],trainer=scheduledId?(bogTrainers?.entries||[]).find(t=>t.id===scheduledId):null;if(trainer&&!shown.has(trainer.id))chosen.push({type:'trainer',entry:trainer});
    const candidates=eligibleEvents(events,used,depth);
    if(pressure>=3&&chosen.length<count){const e=chooseEvent(candidates,pressure,rng,{requireHaunting:true});if(e)chosen.push({type:'event',entry:e});}
    if(pressure>=2&&chosen.length<count&&!chosen.some(c=>c.entry?.fogTouched)){const remaining=candidates.filter(e=>!chosen.some(c=>c.type==='event'&&c.entry.id===e.id));const e=chooseEvent(remaining,pressure,rng,{requireFog:true});if(e)chosen.push({type:'event',entry:e});}
    while(chosen.length<count){const available=candidates.filter(e=>!chosen.some(c=>c.type==='event'&&c.entry.id===e.id));if(!available.length)break;const e=chooseEvent(available,pressure,rng);chosen.push({type:'event',entry:e});}
  }
  if(chosen.length!==count)throw new Error(`Bog event authority cannot supply ${count} unique cards at Depth ${depth}.`);
  for(let i=chosen.length-1;i>0;i--){const j=Math.floor(unit(rng)*(i+1));[chosen[i],chosen[j]]=[chosen[j],chosen[i]];}
  const cards=chosen.map((c,i)=>c.type==='trainer'?cardFromTrainer(c.entry,runId,depth,i+1,rng):cardFromEvent(c.entry,runId,depth,i+1,rng));
  for(const c of chosen){if(c.type==='trainer')shown.add(c.entry.id);else used.add(c.entry.id);}
  return{cards,usedEventIds:[...used],shownTrainerIds:[...shown],majorHauntingOffered:pressure>=3&&cards.some(c=>c.majorHaunting)};
}
