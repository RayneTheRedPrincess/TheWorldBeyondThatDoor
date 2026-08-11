function alive(a){return Number(a?.resources?.hp||0)>0;}
function append(combat,entry){combat.log=combat.log||[];combat.log.push({...entry,at:new Date().toISOString()});}
export function resolveScriptedEnemyLethal(combat,target){
 if(!target||target.side!=='enemy'||alive(target))return{handled:false,revived:false};
 const revival=target.enemyAi?.revival;
 if(revival?.kind==='divine-anchor'){
   const used=Math.max(0,Number(revival.revivalsUsed||0)),charges=Math.max(0,Number(revival.charges||0));
   if(used<charges){
     const nextUsed=used+1;revival.revivalsUsed=nextUsed;revival.chargesRemaining=Math.max(0,charges-nextUsed);
     revival.originalMaxHp=Math.max(1,Number(revival.originalMaxHp||target.resources?.maxHp||1));
     const hpPcts=revival.hpPctByLife||[100,90,80,70],pct=Number(hpPcts[nextUsed]??Math.max(10,100-nextUsed*10));
     target.resources.maxHp=Math.max(1,Math.round(revival.originalMaxHp*pct/100));target.resources.hp=target.resources.maxHp;
     target.resources.energy=Math.min(Number(target.resources.maxEnergy||7),Number(target.resources.energy||0)+Number(revival.energyGainPerRevival||2));
     const dmg=Math.max(0,Number(revival.damagePctPerRevival||10));
     target.effects=target.effects||[];
     target.effects.push({id:`divine-reconstitution-${nextUsed}`,sourceActorId:target.id,negative:false,removable:false,modifiers:{finalDamagePct:dmg},memory:{statusKind:'Divine Reconstitution',revival:nextUsed,permanent:true}});
     const names=revival.unlockNames||[],unlockName=names[nextUsed-1]||`Revelation ${nextUsed}`;
     target.effects.push({id:`divine-revelation-${nextUsed}`,sourceActorId:target.id,negative:false,removable:false,modifiers:{},memory:{statusKind:unlockName,revivalUnlock:nextUsed,permanent:true}});
     append(combat,{type:'enemy-revival',actorId:target.id,name:target.name,revival:nextUsed,livesRemaining:Math.max(1,charges-nextUsed+1),maxHp:target.resources.maxHp,damageBuffPct:nextUsed*dmg,energy:target.resources.energy,unlockName});
     return{handled:true,revived:true,revivalsUsed:nextUsed};
   }
 }
 if(target.enemyTemplateId==='aureofrost-colossus-body'){
   for(const actor of combat.actors||[])if(actor.side==='enemy'&&['aureofrost-left-arm','aureofrost-right-arm'].includes(actor.enemyTemplateId)&&alive(actor))actor.resources.hp=0;
   append(combat,{type:'colossus-shutdown',actorId:target.id,name:target.name});
   return{handled:true,revived:false,cascade:true};
 }
 target.combatMemory=target.combatMemory||{};
 if(target.enemyAi?.shadowPartyClone===true&&!target.combatMemory.finalShadowCloneLethalHandled){
   target.combatMemory.finalShadowCloneLethalHandled=true;
   const remaining=(combat.actors||[]).filter(a=>a.enemyAi?.shadowPartyClone===true&&alive(a));
   if(!remaining.length){
     const mirror=(combat.actors||[]).find(a=>a.enemyTemplateId==='broken-mirror'&&alive(a));
     if(mirror){
       mirror.effects=(mirror.effects||[]).filter(e=>e.id!=='broken-mirror-clone-ward'&&!e?.memory?.mirrorCloneWard);
       mirror.combatMemory=mirror.combatMemory||{};mirror.combatMemory.mirrorProtectedByClones=false;
       append(combat,{type:'broken-mirror-clone-ward-shattered',actorId:mirror.id,name:mirror.name});
     }
   }
   return{handled:true,revived:false};
 }
 if(target.enemyTemplateId==='broken-mirror'){
   const livingClones=(combat.actors||[]).filter(a=>a.enemyAi?.shadowPartyClone===true&&alive(a));
   if(livingClones.length){target.resources.hp=1;append(combat,{type:'broken-mirror-ward-holds',actorId:target.id,clonesRemaining:livingClones.length});return{handled:true,revived:true,warded:true};}
   const forms=Array.isArray(target.combatMemory?.mirrorForms)?target.combatMemory.mirrorForms:[];
   const current=Math.max(0,Number(target.combatMemory?.mirrorFormIndex||0));
   if(current<forms.length-1){
     const nextIndex=current+1,form=forms[nextIndex]||{};
     target.combatMemory.mirrorFormIndex=nextIndex;target.combatMemory.currentMirrorForm=form.id||`form-${nextIndex+1}`;
     target.name=`The Broken Mirror — ${String(form.name||'Shadow Form').replace(/^Shadow\s+/,'')}`;
     target.stats={...(form.stats||target.stats||{})};target.basicAttack={...(form.basicAttack||target.basicAttack||{})};
     target.enemyAbilities=(form.abilities||[]).map(a=>({...a}));target.abilityIds=(form.abilities||[]).map(a=>a.id);target.resistances={...(form.resistances||{})};
     target.enemyAi={...(target.enemyAi||{}),currentMirrorForm:form.id||null,affinities:[...new Set((form.abilities||[]).flatMap(a=>(a.components||[]).filter(c=>c.type==='damage').map(c=>c.damageType)).filter(Boolean))]};
     const base=Math.max(1,Number(target.combatMemory.mirrorBaseMaxHp||target.resources?.maxHp||1)),pct=Math.max(10,Number(form.maxHpPct||100));
     target.resources.maxHp=Math.max(1,Math.round(base*pct/100));target.resources.hp=target.resources.maxHp;target.resources.energy=0;target.resources.shield=0;target.resources.shieldLayers=[];
     target.cooldowns={};
     target.effects=(target.effects||[]).filter(e=>e.negative===true);
     append(combat,{type:'broken-mirror-form-shift',actorId:target.id,formIndex:nextIndex,formId:form.id||null,formName:form.name||null,maxHp:target.resources.maxHp});
     return{handled:true,revived:true,mirrorFormShift:true,formIndex:nextIndex};
   }
   append(combat,{type:'broken-mirror-shattered-finally',actorId:target.id,name:target.name,finalForm:forms[current]?.id||'ossuary-king'});
   return{handled:true,revived:false,finalMirrorDefeat:true};
 }
 if(target.enemyTemplateId==='nightblood-charger'&&!target.combatMemory.plainsLethalHandled){target.combatMemory.plainsLethalHandled=true;const rider=(combat.actors||[]).find(a=>a.enemyTemplateId==='lord-varrek'&&alive(a));if(rider){rider.combatMemory=rider.combatMemory||{};rider.combatMemory.dismounted=true;rider.effects=(rider.effects||[]).filter(e=>e?.memory?.redirectTo!==target.id);rider.effects.push({id:'varrek-dismounted-rage',sourceActorId:rider.id,negative:false,removable:false,modifiers:{finalDamagePct:18,lifestealPct:8},memory:{statusKind:'Dismounted Bloodrage',permanent:true},duration:null});append(combat,{type:'plains-dismount',actorId:rider.id,mountId:target.id,name:rider.name});}return{handled:true,revived:false};}
 if(target.enemyTemplateId==='lord-varrek'&&!target.combatMemory.plainsLethalHandled){target.combatMemory.plainsLethalHandled=true;for(const actor of combat.actors||[])if(actor.enemyTemplateId==='nightblood-charger'&&alive(actor))actor.resources.hp=0;append(combat,{type:'plains-warlord-fallen',actorId:target.id,name:target.name});return{handled:true,revived:false,cascade:true};}
 if(['tenairah-crimson-root','tenairah-sable-root','tenairah-crown-root'].includes(target.enemyTemplateId)&&!target.combatMemory.plainsLethalHandled){target.combatMemory.plainsLethalHandled=true;const sovereign=(combat.actors||[]).find(a=>a.enemyTemplateId==='tenairah'&&alive(a));if(sovereign){sovereign.effects=(sovereign.effects||[]).filter(e=>e.id!==`tenairah-smoke-${target.enemyTemplateId}`&&e.sourceActorId!==target.id);append(combat,{type:'tenairah-root-severed',actorId:target.id,sovereignId:sovereign.id,rootTemplateId:target.enemyTemplateId,dodgeSmokeRemovedPct:25});}return{handled:true,revived:false};}
 if(target.enemyTemplateId==='tenairah'&&!target.combatMemory.plainsLethalHandled){target.combatMemory.plainsLethalHandled=true;for(const actor of combat.actors||[])if(['tenairah-crimson-root','tenairah-sable-root','tenairah-crown-root'].includes(actor.enemyTemplateId)&&alive(actor))actor.resources.hp=0;append(combat,{type:'tenairah-fallen',actorId:target.id,name:target.name});return{handled:true,revived:false,cascade:true};}
 if(target.enemyTemplateId==='leviathan-central-head'&&!target.combatMemory.dragonLethalHandled){target.combatMemory.dragonLethalHandled=true;for(const actor of combat.actors||[])if(actor.id!==target.id&&String(actor.enemyTemplateId||'').startsWith('leviathan-')&&alive(actor)){actor.combatMemory=actor.combatMemory||{};actor.combatMemory.leviathanCascadeKilled=true;actor.resources.hp=0;}append(combat,{type:'leviathan-wyrm-collapse',actorId:target.id,name:target.name});return{handled:true,revived:false,cascade:true};}
 if(target.enemyTemplateId==='vicar-malrec-bone-tithe'&&!target.combatMemory.necropolisLethalHandled){target.combatMemory.necropolisLethalHandled=true;for(const actor of combat.actors||[])if(String(actor.enemyTemplateId||'').startsWith('executioner-tithe-skeleton-')&&alive(actor)){actor.combatMemory=actor.combatMemory||{};actor.combatMemory.necropolisCascadeKilled=true;actor.resources.hp=0;}append(combat,{type:'necropolis-executioner-fallen',actorId:target.id,name:target.name});return{handled:true,revived:false,cascade:true};}
 if(String(target.enemyTemplateId||'').startsWith('royal-ossuary-')&&!target.combatMemory.necropolisLethalHandled){target.combatMemory.necropolisLethalHandled=true;const king=(combat.actors||[]).find(a=>a.enemyTemplateId==='ossuary-king'&&alive(a));if(king){const map={'royal-ossuary-bone-armor':'ossuary-bone-armor','royal-ossuary-many-limbs':'ossuary-many-limbs','royal-ossuary-arsenal':'ossuary-royal-arsenal'},effectId=map[target.enemyTemplateId];king.effects=(king.effects||[]).filter(e=>e.id!==effectId&&e.sourceActorId!==target.id);if(target.enemyTemplateId==='royal-ossuary-bone-armor'){king.resources.shieldLayers=(king.resources.shieldLayers||[]).filter(l=>l.sourceActorId!==target.id);king.resources.shield=(king.resources.shieldLayers||[]).reduce((n,l)=>n+Math.max(0,Number(l.amount||0)),0);}append(combat,{type:'royal-ossuary-destroyed',actorId:target.id,kingId:king.id,removedEffectId:effectId});}return{handled:true,revived:false};}
 if(target.enemyTemplateId==='ossuary-king'&&!target.combatMemory.necropolisLethalHandled){target.combatMemory.necropolisLethalHandled=true;for(const actor of combat.actors||[])if(String(actor.enemyTemplateId||'').startsWith('royal-ossuary-')&&alive(actor)){actor.combatMemory=actor.combatMemory||{};actor.combatMemory.ossuaryCascadeKilled=true;actor.resources.hp=0;}append(combat,{type:'ossuary-king-fallen',actorId:target.id,name:target.name});return{handled:true,revived:false,cascade:true};}
 return{handled:false,revived:false};
}
export function resolveAllScriptedEnemyLethals(combat){for(const actor of combat?.actors||[])if(actor.side==='enemy'&&!alive(actor))resolveScriptedEnemyLethal(combat,actor);return combat;}

