import { getCombatActor, getAbilityCooldown, setAbilityCooldown, addCombatEffect, grantCombatShield, pendingEnergyCostAdd, consumeNextEnergyCostEffects, appendCombatLog, finalizeCombatOutcome } from './combat-controller.js';
import { keptEnergyCost, keptCooldown, keptHpCostPct, keptDamageType, keptScaling } from './kept-impression-state.js';
import { keptBeforeAction, keptEnergySpent, keptAfterLifesteal, keptOnPositiveRemoved } from './kept-impression-runtime.js';
import { resolveDamageComponent, resolveHealComponent, resolveShieldComponent, resolvePercentOfActualDamageHeal, applyStatus, getActorDerivedCombatStats } from './combat-resolution.js';
import { gainResource, resourceValue, setResourceValue } from './base-class-state.js';
import { triggerAbilityUseResource, triggerOnDamage, triggerOnSupport, triggerOnDebuff } from './ability-controller.js';
import {
  isSubclassResourceActive, subclassResourceValue, gainSubclassResource, setSubclassResource, spendSubclassResource,
  addCollectionResource, clearCollectionResource, advanceFacet, advanceFlux, gainMorph, placeTrailmark, placeNode, placeConduit,
  placeSeal, addGlyph, consumeGlyphs, setMeasured, setJudged, fractureOath, restoreOath, recordSubclassDebuffApplied,
  recordSubclassMultiAllyEffect, recordSubclassEnergySpend
} from './subclass-state.js';

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function alive(a){return Number(a?.resources?.hp||0)>0;}
function abilityList(c){return Array.isArray(c?.abilities)?c.abilities:Array.isArray(c)?c:[];}
export function findSubclassAbility(catalog,id){return abilityList(catalog).find(a=>a.id===id)||null;}
export function subclassAbilityIdsForSubclass(catalog,subclass,{level=99}={}){return abilityList(catalog).filter(a=>a.subclass===subclass&&Number(a.level||0)<=Number(level||0)).sort((a,b)=>a.slot-b.slot).map(a=>a.id);}

function actorHasAbility(actor,ability){
  if(actor?.subclass===ability?.subclass)return true;
  return Array.isArray(actor?.subclassAbilityIds)&&actor.subclassAbilityIds.includes(ability?.id);
}
function targetResource(actor,ability,targets){
  const name=ability?.resourceCost?.resource;
  if(name&&actor?.classState?.resource?.name===name)return resourceValue(actor);
  if(['Veil Imprints','Fractures'].includes(name))return subclassResourceValue(actor,null,targets?.primary);
  return subclassResourceValue(actor);
}
function actualResourceCost(actor,ability,targets){
  const req=ability?.resourceCost;if(!req)return {ok:true,required:0,available:0};
  const available=targetResource(actor,ability,targets);
  if(req.amount==='all')return {ok:true,required:available,available};
  const required=Math.max(0,Number(req.amount||0));return {ok:available>=required,required,available};
}
function intrinsicEnergyCost(actor,ability){
  let cost=Math.max(0,Number(ability?.energyCost||0));
  // Collapse's -1 Energy is part of the active Fluxwrought subclass passive. Classless Resource Imprints do not inherit it.
  if(actor?.subclass==='Fluxwrought'&&ability?.subclass==='Fluxwrought'&&actor.subclassState?.flux==='Collapse')cost=Math.max(0,cost-1);
  // White-Hot's printed extra Energy cost is part of BrandBlade's actual passive.
  const damaging=(ability?.components||[]).some(c=>c.type==='damage');
  if(actor?.subclass==='BrandBlade'&&ability?.subclass==='BrandBlade'&&damaging&&Number(actor.subclassState?.heat||0)>=5)cost+=1;
  return cost;
}
function effectiveEnergyCost(actor,ability){
  const intrinsic=intrinsicEnergyCost(actor,ability);
  return keptEnergyCost(actor,ability,intrinsic+pendingEnergyCostAdd(actor,intrinsic));
}
function legalTargets(combat,source,mode){
  const friendly=(combat.actors||[]).filter(a=>a.side===source.side&&alive(a));
  const hostile=(combat.actors||[]).filter(a=>a.side!==source.side&&alive(a));
  if(mode==='single-enemy')return hostile;
  if(mode==='single-ally')return friendly.filter(a=>a.id!==source.id);
  if(mode==='ally-or-self')return friendly;
  if(mode==='self')return [source];
  return [];
}
function weaponOk(actor,ability){const req=ability?.requirements?.weaponTypes;if(!Array.isArray(req)||!req.length)return true;return req.includes(actor?.weaponType);}
export function getSubclassAbilityAvailability(combat,actorId,ability,{targets={}}={}){
  const actor=getCombatActor(combat,actorId);
  if(!actor||!alive(actor))return {ok:false,reason:'The combatant cannot act.'};
  if(!ability)return {ok:false,reason:'Unknown subclass ability.'};
  if(!actorHasAbility(actor,ability))return {ok:false,reason:'This combatant does not know that subclass ability.'};
  if(Number(actor.level||0)<Number(ability.level||0))return {ok:false,reason:`Unlocks at Character Level ${ability.level}.`};
  const cd=getAbilityCooldown(combat,actor.id,ability.id);if(cd>0)return {ok:false,reason:`Cooldown: ${cd} turn(s) remaining.`};
  if(!weaponOk(actor,ability))return {ok:false,reason:`Requires ${ability.requirements.weaponTypes.join(' or ')}.`};
  const energyCost=effectiveEnergyCost(actor,ability);if(Number(actor.resources?.energy||0)<energyCost)return {ok:false,reason:`Requires ${energyCost} Energy.`};
  const res=actualResourceCost(actor,ability,targets);if(!res.ok)return {ok:false,reason:`Requires ${res.required} ${ability.resourceCost.resource}.`};
  if(Number(ability.hpCostPctCurrent||0)>0&&Number(actor.resources?.hp||0)<=0)return {ok:false,reason:'Not enough HP.'};
  if(['single-enemy','single-ally','ally-or-self'].includes(ability.targetMode)){
    const id=targets.primary;if(!id||!legalTargets(combat,actor,ability.targetMode).some(a=>a.id===id))return {ok:false,reason:'Choose a legal target.'};
  }
  return {ok:true,energyCost,resourceAvailable:res.available,resourceRequired:res.required};
}

