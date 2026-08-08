function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function randint(min,max,rng){return Math.floor(unit(rng)*(max-min+1))+min;}
function pickOne(list,rng){return list.length?list[Math.floor(unit(rng)*list.length)]:null;}
function weightedPick(entries,weightOf,rng){
  if(!entries.length)return null; const weights=entries.map(e=>Math.max(0,Number(weightOf(e)||0))); const total=weights.reduce((a,b)=>a+b,0);
  if(total<=0)return pickOne(entries,rng); let roll=unit(rng)*total;
  for(let i=0;i<entries.length;i++){roll-=weights[i];if(roll<0)return entries[i];}
  return entries.at(-1);
}
function uniqueStrings(values){return [...new Set((values||[]).filter(Boolean).map(String))];}

export function planForestTrainerRoster({forestTrainers,activeVesselBaseClass=null,partyBaseClasses=[],unlockedSubclasses=[],forcedTrainerIds=[],rng=Math.random}={}){
  const allEntries=forestTrainers?.entries||[]; const entries=activeVesselBaseClass?allEntries.filter(t=>t.baseClass===activeVesselBaseClass):allEntries;
  if(!entries.length)return {activeTrainerIds:[],anchorTrainerIds:[],scheduledByDepth:{},partyBaseClasses:uniqueStrings(partyBaseClasses),activeVesselBaseClass:activeVesselBaseClass||null,rosterSize:0};
  const rules=forestTrainers?.rules||{}; const min=Math.max(0,Number(rules.activeRosterMin||6)),max=Math.max(min,Number(rules.activeRosterMax||8));
  const desired=Math.min(entries.length,randint(min,max,rng)); const party=uniqueStrings(partyBaseClasses); const unlocked=new Set(unlockedSubclasses||[]);
  const selected=uniqueStrings(forcedTrainerIds).filter(id=>entries.some(t=>t.id===id)).slice(0,desired); const anchors=[];
  // Runtime campaigns always provide activeVesselBaseClass, which hard-filters offers to that class.
  // The no-active-class utility path retains the sealed I22 planner contract for diagnostic/test callers.
  if(activeVesselBaseClass){
    if(unit(rng)<Number(rules.matchingBaseClassAnchorChancePct||95)/100){
      let candidates=entries.filter(t=>!selected.includes(t.id)); const locked=candidates.filter(t=>!unlocked.has(t.subclass)); if(locked.length)candidates=locked;
      const chosen=pickOne(candidates,rng); if(chosen){selected.push(chosen.id);anchors.push(chosen.id);}
    }
  }else{
    for(const baseClass of party){
      if(unit(rng)>=Number(rules.matchingBaseClassAnchorChancePct||95)/100)continue;
      let candidates=entries.filter(t=>t.baseClass===baseClass&&!selected.includes(t.id)); if(!candidates.length)continue;
      const locked=candidates.filter(t=>!unlocked.has(t.subclass)); if(locked.length)candidates=locked;
      const chosen=pickOne(candidates,rng); if(chosen){selected.push(chosen.id);anchors.push(chosen.id);}
    }
  }
  while(selected.length<desired){
    const candidates=entries.filter(t=>!selected.includes(t.id)); if(!candidates.length)break;
    const chosen=weightedPick(candidates,t=>{let w=activeVesselBaseClass?1:(party.includes(t.baseClass)?Number(rules.matchingFamilyWeight||4):1);if(!unlocked.has(t.subclass))w*=1.25;return w;},rng); selected.push(chosen.id);
  }
  const byId=new Map(entries.map(t=>[t.id,t])); const scheduledByDepth={}; const usedDepths=new Set();
  const earlyCandidates=selected.map(id=>byId.get(id)).filter(t=>Number(t.minDepth||3)<=14&&Number(t.maxDepth||29)>=3);
  const earlyTarget=Math.min(earlyCandidates.length,randint(2,3,rng)); const earlyIds=[];
  const priorityEarly=[...earlyCandidates].sort((a,b)=>(anchors.includes(b.id)?1:0)-(anchors.includes(a.id)?1:0));
  while(earlyIds.length<earlyTarget&&priorityEarly.length){const i=Math.floor(unit(rng)*priorityEarly.length);earlyIds.push(priorityEarly.splice(i,1)[0].id);}
  const assign=(id,preferEarly=false)=>{
    const t=byId.get(id); if(!t)return; let depths=[];
    for(let d=Math.max(3,Number(t.minDepth||3));d<=Math.min(29,Number(t.maxDepth||29));d++){if(d===15||d===30||usedDepths.has(d))continue;if(preferEarly&&d>14)continue;if(!preferEarly&&!earlyIds.includes(id)&&d<16)continue;depths.push(d);}
    if(!depths.length){for(let d=Math.max(3,Number(t.minDepth||3));d<=Math.min(29,Number(t.maxDepth||29));d++)if(d!==15&&d!==30&&!usedDepths.has(d))depths.push(d);}
    const depth=pickOne(depths,rng); if(depth!=null){usedDepths.add(depth);scheduledByDepth[String(depth)]=id;}
  };
  for(const id of earlyIds)assign(id,true); for(const id of selected)if(!earlyIds.includes(id))assign(id,false);
  return {activeTrainerIds:selected,anchorTrainerIds:anchors,scheduledByDepth,partyBaseClasses:party,activeVesselBaseClass:activeVesselBaseClass||null,rosterSize:selected.length};
}