const SEREVAKH_SINS=['Pride','Greed','Lust','Envy','Gluttony','Wrath','Sloth'];
function randomUnit(rng){const n=Number(rng());return Number.isFinite(n)?Math.max(0,Math.min(.999999999,n)):0;}
function shuffle(values,rng){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(randomUnit(rng)*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function removeEnvyBorrow(actor){const mem=actor?.combatMemory||{};const stat=mem.envyCopiedStat,value=Number(mem.envyCopiedValue||0);if(stat&&value&&actor.stats)actor.stats[stat]=Math.max(0,Number(actor.stats[stat]||0)-value);delete mem.envyCopiedStat;delete mem.envyCopiedValue;}
function applyEnvyBorrow(combat,actor){const party=(combat?.actors||[]).filter(a=>a.side==='party'&&alive(a));let best=null;for(const target of party){for(const stat of ['STR','DEX','CON','INT','FTH','CHA','LCK']){const value=Number(target.stats?.[stat]||0);if(!best||value>best.value)best={stat,value,targetId:target.id};}}if(!best||best.value<=0)return;const copied=Math.max(1,Math.round(best.value*.4));actor.stats=actor.stats||{};actor.stats[best.stat]=Number(actor.stats[best.stat]||0)+copied;actor.combatMemory.envyCopiedStat=best.stat;actor.combatMemory.envyCopiedValue=copied;actor.combatMemory.envyCopiedFrom=best.targetId;}
function sinLabelEffect(actor,sin){actor.effects=actor.effects||[];actor.effects=actor.effects.filter(e=>!String(e.id||'').startsWith('serevakh-sin-'));actor.effects.push({id:`serevakh-sin-${sin.toLowerCase()}`,sourceActorId:actor.id,negative:false,removable:false,modifiers:{},memory:{statusKind:`Sin — ${sin}`,sinForm:sin,permanent:true},duration:null});}
export function advanceSerevakhSin(combat,actor,{rng=Math.random}={}){
 if(!combat||actor?.enemyTemplateId!=='serevakh-sevenfold-regent'||!alive(actor))return null;
 actor.combatMemory=actor.combatMemory||{};removeEnvyBorrow(actor);
 let deck=Array.isArray(actor.combatMemory.sinDeck)?[...actor.combatMemory.sinDeck]:[];
 const current=String(actor.combatMemory.currentSin||'Pride');
 if(!deck.length){
   if(Number(actor.combatMemory.sinCycleNumber||1)===1&&current==='Pride'&&(actor.combatMemory.sinCycleSeen||[]).length<=1) deck=shuffle(SEREVAKH_SINS.filter(x=>x!=='Pride'),rng);
   else {actor.combatMemory.sinCycleNumber=Math.max(1,Number(actor.combatMemory.sinCycleNumber||1))+1;deck=shuffle(SEREVAKH_SINS,rng);}
 }
 const nextSin=deck.shift()||'Pride';actor.combatMemory.sinDeck=deck;actor.combatMemory.currentSin=nextSin;
 actor.combatMemory.sinCycleSeen=[...new Set([...(actor.combatMemory.sinCycleSeen||[]),nextSin])];
 if(nextSin==='Envy')applyEnvyBorrow(combat,actor);sinLabelEffect(actor,nextSin);
 append(combat,{type:'serevakh-sin-shift',actorId:actor.id,name:actor.name,fromSin:current,toSin:nextSin,cycle:Number(actor.combatMemory.sinCycleNumber||1)});
 return nextSin;
}