function durationTurns(owner,turns){return {mode:'actor-turn-end',actorId:owner.id,remaining:Number(turns),appliedTurn:Number(owner.turnControl?.turnsStarted||0)};}
function untilOwnTurn(actor){return {mode:'actor-turn-start',actorId:actor.id};}
function status(combat,target,source,id,modifiers,{turns=null,untilSourceTurn=false,negative=false,memory={},stacking='refresh',removable=true}={}){
  return applyStatus(combat,target.id,{id,sourceActorId:source.id,negative,removable,modifiers,duration:untilSourceTurn?untilOwnTurn(source):turns?durationTurns(target,turns):null,memory,stacking});
}
function livingAllies(combat,actor){return (combat.actors||[]).filter(a=>a.side===actor.side&&alive(a));}
function livingEnemies(combat,actor){return (combat.actors||[]).filter(a=>a.side!==actor.side&&alive(a));}
function lowestHp(list){return [...list].sort((a,b)=>(a.resources.hp/a.resources.maxHp)-(b.resources.hp/b.resources.maxHp)||a.id.localeCompare(b.id))[0]||null;}
function componentTargets(combat,actor,ability,component,targets){
  if(component.targetKey==='self')return [actor];
  if(component.targetKey==='primary')return [targets.primary?getCombatActor(combat,targets.primary):null].filter(Boolean);
  if(component.targetKey==='secondary'){const chosen=targets.secondary?getCombatActor(combat,targets.secondary):null;if(chosen&&alive(chosen))return [chosen];const hostile=livingEnemies(combat,actor);const other=hostile.find(a=>a.id!==targets.primary);return [other||getCombatActor(combat,targets.primary)].filter(Boolean);}
  if(component.targetKey==='two-lowest-real-allies')return livingAllies(combat,actor).filter(a=>a.real).sort((a,b)=>(a.resources.hp/a.resources.maxHp)-(b.resources.hp/b.resources.maxHp)||a.id.localeCompare(b.id)).slice(0,2);
  if(component.targetKey==='trailmarked-allies')return livingAllies(combat,actor).filter(a=>actor.subclassState?.trailmarks?.includes(a.id));
  if(component.targetKey==='conducted-enemies')return livingEnemies(combat,actor).filter(a=>actor.subclassState?.conduits?.some(x=>(x?.targetId||x)===a.id));
  if(component.targetKey==='other-conducted')return livingEnemies(combat,actor).filter(a=>a.id!==targets.primary&&actor.subclassState?.conduits?.some(x=>(x?.targetId||x)===a.id)).slice(0,1);
  if(component.targetKey==='enemy-nodes')return livingEnemies(combat,actor).filter(a=>actor.subclassState?.nodes?.includes(a.id));
  if(component.targetKey==='ally-nodes')return livingAllies(combat,actor).filter(a=>actor.subclassState?.nodes?.includes(a.id));
  if(ability.targetMode==='all-enemies')return livingEnemies(combat,actor);
  if(ability.targetMode==='all-allies')return livingAllies(combat,actor);
  if(ability.targetMode==='self')return [actor];
  return [targets.primary?getCombatActor(combat,targets.primary):null].filter(Boolean);
}
function chosenGlyphsForAbility(actor,ability,choices={}){
  const glyphs=[...(actor?.subclassState?.glyphs||[])];if(!glyphs.length)return [];
  if(ability.name==='Grand Rewrite')return glyphs.slice(0,3);
  const max=ability.name==='Shifted Lance'?1:ability.name==='Morphline'?2:0;if(!max)return [];
  const requested=Math.max(0,Math.min(max,Number(choices.consumeGlyphCount||0)));return glyphs.slice(0,requested);
}
function glyphBonuses(glyphs,{enhanced=false}={}){const edge=glyphs.filter(g=>g==='Edge').length,echo=glyphs.filter(g=>g==='Echo').length,veil=glyphs.filter(g=>g==='Veil').length;return {finalDamagePct:edge*(enhanced?15:8),echoPct:echo*(enhanced?20:12),dodgePct:veil*(enhanced?12:8)};}
function pendingNextSubclassCritEffects(actor,ability){
  if(!(ability?.components||[]).some(c=>c.type==='damage'))return [];
  return (actor.effects||[]).filter(effect=>Number(effect?.memory?.nextSubclassCrit||0)>0&&(!effect.memory.subclass||effect.memory.subclass===ability.subclass));
}
function consumePendingNextSubclassCritEffects(actor,effects){if(!effects?.length)return;const set=new Set(effects);actor.effects=(actor.effects||[]).filter(e=>!set.has(e));}
function prismaticFacetBonuses(actor,ability){
  if(ability?.subclass!=='Prismatic Palm'||!(ability.components||[]).some(c=>c.type==='damage'))return {finalDamagePct:0,critChanceBonus:0,lumen:false,facet:null};
  // White Palm's three facet benefits are printed on the ability itself, so Classless keeps them too.
  if(ability.name==='White Palm')return {finalDamagePct:12,critChanceBonus:15,lumen:true,facet:'White'};
  const canUseFacet=actor?.subclass==='Prismatic Palm'||actor?.resourceImprint?.subclass==='Prismatic Palm';
  if(!canUseFacet)return {finalDamagePct:0,critChanceBonus:0,lumen:false,facet:null};
  const facet=actor.subclassState?.facet||'Ember';return {finalDamagePct:facet==='Ember'?12:0,critChanceBonus:facet==='Storm'?15:0,lumen:facet==='Lumen',facet};
}
function preDamageSpecial(actor,target,ability,preResource,hitIndex=0,{nextCritBonus=0}={}){
  const name=ability.name;const out={finalDamagePct:0,critChanceBonus:0,critDamageBonus:0,unblockable:false,ignoreShields:false,blockChanceMultiplier:1};
  const hpPct=Number(actor.resources?.maxHp||0)>0?Number(actor.resources.hp||0)/Number(actor.resources.maxHp)*100:100;
  out.critChanceBonus+=Number(nextCritBonus||0);
  const prism=prismaticFacetBonuses(actor,ability);out.finalDamagePct+=prism.finalDamagePct;out.critChanceBonus+=prism.critChanceBonus;
  if(name==='Splintering Hew'){};
  if(name==='Reckless Advance')out.critChanceBonus+=15;
  if(name==='Break the Limit')out.finalDamagePct+=12*Number(actor.subclassState?.overpressure||0);
  if(name==='Runebreak'&&Number(target.resources?.shield||0)>0)out.finalDamagePct+=25;
  if(name==='Whitebrand Arc')out.finalDamagePct+=8*preResource;
  if(name==='Quickdraw'&&!actor.subclassState?.turnFlags?.gunslingerDamagingAction)out.critChanceBonus+=10;
  if(name==='Called Shot'&&(target.effects||[]).some(e=>e.id==='gunslinger-sighted'&&e.sourceActorId===actor.id))out.critChanceBonus+=15;
  if(name==='Redline Execution')out.finalDamagePct+=10*preResource;
  if(name==='Shadow Through'&&subclassResourceValue(actor,null,target.id)>=3)out.unblockable=true;
  if(name==='Erase the Mark')out.finalDamagePct+=12*preResource;
  if(name==='Open Vein')out.critDamageBonus+=20;
  if(name==='Heartbreaker'&&hpPct<50)out.finalDamagePct+=20;
  if(name==='Crimson Reprisal'&&hpPct<50)out.unblockable=true;
  if(actor.subclass==='AdaptedFist'&&ability.subclass==='AdaptedFist'&&['Answering Strike'].includes(name)){
    if(actor.subclassState?.adaptation==='Flow')out.critChanceBonus+=15;
    if(actor.subclassState?.adaptation==='Grit')out.finalDamagePct+=20;
  }
  if(name==='Counterform'&&actor.subclassState?.adaptation==='Flow')out.critChanceBonus+=25;
  if(name==='Counterform'&&actor.subclassState?.adaptation==='Grit')out.finalDamagePct+=25;
  if(name==='Perfect Adaptation'){out.critChanceBonus+=15;out.finalDamagePct+=20;}
  if(name==='Cataclysmic Formula'){out.finalDamagePct+=10*Number(actor.subclassState?.flare||0);}
  if(name==='Noon Sentence')out.finalDamagePct+=10*preResource;
  if(name==='Break Benediction'&&!actor.combatMemory?.breakBenedictionHadPositive)out.finalDamagePct+=20;
  if(name==='Rupture the Faithful')out.finalDamagePct+=12*preResource;
  if(name==='Total Breach')out.finalDamagePct+=10*preResource;
  if(name==='One Perfect Shot'){out.unblockable=true;out.critChanceBonus+=25;out.critDamageBonus+=25;}
  if(name==='Final Dirge')out.finalDamagePct+=10*preResource;
  if(name==='Final Cadence'){out.critChanceBonus+=20;out.unblockable=true;}
  if(name==='Wellburst'&&preResource>0)out.finalDamagePct+=15;
  if(name==='Pressure Release')out.finalDamagePct+=12*Math.min(2,preResource);
  if(name==='Impossible Outcome'){out.finalDamagePct+=12;out.critChanceBonus+=18;out.critDamageBonus+=25;}
  if(name==='Fast Circuit')out.critChanceBonus+=20;
  if(name==='Measured Shot')out.critChanceBonus+=5*preResource;
  if(name==='Choir of Knives')out.critChanceBonus+=5*preResource;
  if(name==='Sunbrand'&&(target.effects||[]).some(e=>e.negative))out.critChanceBonus+=10;
  if(name==='Flarebolt'&&resourceValue(actor)>=3)out.critChanceBonus+=10;
  if(name==='Through the Gap'&&Number(target.resources?.shield||0)>0)out.finalDamagePct+=30;
  if(name==='Pyre Due'){out.finalDamagePct+=9*preResource;if(preResource>=5)out.critDamageBonus+=25;}
  if(name==='The Voice Answers')out.finalDamagePct+=10*preResource;
  if(name==='Harvest Pulse'&&Number(target.resources.hp)/Number(target.resources.maxHp)<.5)out.finalDamagePct+=20;
  if(name==='Mortal Reckoning')out.unblockable=true;
  if(name==='Sentence Pending')out.finalDamagePct+=8*Number(actor.subclassState?.verdict||0);
  if(name==='Final Verdict'){out.unblockable=true;out.critDamageBonus+=25;}
  if(name==="Perjurer's Blade")out.finalDamagePct+=10*Number(actor.subclassState?.fractures||0);
  if(name==="Oath's End"&&Number(actor.subclassState?.fractures||0)>=3){out.finalDamagePct+=30;out.critChanceBonus+=20;}
  if(name==='Final Measure'){out.finalDamagePct+=12*preResource;if(preResource>=3)out.unblockable=true;}
  if(name==='Noon Sentence'&&preResource>=4)out.unblockable=true;
  if(name==='Total Breach'&&preResource>=4){out.unblockable=true;out.ignoreShields=true;}
  if(name==='Crackshot')out.blockChanceMultiplier=.75;
  if(name==='Piercing Line')out.blockChanceMultiplier=.60;
  if(name==='Shadow Through')out.blockChanceMultiplier=.50;
  if(name==='Verdictbearer Placeholder'){};
  return out;
}
function componentOverride(actor,ability,component){
  const c=clone(component);
  if(actor?.subclass==='Prismatic Palm'&&ability?.subclass==='Prismatic Palm'&&component.type==='damage'&&!['Split Spectrum','White Palm'].includes(ability.name)){const f=actor.subclassState?.facet||'Ember';c.damageType=f==='Storm'?'Lightning':f==='Lumen'?'Radiant':'Fire';}
  if(ability.name==='Prism Jab'&&actor?.resourceImprint?.subclass==='Prismatic Palm'){const f=actor.subclassState?.facet||'Ember';c.damageType=f==='Storm'?'Lightning':f==='Lumen'?'Radiant':'Fire';}
  if(ability.name==='White Palm')c.damageType='Radiant';
  if(ability.name==='Cataclysmic Formula')c.damageType=['Fire','Cold','Lightning'].includes(actor?.combatMemory?.cataclysmDamageType)?actor.combatMemory.cataclysmDamageType:'Fire';
  if(ability.name==="Oath's End"){const f=Number(actor.subclassState?.fractures||0);c.damageType=f===0?'Radiant':f===3?'Dark':'Force';}
  return c;
}
function veilBladeSplitComponent(component,factor,damageType,{indirect=false}={}){
  const scaling={};
  for(const [stat,value] of Object.entries(component?.scaling||{}))scaling[stat]=Number(value||0)*Number(factor||0);
  return {...component,base:Number(component?.base||0)*Number(factor||0),damageType,scaling,indirect:Boolean(indirect)};
}
function isVeilBladeDamageSplit(ability){return ability?.subclass==='Veil Blade'&&ability?.special?.includes('veilblade-damage-split-60-dark-40-poison');}
function resolveVeilBladePoisonSplit(slot,combat,actor,target,ability,component,parentResult,{rng=Math.random,finalDamagePct=0,critDamageBonus=0}={}){
  if(!isVeilBladeDamageSplit(ability)||!parentResult?.hit||!alive(target))return null;
  const poisonComponent=veilBladeSplitComponent(component,.40,'Poison',{indirect:true});
  const packetAbility={id:`${ability.id}-poison-split`,name:`${ability.name} · Poison Split`,baseClass:ability.baseClass||'Rogue',subclass:null,components:[poisonComponent]};
  return resolveDamageComponent(slot,combat,actor,target,packetAbility,poisonComponent,{rng,finalDamagePct,critDamageBonus,reaction:true,skipDodge:true,forcedBlocked:Boolean(parentResult.blocked),forcedCritical:Boolean(parentResult.critical),forcedRecursiveCritical:Boolean(parentResult.recursiveCritical),suppressDefenseProcs:true});
}
function applySeedmarshalPlanting(slot,combat,actor,target,type,ability,{rng=Math.random}={}){
  if(!actor?.subclassState||!target)return [];
  const planting={targetId:target.id,type,remaining:actor.keptImpressions?.includes('KI-264')?1:3,base:4,scaling:ability.components?.[0]?.scaling||{}};
  actor.subclassState.plantings[target.id]=planting;
  if(!actor.keptImpressions?.includes('KI-264'))return [];
  const immediate=triggerPlantings(slot,combat,actor,1.2,false,{rng,targetId:target.id});
  const key=`wild:${combat.round}:${actor.id}:${Number(actor.turnControl?.turnsStarted||0)}`;
  actor.subclassState.memory=actor.subclassState.memory||{};
  if(immediate.length&&actor.subclassState.memory.lastGrowthTriggerKey!==key){gainSubclassResource(actor,1);actor.subclassState.memory.lastGrowthTriggerKey=key;}
  return immediate;
}
function afterDamageSpecial(slot,combat,actor,target,ability,result,total,hitIndex,{rng}){
  if(!result.hit)return;
  const name=ability.name;
  if(name==='Splintering Hew'&&result.critical)gainResource(actor,1);
  if(name==='Open Vein'&&result.actualHpRemoved>0)gainResource(actor,1);
  if(name==='Brandcut'||name==='Runebreak')gainSubclassResource(actor,1);
  if(name==='Quickdraw'||name==='Called Shot'||name==='Ricochet'||name==='Redline Execution')actor.subclassState.turnFlags.gunslingerDamagingAction=true;
  if(name==='Testing Thrust')setMeasured(actor,target.id);
  if(name==='Turn the Blade'){status(combat,target,actor,'duelist-off-balance',{dodgeChancePct:-10,blockChancePct:-10},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Flashfreeze'){status(combat,target,actor,'spellflare-flashfreeze',{dodgeChancePct:-15},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Halo Breaker'){status(combat,target,actor,'lumenwrath-halo-breaker',{blockChancePct:-10},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Runic Sentence')placeAbilitySeal(actor,target,'Fracture',ability.components[0]?.scaling||{});
  if(name==='Called Shot')status(combat,target,actor,'gunslinger-sighted',{}, {turns:2,memory:{critChanceAgainstSource:15}});
  if(name==='Ruinwake'){status(combat,target,actor,'ruinhewer-ruinwake',{blockChancePct:-15,blockedDamageReductionPct:-15},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Fracture Bolt'){status(combat,target,actor,'breachstrider-fractured-defense',{blockChancePct:-15,blockedDamageReductionPct:-15},{turns:2,negative:true});gainSubclassResource(actor,1);recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Grave Verse'){status(combat,target,actor,'dreadcantor-grave-verse',{finalDamagePct:-8},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Wrong Note'){status(combat,target,actor,'dreadcantor-wrong-note',{incomingHealingPct:-20},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Low Murmur'){status(combat,target,actor,'belowcaller-low-murmur',{damageCritChancePct:-10},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Whispered Doubt'){status(combat,target,actor,'belowcaller-doubt',{criticalDamagePct:-15,incomingHealingPct:-15},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Hands Beneath'){status(combat,target,actor,'belowcaller-hands',{dodgeChancePct:-15},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Blighted Litany'){recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Profane Exchange'){recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);}
  if(name==='Weight of Evidence'){status(combat,target,actor,'verdictbearer-evidence',{finalDamagePct:-10},{turns:2,negative:true});recordSubclassDebuffApplied(actor);triggerOnDebuff(actor,ability);if(actor.subclassState?.judgedTargetId===target.id)gainSubclassResource(actor,1);}
  if(name==='Cite the Crime')setJudged(actor,target.id);
  if(name==='Covering Shot'){const ally=lowestHp(livingAllies(combat,actor));if(ally)placeTrailmark(actor,ally.id);}
  if(name==='Intercepting Volley')status(combat,target,actor,'trailguard-intercept',{}, {turns:2,negative:true,memory:{trailguardOwnerId:actor.id,finalDamageVsTrailmarkedPct:-15}});
  if(name==='Conductor Bolt')placeConduit(actor,target.id);
  if(name==='Spore Needle')placeNode(actor,target.id);
  if(name==='Sow Thorn')applySeedmarshalPlanting(slot,combat,actor,target,'Thornseed',ability,{rng});
  if(name==='Knotted Claw')gainMorph(actor,'Claw');
}
function updateCadence(actor,ability,result){
  const s=actor.subclassState;if(!s||s.subclass!=='Cadenceblade'||!result.hit)return;
  if(s.lastAbilityId===ability.id){s.memory=s.memory||{};s.memory.sameCadenceCount=Number(s.memory.sameCadenceCount||0)+1;if(s.memory.sameCadenceCount>=2){s.cadence=0;s.memory.sameCadenceCount=0;}}
  else{gainSubclassResource(actor,1);s.memory=s.memory||{};s.memory.sameCadenceCount=0;}
  s.lastAbilityId=ability.id;
}
function placeAbilitySeal(actor,target,type,scaling){const empowered=actor.classState?.resource?.name==='Arcane Charge'&&resourceValue(actor)>=5;if(empowered)setResourceValue(actor,resourceValue(actor)-1);return placeSeal(actor,target.id,type,3,{empowered,scaling});}
function supportAfter(slot,combat,actor,target,ability,result,{rng=Math.random}={}){
  const name=ability.name;
  if(name==='Aegis Seal'&&target)placeAbilitySeal(actor,target,'Ward',ability.components[0]?.scaling||{});
  if(name==='Mercy Seal'&&target)placeAbilitySeal(actor,target,'Mercy',ability.components[0]?.scaling||{});
  if(name==='Sow Shelter'&&target)applySeedmarshalPlanting(slot,combat,actor,target,'Shelterseed',ability,{rng});
  if(name==='Sow Life'&&target)applySeedmarshalPlanting(slot,combat,actor,target,'Lifeseed',ability,{rng});
  if(['Threaded Remedy','Mycelial Shell'].includes(name)&&target)placeNode(actor,target.id);
  if(name==='Answering Harmony'&&target)status(combat,target,actor,'choruswarden-answering-harmony',{}, {memory:{answeringHarmonySourceId:actor.id,heal:{base:4,scaling:{FTH:.009,CON:.007,CHA:.005}}}});
  if(name==='Living Carapace')gainMorph(actor,'Hide');
  if(name==='Heartwood Pulse')gainMorph(actor,'Heartwood');
  if(name==="Dawn's Mercy"&&target)status(combat,target,actor,'dawnwarden-mercy-block',{blockChancePct:10},{turns:2});
}
function applyHpCost(actor,ability){const pct=Math.max(0,Number(keptHpCostPct(actor,ability,ability.hpCostPctCurrent||0)));if(!pct)return 0;const cost=Math.max(1,Math.round(Number(actor.resources.hp||0)*pct/100));const actual=Math.min(Math.max(0,Number(actor.resources.hp||0)-1),cost);actor.resources.hp=Math.max(1,Number(actor.resources.hp||0)-actual);return actual;}

function pureSpecial(slot,combat,actor,ability,targets,{choices={},rng=Math.random}={}){
  const name=ability.name;const primary=targets.primary?getCombatActor(combat,targets.primary):null;const out=[];
  if(name==='Flash Temper'){status(combat,actor,actor,'brandblade-flash-temper',{dodgeChancePct:10},{turns:2,memory:{nextSubclassCrit:15,subclass:'BrandBlade'}});gainSubclassResource(actor,1);}
  else if(name==='Fade Between'){status(combat,actor,actor,'veilblade-fade-dodge',{dodgeChancePct:20},{untilSourceTurn:true});status(combat,actor,actor,'veilblade-fade-crit',{}, {turns:2,memory:{nextSubclassCrit:15,subclass:'Veil Blade'}});}
  else if(name==='Refract Stance'){advanceFacet(actor,choices.facetDirection===-1?-1:1);status(combat,actor,actor,'prismatic-refract',{dodgeChancePct:10},{untilSourceTurn:true});}
  else if(name==='Parrying Measure')status(combat,actor,actor,'duelist-parrying-measure',{blockChancePct:20,blockedDamageReductionPct:20},{untilSourceTurn:true,memory:{riposte:{base:8,scaling:{DEX:.008,STR:.008,CHA:.005}},triggered:false}});
  else if(name==='Read the Exchange')status(combat,actor,actor,'adaptedfist-read-exchange',{blockChancePct:15,dodgeChancePct:15},{untilSourceTurn:true,memory:{grantImpactOnAdaptation:true}});
  else if(name==='Interpose'&&primary){const takeMe=actor.keptImpressions?.includes('KI-204');status(combat,primary,actor,'steelbearer-interpose',{}, takeMe?{turns:2,memory:{redirectTo:actor.id,damageReductionPct:75,grantBearing:true,redirectHitsRemaining:2}}:{untilSourceTurn:true,memory:{redirectTo:actor.id,damageReductionPct:30,grantBearing:true,redirectHitsRemaining:1}});}
  else if(name==='Share the Hurt'&&primary)status(combat,primary,actor,'solaceweaver-share-hurt',{incomingDamagePct:-20},{turns:2,memory:{shareHurtSourceId:actor.id,heal:{base:4,scaling:{FTH:.009,CON:.007,CHA:.005}}}});
  else if(name==='Grand Unsealing')out.push(...triggerGrandUnsealing(slot,combat,actor,{rng}));
  else if(name==='Quickscript'){const glyphs=Array.isArray(choices.glyphs)?choices.glyphs:['Edge','Echo'];for(const g of glyphs.slice(0,2))addGlyph(actor,g);}
  else if(name==='Blazing Conviction')status(combat,actor,actor,'lumenwrath-blazing',{damageTypeFinalPct:15,blockChancePct:10},{turns:2,memory:{damageType:'Radiant'}});
  else if(name==='Hold Breath'){gainSubclassResource(actor,2);status(combat,actor,actor,'longwatch-hold-breath',{dodgeChancePct:-10},{untilSourceTurn:true});}
  else if(name==='Mark Safe Ground'){const ids=Array.isArray(choices.allyIds)&&choices.allyIds.length?choices.allyIds:livingAllies(combat,actor).slice(0,2).map(a=>a.id);for(const id of ids.slice(0,2))placeTrailmark(actor,id);}
  else if(name==='Hold the Chorus')for(const ally of livingAllies(combat,actor))status(combat,ally,actor,'choruswarden-hold',{incomingDamagePct:-10},{turns:2});
  else if(name==='Probability Shear'){advanceFlux(actor,actor.keptImpressions?.includes('KI-246')?1:(choices.fluxDirection===-1?-1:1),{rng});status(combat,actor,actor,'fluxwrought-probability',{}, {memory:{nextSubclassCrit:10,subclass:'Fluxwrought'},turns:2});}
  else if(name==='Furnace Oath'){gainSubclassResource(actor,2);status(combat,actor,actor,'pyrecovenant-furnace',{damageTypeFinalPct:15},{turns:2,memory:{damageType:'Fire'}});}
  else if(name==='Stand Before the Sun'&&primary)status(combat,primary,actor,'dawnwarden-stand-before',{}, {untilSourceTurn:true,memory:{redirectTo:actor.id,damageReductionPct:35}});
  else if(name==='Scar the Promise'){fractureOath(actor,1);status(combat,actor,actor,'vowscarred-scar',{}, {memory:{nextSubclassCrit:20,subclass:'Vowscarred'}});}
  else if(name==='Verdant Muster')out.push(...triggerPlantings(slot,combat,actor,1.5,true,{rng}));
  return out;
}
function triggerGrandUnsealing(slot,combat,actor,{rng=Math.random}={}){
  const out=[];const seals=[...(actor.subclassState?.seals||[])];actor.subclassState.seals=[];
  for(const seal of seals){const target=getCombatActor(combat,seal.targetId);if(!target||!alive(target))continue;const bonus=seal.empowered?25:0;
    if(seal.type==='Fracture'){const c={type:'damage',base:8,damageType:'Force',scaling:{INT:.009,CHA:.007,FTH:.005}};const r=resolveDamageComponent(slot,combat,actor,target,{id:'mage-sealweaver-grand-unsealing',name:'Grand Unsealing',baseClass:'Mage',subclass:'Sealweaver',components:[c]},c,{rng,finalDamagePct:bonus,reaction:true});out.push({type:'seal-trigger',seal:'Fracture',targetId:target.id,...r});}
    else if(seal.type==='Ward'){const c={type:'shield',base:8,scaling:{FTH:.008,CHA:.007,INT:.006}};const r=resolveShieldComponent(combat,actor,target,{id:'mage-sealweaver-grand-unsealing',name:'Grand Unsealing',baseClass:'Mage',subclass:'Sealweaver'},c,{finalShieldPct:bonus});out.push({type:'seal-trigger',seal:'Ward',targetId:target.id,...r});}
    else if(seal.type==='Mercy'){const c={type:'heal',base:8,scaling:{FTH:.010,CHA:.007,INT:.004}};const r=resolveHealComponent(slot,combat,actor,target,{id:'mage-sealweaver-grand-unsealing',name:'Grand Unsealing',baseClass:'Mage',subclass:'Sealweaver'},c,{rng,finalHealingPct:bonus});out.push({type:'seal-trigger',seal:'Mercy',targetId:target.id,...r});}
  }return out;
}
function triggerPlantings(slot,combat,actor,mult=1,refresh=false,{rng=Math.random,targetId=null}={}){const out=[];for(const planting of Object.values(actor.subclassState?.plantings||{})){if(targetId&&planting.targetId!==targetId)continue;const target=getCombatActor(combat,planting.targetId);if(!target||!alive(target))continue;const finalPct=(mult-1)*100+(Number(actor.subclassState?.growth||0)>=4?20:0);if(planting.type==='Thornseed'){const c={type:'damage',base:Number(planting.base||4),damageType:'Physical',scaling:planting.scaling||{}};const r=resolveDamageComponent(slot,combat,actor,target,{id:'druid-seedmarshal-planting',name:'Thornseed',baseClass:'Druid',subclass:'Seedmarshal',components:[c]},c,{rng,finalDamagePct:finalPct,canCrit:false,reaction:true});out.push({type:'planting',planting:'Thornseed',targetId:target.id,...r});}if(planting.type==='Shelterseed'){const c={type:'shield',base:Number(planting.base||4),scaling:planting.scaling||{}};const r=resolveShieldComponent(combat,actor,target,{id:'druid-seedmarshal-planting',name:'Shelterseed',baseClass:'Druid',subclass:'Seedmarshal'},c,{finalShieldPct:finalPct});out.push({type:'planting',planting:'Shelterseed',targetId:target.id,...r});}if(planting.type==='Lifeseed'){const c={type:'heal',base:Number(planting.base||4),scaling:planting.scaling||{}};const r=resolveHealComponent(slot,combat,actor,target,{id:'druid-seedmarshal-planting',name:'Lifeseed',baseClass:'Druid',subclass:'Seedmarshal'},c,{rng,finalHealingPct:finalPct,canCrit:false});out.push({type:'planting',planting:'Lifeseed',targetId:target.id,...r});}if(refresh)planting.remaining=3;}return out;}

function spendResourceAfter(actor,ability,preResource,targets){
  const req=ability.resourceCost;if(!req)return 0;let amount=req.amount==='all'?preResource:Number(req.amount||0);
  if(req.resource&&actor?.classState?.resource?.name===req.resource){setResourceValue(actor,Math.max(0,resourceValue(actor)-amount));return amount;}
  if(['Veil Imprints','Fractures'].includes(req.resource)){spendSubclassResource(actor,amount,{targetId:targets.primary});return amount;}
  if(req.resource==='Morphs'){const n=actor.subclassState?.morphs?.length||0;actor.subclassState.morphs=[];return n;}
  if(req.resource==='Hypha Nodes'){return clearCollectionResource(actor);}
  if(req.resource==='Conduits'){return clearCollectionResource(actor);}
  if(req.resource==='Seals'){return clearCollectionResource(actor);}
  if(req.resource==='Glyphs'){return consumeGlyphs(actor,amount).length;}
  spendSubclassResource(actor,amount);return amount;
}
function consumeSpecialResources(actor,ability,preResource){
  const name=ability.name;
  if(name==='Break the Limit'){const pressure=resourceValue(actor);setResourceValue(actor,0);setSubclassResource(actor,0);return pressure;}
  if(name==='Wellburst'&&preResource>0)spendSubclassResource(actor,1);
  if(name==='Pressure Release'&&preResource>0)spendSubclassResource(actor,Math.min(2,preResource));
  if(name==='Cataclysmic Formula')setSubclassResource(actor,0);
  if(name==="Oath's End")restoreOath(actor);
}
function postAbilityState(actor,ability,results,preResource,{rng=Math.random}={}){
  const name=ability.name;
  if(actor.subclass==='BrandBlade'&&Number(actor.subclassState?.heat||0)>=5&&(ability.components||[]).some(c=>c.type==='damage'))setSubclassResource(actor,0);
  if(actor.subclass==='Prismatic Palm'&&actor.subclassState?.subclass==='Prismatic Palm'&&(ability.components||[]).some(c=>c.type==='damage'))advanceFacet(actor,1);
  if(actor.subclassState?.subclass==='Fluxwrought'&&(ability.components||[]).some(c=>c.type==='damage'))advanceFlux(actor,1,{rng});
  if(name==='Many-Limbed Form')actor.subclassState.morphs=[];
  if(name==='Fruiting Network')actor.subclassState.nodes=[];
  if(name==='Grand Rewrite')actor.subclassState.glyphs=[];
}

export function executeSubclassAbility(slot,{abilityId,catalog,targets={},choices={},rng=Math.random}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.combat)return {ok:false,error:'No active combat.'};
  const next=clone(slot),combat=next.campaign.state.combat;
  if(combat.state!=='active'||!combat.turn||combat.turn.actionTaken)return {ok:false,error:'No unused combat action is available.'};
  const actor=getCombatActor(combat,combat.turn.actorId);if(!actor)return {ok:false,error:'Current combatant is missing.'};
  const ability=findSubclassAbility(catalog,abilityId);const avail=getSubclassAbilityAvailability(combat,actor.id,ability,{targets});if(!avail.ok)return {ok:false,error:avail.reason};
  const preResource=targetResource(actor,ability,targets);if(ability.name==='Cataclysmic Formula')actor.combatMemory.cataclysmDamageType=['Fire','Cold','Lightning'].includes(choices.damageType)?choices.damageType:'Fire';const hpPaid=applyHpCost(actor,ability);
  const intrinsicCost=intrinsicEnergyCost(actor,ability);keptBeforeAction({combat,actor,ability});actor.resources.energy=Math.max(0,Number(actor.resources.energy||0)-avail.energyCost);consumeNextEnergyCostEffects(actor,intrinsicCost);keptEnergySpent({slot:next,combat,actor,ability,amount:avail.energyCost,rng});recordSubclassEnergySpend(actor,ability,avail.energyCost);triggerAbilityUseResource(actor,ability,avail.energyCost);
  if(ability.name==='Furnace Oath'&&hpPaid>0&&!actor.subclassState?.turnFlags?.cinderHpCost){gainSubclassResource(actor,1);actor.subclassState.turnFlags.cinderHpCost=true;}
  const results=[];results.push(...pureSpecial(next,combat,actor,ability,targets,{choices,rng}));
  if(ability.name==='Break Benediction'&&targets.primary){const t=getCombatActor(combat,targets.primary);const i=(t?.effects||[]).findIndex(e=>e.removable!==false&&!e.negative);actor.combatMemory.breakBenedictionHadPositive=i>=0;if(i>=0){const [removed]=t.effects.splice(i,1);keptOnPositiveRemoved({slot:next,combat,source:actor,target:t,effect:removed});}}
  if(ability.name==='Final Dirge'&&preResource>=4&&targets.primary){const t=getCombatActor(combat,targets.primary);const i=(t?.effects||[]).findIndex(e=>e.removable!==false&&!e.negative);if(i>=0){const [removed]=t.effects.splice(i,1);keptOnPositiveRemoved({slot:next,combat,source:actor,target:t,effect:removed});}}
  const selectedGlyphs=chosenGlyphsForAbility(actor,ability,choices),glyphMods=glyphBonuses(selectedGlyphs,{enhanced:ability.name==='Grand Rewrite'});
  const pendingCritEffects=pendingNextSubclassCritEffects(actor,ability);const nextCritBonus=pendingCritEffects.reduce((n,e)=>n+Number(e.memory?.nextSubclassCrit||0),0);
  let totalDamage=0;let affectedAllies=new Set();
  const delayedOnly=new Set(['Parrying Measure','Red Guard']);
  for(const rawComponent of (delayedOnly.has(ability.name)?[]:(ability.components||[]))){const component=componentOverride(actor,ability,rawComponent);const tlist=componentTargets(combat,actor,ability,component,targets);const hits=Math.max(1,Number(component.hits||1));
    for(const target of tlist){if(!target||!alive(target))continue;
      if(component.type==='damage')for(let h=0;h<hits;h++){
        const hadConduitBefore=actor.subclass==='Spellconductor'&&(actor.subclassState?.conduits||[]).some(x=>(x?.targetId||x)===target.id);
        const hadNodeBefore=actor.subclass==='Hyphaweaver'&&(actor.subclassState?.nodes||[]).includes(target.id);
        const pre=preDamageSpecial(actor,target,ability,preResource,h,{nextCritBonus});pre.finalDamagePct+=glyphMods.finalDamagePct;
        // Unstable Pair: hit one uses the current Flux state and hit two uses the next state, never both.
        let restoreFlux=null;
        const hasFluxSystem=actor.subclassState?.subclass==='Fluxwrought'&&(actor.subclass==='Fluxwrought'||actor.resourceImprint?.subclass==='Fluxwrought');
        if(ability.name==='Unstable Pair'&&h===1&&hasFluxSystem){restoreFlux=actor.subclassState.flux;advanceFlux(actor,1,{rng});}
        if(ability.name==='Ricochet'&&component.targetKey==='secondary'&&target.id===targets.primary)component.finalMultiplier=.70;
        if(ability.name==='Forked Spark'&&component.targetKey==='secondary'){
          const primaryResult=results.find(x=>x.type==='damage'&&x.targetId===targets.primary);
          if(primaryResult?.critical)pre.finalDamagePct+=20;
          if(target.id===targets.primary)component.finalMultiplier=.60;
        }
        const veilSplit=isVeilBladeDamageSplit(ability);
        const primaryComponent=veilSplit?veilBladeSplitComponent(component,.60,'Dark'):component;
        const r=resolveDamageComponent(next,combat,actor,target,ability,primaryComponent,{rng,...pre});
        if(restoreFlux!==null)actor.subclassState.flux=restoreFlux;
        results.push({type:'damage',targetId:target.id,hitIndex:h,damageSplit:veilSplit?'60% Dark':null,...r});totalDamage+=Number(r.actualHpRemoved||0);triggerOnDamage(actor,target,ability,r);afterDamageSpecial(next,combat,actor,target,ability,r,totalDamage,h,{rng});
        const poisonSplit=resolveVeilBladePoisonSplit(next,combat,actor,target,ability,component,r,{rng,finalDamagePct:pre.finalDamagePct+(ability.subclass==='Veil Blade'?4*Number(preResource||0):0),critDamageBonus:pre.critDamageBonus});
        if(poisonSplit){results.push({type:'bonus-damage',packet:'veilblade-poison-split',damageSplit:'40% Poison',targetId:target.id,hitIndex:h,...poisonSplit});totalDamage+=Number(poisonSplit.actualHpRemoved||0);}
        if(actor.subclass==='Spellconductor'&&ability.subclass==='Spellconductor'&&hadConduitBefore&&Number(r.actualHpRemoved||0)>0&&!actor.subclassState.turnFlags.arcThisAbility){const other=livingEnemies(combat,actor).find(e=>e.id!==target.id&&(actor.subclassState.conduits||[]).some(x=>(x?.targetId||x)===e.id));if(other){const c={type:'damage',base:Number(r.actualHpRemoved)*.20,damageType:'Force',scaling:{}};const ar=resolveDamageComponent(next,combat,actor,other,{id:'spellconductor-arc',name:'Conduit Arc',baseClass:'Sorcerer',subclass:null,components:[c]},c,{rng,canCrit:false,reaction:true});results.push({type:'conduit-arc',targetId:other.id,...ar});actor.subclassState.turnFlags.arcThisAbility=true;}}
        if(actor.subclass==='Hyphaweaver'&&ability.subclass==='Hyphaweaver'&&hadNodeBefore&&Number(r.actualHpRemoved||0)>0){const other=livingEnemies(combat,actor).find(e=>e.id!==target.id&&(actor.subclassState.nodes||[]).includes(e.id));if(other){const c={type:'damage',base:Number(r.actualHpRemoved)*.25,damageType:'Poison',scaling:{}};const tr=resolveDamageComponent(next,combat,actor,other,{id:'hyphaweaver-network-damage',name:'Mycelial Transmission',baseClass:'Druid',subclass:null,components:[c]},c,{rng,canCrit:false,reaction:true});results.push({type:'hypha-transmission',targetId:other.id,...tr});}}
      }
      if(component.type==='heal'){const hadNodeBefore=actor.subclass==='Hyphaweaver'&&(actor.subclassState?.nodes||[]).includes(target.id);const hpBeforePct=Number(target.resources?.maxHp||0)>0?Number(target.resources.hp||0)/Number(target.resources.maxHp)*100:100;const finalHealingPct=ability.name==='Unbroken Solace'&&hpBeforePct<40?25:0;const r=resolveHealComponent(next,combat,actor,target,ability,component,{rng,finalHealingPct});results.push({type:'heal',targetId:target.id,...r});triggerOnSupport(actor,ability,{actualHealing:Number(r.actualRestored||0)});affectedAllies.add(target.id);supportAfter(next,combat,actor,target,ability,r,{rng});if(ability.name==='Gentle Stitch'&&Number(r.overheal||0)>0){const shield=Math.round(Number(r.overheal)*.30);if(shield>0){grantCombatShield(combat,target.id,shield,{sourceActorId:actor.id,abilityId:ability.id});results.push({type:'overheal-shield',targetId:target.id,amount:shield});}}if(actor.subclass==='Hyphaweaver'&&ability.subclass==='Hyphaweaver'&&hadNodeBefore&&Number(r.actualRestored||0)>0){const other=livingAllies(combat,actor).find(a=>a.id!==target.id&&(actor.subclassState.nodes||[]).includes(a.id));if(other){const before=other.resources.hp,amt=Math.round(Number(r.actualRestored)*.25);other.resources.hp=Math.min(other.resources.maxHp,before+amt);results.push({type:'hypha-heal-transmission',targetId:other.id,actualRestored:other.resources.hp-before});}}}
      if(component.type==='shield'){const hadNodeBefore=actor.subclass==='Hyphaweaver'&&(actor.subclassState?.nodes||[]).includes(target.id);let finalShieldPct=0;if(ability.name==='Hold the Line')finalShieldPct=15*preResource;if(ability.name==='Hold the Route')finalShieldPct=15*preResource;if(ability.name==='Ossuary Skin'&&preResource>0&&choices.consumeResource===true){spendSubclassResource(actor,1);finalShieldPct=30;}const r=resolveShieldComponent(combat,actor,target,ability,component,{finalShieldPct});results.push({type:'shield',targetId:target.id,...r});triggerOnSupport(actor,ability,{shieldGranted:Number(r.amount||0)});affectedAllies.add(target.id);supportAfter(next,combat,actor,target,ability,r,{rng});if(actor.subclass==='Hyphaweaver'&&ability.subclass==='Hyphaweaver'&&hadNodeBefore&&Number(r.amount||0)>0){const other=livingAllies(combat,actor).find(a=>a.id!==target.id&&(actor.subclassState.nodes||[]).includes(a.id));if(other){const amount=Math.round(Number(r.amount)*.25);grantCombatShield(combat,other.id,amount,{sourceActorId:actor.id,abilityId:'hyphaweaver-network-shield'});results.push({type:'hypha-shield-transmission',targetId:other.id,amount});}}}
    }
  }
  if(['Beatcut','Passing Step','Syncopated Slash','Final Cadence'].includes(ability.name)){const cadenceHit=results.find(r=>r.type==='damage'&&r.hit);updateCadence(actor,ability,cadenceHit||{hit:false});}
  if(pendingCritEffects.length&&(ability.components||[]).some(c=>c.type==='damage'))consumePendingNextSubclassCritEffects(actor,pendingCritEffects);
  if(affectedAllies.size>=2)recordSubclassMultiAllyEffect(actor,affectedAllies.size);
  // Printed post-damage healing / shields.
  if(['Crimson Reprisal','Mortal Reckoning'].includes(ability.name)&&totalDamage>0){
    let pct=ability.name==='Crimson Reprisal'?30:35;
    if(ability.name==='Crimson Reprisal'&&actor.subclass==='Bloodknuckle'){
      const hpPct=Number(actor.resources?.maxHp||0)>0?Number(actor.resources.hp||0)/Number(actor.resources.maxHp)*100:100;
      if(actor.keptImpressions?.includes('KI-213')&&hpPct<30)pct=40;
      if(actor.keptImpressions?.includes('KI-214'))pct*=.75;
    }
    const r=resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalDamage,pct,{ability,healKind:ability.name==='Crimson Reprisal'?'bloodknuckle-printed-lifesteal':'mortisworn-printed-lifesteal'});
    if(ability.name==='Crimson Reprisal')keptAfterLifesteal({actor,ability,actualRestored:r.actualRestored});
    results.push({type:'lifesteal',targetId:actor.id,...r});
  }
  // Bloodknuckle innate Lifesteal and Mortisworn Remain/Gravetouch Lifesteal are resolved once per damage packet by the shared KI-aware damage resolver.
  const prism=prismaticFacetBonuses(actor,ability);if(prism.lumen&&totalDamage>0){const r=resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalDamage,10);results.push({type:'lumen-heal',targetId:actor.id,...r});}
  if(actor.subclass==='AdaptedFist'&&ability.subclass==='AdaptedFist'&&ability.name==='Answering Strike'&&totalDamage>0){const adaptation=actor.subclassState?.adaptation;if(adaptation==='Flow')status(combat,actor,actor,'adaptedfist-flow',{dodgeChancePct:10},{untilSourceTurn:true});if(adaptation==='Guard'){grantCombatShield(combat,actor.id,Math.max(1,Math.round(totalDamage*.10)),{sourceActorId:actor.id,abilityId:ability.id});status(combat,actor,actor,'adaptedfist-guard',{blockedDamageReductionPct:15},{untilSourceTurn:true});}if(adaptation==='Grit'){const r=resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalDamage,8);results.push({type:'adaptation-heal',...r});}}
  if(ability.name==='Perfect Adaptation'&&totalDamage>0){const r=resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalDamage,8);grantCombatShield(combat,actor.id,Math.max(1,Math.round(totalDamage*.10)),{sourceActorId:actor.id,abilityId:ability.id});status(combat,actor,actor,'adaptedfist-perfect',{dodgeChancePct:10,blockedDamageReductionPct:15},{untilSourceTurn:true});results.push({type:'adaptation-heal',...r});}
  if(ability.name==='Counterform'&&actor.subclassState?.adaptation==='Guard'&&totalDamage>0){grantCombatShield(combat,actor.id,Math.max(1,Math.round(totalDamage*.15)),{sourceActorId:actor.id,abilityId:ability.id});}
  if(ability.name==='Profane Exchange'&&totalDamage>0){const ally=lowestHp(livingAllies(combat,actor));if(ally){const r=resolvePercentOfActualDamageHeal(next,combat,actor,ally,totalDamage,30);results.push({type:'profane-exchange-heal',targetId:ally.id,...r});}}
  if(ability.name==='Cinderlash'&&preResource>=3&&targets.primary){const target=getCombatActor(combat,targets.primary);if(target&&alive(target)){const c={type:'damage',base:7,damageType:'Fire',scaling:ability.components[0]?.scaling||{}};const r=resolveDamageComponent(next,combat,actor,target,ability,c,{rng});results.push({type:'bonus-damage',targetId:target.id,...r});}}
  if(ability.name==='Interpose'||ability.name==='Stand Before the Sun'){} // redirect is resolver-owned through the placed effect.
  if(ability.name==='Tempered Wall')status(combat,actor,actor,'steelbearer-tempered-wall',{blockChancePct:15},{turns:2,memory:{requiresShieldAbilityId:ability.id,expiresShieldAbilityId:ability.id}});
  if(ability.name==='Hold the Line'){status(combat,actor,actor,'steelbearer-hold-line',{blockChancePct:20,aggroMultiplierAdd:actor.keptImpressions?.includes('KI-204')?.9:.5},{turns:2});}
  if(ability.name==='Shieldcheck')status(combat,actor,actor,'steelbearer-shieldcheck',{aggroMultiplierAdd:.35},{turns:2});
  if(ability.name==='Reckless Advance')status(combat,actor,actor,'ruinhewer-reckless',{blockChancePct:-10},{untilSourceTurn:true});
  if(ability.name==='Break the Limit')status(combat,actor,actor,'ruinhewer-break-limit',{incomingDamagePct:10},{untilSourceTurn:true});
  if(ability.name==='Red Guard')status(combat,actor,actor,'bloodknuckle-red-guard',{blockedDamageReductionPct:15},{turns:2,memory:{healOnNextBlock:{base:5,scaling:{FTH:.010,CON:.007,STR:.003}}}});
  if(ability.name==='Reservoir Skin'){};
  if(ability.name==='Passing Step')status(combat,actor,actor,'cadenceblade-passing-step',{dodgeChancePct:15},{untilSourceTurn:true});
  if(ability.name==='Fast Circuit'&&targets.primary&&actor.subclassState?.conduits?.includes(targets.primary))status(combat,actor,actor,'spellconductor-fast-circuit',{dodgeChancePct:15},{untilSourceTurn:true});
  if(ability.name==='The Voice Answers'&&preResource>=4&&targets.primary){const t=getCombatActor(combat,targets.primary);if(t)status(combat,t,actor,'belowcaller-voice-tax',{}, {turns:2,negative:true,memory:{nextEnergyAbilityCostAdd:1}});}
  if(ability.name==='Furnace Oath'){};
  if(ability.name==='Scar the Promise'){};
  if(ability.name==='Many-Limbed Form'){};
  if(selectedGlyphs.length){if(glyphMods.echoPct>0&&totalDamage>0&&targets.primary){const t=getCombatActor(combat,targets.primary);if(t&&alive(t)){const c={type:'damage',base:totalDamage*glyphMods.echoPct/100,damageType:'Force',scaling:{}};const er=resolveDamageComponent(next,combat,actor,t,{id:'glyphmorpher-echo',name:'Echo Glyph',baseClass:'Mage',subclass:null,components:[c]},c,{rng,canCrit:false,reaction:true});results.push({type:'glyph-echo',targetId:t.id,...er});}}if(glyphMods.dodgePct>0)status(combat,actor,actor,'glyphmorpher-veil',{dodgeChancePct:glyphMods.dodgePct},{untilSourceTurn:true});if(ability.name!=='Grand Rewrite')consumeGlyphs(actor,selectedGlyphs.length);}
  const spent=spendResourceAfter(actor,ability,preResource,targets);consumeSpecialResources(actor,ability,preResource);postAbilityState(actor,ability,results,preResource,{rng});
  if(ability.name==='Answering Strike')actor.subclassState.adaptation=null;
  if(ability.name==='Counterform')actor.subclassState.adaptation=null;
  if(isSubclassResourceActive(actor,'Glyphmorpher')&&ability.subclass==='Glyphmorpher'&&intrinsicCost>=2&&!actor.subclassState.turnFlags.glyphCreated){addGlyph(actor,['Edge','Echo','Veil'].includes(choices.createGlyph)?choices.createGlyph:'Edge');actor.subclassState.turnFlags.glyphCreated=true;}
  setAbilityCooldown(combat,actor.id,ability.id,keptCooldown(actor,ability,ability.cooldown));
  combat.turn.actionTaken=true;combat.turn.actionType='ability';combat.turn.actionPayload={abilityId:ability.id,subclassAbility:true,targets:clone(targets),choices:clone(choices)};combat.turn.canEndTurn=true;
  appendCombatLog(combat,{type:'subclass-ability',round:combat.round,actorId:actor.id,abilityId:ability.id,energySpent:avail.energyCost,hpPaid,resourceSpent:spent,results:clone(results),at:new Date().toISOString()},{presentation:true});
  const outcome=finalizeCombatOutcome(combat);
  return {ok:true,slot:next,combat:clone(combat),ability:clone(ability),results,outcome};
}

export function resolveSubclassTurnStartEvents(slot,{rng=Math.random}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.combat)return {ok:true,slot};
  const next=clone(slot),combat=next.campaign.state.combat,current=getCombatActor(combat,combat.currentActorId);if(!current||combat.turn?.subclassStartResolved)return {ok:true,slot:next};
  const events=[];
  // Seal duration is measured on the carrier. Mercy triggers below 60% immediately, or on the carrier's third marked turn.
  // Ward/Fracture remain live through three carrier turns and expire before a fourth begins if untriggered.
  for(const owner of combat.actors||[]){
    const seals=owner.subclassState?.subclass==='Sealweaver'?(owner.subclassState.seals||[]):[];
    for(const seal of [...seals]){
      if(seal.targetId!==current.id)continue;
      const marked=Math.max(0,Number(seal.markedTurns||0));
      if(seal.type!=='Mercy'&&marked>=3){owner.subclassState.seals=owner.subclassState.seals.filter(x=>x!==seal);events.push({type:'seal-expired',sealType:seal.type,sourceActorId:owner.id,targetId:current.id});continue;}
      seal.markedTurns=marked+1;
      if(seal.type==='Mercy'){
        const hpPct=Number(current.resources?.maxHp||0)>0?Number(current.resources.hp||0)/Number(current.resources.maxHp)*100:100;
        if(hpPct<60||seal.markedTurns>=3){const c={type:'heal',base:6,scaling:seal.scaling||{}};const r=resolveHealComponent(next,combat,owner,current,{id:'sealweaver-mercy-trigger',name:'Mercy Seal',baseClass:'Mage',subclass:'Sealweaver'},c,{rng,finalHealingPct:seal.empowered?25:0});owner.subclassState.seals=owner.subclassState.seals.filter(x=>x!==seal);events.push({type:'mercy-seal',sourceActorId:owner.id,targetId:current.id,...r});}
      }
    }
  }
  // Malisunder Fractures last three turns of their carrier and refresh to three whenever another Fracture is applied.
  for(const owner of combat.actors||[]){
    const s=owner.subclassState;if(s?.subclass!=='Malisunder'||!s.fractures?.[current.id])continue;
    s.memory.fractureRemaining=s.memory.fractureRemaining||{};const remaining=Math.max(0,Number(s.memory.fractureRemaining[current.id]||0));
    if(remaining<=0){delete s.memory.fractureRemaining[current.id];delete s.fractures[current.id];events.push({type:'fractures-expired',sourceActorId:owner.id,targetId:current.id});}
    else s.memory.fractureRemaining[current.id]=remaining-1;
  }
  // Duelist Measured lasts four turns of the measured enemy; losing that mark also clears Tempo.
  for(const owner of combat.actors||[]){
    const s=owner.subclassState;if(s?.subclass!=='Duelist'||s.measuredTargetId!==current.id)continue;
    const remaining=Math.max(0,Number(s.measuredRemaining||0));
    if(remaining<=0){s.measuredTargetId=null;s.measuredRemaining=0;s.tempo=0;events.push({type:'measured-expired',sourceActorId:owner.id,targetId:current.id});}
    else s.measuredRemaining=remaining-1;
  }
  // Plantings trigger on the planted combatant's own turn and expire after exactly three such periodic turns.
  for(const owner of combat.actors||[]){if(owner.subclassState?.subclass!=='Seedmarshal')continue;const planting=owner.subclassState.plantings?.[current.id];if(!planting||!alive(current))continue;const r=triggerPlantings(next,combat,owner,1,false,{rng,targetId:current.id});events.push(...r);const key=`${combat.round}:${current.id}`;if(r.length&&owner.subclassState.memory.lastGrowthTriggerKey!==key){gainSubclassResource(owner,1);owner.subclassState.memory.lastGrowthTriggerKey=key;}planting.remaining=Math.max(0,Number(planting.remaining||0)-1);if(planting.remaining<=0)delete owner.subclassState.plantings[current.id];}
  if(combat.turn)combat.turn.subclassStartResolved=true;if(events.length)combat.log.push({type:'subclass-turn-start-events',actorId:current.id,events:clone(events),at:new Date().toISOString()});return {ok:true,slot:next,events};
}

export function listUsableSubclassAbilities(combat,actorId,catalog){const actor=getCombatActor(combat,actorId);if(!actor)return[];return abilityList(catalog).filter(a=>actorHasAbility(actor,a)&&Number(actor.level||0)>=Number(a.level||0)).sort((a,b)=>a.level-b.level||a.slot-b.slot).map(a=>{const res=actualResourceCost(actor,a,{primary:null});return {...clone(a),cooldownRemaining:getAbilityCooldown(combat,actor.id,a.id),effectiveEnergyCost:effectiveEnergyCost(actor,a),resourceAvailable:res.available,resourceRequired:res.required};});}