function cardFromEvent(event,runId,depth,ordinal,rng){
  return {id:`${runId}-d${depth}-c${ordinal}-${Math.floor(unit(rng)*0xffffff).toString(36).padStart(5,'0')}`,ordinal,depth,eventId:event.id,kind:event.kind,label:event.label,description:event.description,combat:Boolean(event.combat||event.kind==='combat'),noncombat:!(event.combat||event.kind==='combat'),trainer:false,check:event.check?clone(event.check):null,checkmark:Boolean(event.checkmark),eventPayload:{success:clone(event.success||{}),failure:clone(event.failure||{}),criticalSuccess:clone(event.criticalSuccess||{}),criticalFailure:clone(event.criticalFailure||{})}};
}
function cardFromTrainer(trainer,runId,depth,ordinal,rng){
  return {id:`${runId}-d${depth}-c${ordinal}-${Math.floor(unit(rng)*0xffffff).toString(36).padStart(5,'0')}`,ordinal,depth,eventId:`trainer:${trainer.id}`,kind:'trainer',label:`Trainer — ${trainer.name}`,description:`${trainer.description} They teach ${trainer.subclass}, a ${trainer.baseClass} subclass.`,combat:false,noncombat:true,trainer:true,trainerId:trainer.id,subclass:trainer.subclass,baseClass:trainer.baseClass,check:null,checkmark:false};
}

export function createForestEventCards({runId,depth,forestEvents,forestTrainers,expedition,rng=Math.random}={}){
  const count=3; const events=forestEvents?.events||[]; const used=new Set(expedition?.usedEventIds||[]); const shown=new Set(expedition?.shownTrainerIds||[]);
  const firstIntro=Boolean(expedition?.firstEverIntro&&depth===1);
  let chosen=[];
  if(firstIntro){
    for(const id of forestEvents?.introCardIds||[]){const e=events.find(x=>x.id===id);if(e&&!used.has(e.id))chosen.push({type:'event',entry:e});}
  }else{
    const scheduledId=expedition?.trainerPlan?.scheduledByDepth?.[String(depth)];
    const trainer=scheduledId?(forestTrainers?.entries||[]).find(t=>t.id===scheduledId):null;
    if(trainer&&!shown.has(trainer.id))chosen.push({type:'trainer',entry:trainer});
    const candidates=events.filter(e=>!e.introOnly&&!used.has(e.id)&&depth>=Number(e.minDepth||1)&&depth<=Number(e.maxDepth||29));
    while(chosen.length<count){
      const available=candidates.filter(e=>!chosen.some(c=>c.type==='event'&&c.entry.id===e.id)); if(!available.length)break;
      const e=weightedPick(available,x=>Number(x.weight||1),rng); chosen.push({type:'event',entry:e});
    }
  }
  if(chosen.length!==count)throw new Error(`Forest event authority cannot supply ${count} unique cards at Depth ${depth}.`);
  // Shuffle the forced Trainer/intro positions while preserving unique content.
  for(let i=chosen.length-1;i>0;i--){const j=Math.floor(unit(rng)*(i+1));[chosen[i],chosen[j]]=[chosen[j],chosen[i]];}
  const cards=chosen.map((c,i)=>c.type==='trainer'?cardFromTrainer(c.entry,runId,depth,i+1,rng):cardFromEvent(c.entry,runId,depth,i+1,rng));
  for(const c of chosen){if(c.type==='trainer')shown.add(c.entry.id);else used.add(c.entry.id);}
  return {cards,usedEventIds:[...used],shownTrainerIds:[...shown]};
}
