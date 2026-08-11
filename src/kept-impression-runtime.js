import { hasKept, kiState, keptChoice, keptIds, actionCategory, keptActiveAbilityDefinitions } from './kept-impression-state.js';
import { gainSubclassResource } from './subclass-state.js';

function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function clamp(v,a,b){return Math.max(a,Math.min(b,n(v)));}
function alive(a){return n(a?.resources?.hp)>0;}
function hpPct(a){return n(a?.resources?.maxHp)>0?n(a.resources.hp)/n(a.resources.maxHp)*100:0;}
function allies(combat,a,{real=false,other=false}={}){return (combat?.actors||[]).filter(x=>x.side===a.side&&alive(x)&&(!real||x.real)&&(!other||x.id!==a.id));}
function enemies(combat,a){return (combat?.actors||[]).filter(x=>x.side!==a.side&&alive(x));}
function lowest(list){return [...list].sort((a,b)=>hpPct(a)-hpPct(b)||a.id.localeCompare(b.id))[0]||null;}
function effect(actor,id,sourceId=null){return (actor?.effects||[]).find(e=>e.id===id&&(sourceId==null||e.sourceActorId===sourceId));}
function effectsBySource(actor,sourceId){return (actor?.effects||[]).filter(e=>e.sourceActorId===sourceId);}
function negativeCount(actor){return new Set((actor?.effects||[]).filter(e=>e.negative).map(e=>e.memory?.statusKind||e.id)).size;}
function hasNegative(actor){return negativeCount(actor)>0;}
function duration(owner,turns){return {mode:'actor-turn-end',actorId:owner.id,remaining:Math.max(1,n(turns,1)),appliedTurn:n(owner.turnControl?.turnsStarted)};}
function untilStart(actor){return {mode:'actor-turn-start',actorId:actor.id};}
function putEffect(actor,{id,sourceActorId=null,negative=false,removable=true,modifiers={},turns=null,untilActorStart=null,memory={},stacking='refresh'}={}){
 actor.effects=actor.effects||[];
 const item={id,sourceActorId,negative,removable,modifiers:{...modifiers},duration:untilActorStart?{mode:'actor-turn-start',actorId:untilActorStart}:turns?duration(actor,turns):null,memory:{...memory},stacking};
 const i=actor.effects.findIndex(e=>e.id===id&&e.sourceActorId===sourceActorId);
 if(i>=0&&stacking!=='stack')actor.effects[i]=item; else actor.effects.push(item);
 return item;
}
function removeEffect(actor,id,sourceId=null){const i=(actor.effects||[]).findIndex(e=>e.id===id&&(sourceId==null||e.sourceActorId===sourceId));if(i<0)return null;return actor.effects.splice(i,1)[0];}
function addShield(target,amount,{sourceActorId=null,abilityId='kept-impression',memory={}}={}){
 const value=Math.max(0,Math.round(n(amount))); if(!value)return 0; target.resources.shieldLayers=target.resources.shieldLayers||[];target.resources.shieldLayers.push({sourceActorId,abilityId,amount:value,originalAmount:value,memory:{...memory}});target.resources.shield=n(target.resources.shield)+value;return value;
}
function heal(target,amount){const before=n(target.resources.hp),mx=n(target.resources.maxHp);const actual=Math.min(Math.max(0,mx-before),Math.max(0,Math.round(n(amount))));target.resources.hp=before+actual;return actual;}
function healPct(target,pct){return heal(target,n(target.resources.maxHp)*n(pct)/100);}
function selfNonlethalDamage(actor,amount){const before=n(actor.resources.hp);const actual=Math.min(Math.max(0,before-1),Math.max(0,Math.round(n(amount))));actor.resources.hp=before-actual;return actual;}
function fallbackIndirectDamage(combat,source,target,amount,damageType='Force'){
 if(!combat||!source||!target||!alive(target))return 0;
 let dmg=Math.max(0,n(amount));
 const resist=n(target.resistances?.[damageType]);
 dmg=Math.max(0,Math.round(dmg*(1-resist/100)));
 let remaining=dmg;
 target.resources.shieldLayers=target.resources.shieldLayers||[];
 for(const layer of target.resources.shieldLayers){if(remaining<=0)break;const take=Math.min(remaining,Math.max(0,n(layer.amount)));layer.amount-=take;remaining-=take;}
 target.resources.shieldLayers=target.resources.shieldLayers.filter(l=>n(l.amount)>0);
 target.resources.shield=target.resources.shieldLayers.reduce((sum,l)=>sum+n(l.amount),0);
 const hp=Math.min(n(target.resources.hp),remaining);target.resources.hp=Math.max(0,n(target.resources.hp)-hp);
 combat.log?.push({type:'kept-indirect-fallback',sourceActorId:source.id,targetActorId:target.id,damageType,amount:hp});
 return hp;
}
function grantEnergy(actor,amount=1){const before=n(actor.resources.energy),mx=n(actor.resources.maxEnergy,7);actor.resources.energy=Math.min(mx,before+Math.max(0,n(amount)));return actor.resources.energy-before;}
function rider(pct,type,{canCrit=false,label=null}={}){return {pct:n(pct),damageType:type,canCrit:Boolean(canCrit),label:label||type};}
function firstDamagePacket(actor){const s=actor.keptState?.action||(actor.keptState.action={});if(s.damagePacket)return false;s.damagePacket=true;return true;}
function firstHealPacket(actor){const s=actor.keptState?.action||(actor.keptState.action={});if(s.healPacket)return false;s.healPacket=true;return true;}
function firstShieldPacket(actor){const s=actor.keptState?.action||(actor.keptState.action={});if(s.shieldPacket)return false;s.shieldPacket=true;return true;}
function firstActionCategory(actor,category){const s=actor.keptState?.action||(actor.keptState.action={});if(s.categoryMarked)return false;s.categoryMarked=category;return true;}
function chooseNonPhysical(rng=Math.random){const list=['Fire','Cold','Lightning','Poison','Force','Psychic','Holy','Dark','Radiant'];return list[Math.floor(clamp(rng(),0,.999999)*list.length)];}
function directAbility(ability,component,reaction){return !reaction&&component?.indirect!==true&&ability?.id&&!String(ability.id).startsWith('ki-rider-');}
function actionIsDamage(ability){return (ability?.components||[]).some(c=>c.type==='damage');}
function actionIsSupport(ability){return (ability?.components||[]).some(c=>c.type==='heal'||c.type==='shield');}
const SUMMON_KEPTS=['KI-089','KI-090','KI-091','KI-092','KI-093','KI-094','KI-124','KI-125','KI-126','KI-152','KI-153','KI-154','KI-172'];
function isSummon(actor){return actor?.real===false||actor?.kind==='summon';}
function hasSummonKept(actor){return Boolean(actor?.keptState)&&SUMMON_KEPTS.some(id=>hasKept(actor,id));}
function summonMemory(actor){actor.combatMemory=actor.combatMemory||{};actor.combatMemory.keptSummon=actor.combatMemory.keptSummon||{};return actor.combatMemory.keptSummon;}
function summonOwner(combat,summon){
 if(!isSummon(summon))return null;
 let owner=summon.summonOwnerId?(combat?.actors||[]).find(a=>a.id===summon.summonOwnerId):null;
 if(owner)return owner;
 const candidates=(combat?.actors||[]).filter(a=>a.real&&a.side===summon.side&&hasSummonKept(a));
 if(candidates.length===1){summon.summonOwnerId=candidates[0].id;return candidates[0];}
 return null;
}
function ownedSummons(combat,owner,{aliveOnly=true}={}){
 if(!owner)return [];
 const list=(combat?.actors||[]).filter(a=>isSummon(a)&&a.side===owner.side&&(!aliveOnly||alive(a))&&(a.summonOwnerId===owner.id||(!a.summonOwnerId&&summonOwner(combat,a)?.id===owner.id)));
 return list.sort((a,b)=>n(a.summonOrder)-n(b.summonOrder)||a.id.localeCompare(b.id));
}
function summonPrimaryType(summon){return summon?.primaryDamageType||summon?.basicAttack?.damageType||(summon?.enemyAbilities||[]).find(a=>(a.components||[]).some(c=>c.type==='damage'))?.components?.find(c=>c.type==='damage')?.damageType||'Force';}
function summonRoleIndex(combat,owner,summon){return Math.max(1,ownedSummons(combat,owner,{aliveOnly:false}).findIndex(s=>s.id===summon.id)+1);}
function actionNumericalBonusForSummon(combat,summon,category){
 const owner=summonOwner(combat,summon);if(!owner)return 0;const mem=summonMemory(summon);let pct=0;
 if(hasKept(owner,'KI-093')&&mem.companionCurrentBonus){pct+=20;mem.companionCurrentBonus=false;}
 if(hasKept(owner,'KI-094')&&mem.sharedFootingBonus){pct+=10;mem.sharedFootingBonus=false;}
 if(hasKept(owner,'KI-152')){const key=String(combat?.round||1);mem.covenantRounds=mem.covenantRounds||{};if(!mem.covenantRounds[key]){mem.covenantRounds[key]=true;pct+=25;}}
 if(hasKept(owner,'KI-172')){const role=summonRoleIndex(combat,owner,summon);if(role===1&&category==='Damage')pct+=30;if(role===2&&category==='Support')pct+=30;}
 if(hasKept(owner,'KI-126')&&mem.hoststepCategory==='Support'&&category==='Support'){pct+=20;mem.hoststepCategory=null;}
 return pct;
}
function applySummonStaticKis(combat){
 for(const summon of (combat?.actors||[]).filter(isSummon)){
  const owner=summonOwner(combat,summon);if(!owner)continue;const mem=summonMemory(summon);if(mem.staticApplied)return;
  const role=summonRoleIndex(combat,owner,summon);let maxHpPct=0;
  if(hasKept(owner,'KI-090'))maxHpPct+=10;
  if(hasKept(owner,'KI-172')&&role===3){maxHpPct+=20;for(const type of ['Physical','Fire','Cold','Lightning','Poison','Force','Psychic','Holy','Dark','Radiant'])summon.resistances[type]=n(summon.resistances?.[type])+20;}
  if(maxHpPct){const before=n(summon.resources.maxHp),ratio=before>0?n(summon.resources.hp)/before:1;const after=Math.max(1,Math.round(before*(1+maxHpPct/100)));summon.resources.maxHp=after;summon.resources.hp=Math.max(0,Math.min(after,Math.round(after*ratio)));}
  mem.staticApplied=true;mem.ownerId=owner.id;mem.primacyRole=role;
 }
}
function allActiveSummonsActedThisRound(combat,owner){const round=String(combat?.round||1),list=ownedSummons(combat,owner);return list.length>0&&list.every(s=>Boolean(summonMemory(s).actedRounds?.[round]));}
function roleEcho(owner,role){const st=kiState(owner,'KI-172');st.echoRoles=st.echoRoles||{};if(role>=1&&role<=3)st.echoRoles[role]=true;}

const SUMMON_KEPT_IDS=new Set(['KI-089','KI-090','KI-091','KI-092','KI-093','KI-094','KI-124','KI-125','KI-126','KI-152','KI-153','KI-154','KI-172']);
const CONSUMABLE_KEPT_IDS=new Set(['KI-096','KI-097','KI-132','KI-133']);
function keptRuntimeOwner(id){
 if(id==='KI-182')return 'classless-controller';
 if(id==='KI-267')return 'kept-impression-state';
 if(CONSUMABLE_KEPT_IDS.has(id))return 'consumable-event-hooks';
 if(id==='KI-095')return 'forest-reward-hook';
 if(['KI-098','KI-136','KI-195'].includes(id))return 'post-combat-recovery-hook';
 if(SUMMON_KEPT_IDS.has(id))return 'summon-event-hooks';
 if(Number(id.slice(3))>=201)return 'subclass-state/controller + kept-impression-runtime';
 return 'kept-impression-runtime';
}
export function getKeptRuntimeCoverage(ids=[]) { return ids.map(id=>({id,owner:keptRuntimeOwner(id)})); }
export function keptBeforeConsumableUse({slot,combat,actor,itemId=null,slotIndex=null,isFood=false,primaryEffect=null,pocketGrantedSlot=false}={}){
 const context={itemId,slotIndex:Number(slotIndex||0),isFood:Boolean(isFood),primaryEffect,pocketGrantedSlot:Boolean(pocketGrantedSlot),numericalMultiplier:1,preparedFlask:false,roadfeastFirst:false};
 if(!actor?.keptState)return context;
 if(hasKept(actor,'KI-096')){const st=kiState(actor,'KI-096');if(!st.used){context.numericalMultiplier*=1.20;context.preparedFlask=true;}}
 if(hasKept(actor,'KI-132')&&isFood&&itemId){const campaignState=slot?.campaign?.state;if(campaignState){campaignState.keptImpressions=campaignState.keptImpressions||{};const road=campaignState.keptImpressions.roadfeastMemory||(campaignState.keptImpressions.roadfeastMemory={foods:[],statPointsGranted:false});if(!road.foods.includes(itemId)){context.numericalMultiplier*=2.25;context.roadfeastFirst=true;}}}
 return context;
}

export function keptAfterConsumableUse({slot,combat,actor,context={},resolved={}}={}){
 if(!actor?.keptState)return {ok:false};
 const primary=resolved.primaryEffect||context.primaryEffect||null;
 if(context.preparedFlask&&hasKept(actor,'KI-096')){
  const st=kiState(actor,'KI-096');st.used=true;
  if(primary==='healing'||primary==='heal')putEffect(actor,{id:'ki-096-aftertaste-healing',sourceActorId:actor.id,turns:2,modifiers:{incomingHealingPct:10},memory:{statusKind:'Aftertaste'}});
  else if(primary==='damage')putEffect(actor,{id:'ki-096-aftertaste-damage',sourceActorId:actor.id,turns:2,memory:{statusKind:'Aftertaste',damageType:resolved.damageType||'Physical',keptDamageTypePct:10}});
  else if(primary==='shield')putEffect(actor,{id:'ki-096-aftertaste-shield',sourceActorId:actor.id,turns:2,modifiers:{blockedDamageReductionPct:10},memory:{statusKind:'Aftertaste'}});
 }
 if(hasKept(actor,'KI-097')&&(Number(context.slotIndex)===6||context.pocketGrantedSlot)){const st=kiState(actor,'KI-097');if(!st.sixthSlotUsed){st.sixthSlotUsed=true;actor.explicitInitiativeBonus=n(actor.explicitInitiativeBonus)+1;putEffect(actor,{id:'ki-097-sixth-discipline',sourceActorId:actor.id,untilActorStart:actor.id,modifiers:{energyGainPct:10},memory:{statusKind:'Pocket Discipline'}});}}
 if(hasKept(actor,'KI-133')){const st=kiState(actor,'KI-133');if(!st.used){st.used=true;st.echo={primaryEffect:primary,damageType:resolved.damageType||null,value:n(resolved.eligibleNumericalValue??resolved.value),energy:n(resolved.energy),targetId:resolved.targetId||null,control:false};}}
 if(context.roadfeastFirst&&hasKept(actor,'KI-132')&&context.itemId){const campaignState=slot?.campaign?.state;if(campaignState){campaignState.keptImpressions=campaignState.keptImpressions||{};const road=campaignState.keptImpressions.roadfeastMemory||(campaignState.keptImpressions.roadfeastMemory={foods:[],statPointsGranted:false});if(!road.foods.includes(context.itemId))road.foods.push(context.itemId);const removable=(actor.effects||[]).find(e=>e.negative&&e.removable!==false&&(['Burn','Poison','Bleed'].includes(e.memory?.statusKind)||e.memory?.dot===true));if(removable)actor.effects=actor.effects.filter(e=>e!==removable);if(road.foods.length>=4&&!road.statPointsGranted){road.statPointsGranted=true;if(campaignState.character)campaignState.character.unspentLevelStatPoints=n(campaignState.character.unspentLevelStatPoints)+12;}}}
 return {ok:true};
}

export function consumeKeptTrailstockEcho(actor){
 if(!actor?.keptState||!hasKept(actor,'KI-133'))return null;const st=kiState(actor,'KI-133');if(!st.echo)return null;const echo={...st.echo,multiplier:.25,value:n(st.echo.value)*.25,energy:n(st.echo.energy)*.25};st.echo=null;return echo;
}

export function resolveKeptEnergyGainRoll({actor,chancePct=0,rng=Math.random}={}){
 let chance=n(chancePct)+(actor?.effects||[]).reduce((sum,e)=>sum+n(e?.modifiers?.energyGainPct),0);
 if(actor?.keptState&&hasKept(actor,'KI-093')&&kiState(actor,'KI-093').energyGainWindow)chance+=15;
 let patienceUsed=false;
 if(actor?.keptState&&hasKept(actor,'KI-015')){const st=kiState(actor,'KI-015');if(st.chargedPatience){chance+=25;st.chargedPatience=false;patienceUsed=true;}}
 const success=clamp(rng(),0,.999999)*100<Math.max(0,chance);
 if(actor?.keptState&&hasKept(actor,'KI-015')&&!success){const st=kiState(actor,'KI-015');if(!st.failedOnce){st.failedOnce=true;st.chargedPatience=true;}}
 return {success,chancePct:chance,patienceUsed};
}

export function initializeKeptCombat(combat,{rng=Math.random}={}){
 for(const actor of combat?.actors||[]){
  if(!actor.keptState)continue;
  // First Bell is established from the actual rolled queue totals.
  if(hasKept(actor,'KI-002')){const higher=enemies(combat,actor).some(e=>n(e.initiative?.total)>n(actor.initiative?.total));if(higher)kiState(actor,'KI-002').active=true;}
  if(hasKept(actor,'KI-146')&&actor.real){for(const ally of allies(combat,actor,{real:true})){addShield(ally,n(ally.resources.maxHp)*.06,{sourceActorId:actor.id,abilityId:'ki-146-kindleline'});}const low=lowest(allies(combat,actor,{real:true}));if(low)putEffect(low,{id:'ki-146-kindled',sourceActorId:actor.id,turns:2,modifiers:{finalDamagePct:10,incomingHealingPct:10},memory:{statusKind:'Kindled'}});}
  if(hasKept(actor,'KI-184'))kiState(actor,'KI-184').awaitingChoice=true;
  if(hasKept(actor,'KI-184')&&keptChoice(actor,'KI-184','ignite',false)){kiState(actor,'KI-184').awaitingChoice=false;putEffect(actor,{id:'ki-184-cinderwound',sourceActorId:actor.id,negative:true,removable:false,turns:3,memory:{statusKind:'Burn',selfCinderwound:true,tickPctMaxHp:4,tickTiming:'owner-turn-end',nonlethal:true}});kiState(actor,'KI-184').ignited=true;}
  if(hasKept(actor,'KI-186'))putEffect(actor,{id:'ki-186-venom-debt',sourceActorId:actor.id,negative:true,removable:false,turns:3,modifiers:{incomingHealingPct:-10},memory:{statusKind:'Poison',venomDebt:true,tickPctMaxHp:3,tickTiming:'owner-turn-end',nonlethal:true}});
  if(hasKept(actor,'KI-209')&&actor.subclass==='Gunslinger')kiState(actor,'KI-209').triggered=false;
  if(hasKept(actor,'KI-259')&&actor.subclass==='Vowscarred'){actor.subclassState.oath=0;actor.subclassState.fractures=3;}
  if(hasKept(actor,'KI-260')&&actor.subclass==='Vowscarred'){actor.subclassState.oath=3;actor.subclassState.fractures=0;}
 }
 applySummonStaticKis(combat);
 return combat;
}

export function setKeptCombatStartChoice(slot,{actorId,kiId,key,value}={}){
 const next=typeof structuredClone==='function'?structuredClone(slot):JSON.parse(JSON.stringify(slot));
 const combat=next?.campaign?.state?.combat;const actor=(combat?.actors||[]).find(a=>a.id===actorId);
 if(!actor||!hasKept(actor,kiId))return {ok:false,error:'That combatant does not have this Kept Impression.'};
 if(kiId!=='KI-184'||key!=='ignite'||typeof value!=='boolean')return {ok:false,error:'Unknown combat-start Kept Impression choice.'};
 const st=kiState(actor,'KI-184');if(!st.awaitingChoice)return {ok:false,error:'That combat-start choice has already been made.'};
 st.awaitingChoice=false;actor.keptImpressionChoices=actor.keptImpressionChoices||{};actor.keptImpressionChoices['KI-184']={...(actor.keptImpressionChoices['KI-184']||{}),ignite:value};
 if(value){const c=putEffect(actor,{id:'ki-184-cinderwound',sourceActorId:actor.id,negative:true,removable:false,turns:3,memory:{statusKind:'Burn',selfCinderwound:true,tickPctMaxHp:4,tickTiming:'owner-turn-end',nonlethal:true}});if(c.duration)c.duration.appliedTurn=Math.max(0,n(actor.turnControl?.turnsStarted)-1);st.ignited=true;}
 combat.log?.push({type:'kept-combat-start-choice',actorId:actor.id,kiId:'KI-184',choice:value?'ignite':'decline'});
 return {ok:true,slot:next,combat:typeof structuredClone==='function'?structuredClone(combat):JSON.parse(JSON.stringify(combat))};
}

export function keptBeforeTurnStart({slot,combat,actor,helpers={}}={}){
 if(isSummon(actor)){const mem=summonMemory(actor);if((actor.resources?.shieldLayers||[]).some(l=>l.abilityId==='ki-092-summoned-shelter')){mem.shelterHealBonus=true;mem.shelterShieldSurvived=true;}}
 if(!actor?.keptState)return {bonusEnergyAfterNatural:0};
 if(hasKept(actor,'KI-093')){const st=kiState(actor,'KI-093');st.energyGainWindow=false;st.actingSummonId=null;}
 let bonusEnergyAfterNatural=0;
 // Tomorrow's Wound resolves before natural energy and is explicitly unmitigated.
 if(hasKept(actor,'KI-196')){const st=kiState(actor,'KI-196');if(n(st.stored)>0){const dmg=Math.min(n(actor.resources.hp),Math.round(n(st.stored)));actor.resources.hp=Math.max(0,n(actor.resources.hp)-dmg);st.stored=0;st.active=false;combat.log?.push({type:'ki-deferred-damage',kiId:'KI-196',actorId:actor.id,amount:dmg});}}
 if(hasKept(actor,'KI-142')){const st=kiState(actor,'KI-142');if(st.zeroLoop&&n(st.readyOnTurn)<=n(actor.turnControl?.turnsStarted)+1){bonusEnergyAfterNatural+=1;st.loopEcho=true;st.zeroLoop=false;}}
 if(hasKept(actor,'KI-169')&&((n(actor.turnControl?.turnsStarted)+1)%2===0))bonusEnergyAfterNatural+=1;
 if(hasKept(actor,'KI-060')){const st=kiState(actor,'KI-060');if(st.spark&&n(st.cooldown||0)<=0){bonusEnergyAfterNatural+=1;st.spark=false;st.firstHit=true;st.cooldown=3;}}
 if(hasKept(actor,'KI-159')){const st=kiState(actor,'KI-159');if(st.surgebackNext){st.surgebackReady=true;st.surgebackNext=false;}}
 return {bonusEnergyAfterNatural};
}

export function keptAfterTurnStart({slot,combat,actor,bonusEnergyGranted=0,helpers={}}={}){
 if(!actor?.keptState)return;
 if(bonusEnergyGranted>0)keptOnBonusEnergy({slot,combat,actor,amount:bonusEnergyGranted,helpers});
 if(hasKept(actor,'KI-144')){const st=kiState(actor,'KI-144');if(n(actor.resources.energy)>=n(actor.resources.maxEnergy)&&st.wasBelowMax!==false){st.ghostwake=true;st.wasBelowMax=false;} }
}

export function keptBeforeAction({combat,actor,ability}={}){
 if(!actor?.keptState)return;
 const category=actionCategory(ability);actor.keptState.action={energyAtStart:n(actor.resources.energy),category,damagePacket:false,healPacket:false,shieldPacket:false};
 if(isSummon(actor)){
  const owner=summonOwner(combat,actor),mem=summonMemory(actor);
  if(owner&&hasKept(owner,'KI-126')){const st=kiState(owner,'KI-126'),round=String(combat?.round||1);if(st.hoststepRound!==round&&owner.keptState?.lastActionCategory){st.hoststepRound=round;mem.hoststepCategory=owner.keptState.lastActionCategory;}}
  mem.actionNumericalBonusPct=actionNumericalBonusForSummon(combat,actor,category);
 }
 if(hasKept(actor,'KI-124')){const st=kiState(actor,'KI-124');st.circuitAction=Boolean(st.damageCircuit&&st.mercyCircuit);if(st.circuitAction){st.damageCircuit=false;st.mercyCircuit=false;}}
 if(hasKept(actor,'KI-152')){const st=kiState(actor,'KI-152');st.actionPct=n(st.ownerNextPct);st.ownerNextPct=0;}
 if(hasKept(actor,'KI-153')){const st=kiState(actor,'KI-153');st.bodyNotes=st.bodyNotes||{};if(st.bodyNotes[3]){addShield(actor,n(actor.resources.maxHp)*.07,{sourceActorId:actor.id,abilityId:'ki-153-third-body'});st.bodyNotes[3]=false;}}
 if(hasKept(actor,'KI-172')){const st=kiState(actor,'KI-172');st.echoRoles=st.echoRoles||{};if(st.echoRoles[3]){addShield(actor,n(actor.resources.maxHp)*.08,{sourceActorId:actor.id,abilityId:'ki-172-third-echo'});st.echoRoles[3]=false;}}
 if(hasKept(actor,'KI-246')){const st=kiState(actor,'KI-246');st.useBonusThisAction=Boolean(st.bonusDamageReady&&ability?.subclass==='Fluxwrought'&&(ability.components||[]).some(c=>c.type==='damage'));if(st.useBonusThisAction)st.bonusDamageReady=false;}
 if(hasKept(actor,'KI-166')&&!kiState(actor,'KI-166').chosen){const cat=category;kiState(actor,'KI-166').chosen=cat;kiState(actor,'KI-166').active=true;}
}

export function keptEnergySpent({slot,combat,actor,ability,amount,helpers={},rng=Math.random}={}){
 if(!actor?.keptState)return;
 const spent=Math.max(0,n(amount));actor.keptState.energySpentCumulative=n(actor.keptState.energySpentCumulative)+spent;
 if(hasKept(actor,'KI-006')){const st=kiState(actor,'KI-006');st.progress=n(st.progress)+spent;while(st.progress>=3){st.progress-=3;const opts=['Ember','Rime','Storm','Chorus'].filter(x=>x!==st.last);const pick=opts[Math.floor(clamp(rng(),0,.999999)*opts.length)];st.last=pick;st.ovation=pick;if(pick==='Rime')addShield(actor,n(actor.resources.maxHp)*.12,{sourceActorId:actor.id,abilityId:'ki-006-rime'});if(pick==='Storm'){const gained=grantEnergy(actor,1);if(gained)keptOnBonusEnergy({slot,combat,actor,amount:gained,helpers});}}}
 if(hasKept(actor,'KI-059')&&spent>=3)kiState(actor,'KI-059').cleanSpend=true;
 if(hasKept(actor,'KI-062')&&spent>=2&&n(kiState(actor,'KI-062').cooldown)<=0){if(hpPct(actor)<100)healPct(actor,3);else kiState(actor,'KI-062').restoration=true;kiState(actor,'KI-062').cooldown=2;}
 if(hasKept(actor,'KI-109')&&spent>=3&&n(kiState(actor,'KI-109').cooldown)<=0){healPct(actor,5);kiState(actor,'KI-109').active=true;kiState(actor,'KI-109').cooldown=2;}
 if(hasKept(actor,'KI-143')&&spent>=4&&n(kiState(actor,'KI-143').cooldown)<=0){kiState(actor,'KI-143').overdraw=true;kiState(actor,'KI-143').cooldown=3;}
 if(hasKept(actor,'KI-159')&&spent>=4)kiState(actor,'KI-159').surgebackNext=true;
 if(hasKept(actor,'KI-169')&&spent>=3&&n(kiState(actor,'KI-169').charges)>=4){kiState(actor,'KI-169').empower=true;kiState(actor,'KI-169').charges=0;}
 if(hasKept(actor,'KI-108')&&spent>=3&&n(kiState(actor,'KI-108').dividend)>0){kiState(actor,'KI-108').consumeDividend=n(kiState(actor,'KI-108').dividend);kiState(actor,'KI-108').dividend=0;}
 if(actor.subclass==='Fontborn'&&hasKept(actor,'KI-244')&&spent>0&&actor.subclassState){actor.subclassState.font=Math.min(5,n(actor.subclassState.font)+2);}
}

export function keptOnBonusEnergy({slot,combat,actor,amount=1,helpers={}}={}){
 if(!actor?.keptState||n(amount)<=0)return;
 actor.keptState.bonusEnergyGained=n(actor.keptState.bonusEnergyGained)+n(amount);
 if(hasKept(actor,'KI-058'))kiState(actor,'KI-058').charged=true;
 if(hasKept(actor,'KI-061')&&!actor.keptState.round['KI-061']){actor.keptState.round['KI-061']=true;addShield(actor,n(actor.resources.maxHp)*.04,{sourceActorId:actor.id,abilityId:'ki-061-current-shield'});kiState(actor,'KI-061').currentShield=true;}
 if(hasKept(actor,'KI-108'))kiState(actor,'KI-108').dividend=Math.min(3,n(kiState(actor,'KI-108').dividend)+n(amount));
 if(hasKept(actor,'KI-110')&&kiState(actor,'KI-110').quickening){kiState(actor,'KI-110').charged=true;kiState(actor,'KI-110').quickening=false;actor.explicitInitiativeBonus=n(actor.explicitInitiativeBonus)+1;}
 if(hasKept(actor,'KI-169'))kiState(actor,'KI-169').charges=Math.min(4,n(kiState(actor,'KI-169').charges)+n(amount));
 if(hasKept(actor,'KI-093')){const st=kiState(actor,'KI-093');if(st.energyGainWindow&&st.actingSummonId){const summon=(combat?.actors||[]).find(a=>a.id===st.actingSummonId&&alive(a));if(summon)summonMemory(summon).companionCurrentBonus=true;}}
 if(hasKept(actor,'KI-144')){const st=kiState(actor,'KI-144');if(n(actor.resources.energy)>=n(actor.resources.maxEnergy)&&st.wasBelowMax!==false){st.ghostwake=true;st.wasBelowMax=false;}}
 const link=effect(actor,'ki-117-clean-current');if(link&&!link.memory?.fired){link.memory.fired=true;const other=(combat.actors||[]).find(a=>a.id===link.memory.otherId&&alive(a));if(other)grantEnergy(other,1);}
}

export function keptBeforeDamage({slot,combat,source,target,ability,component,reaction=false,rng=Math.random}={}){
 const out={finalDamagePct:0,critChanceBonus:0,critDamageBonus:0,targetDodgeChanceDelta:0,blockChanceMultiplier:1,incomingHpDamageMultiplier:1,deferHpDamagePct:0,preventLethal:false,riders:[],damageType:null};
 if(!source||!target)return out;
 const direct=directAbility(ability,component,reaction), first=direct&&firstDamagePacket(source), base=n(component?.base);
 if(isSummon(source)&&direct){
  const owner=summonOwner(combat,source),mem=summonMemory(source);out.finalDamagePct+=n(mem.actionNumericalBonusPct);
  if(owner&&hasKept(owner,'KI-126')&&mem.hoststepCategory==='Damage'&&first){out.riders.push(rider(20,'Force'));mem.hoststepCategory=null;}
 }
 if(source.keptState&&direct){
  const activeSummons=ownedSummons(combat,source);
  if(hasKept(source,'KI-172')&&activeSummons.length)out.finalDamagePct-=10;
  if(hasKept(source,'KI-152'))out.finalDamagePct+=n(kiState(source,'KI-152').actionPct);
  if(first&&hasKept(source,'KI-089')){const st=kiState(source,'KI-089');if(st.wake){out.riders.push(rider(15,st.wakeType||'Force'));st.wake=false;st.wakeType=null;}}
  if(first&&hasKept(source,'KI-091')&&effect(target,'ki-091-summoned-precision',source.id)){out.critChanceBonus+=8;removeEffect(target,'ki-091-summoned-precision',source.id);}
  if(first&&hasKept(source,'KI-124')&&kiState(source,'KI-124').circuitAction)out.riders.push(rider(20,'Force'));
  if(first&&hasKept(source,'KI-125')&&kiState(source,'KI-125').borrowedBodyRider&&n(kiState(source,'KI-125').borrowedUntil)>=n(source.turnControl?.turnsStarted)){const st=kiState(source,'KI-125');out.riders.push(rider(25,st.borrowedBodyType||'Force'));st.borrowedBodyRider=false;}
  if(first&&hasKept(source,'KI-153')){const st=kiState(source,'KI-153');st.bodyNotes=st.bodyNotes||{};if(st.bodyNotes[1]){out.riders.push(rider(15,'Force'));st.bodyNotes[1]=false;}}
  if(first&&hasKept(source,'KI-154')&&kiState(source,'KI-154').fallenEcho&&n(kiState(source,'KI-154').fallenUntil)>=n(source.turnControl?.turnsStarted)){const st=kiState(source,'KI-154');out.riders.push(rider(35,st.fallenType||'Force'));st.fallenEcho=false;}
  if(first&&hasKept(source,'KI-172')){const st=kiState(source,'KI-172');st.echoRoles=st.echoRoles||{};if(st.echoRoles[1]){out.riders.push(rider(20,'Force'));st.echoRoles[1]=false;}}
 }
 if(source.keptState&&direct){
  const add=(pct,type,opts={})=>out.riders.push(rider(pct,hasKept(source,'KI-178')?keptChoice(source,'KI-178','damageType',type):type,opts));
  if(hasKept(source,'KI-001')){const st=kiState(source,'KI-001');if(n(st.lastlight)>0&&first){add(n(st.lastlight)>=3?30:15,'Force');if(n(st.lastlight)>=2)st.aftershockPending=true;if(n(st.lastlight)>=3)st.lastlight=0;}}
  if(hasKept(source,'KI-002')&&kiState(source,'KI-002').charged&&first){add(20,'Lightning');kiState(source,'KI-002').charged=false;}
  if(hasKept(source,'KI-003')&&kiState(source,'KI-003').kinEcho&&first){add(25,'Force');kiState(source,'KI-003').kinEcho=false;}
  if(hasKept(source,'KI-008')&&kiState(source,'KI-008').chargedTarget===target.id&&first){add(20,keptChoice(source,'KI-008','damageType','Force'));kiState(source,'KI-008').chargedTarget=null;}
  if(hasKept(source,'KI-009')&&!kiState(source,'KI-009').used&&n(source.turnControl?.turnsStarted)===1&&first){const acted=enemies(combat,source).every(e=>n(e.turnControl?.turnsStarted)===0);if(acted){add(15,'Lightning');kiState(source,'KI-009').used=true;}}
  if(hasKept(source,'KI-010')&&kiState(source,'KI-010').veiled&&first){add(10,'Psychic');kiState(source,'KI-010').veiled=false;}
  if(hasKept(source,'KI-013')&&kiState(source,'KI-013').gripstone&&first){add(15,'Force');kiState(source,'KI-013').gripstone=false;}
  if(hasKept(source,'KI-017')&&kiState(source,'KI-017').followthrough&&first){kiState(source,'KI-017').consumeOnNonCrit=true;}
  if(hasKept(source,'KI-020')&&kiState(source,'KI-020').breathbank&&first){add(15,'Cold');kiState(source,'KI-020').breathbank=false;kiState(source,'KI-020').initiativeDownTarget=target.id;}
  if(hasKept(source,'KI-022')&&n(source.keptState.action?.energyAtStart)===1&&first)add(10,'Lightning');
  if(hasKept(source,'KI-026')&&hpPct(source)<=50&&!source.keptState.round['KI-026']&&first){add(10,'Fire');source.keptState.round['KI-026']=true;}
  if(hasKept(source,'KI-029')&&first){const st=kiState(source,'KI-029');st.step=st.targetId===target.id?(n(st.step)%3)+1:1;st.targetId=target.id;const vals=[[12,'Physical'],[15,'Force'],[18,'Fire']];add(...vals[st.step-1]);}
  if(hasKept(source,'KI-030')&&first){const st=kiState(source,'KI-030');if(st.targetId&&st.targetId!==target.id){add(18,'Force');st.crosscut=true;}st.targetId=target.id;}
  if(hasKept(source,'KI-031')&&first&&!source.keptState.round[`KI-031:${target.id}`]&&n(target.turnControl?.turnsStarted)<n(source.turnControl?.turnsStarted)){add(20,'Lightning');source.keptState.round[`KI-031:${target.id}`]=true;kiState(source,'KI-031').speedTarget=target.id;}
  if(hasKept(source,'KI-032')&&first&&hpPct(target)<40&&!source.keptState.turn['KI-032']){add(20,'Dark');source.keptState.turn['KI-032']=true;kiState(source,'KI-032').selfCost=true;}
  if(hasKept(source,'KI-118')&&kiState(source,'KI-118').harvest==='offense'&&first){add(25,'Holy');kiState(source,'KI-118').harvest=null;}
  const cleanHand=effect(source,'ki-148-clean-hand');if(cleanHand&&first){add(25,'Holy');removeEffect(source,'ki-148-clean-hand');}
  if(hasKept(source,'KI-034')&&!source.keptState.turn['KI-034']&&n(target.resources?.shield)<=0)kiState(source,'KI-034').pendingBareTarget=target.id;
  if(hasKept(source,'KI-035')&&first&&!kiState(source,'KI-035').used){add(25,keptChoice(source,'KI-035','damageType','Force'));kiState(source,'KI-035').used=true;}
  if(hasKept(source,'KI-036')&&kiState(source,'KI-036').rebound&&first){add(30,'Force');kiState(source,'KI-036').rebound=false;kiState(source,'KI-036').blockedAttackerHit=kiState(source,'KI-036').attackerId===target.id;}
  if(hasKept(source,'KI-037')&&kiState(source,'KI-037').misreadTarget===target.id&&first){out.targetDodgeChanceDelta-=10;add(20,'Psychic');kiState(source,'KI-037').misreadTarget=null;}
  if(hasKept(source,'KI-038')&&kiState(source,'KI-038').timingTarget===target.id&&first){add(15,'Force');kiState(source,'KI-038').timingTarget=null;}
  if(hasKept(source,'KI-040')&&kiState(source,'KI-040').type&&kiState(source,'KI-040').type!==component.damageType&&first){add(25,kiState(source,'KI-040').type);kiState(source,'KI-040').type=null;}
  if(hasKept(source,'KI-042')&&n(kiState(source,'KI-042').stored)>0&&first){out.riders.push({flat:n(kiState(source,'KI-042').stored),damageType:'Force',canCrit:false});kiState(source,'KI-042').stored=0;}
  if(hasKept(source,'KI-046')&&kiState(source,'KI-046').attackerId===target.id&&first){add(20,kiState(source,'KI-046').type||'Force');kiState(source,'KI-046').attackerId=null;}
  if(hasKept(source,'KI-050')&&n(combat.round)===1&&first&&!kiState(source,'KI-050').damage){add(15,'Lightning');kiState(source,'KI-050').damage=true;}
  if(hasKept(source,'KI-051')&&first){const allActed=enemies(combat,source).every(e=>n(e.turnControl?.turnsStarted)>=n(combat.round));if(allActed)add(20,'Cold');}
  if(hasKept(source,'KI-052')&&kiState(source,'KI-052').tempo&&kiState(source,'KI-052').lastCategory!=='Damage'&&first){add(15,'Lightning');kiState(source,'KI-052').tempo=false;source.explicitInitiativeBonus=n(source.explicitInitiativeBonus)+2;}
  if(hasKept(source,'KI-053')&&kiState(source,'KI-053').certainTarget===target.id&&first)out.critChanceBonus+=15;
  if(hasKept(source,'KI-054')&&hpPct(source)>=100&&first&&!source.keptState.round['KI-054']){kiState(source,'KI-054').aim=true;source.keptState.round['KI-054']=true;}
  if(hasKept(source,'KI-055')&&effect(target,'ki-055-deep-edge',source.id)&&first){add(20,'Dark');removeEffect(target,'ki-055-deep-edge',source.id);}
  if(hasKept(source,'KI-056')&&kiState(source,'KI-056').emptyCircuitHit&&first){add(15,'Lightning');kiState(source,'KI-056').emptyCircuitHit=false;}
  if(hasKept(source,'KI-058')&&kiState(source,'KI-058').charged&&first){add(20,'Lightning');kiState(source,'KI-058').charged=false;}
  if(hasKept(source,'KI-059')&&kiState(source,'KI-059').cleanSpend&&n(ability?.energyCost)===0&&first){add(20,'Force');kiState(source,'KI-059').cleanSpend=false;}
  if(hasKept(source,'KI-063')&&n(source.turnControl?.turnsStarted)===1){out.critChanceBonus+=35;out.critDamageBonus+=30;}
  if(hasKept(source,'KI-064')&&kiState(source,'KI-064').staticMemory&&first){add(20,'Lightning');kiState(source,'KI-064').staticMemory=false;}
  if(hasKept(source,'KI-077')&&kiState(source,'KI-077').venomCharge&&first){add(20,'Poison');kiState(source,'KI-077').venomCharge=false;}
  if(hasKept(source,'KI-079')&&effect(target,'ki-079-mirror',source.id)&&first){add(15,component.damageType||'Force');removeEffect(target,'ki-079-mirror',source.id);}
  if(hasKept(source,'KI-081')&&negativeCount(source)>=2&&first)out.finalDamagePct+=15;
  if(hasKept(source,'KI-083')&&first){const c=negativeCount(target);if(c>=4)add(25,'Psychic');else if(c>=2)add(15,'Psychic');}
  if(hasKept(source,'KI-084')&&kiState(source,'KI-084').targetId===target.id&&first)out.critChanceBonus+=6;
  if(hasKept(source,'KI-087')&&kiState(source,'KI-087').riderType&&first){add(15,kiState(source,'KI-087').riderType);kiState(source,'KI-087').riderType=null;}
  if(hasKept(source,'KI-088')&&kiState(source,'KI-088').wardCharge&&first){add(20,keptChoice(source,'KI-088','damageType','Force'));kiState(source,'KI-088').wardCharge=false;}
  if(hasKept(source,'KI-099')&&first){const st=kiState(source,'KI-099');if(st.lastCategory==='Support'){add(15,'Holy');st.stacks=Math.min(3,n(st.stacks)+1);if(st.stacks>=3)add(15,'Holy');}st.lastCategory='Damage';}
  if(hasKept(source,'KI-100')&&n(kiState(source,'KI-100').white)>0&&first){for(let i=0;i<n(kiState(source,'KI-100').white);i++)add(12,'Dark');kiState(source,'KI-100').white=0;}
  if(hasKept(source,'KI-102')&&n(kiState(source,'KI-102').debt)>0&&first)kiState(source,'KI-102').pendingDebt=n(kiState(source,'KI-102').debt);
  if(hasKept(source,'KI-103')&&n(kiState(source,'KI-103').pace)>=3&&first){add(35,'Dark');kiState(source,'KI-103').mournTarget=target.id;kiState(source,'KI-103').pace=0;}
  if(hasKept(source,'KI-104')&&kiState(source,'KI-104').chargedTarget===target.id&&first){add(25,'Holy');kiState(source,'KI-104').chargedTarget=null;}
  if(hasKept(source,'KI-105')&&n(kiState(source,'KI-105').heat)>0&&first){out.riders.push({flat:n(kiState(source,'KI-105').heat),damageType:'Fire',canCrit:false});kiState(source,'KI-105').heat=0;}
  if(hasKept(source,'KI-106')&&kiState(source,'KI-106').wind&&kiState(source,'KI-106').stone&&first){add(20,'Force');add(20,'Lightning');kiState(source,'KI-106').wind=false;kiState(source,'KI-106').stone=false;}
  if(hasKept(source,'KI-107')&&n(kiState(source,'KI-107').current)>0&&first){for(let i=0;i<n(kiState(source,'KI-107').current);i++)add(12,'Lightning');kiState(source,'KI-107').current=0;}
  if(hasKept(source,'KI-108')&&n(kiState(source,'KI-108').consumeDividend)>0&&first){for(let i=0;i<n(kiState(source,'KI-108').consumeDividend);i++)add(15,'Lightning');kiState(source,'KI-108').consumeDividend=0;}
  if(hasKept(source,'KI-110')&&kiState(source,'KI-110').charged&&first){add(20,'Lightning');kiState(source,'KI-110').charged=false;}
  if(hasKept(source,'KI-113')&&n(kiState(source,'KI-113').beats)>0&&first){const b=n(kiState(source,'KI-113').beats);for(let i=0;i<b;i++)add(15,'Force');if(b>=3)kiState(source,'KI-113').crumple=true;kiState(source,'KI-113').beats=0;}
  if(hasKept(source,'KI-114')&&n(kiState(source,'KI-114').beats)>0&&first){const b=n(kiState(source,'KI-114').beats);for(let i=0;i<b;i++)add(10,'Lightning');out.critChanceBonus+=b*4;kiState(source,'KI-114').beats=0;}
  if(hasKept(source,'KI-119')&&kiState(source,'KI-119').singularTarget===target.id&&first){const st=kiState(source,'KI-119');const seq=['Poison','Force','Dark'];add(20,seq[n(st.stage)%3]);st.stage=(n(st.stage)+1)%3;}
  if(hasKept(source,'KI-120')&&kiState(source,'KI-120').pivotTarget===target.id&&first){add(25,'Psychic');out.critDamageBonus+=Math.min(30,n(kiState(source,'KI-120').copiedCritBonus));kiState(source,'KI-120').pivotTarget=null;}
  if(hasKept(source,'KI-128')&&kiState(source,'KI-128').a&&kiState(source,'KI-128').b&&first){add(15,kiState(source,'KI-128').a);add(15,kiState(source,'KI-128').b);kiState(source,'KI-128').a=null;kiState(source,'KI-128').b=null;}
  if(hasKept(source,'KI-130')&&kiState(source,'KI-130').shelterReady&&first){add(15,'Holy');kiState(source,'KI-130').shelterReady=false;}
  if(hasKept(source,'KI-134')&&n((source.__derivedAggroMultiplier)||1)<=.5&&first){const st=kiState(source,'KI-134');if(st.hiddenTarget===target.id){add(20,'Psychic');st.hiddenTarget=null;}else st.pendingTarget=target.id;}
  if(hasKept(source,'KI-137')&&n(kiState(source,'KI-137').crowns)>0&&first)kiState(source,'KI-137').pending=n(kiState(source,'KI-137').crowns);
  if(hasKept(source,'KI-138')&&n(kiState(source,'KI-138').wall)>0&&first){out.riders.push({flat:n(kiState(source,'KI-138').wall),damageType:'Force',canCrit:false});kiState(source,'KI-138').wall=0;}
  if(hasKept(source,'KI-139')&&kiState(source,'KI-139').mirrorstep&&first)kiState(source,'KI-139').mirrorTarget=target.id;
  if(hasKept(source,'KI-140')&&kiState(source,'KI-140').scar&&first){add(30,'Lightning');kiState(source,'KI-140').scar=false;kiState(source,'KI-140').siphonRider=true;}
  if(hasKept(source,'KI-141')&&hpPct(source)<50&&first){const st=kiState(source,'KI-141');const seq=['Fire','Dark','Physical'];add(20,seq[n(st.stage)%3]);st.stage=(n(st.stage)+1)%3;st.selfCost=true;}
  if(hasKept(source,'KI-142')&&kiState(source,'KI-142').loopEcho&&first){add(20,'Force');kiState(source,'KI-142').loopEcho=false;}
  if(hasKept(source,'KI-143')&&kiState(source,'KI-143').overdraw&&n(ability?.energyCost)===0&&first){add(25,'Lightning');}
  if(hasKept(source,'KI-144')&&kiState(source,'KI-144').ghostwake&&first){out.critChanceBonus+=15;if(kiState(source,'KI-144').dodged)add(25,'Psychic');kiState(source,'KI-144').consumeAfter=true;}
  if(hasKept(source,'KI-147')&&n(kiState(source,'KI-147').recoil)>0&&first){const b=n(kiState(source,'KI-147').recoil);for(let i=0;i<b;i++)add(10,'Force');kiState(source,'KI-147').spent=b;kiState(source,'KI-147').recoil=0;}
  if(hasKept(source,'KI-149')&&first){const c=Math.min(5,negativeCount(target));if(c>=5)add(35,'Psychic');else if(c>=3)add(20,'Psychic');}
  if(hasKept(source,'KI-150')&&n(kiState(source,'KI-150').tokens)>=2&&first){add(40,'Force');kiState(source,'KI-150').tokens-=2;kiState(source,'KI-150').extend=true;}
  if(hasKept(source,'KI-151')&&effect(target,'ki-151-mirrored',source.id)&&first)add(15,'Psychic');
  if(hasKept(source,'KI-155')&&n(kiState(source,'KI-155').charge)>0&&first){out.riders.push({flat:n(kiState(source,'KI-155').charge),damageType:'Poison',canCrit:false});kiState(source,'KI-155').charge=0;}
  if(hasKept(source,'KI-156')&&n(kiState(source,'KI-156').distillates)>0&&first){add(30,'Holy');kiState(source,'KI-156').distillates-=1;}
  if(hasKept(source,'KI-158')&&kiState(source,'KI-158').ready&&first){for(const t of keptChoice(source,'KI-158','damageTypes',[]))add(20,t);kiState(source,'KI-158').ready=false;kiState(source,'KI-158').record=[];}
  if(hasKept(source,'KI-159')&&kiState(source,'KI-159').surgebackReady&&first){add(30,'Lightning');kiState(source,'KI-159').surgebackReady=false;}
  if(hasKept(source,'KI-160')&&n(kiState(source,'KI-160').readyBeats)>0&&first){for(let i=0;i<n(kiState(source,'KI-160').readyBeats);i++)add(10,'Holy');kiState(source,'KI-160').readyBeats=0;}
  if(hasKept(source,'KI-164')&&n(source.keptState.action?.energyAtStart)>=3&&first){add(20,'Force');add(20,'Psychic');kiState(source,'KI-164').invoked=true;}
  if(hasKept(source,'KI-165')&&n(source.keptState.action?.energyAtStart)===1&&first&&!source.keptState.turn['KI-165']){add(25,'Lightning');source.keptState.turn['KI-165']=true;}
  if(hasKept(source,'KI-166')&&n(source.turnControl?.turnsStarted)===1&&kiState(source,'KI-166').chosen==='Damage'&&first){add(40,chooseNonPhysical(rng));kiState(source,'KI-166').vulnerable=true;}
  if(hasKept(source,'KI-167')&&n(kiState(source,'KI-167').shards)>0&&first){const sh=n(kiState(source,'KI-167').shards);for(let i=0;i<sh;i++){add(20,'Holy');add(20,'Force');}kiState(source,'KI-167').spent=sh;kiState(source,'KI-167').shards=0;}
  if(hasKept(source,'KI-169')&&kiState(source,'KI-169').empower&&first){add(60,'Lightning');kiState(source,'KI-169').empower=false;}
  if(hasKept(source,'KI-170')&&n(kiState(source,'KI-170').threads)>=3&&first){add(50,'Dark');kiState(source,'KI-170').threads=0;}
  if(hasKept(source,'KI-171')&&n(kiState(source,'KI-171').threads)>=3&&first){out.finalDamagePct+=12;add(50,'Holy');kiState(source,'KI-171').threads=0;}
  if(hasKept(source,'KI-173')&&effect(target,'ki-173-architecture',source.id)&&first)add(35,'Psychic');
  if(hasKept(source,'KI-174')&&kiState(source,'KI-174').spiral&&first){add(25,kiState(source,'KI-174').spiral);}
  if(hasKept(source,'KI-175')&&kiState(source,'KI-175').seed&&first){add(30,'Force');kiState(source,'KI-175').seed=false;}
  if(hasKept(source,'KI-177')&&kiState(source,'KI-177').phrase&&first){add(30,'Lightning');kiState(source,'KI-177').phrase=false;}
  if(hasKept(source,'KI-178')&&kiState(source,'KI-178').accord&&first)kiState(source,'KI-178').scarTarget=target.id;
  if(hasKept(source,'KI-180')&&first){const st=kiState(source,'KI-180');st.stage=st.targetId===target.id?(n(st.stage)%4)+1:1;st.targetId=target.id;const vals=[[20,'Poison'],[20,'Cold'],[25,'Force'],[30,'Dark']];add(...vals[st.stage-1]);st.specialStage=st.stage;}
  if(hasKept(source,'KI-181')&&kiState(source,'KI-181').active&&first){add(25,'Holy');add(25,'Dark');}
  if(hasKept(source,'KI-184')&&kiState(source,'KI-184').ignited&&first&&!source.keptState.turn['KI-184']){const burning=(target.effects||[]).some(e=>e.memory?.statusKind==='Burn');add(burning?35:25,'Fire');source.keptState.turn['KI-184']=true;}
  if(hasKept(source,'KI-197')&&(source.effects||[]).some(e=>e.memory?.statusKind==='Burn')&&component.damageType==='Cold'&&first&&!source.keptState.turn['KI-197']){add(25,'Cold');source.keptState.turn['KI-197']=true;kiState(source,'KI-197').fractureTarget=target.id;}
  if(hasKept(source,'KI-199')&&kiState(source,'KI-199').thread&&first){const t=kiState(source,'KI-199').thread;add(t==='Burn'?25:t==='Poison'?25:20,t==='Burn'?'Fire':t==='Poison'?'Poison':t==='Chill'?'Cold':'Psychic');kiState(source,'KI-199').thread=null;}
  if(hasKept(source,'KI-200')&&n(kiState(source,'KI-200').seeds)>=6&&first){putEffect(target,{id:'ki-200-ruinseed',sourceActorId:source.id,negative:true,turns:2,memory:{statusKind:'Ruinseed',ruptures:{}}});kiState(source,'KI-200').seeds=0;}
 }
 // Target-side defensive KIs are applied after outgoing modifiers but before defense resolution.
 if(target.keptState&&direct){
  if(hasKept(target,'KI-002')&&kiState(target,'KI-002').active&&!kiState(target,'KI-002').tested)out.targetDodgeChanceDelta-=10;
  if(hasKept(target,'KI-027')&&n(target.resources.shield)>0&&!kiState(target,'KI-027').used)out.critDamageBonus-=15;
  if(hasKept(target,'KI-046')&&!kiState(target,'KI-046').used)out.incomingHpDamageMultiplier*=.90;
  if(hasKept(target,'KI-047')&&effect(source,'ki-047-soft-impact',target.id))out.incomingHpDamageMultiplier*=.92;
  if(hasKept(target,'KI-073')&&['Cold','Dark'].includes(component.damageType)&&kiState(target,'KI-073').warm)out.incomingHpDamageMultiplier*=.9;
  if(hasKept(target,'KI-088')&&!kiState(target,'KI-088').used&&component.damageType===keptChoice(target,'KI-088','damageType','Force'))out.incomingHpDamageMultiplier*=.85;
  if(hasKept(target,'KI-104')&&kiState(target,'KI-104').vigilSource===source.id)out.incomingHpDamageMultiplier*=.90;
  if(hasKept(target,'KI-121')&&kiState(target,'KI-121').windglass)out.incomingHpDamageMultiplier*=.80;
  if(hasKept(target,'KI-122')&&!target.keptState.round['KI-122']){out.incomingHpDamageMultiplier*=.92;target.keptState.round['KI-122']=true;kiState(target,'KI-122').storePrevented=true;}
  if(hasKept(target,'KI-144')&&kiState(target,'KI-144').ghostwake&&!kiState(target,'KI-144').hitReduced)out.incomingHpDamageMultiplier*=.75;
  if(hasKept(target,'KI-166')&&kiState(target,'KI-166').vulnerable&&n(combat.round)===1){out.incomingHpDamageMultiplier*=1.15;kiState(target,'KI-166').vulnerable=false;}
  if(hasKept(target,'KI-179')&&kiState(target,'KI-179').wardline&&!target.keptState.round['KI-179']){out.incomingHpDamageMultiplier*=.88;target.keptState.round['KI-179']=true;}
  if(hasKept(target,'KI-181')&&!kiState(target,'KI-181').triggered&&hpPct(target)<=25){} // triggers after hit, not before.
  if(hasKept(target,'KI-196')&&kiState(target,'KI-196').active)out.deferHpDamagePct=40;
  if(hasKept(target,'KI-045')&&kiState(target,'KI-045').cushionReady&&n(kiState(target,'KI-045').cushionUntil)>=n(target.turnControl?.turnsStarted)&&direct){kiState(target,'KI-045').pendingSourceId=source.id;out.incomingHpDamageMultiplier*=.88;}
  if(hasKept(target,'KI-161')&&direct&&source.side!==target.side){const st=kiState(target,'KI-161');if(st.round!==n(combat.round)){st.round=n(combat.round);st.attackers=[];}if(!st.attackers.includes(source.id)&&st.attackers.length<3)st.attackers.push(source.id);}
  if(hasKept(target,'KI-028')&&kiState(target,'KI-028').sureReturn)out.preventLethal=true;
 }
 // Whispered Fate belongs to the Belowcaller who owns the debuffs, even when another ally makes the attack.
 if(direct&&combat){
  for(const owner of combat.actors||[]){
   if(alive(owner)&&owner.side===target.side&&owner.id!==target.id&&hasKept(owner,'KI-162')){const st=kiState(owner,'KI-162');const cuts=n(st.cuts?.[source.id]);if(cuts>0){st.pendingTrigger={enemyId:source.id,targetId:target.id,cuts,ability,component};}}
  }
  for(const owner of combat.actors||[]){
   if(!alive(owner)||owner.subclass!=='Belowcaller'||!hasKept(owner,'KI-251'))continue;
   const belowDebuffs=(target.effects||[]).filter(e=>e.negative&&e.sourceActorId===owner.id&&String(e.id||'').startsWith('belowcaller-'));
   if(!belowDebuffs.length)continue;
   const st=kiState(owner,'KI-251');st.fateSeen=st.fateSeen||{};st.pending=st.pending||{};
   const key=`${combat.currentActorId||source.id}:${n(source.turnControl?.turnsStarted)}:${target.id}`;
   if(st.fateSeen[key])continue;
   st.fateSeen[key]=true;st.pending[key]={sourceId:source.id,targetId:target.id};
   const strong=n(owner.subclassState?.whispers)>=4;out.critChanceBonus+=strong?20:15;out.targetDodgeChanceDelta-=strong?20:15;
  }
 }
 return out;
}

export function keptAfterDamage({slot,combat,source,target,ability,component,result,rng=Math.random,reaction=false,helpers={}}={}){
 if(!source||!target)return {riders:[]};const direct=directAbility(ability,component,reaction);const stS=source.keptState,stT=target.keptState;
 if(isSummon(target)&&n(result.actualHpRemoved)>0){const owner=summonOwner(combat,target);if(owner&&hasKept(owner,'KI-090')&&hpPct(target)<50){const mem=summonMemory(target);if(!mem.echoBarkUsed){mem.echoBarkUsed=true;putEffect(target,{id:'ki-090-echo-bark',sourceActorId:owner.id,turns:2,modifiers:{},memory:{statusKind:'Echo Bark',resistanceAllPct:10,forcedRepositionImmune:true}});}}}
 if(isSummon(source)&&direct&&!result.dodged){
  const owner=summonOwner(combat,source),mem=summonMemory(source);if(owner){
   if(hasKept(owner,'KI-089')){const st=kiState(owner,'KI-089'),round=String(combat?.round||1);if(st.wakeRound!==round){st.wakeRound=round;st.wake=true;st.wakeType=component?.damageType||summonPrimaryType(source);}}
   if(hasKept(owner,'KI-091')&&result.critical&&!mem.precisionUsed){mem.precisionUsed=true;putEffect(target,{id:'ki-091-summoned-precision',sourceActorId:owner.id,turns:2,memory:{statusKind:'Summoned Precision'}});}
   if(hasKept(owner,'KI-124'))kiState(owner,'KI-124').damageCircuit=true;
  }
 }
 if(stT&&direct){
  if(!result.dodged&&hasKept(target,'KI-163')&&n(result.targetAggroMultiplier)>=1.50&&source){const st=kiState(target,'KI-163');st.marked=st.marked||{};const round=n(combat?.round);if(st.marked[source.id]!==round)st.marked[source.id]=round;}
  if(result.dodged){
   if(hasKept(target,'KI-002')&&kiState(target,'KI-002').active&&!kiState(target,'KI-002').tested){kiState(target,'KI-002').tested=true;kiState(target,'KI-002').charged=true;target.explicitInitiativeBonus=n(target.explicitInitiativeBonus)+2;}
   if(hasKept(target,'KI-023'))kiState(target,'KI-023').catch=true;
   if(hasKept(target,'KI-048'))kiState(target,'KI-048').catch={attackerId:source.id};
   if(hasKept(target,'KI-106'))kiState(target,'KI-106').wind=true;
   if(hasKept(target,'KI-114'))kiState(target,'KI-114').beats=Math.min(3,n(kiState(target,'KI-114').beats)+1);
   if(hasKept(target,'KI-115')){const s=kiState(target,'KI-115');s.wind=true;if(s.stone){s.wind=s.stone=false;const g=grantEnergy(target,1);addShield(target,n(target.resources.maxHp)*.06,{sourceActorId:target.id,abilityId:'ki-115-two-step'});if(g)keptOnBonusEnergy({slot,combat,actor:target,amount:g,helpers});}}
   if(hasKept(target,'KI-139')){const s=kiState(target,'KI-139');s.dodges=n(s.dodges)+1;if(s.dodges%2===0){const g=grantEnergy(target,1);s.mirrorstep=true;if(g)keptOnBonusEnergy({slot,combat,actor:target,amount:g,helpers});}}
   if(hasKept(target,'KI-144')&&kiState(target,'KI-144').ghostwake)kiState(target,'KI-144').dodged=true;
  } else {
   if(hasKept(target,'KI-002')&&kiState(target,'KI-002').active&&!kiState(target,'KI-002').tested)kiState(target,'KI-002').tested=true;
   if(hasKept(target,'KI-046')&&!kiState(target,'KI-046').used){kiState(target,'KI-046').used=true;kiState(target,'KI-046').attackerId=source.id;kiState(target,'KI-046').type=component.damageType||'Force';}
   if(hasKept(target,'KI-047')&&n(result.actualHpRemoved)<n(target.resources.maxHp)*.10)putEffect(source,{id:'ki-047-soft-impact',sourceActorId:target.id,negative:true,turns:1,modifiers:{},memory:{statusKind:'Soft Impact'}});
   if(hasKept(target,'KI-073')&&kiState(target,'KI-073').warm&&['Cold','Dark'].includes(component.damageType))kiState(target,'KI-073').warm=false;
   if(hasKept(target,'KI-088')&&!kiState(target,'KI-088').used&&component.damageType===keptChoice(target,'KI-088','damageType','Force')){kiState(target,'KI-088').used=true;kiState(target,'KI-088').wardCharge=true;}
   if(hasKept(target,'KI-121')&&kiState(target,'KI-121').windglass){addShield(target,n(result.actualHpRemoved)*.20,{sourceActorId:target.id,abilityId:'ki-121-windglass'});kiState(target,'KI-121').windglass=false;}
   if(hasKept(target,'KI-144')&&kiState(target,'KI-144').ghostwake&&!kiState(target,'KI-144').hitReduced)kiState(target,'KI-144').hitReduced=true;
  }
  if(n(result.actualHpRemoved)>=n(target.resources.maxHp)*.15&&source.side!==target.side){
   if(hasKept(target,'KI-001')){const s=kiState(target,'KI-001');s.lastlight=Math.min(3,n(s.lastlight)+1);s.expiresAfterTurn=n(target.turnControl?.turnsStarted)+1;}
   if(hasKept(target,'KI-140')&&n(kiState(target,'KI-140').cooldown)<=0){const g=grantEnergy(target,1);kiState(target,'KI-140').scar=true;kiState(target,'KI-140').cooldown=2;if(g)keptOnBonusEnergy({slot,combat,actor:target,amount:g,helpers});}
  }
  if(n(result.actualHpRemoved)>0){
   if(hasKept(target,'KI-008'))kiState(target,'KI-008').targetedBy[source.id]=true;
   if(hasKept(target,'KI-010'))kiState(target,'KI-010').targetedThisTurn=true;
   if(hasKept(target,'KI-134')){kiState(target,'KI-134').hiddenTarget=null;kiState(target,'KI-134').pendingTarget=null;}
   if(hasKept(target,'KI-181')&&!kiState(target,'KI-181').triggered&&hpPct(target)<=25){kiState(target,'KI-181').triggered=true;kiState(target,'KI-181').active=true;grantEnergy(target,2);addShield(target,n(target.resources.maxHp)*.20,{sourceActorId:target.id,abilityId:'ki-181-reversal'});}
   if(hasKept(target,'KI-121')&&!kiState(target,'KI-121').triggered&&hpPct(target)<25){kiState(target,'KI-121').triggered=true;kiState(target,'KI-121').windglass=true;healPct(target,12);}
   if(hasKept(target,'KI-011')&&!kiState(target,'KI-011').triggered&&hpPct(target)<60){kiState(target,'KI-011').triggered=true;kiState(target,'KI-011').reserve=n(target.resources.maxHp)*.05;}
   if(hasKept(target,'KI-005')&&!kiState(target,'KI-005').triggered&&hpPct(target)<50){kiState(target,'KI-005').triggered=true;addShield(target,n(target.resources.maxHp)*.10,{sourceActorId:target.id,abilityId:'ki-005-stoneheld'});}
   if(hasKept(target,'KI-045')&&kiState(target,'KI-045').cushionReady){const st=kiState(target,'KI-045');helpers.rider?.(target,source,ability,component,10,'Force',{canCrit:false,originalResult:result});st.cushionReady=false;st.pendingSourceId=null;}
   if(hasKept(target,'KI-162')){const st=kiState(target,'KI-162');st.cuts={};}
   if(hasKept(target,'KI-179')&&hpPct(target)<35){for(const owner of allies(combat,target,{real:true,other:true})){if(hasKept(owner,'KI-179')){kiState(owner,'KI-179').wardline=target.id;kiState(target,'KI-179').wardline=owner.id;break;}}}
  }
 }
 // Low-Profile Edge detonates stored Cuts when that enemy attacks someone else.
 if(direct&&combat){for(const owner of combat.actors||[]){if(!alive(owner)||!hasKept(owner,'KI-162'))continue;const st=kiState(owner,'KI-162'),p=st.pendingTrigger;if(p?.enemyId===source.id&&p.targetId===target.id&&n(p.cuts)>0){for(let i=0;i<n(p.cuts);i++)helpers.rider?.(owner,source,p.ability||ability,p.component||component,15,'Psychic',{canCrit:false,originalResult:result});st.cuts=st.cuts||{};delete st.cuts[source.id];st.pendingTrigger=null;}}}
 // Resolve any Whispered Fate trigger after the attack, including a Dodge: debuffs always lose one turn; Whisper is gained only on actual HP damage.
 if(direct&&combat){
  for(const owner of combat.actors||[]){
   if(owner.subclass!=='Belowcaller'||!hasKept(owner,'KI-251'))continue;
   const st=kiState(owner,'KI-251');const key=`${combat.currentActorId||source.id}:${n(source.turnControl?.turnsStarted)}:${target.id}`;
   const pending=st.pending?.[key];if(!pending||pending.sourceId!==source.id||pending.targetId!==target.id)continue;
   if(n(result.actualHpRemoved)>0)gainSubclassResource(owner,1);
   for(const deb of [...(target.effects||[])].filter(e=>e.negative&&e.sourceActorId===owner.id&&String(e.id||'').startsWith('belowcaller-')&&e.duration?.remaining!=null)){
    deb.duration.remaining=Math.max(0,n(deb.duration.remaining)-1);
    if(deb.duration.remaining<=0){target.effects=target.effects.filter(e=>e!==deb);keptOnStatusExpired({slot,combat,actor:target,effect:deb,rng,helpers});}
   }
   delete st.pending[key];
  }
 }
 if(stS&&direct){
  if(result.dodged){if(hasKept(source,'KI-037'))kiState(source,'KI-037').misreadTarget=target.id;if(hasKept(source,'KI-034'))kiState(source,'KI-034').pendingBareTarget=null;return {riders:[]};}
  if(result.blocked){if(hasKept(source,'KI-038'))kiState(source,'KI-038').timingTarget=target.id;}
  const crit=Boolean(result.critical);
  if(hasKept(source,'KI-018')){const st=kiState(source,'KI-018'),turn=n(source.turnControl?.turnsStarted);if(st.lastTarget===target.id&&st.lastTurn===turn-1)putEffect(target,{id:'ki-018-patient-cut',sourceActorId:source.id,turns:1,memory:{statusKind:'Patient Cut'}});st.lastTarget=target.id;st.lastTurn=turn;}
  if(hasKept(source,'KI-034')&&kiState(source,'KI-034').pendingBareTarget===target.id){putEffect(target,{id:'ki-034-bare',sourceActorId:source.id,turns:2,memory:{statusKind:'Bare'}});source.keptState.turn['KI-034']=true;kiState(source,'KI-034').pendingBareTarget=null;}
  if(hasKept(source,'KI-033')&&result.targetHadShieldBefore){const sr=helpers.shieldOnly?.(source,target,ability,component,25,'Force',{forcedBlocked:result.blocked});if(sr?.broke)putEffect(target,{id:'ki-033-rattled-guard',sourceActorId:source.id,negative:true,turns:2,modifiers:{blockChancePct:-10},memory:{statusKind:'Rattled Guard'}});}
  if(hasKept(source,'KI-162')&&n(result.sourceAggroMultiplier)<=.50){const st=kiState(source,'KI-162');st.cuts=st.cuts||{};st.cuts[target.id]=Math.min(2,n(st.cuts[target.id])+1);}
  if(hasKept(source,'KI-017')){const st=kiState(source,'KI-017');if(crit)st.followthrough=true;else if(st.consumeOnNonCrit){st.consumeOnNonCrit=false;st.followthrough=false;if(helpers.rider)helpers.rider(source,target,ability,component,15,'Physical',{originalResult:result});}}
  if(hasKept(source,'KI-030')&&kiState(source,'KI-030').crosscut){putEffect(target,{id:'ki-030-crosscut',sourceActorId:source.id,negative:true,turns:1,modifiers:{blockedDamageReductionPct:-8}});kiState(source,'KI-030').crosscut=false;}
  if(hasKept(source,'KI-031')&&kiState(source,'KI-031').speedTarget===target.id&&alive(target)){target.explicitInitiativeBonus=n(target.explicitInitiativeBonus)+1;kiState(source,'KI-031').speedTarget=null;}
  if(hasKept(source,'KI-032')&&kiState(source,'KI-032').selfCost){selfNonlethalDamage(source,n(source.resources.maxHp)*.02);kiState(source,'KI-032').selfCost=false;}
  if(hasKept(source,'KI-036')&&kiState(source,'KI-036').blockedAttackerHit){putEffect(target,{id:'ki-036-rebound-break',sourceActorId:source.id,negative:true,turns:1,modifiers:{blockedDamageReductionPct:-10}});kiState(source,'KI-036').blockedAttackerHit=false;}
  if(hasKept(source,'KI-039')){const chosen=keptChoice(source,'KI-039','damageType','Force'),st=kiState(source,'KI-039');if(component.damageType===chosen&&!source.keptState.turn['KI-039']){st.orb=true;source.keptState.turn['KI-039']=true;}else if(st.orb&&component.damageType!==chosen){if(helpers.rider)helpers.rider(source,target,ability,component,20,chosen,{originalResult:result});st.orb=false;}}
  if(hasKept(source,'KI-041')){const st=kiState(source,'KI-041');if(crit){const count=n(st.stacks);st.stacks=0;for(let i=0;i<count;i++)helpers.rider?.(source,target,ability,component,10,'Psychic',{canCrit:false,originalResult:result});}else st.stacks=Math.min(3,n(st.stacks)+1);}
  if(hasKept(source,'KI-053')){const st=kiState(source,'KI-053');if(crit&&st.certainTarget===target.id){helpers.rider?.(source,target,ability,component,20,'Psychic',{canCrit:false,originalResult:result});st.certainTarget=null;st.misses=0;}else if(!crit){st.misses=st.lastTarget===target.id?n(st.misses)+1:1;st.lastTarget=target.id;if(st.misses>=3){st.certainTarget=target.id;st.misses=0;}}else st.misses=0;}
  if(hasKept(source,'KI-054')&&kiState(source,'KI-054').aim){if(crit)helpers.rider?.(source,target,ability,component,20,'Force',{originalResult:result});else addShield(source,n(source.resources.maxHp)*.04,{sourceActorId:source.id,abilityId:'ki-054-aim'});kiState(source,'KI-054').aim=false;}
  if(hasKept(source,'KI-055')&&crit&&hpPct(target)>75)putEffect(target,{id:'ki-055-deep-edge',sourceActorId:source.id,negative:false,turns:2});
  if(hasKept(source,'KI-063')&&n(source.turnControl?.turnsStarted)===1&&firstActionCategory(source,'Damage')){if(crit)putEffect(target,{id:'ki-063-zenith-scar',sourceActorId:source.id,turns:2,memory:{statusKind:'Zenith Scar'}});else kiState(source,'KI-063').faltered=true;}
  if(hasKept(source,'KI-064')&&!kiState(source,'KI-064').triggered&&crit){kiState(source,'KI-064').triggered=true;kiState(source,'KI-064').staticMemory=true;const g=grantEnergy(source,1);if(g)keptOnBonusEnergy({slot,combat,actor:source,amount:g,helpers});}
  if(hasKept(source,'KI-079')&&hasNegative(target))putEffect(target,{id:'ki-079-mirror',sourceActorId:source.id,turns:2});
  if(hasKept(source,'KI-084')&&hasNegative(target)){const st=kiState(source,'KI-084');if(st.targetId===target.id&&crit){const deb=(target.effects||[]).find(e=>e.negative&&e.duration?.remaining);if(deb)deb.duration.remaining+=1;st.targetId=null;}else st.targetId=target.id;}
  if(hasKept(source,'KI-087')&&['Force','Psychic'].includes(component.damageType)){} // triggered on incoming type, state applied there.
  if(hasKept(source,'KI-100')&&hpPct(source)<40){const st=kiState(source,'KI-100');st.red=Math.min(3,n(st.red)+1);st.white=0;}
  if(hasKept(source,'KI-101')&&n(source.resources.shield)>0&&n(result.actualHpRemoved)>0){const st=kiState(source,'KI-101');st.charge=Math.min(n(source.resources.maxHp)*.10,n(st.charge)+n(result.actualHpRemoved)*.10);st.lastTarget=target.id;}
  if(hasKept(source,'KI-102')){const st=kiState(source,'KI-102');if(crit)st.debt=Math.min(3,n(st.debt)+1);else if(n(st.pendingDebt)>0){const b=n(st.pendingDebt);for(let i=0;i<b;i++)helpers.rider?.(source,target,ability,component,12,'Psychic',{canCrit:false,originalResult:result});st.nextCritBonus=n(st.nextCritBonus)+b*3;st.debt=0;st.pendingDebt=0;}}
  if(hasKept(source,'KI-103')){const st=kiState(source,'KI-103');st.pace=crit?0:Math.min(3,n(st.pace)+1);if(st.mournTarget===target.id)putEffect(target,{id:'ki-103-mourned',sourceActorId:source.id,turns:2});}
  if(hasKept(source,'KI-105')&&n(result.actualHpRemoved)>0){const st=kiState(source,'KI-105');st.mercy=Math.min(n(source.resources.maxHp)*.08,n(st.mercy)+n(result.actualHpRemoved)*.10);}
  if(hasKept(source,'KI-110')&&crit)kiState(source,'KI-110').quickening=true;
  if(hasKept(source,'KI-113')&&n(kiState(source,'KI-113').spent)>=3){putEffect(target,{id:'ki-113-crumpled-guard',sourceActorId:source.id,negative:true,turns:2,modifiers:{blockedDamageReductionPct:-15}});kiState(source,'KI-113').spent=0;}
  if(hasKept(source,'KI-119')){const st=kiState(source,'KI-119');st.consecutive=st.lastTarget===target.id?n(st.consecutive)+1:1;st.lastTarget=target.id;if(st.consecutive>=3){st.singularTarget=target.id;st.stage=0;}}
  if(hasKept(source,'KI-128')){const st=kiState(source,'KI-128'),t=component.damageType;if(!st.a)st.a=t;else if(t!==st.a&&!st.b)st.b=t;}
  if(hasKept(source,'KI-129')){const [a,b]=keptChoice(source,'KI-129','damageTypes',[]),st=kiState(source,'KI-129');if(component.damageType===a){if(st.tuned?.[target.id]==='B')helpers.rider?.(source,target,ability,component,25,b,{originalResult:result});st.tuned=st.tuned||{};st.tuned[target.id]='A';}if(component.damageType===b){if(st.tuned?.[target.id]==='A')helpers.rider?.(source,target,ability,component,25,a,{originalResult:result});st.tuned=st.tuned||{};st.tuned[target.id]='B';}}
  if(hasKept(source,'KI-130')&&crit&&!source.keptState.round['KI-130']){source.keptState.round['KI-130']=true;addShield(source,n(source.resources.maxHp)*.05,{sourceActorId:source.id,abilityId:'ki-130-shelter'});kiState(source,'KI-130').shelterReady=true;}
  if(hasKept(source,'KI-134')&&kiState(source,'KI-134').pendingTarget){kiState(source,'KI-134').hiddenTarget=kiState(source,'KI-134').pendingTarget;kiState(source,'KI-134').pendingTarget=null;}
  if(hasKept(source,'KI-137')){const st=kiState(source,'KI-137');if(crit){const c=n(st.pending);for(let i=0;i<c;i++)helpers.rider?.(source,target,ability,component,12,'Psychic',{canCrit:false,originalResult:result});if(c>=4)putEffect(target,{id:'ki-137-crownshock',sourceActorId:source.id,negative:true,turns:2,modifiers:{damageCritChancePct:-15,energyGainPct:-15}});st.crowns=0;st.pending=0;}else st.crowns=Math.min(4,n(st.crowns)+1);}
  if(hasKept(source,'KI-139')&&kiState(source,'KI-139').mirrorTarget===target.id){const other=enemies(combat,source).find(e=>e.id!==target.id);helpers.rider?.(source,other||target,ability,component,other?30:20,'Psychic',{canCrit:false,originalResult:result});kiState(source,'KI-139').mirrorstep=false;kiState(source,'KI-139').mirrorTarget=null;}
  if(hasKept(source,'KI-140')&&kiState(source,'KI-140').siphonRider){const amount=helpers.lastRiderDamage?.()||0;heal(source,amount*.20);kiState(source,'KI-140').siphonRider=false;}
  if(hasKept(source,'KI-141')&&kiState(source,'KI-141').selfCost){selfNonlethalDamage(source,n(source.resources.maxHp)*.02);kiState(source,'KI-141').selfCost=false;}
  if(hasKept(source,'KI-144')&&kiState(source,'KI-144').consumeAfter){kiState(source,'KI-144').ghostwake=false;kiState(source,'KI-144').consumeAfter=false;kiState(source,'KI-144').dodged=false;}
  if(hasKept(source,'KI-147')&&n(kiState(source,'KI-147').spent)>=3){putEffect(target,{id:'ki-147-bent-guard',sourceActorId:source.id,negative:true,turns:2,modifiers:{blockedDamageReductionPct:-15}});if(n(kiState(source,'KI-147').spent)>=6){for(const other of enemies(combat,source).filter(e=>e.id!==target.id))helpers.rider?.(source,other,ability,component,24,'Force',{canCrit:false,originalResult:result});}kiState(source,'KI-147').spent=0;}
  if(hasKept(source,'KI-149')&&negativeCount(target)>=5){const deb=(target.effects||[]).find(e=>e.negative&&Object.keys(e.modifiers||{}).length);if(deb&&!deb.memory?.constellationBoost){for(const k of Object.keys(deb.modifiers))deb.modifiers[k]=n(deb.modifiers[k])*1.15;deb.memory={...(deb.memory||{}),constellationBoost:true};}}
  if(hasKept(source,'KI-150')&&kiState(source,'KI-150').extend){const deb=(target.effects||[]).find(e=>e.negative&&e.duration?.remaining);if(deb)deb.duration.remaining+=1;kiState(source,'KI-150').extend=false;}
  if(hasKept(source,'KI-158')){const st=kiState(source,'KI-158'),chosen=keptChoice(source,'KI-158','damageTypes',[]);if(chosen.includes(component.damageType)){st.record=st.record||[];if(!st.record.includes(component.damageType))st.record.push(component.damageType);if(st.record.length>=3)st.ready=true;}}
  if(hasKept(source,'KI-167')){const st=kiState(source,'KI-167');if(crit)st.shards=Math.min(3,n(st.shards)+1);else if(n(st.spent)>0)selfNonlethalDamage(source,n(source.resources.maxHp)*.03*n(st.spent));st.spent=0;}
  if(hasKept(source,'KI-170')&&n(source.keptState.lastLifesteal)>0){const st=kiState(source,'KI-170');st.lifeAccum=n(st.lifeAccum)+n(source.keptState.lastLifesteal);while(st.lifeAccum>=n(source.resources.maxHp)*.10){st.lifeAccum-=n(source.resources.maxHp)*.10;st.threads=Math.min(3,n(st.threads)+1);}}
  if(hasKept(source,'KI-173')){const types=new Set(effectsBySource(target,source.id).filter(e=>e.negative).map(e=>e.memory?.statusKind||e.id));if(types.size>=3)putEffect(target,{id:'ki-173-architecture',sourceActorId:source.id,turns:2,memory:{statusKind:'Architecture'}});}
  if(hasKept(source,'KI-174')){const st=kiState(source,'KI-174'),seq=['Force','Lightning','Psychic','Dark'];if(!st.spiral&&crit)st.spiral='Force';else if(st.spiral){if(crit)st.spiral=seq[(seq.indexOf(st.spiral)+1)%4];else{st.spiral=null;addShield(source,n(source.resources.maxHp)*.10,{sourceActorId:source.id,abilityId:'ki-174-collapse'});}}}
  if(hasKept(source,'KI-176')&&hpPct(source)<50&&n(result.actualHpRemoved)>0){const st=kiState(source,'KI-176');st.authority=Math.min(n(source.resources.maxHp)*.15,n(st.authority)+n(result.actualHpRemoved)*.08);st.targetId=target.id;}
  if(hasKept(source,'KI-178')&&component.damageType===keptChoice(source,'KI-178','damageType','Force')){const st=kiState(source,'KI-178');st.turns=st.lastTurn===n(source.turnControl?.turnsStarted)-1?n(st.turns)+1:1;st.lastTurn=n(source.turnControl?.turnsStarted);if(st.turns>=3){st.accord=true;st.turns=0;}if(st.scarTarget===target.id){putEffect(target,{id:'ki-178-spectrum-scar',sourceActorId:source.id,negative:true,turns:2,modifiers:{damageTypeTakenPct:15},memory:{damageType:keptChoice(source,'KI-178','damageType','Force')}});st.scarTarget=null;st.accord=false;}}
  if(hasKept(source,'KI-180')){const st=kiState(source,'KI-180');if(st.specialStage===2)target.explicitInitiativeBonus=n(target.explicitInitiativeBonus)-2;if(st.specialStage===3)putEffect(target,{id:'ki-180-continuance-break',sourceActorId:source.id,negative:true,turns:1,modifiers:{blockedDamageReductionPct:-10}});if(st.specialStage===4){const amount=helpers.lastRiderDamage?.()||0;heal(source,amount*.20);}st.specialStage=0;}
  if(hasKept(source,'KI-183')&&['Fire','Cold','Lightning','Poison','Force','Psychic','Holy','Dark'].includes(component.damageType)){const st=kiState(source,'KI-183');st.types=st.types||[];if(!st.types.includes(component.damageType))st.types.push(component.damageType);if(st.types.length>=3){st.pending=[...st.types.slice(0,3)];st.types=[];}}
  if(hasKept(source,'KI-185')&&component.damageType==='Cold'){const st=kiState(source,'KI-185');st.chill=st.chill||{};st.chill[target.id]=Math.min(3,n(st.chill[target.id])+1);if(st.chill[target.id]>=3&&!st.frozen?.[target.id]){st.frozen=st.frozen||{};st.frozen[target.id]=true;st.chill[target.id]=0;const protectedTarget=Boolean(target.enemyAi?.boss||target.enemyAi?.protected||target.enemyTemplateId?.includes('sovereign')||target.enemyTemplateId?.includes('warden'));if(protectedTarget)putEffect(target,{id:'ki-185-deep-freeze',sourceActorId:source.id,negative:true,turns:1,modifiers:{finalDamagePct:-20,dodgeChancePct:-15},memory:{statusKind:'Deep Freeze',initiativeDelta:-4}});else{target.turnControl.skipNextAction=true;putEffect(target,{id:'ki-185-freeze',sourceActorId:source.id,negative:true,removable:false,turns:1,memory:{statusKind:'Freeze',hardControl:true}});}}}
  if(hasKept(source,'KI-189')&&(effect(target,'ki-185-freeze',source.id)||effect(target,'ki-185-deep-freeze',source.id))&&!kiState(source,'KI-189').used?.[target.id]){const st=kiState(source,'KI-189');st.used=st.used||{};st.used[target.id]=true;removeEffect(target,'ki-185-freeze',source.id);removeEffect(target,'ki-185-deep-freeze',source.id);helpers.rider?.(source,target,ability,component,70,'Force',{canCrit:false,originalResult:result});helpers.rider?.(source,target,ability,component,40,'Cold',{canCrit:false,originalResult:result});for(const o of enemies(combat,source).filter(e=>e.id!==target.id)){helpers.rider?.(source,o,ability,component,35,'Cold',{canCrit:false,originalResult:result});o.explicitInitiativeBonus=n(o.explicitInitiativeBonus)-2;}}
  if(hasKept(source,'KI-191')&&n(result.overkill)>0&&n(target.resources.hp)<=0){heal(source,Math.min(n(source.resources.maxHp)*.10,n(result.overkill)*.35));}
  if(hasKept(source,'KI-197')&&kiState(source,'KI-197').fractureTarget===target.id){putEffect(target,{id:'ki-197-thermal-fracture',sourceActorId:source.id,negative:true,turns:2,memory:{statusKind:'Thermal Fracture'}});kiState(source,'KI-197').fractureTarget=null;}
  if(hasKept(source,'KI-197')&&component.damageType==='Fire'&&effect(target,'ki-197-thermal-fracture',source.id)){removeEffect(target,'ki-197-thermal-fracture',source.id);const burn=(source.effects||[]).find(e=>e.memory?.statusKind==='Burn'&&e.duration?.remaining);if(burn)burn.duration.remaining=Math.max(1,n(burn.duration.remaining)-1);const s=kiState(source,'KI-185');s.chill=s.chill||{};s.chill[target.id]=n(s.chill[target.id])+2;}
  if(hasKept(source,'KI-200')&&effect(target,'ki-200-ruinseed',source.id)){const rs=effect(target,'ki-200-ruinseed',source.id),t=component.damageType;if(['Cold','Force','Psychic','Holy','Dark'].includes(t)&&!rs.memory.ruptures[t]){rs.memory.ruptures[t]=true;helpers.rider?.(source,target,ability,component,15,t,{canCrit:false,originalResult:result});if(t==='Force')putEffect(target,{id:'ki-200-force-break',sourceActorId:source.id,negative:true,turns:1,modifiers:{blockedDamageReductionPct:-15}});if(t==='Psychic')putEffect(target,{id:'ki-200-psychic-break',sourceActorId:source.id,negative:true,turns:1,modifiers:{damageCritChancePct:-8}});if(t==='Holy'){const a=lowest(allies(combat,source,{real:true}));if(a)addShield(a,n(a.resources.maxHp)*.04,{sourceActorId:source.id,abilityId:'ki-200-holy-rupture'});} }}
 }
 return {riders:[]};
}

export function keptOnDefense({slot,combat,source,target,ability=null,component=null,outcome,targetAggroMultiplier=1,helpers={}}={}){
 if(!target?.keptState)return;
 if(outcome==='block'){
  if(hasKept(target,'KI-013')&&!kiState(target,'KI-013').used){kiState(target,'KI-013').gripstone=true;kiState(target,'KI-013').used=true;}
  if(hasKept(target,'KI-021')&&hpPct(target)<=25&&!target.keptState.round['KI-021']){target.keptState.round['KI-021']=true;helpers.rider?.(target,source,{id:'ki-021-recoil',components:[]},{base:10,damageType:'Force'},10,'Force',{canCrit:false});}
  if(hasKept(target,'KI-023')&&kiState(target,'KI-023').catch){addShield(target,n(target.resources.maxHp)*.04,{sourceActorId:target.id,abilityId:'ki-023-bracefoot'});kiState(target,'KI-023').catch=false;}
  if(hasKept(target,'KI-036')){kiState(target,'KI-036').rebound=true;kiState(target,'KI-036').attackerId=source?.id;}
  if(hasKept(target,'KI-048')&&kiState(target,'KI-048').catch){const g=grantEnergy(target,1);helpers.rider?.(target,source,{id:'ki-048-catch',components:[]},{base:15,damageType:'Lightning'},15,'Lightning',{canCrit:false});kiState(target,'KI-048').catch=null;if(g)keptOnBonusEnergy({slot,combat,actor:target,amount:g,helpers});}
  if(hasKept(target,'KI-049'))kiState(target,'KI-049').slip={attackerId:source?.id};
  if(hasKept(target,'KI-068')&&kiState(target,'KI-068').guardedAllyId){const a=(combat.actors||[]).find(x=>x.id===kiState(target,'KI-068').guardedAllyId&&alive(x));if(a)healPct(a,4);kiState(target,'KI-068').guardedAllyId=null;}
  if(hasKept(target,'KI-106'))kiState(target,'KI-106').stone=true;
  if(hasKept(target,'KI-113'))kiState(target,'KI-113').beats=Math.min(3,n(kiState(target,'KI-113').beats)+1);
  if(hasKept(target,'KI-115')){const s=kiState(target,'KI-115');s.stone=true;if(s.wind){s.wind=s.stone=false;const g=grantEnergy(target,1);addShield(target,n(target.resources.maxHp)*.06,{sourceActorId:target.id,abilityId:'ki-115-two-step'});if(g)keptOnBonusEnergy({slot,combat,actor:target,amount:g,helpers});}}
  if(hasKept(target,'KI-135')&&effect(source,'ki-135-threat',target.id)){putEffect(source,{id:'ki-135-threat-broken',sourceActorId:target.id,negative:true,turns:2,modifiers:{finalDamagePct:-10}});helpers.rider?.(target,source,{id:'ki-135-recoil',components:[]},{base:15,damageType:'Force'},15,'Force',{canCrit:false});}
  if(hasKept(target,'KI-147'))kiState(target,'KI-147').recoil=Math.min(6,n(kiState(target,'KI-147').recoil)+1);
  if(hasKept(target,'KI-168')){const st=kiState(target,'KI-168');st.notes=Math.min(3,n(st.notes)+1);if(st.notes>=3){st.notes=0;for(const a of allies(combat,target,{real:true}))addShield(a,n(a.resources.maxHp)*.08,{sourceActorId:target.id,abilityId:'ki-168-party-wall'});helpers.rider?.(target,source,{id:'ki-168-shock',components:[]},{base:40,damageType:'Force'},40,'Force',{canCrit:false});}}
  if(hasKept(target,'KI-005')&&(target.resources?.shieldLayers||[]).some(l=>l.abilityId==='ki-005-stoneheld')&&!kiState(target,'KI-005').recoilUsed){kiState(target,'KI-005').recoilUsed=true;helpers.rider?.(target,source,ability||{id:'ki-005-stoneheld',components:[]},component||{base:10,damageType:'Force',scaling:{}},20,'Force',{canCrit:false});if(source)source.explicitInitiativeBonus=n(source.explicitInitiativeBonus)-2;}
  if(hasKept(target,'KI-043')&&hpPct(target)>75&&!target.keptState.round['KI-043']){target.keptState.round['KI-043']=true;const st=kiState(target,'KI-043');st.attackerId=source?.id;st.ability=ability;st.component=component;addShield(target,n(target.resources.maxHp)*.05,{sourceActorId:target.id,abilityId:'ki-043-raised-bastion'});}
  if(hasKept(target,'KI-123')&&!target.keptState.round['KI-123']){const low=lowest(allies(combat,target,{real:true,other:true}).filter(a=>hpPct(a)<50));if(low){target.keptState.round['KI-123']=true;if(n(low.resources.shield)>0)healPct(low,3);else addShield(low,n(low.resources.maxHp)*.05,{sourceActorId:target.id,abilityId:'ki-123-shared-wall'});}}
  if(hasKept(target,'KI-161')){const st=kiState(target,'KI-161');if((st.attackers||[]).length>=3){for(const id of st.attackers){const e=(combat.actors||[]).find(a=>a.id===id&&alive(a));if(e){helpers.rider?.(target,e,ability||{id:'ki-161-shockring',components:[]},component||{base:10,damageType:'Force',scaling:{}},25,'Force',{canCrit:false});putEffect(e,{id:'ki-161-hard-turn-break',sourceActorId:target.id,negative:true,turns:1,modifiers:{finalDamagePct:-10},memory:{statusKind:'Hard Turn'}});}}st.attackers=[];}}
  if(hasKept(target,'KI-163')&&source){const st=kiState(target,'KI-163');if(st.marked?.[source.id]===n(combat.round)){helpers.rider?.(target,source,ability||{id:'ki-163-high-profile',components:[]},component||{base:10,damageType:'Holy',scaling:{}},20,'Holy',{canCrit:false});const low=lowest(allies(combat,target,{real:true,other:true}));if(low)addShield(low,n(low.resources.maxHp)*.04,{sourceActorId:target.id,abilityId:'ki-163-high-profile'});}}
 } else if(outcome==='dodge'){
  if(hasKept(target,'KI-094')&&!kiState(target,'KI-094').used&&ownedSummons(combat,target).length){kiState(target,'KI-094').used=true;for(const summon of ownedSummons(combat,target)){const mem=summonMemory(summon);mem.sharedFootingBonus=true;mem.nextSummonInitiativeBonus=n(mem.nextSummonInitiativeBonus)+2;}}
  if(hasKept(target,'KI-049')&&kiState(target,'KI-049').slip){addShield(target,n(target.resources.maxHp)*.06,{sourceActorId:target.id,abilityId:'ki-049-slip'});if(source)source.explicitInitiativeBonus=n(source.explicitInitiativeBonus)-2;kiState(target,'KI-049').slip=null;}
 }
}

export function keptOnShieldAbsorb({slot,combat,source,target,shieldResult,helpers={}}={}){
 if(!target?.keptState||n(shieldResult?.absorbed)<=0)return;
 if(hasKept(target,'KI-024')){const st=kiState(target,'KI-024');if(!st.tracked){st.tracked=true;st.store=n(shieldResult.absorbed)*.20;}}
 if(hasKept(target,'KI-044')&&n(target.resources.shield)<n(target.resources.maxHp)*.10&&!kiState(target,'KI-044').used){kiState(target,'KI-044').used=true;helpers.rider?.(target,source,{id:'ki-044-thin-bastion',components:[]},{base:15,damageType:'Force'},15,'Force',{canCrit:false});}
 if(hasKept(target,'KI-101')){const st=kiState(target,'KI-101');if(n(target.resources.shield)<=0&&n(st.charge)>0){const enemy=(combat.actors||[]).find(a=>a.id===st.lastTarget&&alive(a));if(enemy)helpers.flatDamage?.(target,enemy,n(st.charge),'Force',{canCrit:false});st.charge=0;}}
 if(hasKept(target,'KI-155')&&n(target.resources.shield)<=0){kiState(target,'KI-155').charge=Math.min(n(target.resources.maxHp)*.08,n(shieldResult.absorbed)*.25);}
 if(hasKept(target,'KI-045')&&n(target.resources.shield)<=0&&!kiState(target,'KI-045').cushionReady){const st=kiState(target,'KI-045');st.cushionReady=true;st.cushionUntil=n(target.turnControl?.turnsStarted)+1;}
 if(hasKept(target,'KI-043')){const st=kiState(target,'KI-043');if(st.attackerId&&!(target.resources?.shieldLayers||[]).some(l=>l.abilityId==='ki-043-raised-bastion')){const attacker=(combat.actors||[]).find(a=>a.id===st.attackerId&&alive(a));if(attacker&&hpPct(target)>75)helpers.rider?.(target,attacker,st.ability||{id:'ki-043-burst',components:[]},st.component||{base:10,damageType:'Holy',scaling:{}},15,'Holy',{canCrit:false});st.attackerId=null;st.ability=null;st.component=null;}}
}

export function keptBeforeHeal({slot,combat,source,target,ability,component,rng=Math.random}={}){
 const out={finalHealingPct:0};if(!source||!target)return out;const direct=ability?.id&&!String(ability.id).startsWith('ki-');const first=source.keptState&&direct&&firstHealPacket(source);
 if(isSummon(source)&&direct){const mem=summonMemory(source);out.finalHealingPct+=n(mem.actionNumericalBonusPct);if(mem.shelterHealBonus&&first){out.finalHealingPct+=15;mem.shelterHealBonus=false;mem.shelterShieldSurvived=false;}}
 if(source.keptState&&direct){
  if(hasKept(source,'KI-124')&&kiState(source,'KI-124').circuitAction)out.finalHealingPct+=20;
  if(hasKept(source,'KI-152'))out.finalHealingPct+=n(kiState(source,'KI-152').actionPct);
  if(first&&hasKept(source,'KI-153')){const st=kiState(source,'KI-153');st.bodyNotes=st.bodyNotes||{};if(st.bodyNotes[2]){out.finalHealingPct+=20;st.bodyNotes[2]=false;}}
  if(first&&hasKept(source,'KI-154')&&kiState(source,'KI-154').fallenEcho&&n(kiState(source,'KI-154').fallenUntil)>=n(source.turnControl?.turnsStarted)){const st=kiState(source,'KI-154');addShield(source,n(st.fallenMaxHp)*.20,{sourceActorId:source.id,abilityId:'ki-154-fallen-retinue'});st.fallenEcho=false;}
  if(first&&hasKept(source,'KI-172')){const st=kiState(source,'KI-172');st.echoRoles=st.echoRoles||{};if(st.echoRoles[2]){out.finalHealingPct+=20;st.echoRoles[2]=false;}}
 }
 if(source.keptState&&direct){
  if(hasKept(source,'KI-022')&&n(source.keptState.action?.energyAtStart)===1&&first)putEffect(target,{id:'ki-022-energy-gain',sourceActorId:source.id,turns:1,modifiers:{energyGainPct:10}});
  if(hasKept(source,'KI-050')&&n(combat.round)===1&&first&&!kiState(source,'KI-050').heal){kiState(source,'KI-050').heal=true;addShield(target,n(target.resources.maxHp)*.04,{sourceActorId:source.id,abilityId:'ki-050-early-heal'});}
  if(hasKept(source,'KI-052')&&kiState(source,'KI-052').tempo&&kiState(source,'KI-052').lastCategory!=='Support'&&first){out.finalHealingPct+=10;source.explicitInitiativeBonus=n(source.explicitInitiativeBonus)+2;kiState(source,'KI-052').tempo=false;}
  if(hasKept(source,'KI-059')&&kiState(source,'KI-059').cleanSpend&&n(ability?.energyCost)===0){out.finalHealingPct+=20;kiState(source,'KI-059').cleanSpend=false;}
  if(hasKept(source,'KI-062')&&kiState(source,'KI-062').restoration&&target.id!==source.id){out.finalHealingPct+=15;kiState(source,'KI-062').restoration=false;}
  if(hasKept(source,'KI-065')&&effect(target,'ki-065-focused-mending',source.id)){out.finalHealingPct+=15;removeEffect(target,'ki-065-focused-mending',source.id);}
  if(hasKept(source,'KI-081')&&negativeCount(source)>=2&&first)out.finalHealingPct+=15;
  if(hasKept(source,'KI-099')&&first){const st=kiState(source,'KI-099');if(st.lastCategory==='Damage'){st.stacks=Math.min(3,n(st.stacks)+1);addShield(target,n(target.resources.maxHp)*.05,{sourceActorId:source.id,abilityId:'ki-099-farside'});if(st.stacks>=3)out.finalHealingPct+=15;}st.lastCategory='Support';}
  if(hasKept(source,'KI-100')&&n(kiState(source,'KI-100').red)>0){out.finalHealingPct+=n(kiState(source,'KI-100').red)*8;kiState(source,'KI-100').red=0;}
  if(hasKept(source,'KI-105')&&n(kiState(source,'KI-105').mercy)>0){kiState(source,'KI-105').flatHeal=n(kiState(source,'KI-105').mercy);kiState(source,'KI-105').mercy=0;}
  if(hasKept(source,'KI-106')&&kiState(source,'KI-106').wind&&kiState(source,'KI-106').stone){out.finalHealingPct+=25;kiState(source,'KI-106').wind=false;kiState(source,'KI-106').stone=false;}
  if(hasKept(source,'KI-107')&&n(kiState(source,'KI-107').current)>0){out.finalHealingPct+=n(kiState(source,'KI-107').current)*8;kiState(source,'KI-107').current=0;}
  if(hasKept(source,'KI-108')&&n(kiState(source,'KI-108').consumeDividend)>0){kiState(source,'KI-108').bonusHealPctMax=n(kiState(source,'KI-108').consumeDividend)*3;kiState(source,'KI-108').consumeDividend=0;}
  if(hasKept(source,'KI-143')&&kiState(source,'KI-143').overdraw&&n(ability?.energyCost)===0){out.finalHealingPct+=25;}
  if(hasKept(source,'KI-159')&&kiState(source,'KI-159').surgebackReady){out.finalHealingPct+=25;kiState(source,'KI-159').surgebackReady=false;}
  if(hasKept(source,'KI-164')&&n(source.keptState.action?.energyAtStart)>=3){out.finalHealingPct+=25;kiState(source,'KI-164').invoked=true;}
  if(hasKept(source,'KI-166')&&n(source.turnControl?.turnsStarted)===1&&kiState(source,'KI-166').chosen==='Support')out.finalHealingPct+=35;
  if(hasKept(source,'KI-169')&&kiState(source,'KI-169').empower){out.finalHealingPct+=30;kiState(source,'KI-169').empower=false;}
  if(hasKept(source,'KI-177')&&kiState(source,'KI-177').phrase){out.finalHealingPct+=25;kiState(source,'KI-177').phrase=false;}
  if(hasKept(source,'KI-181')&&kiState(source,'KI-181').active)out.finalHealingPct+=25;
 }
 if(target.keptState){
  if(hasKept(target,'KI-011')&&n(kiState(target,'KI-011').reserve)>0){kiState(target,'KI-011').flatBonus=n(kiState(target,'KI-011').reserve);kiState(target,'KI-011').reserve=0;}
  if(hasKept(target,'KI-014')&&!kiState(target,'KI-014').used){out.finalHealingPct+=10;kiState(target,'KI-014').used=true;kiState(target,'KI-014').warmThread=true;}
  if(hasKept(target,'KI-066')&&kiState(target,'KI-066').active)out.finalHealingPct+=15;
  if(hasKept(target,'KI-194')&&source.id!==target.id&&source.side===target.side)out.finalHealingPct-=20;
 }
 return out;
}

export function keptAfterHeal({slot,combat,source,target,ability,component,result,rng=Math.random,helpers={}}={}){
 if(!source||!target)return;const direct=ability?.id&&!String(ability.id).startsWith('ki-');
 if(isSummon(source)&&direct&&n(result?.actualRestored)>0){const owner=summonOwner(combat,source);if(owner){
  if(hasKept(owner,'KI-092')){const st=kiState(owner,'KI-092'),round=String(combat?.round||1);if(st.healRound!==round){st.healRound=round;addShield(source,n(source.resources.maxHp)*.06,{sourceActorId:owner.id,abilityId:'ki-092-summoned-shelter'});summonMemory(source).shelterShieldSurvived=false;}}
  if(hasKept(owner,'KI-124'))kiState(owner,'KI-124').mercyCircuit=true;
 }}
 // Flat reserves are added after normal healing modifiers and capped by HP.
 if(target.keptState){const flat=n(kiState(target,'KI-011').flatBonus);if(flat){heal(target,flat);kiState(target,'KI-011').flatBonus=0;}const flat2=n(kiState(source,'KI-105').flatHeal);if(flat2){heal(target,flat2);kiState(source,'KI-105').flatHeal=0;}const pct=n(kiState(source,'KI-108').bonusHealPctMax);if(pct){healPct(target,pct);kiState(source,'KI-108').bonusHealPctMax=0;}}
 if(source.keptState&&direct){
  if(hasKept(source,'KI-003')&&kiState(source,'KI-003').kinEcho&&n(result.actualRestored)>0){const summon=lowest((combat.actors||[]).filter(a=>a.side===source.side&&!a.real&&alive(a)));if(summon)heal(summon,n(result.actualRestored)*.20);kiState(source,'KI-003').kinEcho=false;}
  if(hasKept(source,'KI-007')&&!source.keptState.turn['KI-007']){const neg=(target.effects||[]).find(e=>e.negative&&e.removable!==false&&!e.memory?.hardControl&&e.duration?.remaining);if(neg){neg.duration.remaining-=1;source.keptState.turn['KI-007']=true;if(neg.duration.remaining<=0){target.effects=target.effects.filter(e=>e!==neg);putEffect(target,{id:'ki-007-washed-thread',sourceActorId:source.id,turns:2,memory:{statusKind:'Washed Thread'}});}}}
  if(hasKept(source,'KI-019')&&!kiState(source,'KI-019').used){kiState(source,'KI-019').used=true;putEffect(target,{id:'ki-019-stitch',sourceActorId:source.id,turns:2,memory:{healPctAfterHit:3}});}
  if(hasKept(source,'KI-057')){const neg=(target.effects||[]).find(e=>e.negative&&e.removable!==false&&!e.memory?.hardControl&&!e.memory?.protected);if(neg){target.effects=target.effects.filter(e=>e!==neg);putEffect(target,{id:'ki-057-purgewoven',sourceActorId:source.id,turns:1,modifiers:{statusResistancePct:15}});}}
  if(hasKept(source,'KI-065')&&hpPct(target)<50&&!effect(target,'ki-065-focused-mending',source.id))putEffect(target,{id:'ki-065-focused-mending',sourceActorId:source.id,turns:2});
  if(hasKept(source,'KI-066')&&target.id!==source.id&&target.real){const st=kiState(source,'KI-066');st.active=true;st.allyId=target.id;}
  if(hasKept(source,'KI-067')&&n(result.overheal)>0){addShield(target,Math.min(n(target.resources.maxHp)*.06,n(result.overheal)*.30),{sourceActorId:source.id,abilityId:'ki-067-overflow-bandage'});}
  if(hasKept(source,'KI-068')&&target.id!==source.id&&target.real)kiState(source,'KI-068').guardedAllyId=target.id;
  if(hasKept(source,'KI-069')&&target.real&&n(target.turnControl?.turnsStarted)>=n(combat.round))putEffect(target,{id:'ki-069-aftercare',sourceActorId:source.id,turns:1,memory:{healPctAfterHit:4}});
  if(hasKept(source,'KI-070')&&target.real&&n(target.turnControl?.turnsStarted)<n(combat.round))putEffect(target,{id:'ki-070-premedicated',sourceActorId:source.id,untilActorStart:target.id,modifiers:{energyGainPct:15,dodgeChancePct:5}});
  if(hasKept(source,'KI-071')&&!kiState(source,'KI-071').used&&target.real&&hpPct(target)<25){kiState(source,'KI-071').used=true;putEffect(target,{id:'ki-071-lifeline',sourceActorId:source.id,turns:2,memory:{statusKind:'Lifeline'}});}
  if(hasKept(source,'KI-072')&&result.critical)putEffect(target,{id:'ki-072-bright-remedy',sourceActorId:source.id,turns:2,memory:{statusKind:'Bright Remedy'}});
  if(hasKept(source,'KI-074')&&target.id!==source.id&&target.real)putEffect(target,{id:'ki-074-conductive-care',sourceActorId:source.id,turns:2,memory:{statusKind:'Conductive Care'}});
  if(hasKept(source,'KI-075')&&n(target.resources.shield)>0&&n(result.actualRestored)>0)kiState(target,'KI-075').stored=Math.min(n(target.resources.maxHp)*.05,n(kiState(target,'KI-075').stored)+n(result.actualRestored)*.20);
  if(hasKept(source,'KI-076')&&target.real){const st=kiState(source,'KI-076');if(st.lastTarget&&st.lastTarget!==target.id)putEffect(target,{id:'ki-076-triage-beat',sourceActorId:source.id,turns:1,modifiers:{incomingHealingPct:8},memory:{nextHitHolyPct:10}});st.lastTarget=target.id;}
  if(hasKept(source,'KI-100')&&hpPct(source)<40){const st=kiState(source,'KI-100');st.white=Math.min(3,n(st.white)+1);st.red=0;}
  if(hasKept(source,'KI-105')&&target.id!==source.id&&target.real&&n(result.actualRestored)>0){const st=kiState(source,'KI-105');st.heat=Math.min(n(source.resources.maxHp)*.10,n(st.heat)+n(result.actualRestored)*.20);}
  if(hasKept(source,'KI-111')&&!source.keptState.turn['KI-111']&&n(result.actualRestored)>0){source.keptState.turn['KI-111']=true;addShield(target,Math.min(n(target.resources.maxHp)*.08,n(result.actualRestored)*.20),{sourceActorId:source.id,abilityId:'ki-111-shield-feeder'});}
  if(hasKept(source,'KI-112')&&n(result.overheal)>0)addShield(target,Math.min(n(target.resources.maxHp)*.12,n(result.overheal)*.50),{sourceActorId:source.id,abilityId:'ki-112-overheal-keeper'});
  if(hasKept(source,'KI-130')&&result.critical&&!source.keptState.round['KI-130']){source.keptState.round['KI-130']=true;addShield(source,n(source.resources.maxHp)*.05,{sourceActorId:source.id,abilityId:'ki-130-shelter'});}
  if(hasKept(source,'KI-131')&&result.critical&&!source.keptState.turn['KI-131']){source.keptState.turn['KI-131']=true;addShield(target,n(target.resources.maxHp)*.08,{sourceActorId:source.id,abilityId:'ki-131-healing-shelter'});}
  if(hasKept(source,'KI-145')&&target.id!==source.id&&target.real&&!source.keptState.turn['KI-145']){source.keptState.turn['KI-145']=true;heal(source,n(result.actualRestored)*.20);putEffect(source,{id:'ki-145-link',sourceActorId:source.id,turns:1,memory:{otherId:target.id}});putEffect(target,{id:'ki-145-link',sourceActorId:source.id,turns:1,memory:{otherId:source.id}});}
  if(hasKept(source,'KI-156')&&n(result.overheal)>0){const st=kiState(source,'KI-156');st.overheal=n(st.overheal)+n(result.overheal);const threshold=n(source.resources.maxHp)*.20;while(st.overheal>=threshold&&n(st.distillates)<2){st.overheal-=threshold;st.distillates=n(st.distillates)+1;}}
  if(hasKept(source,'KI-160')&&target.id!==source.id&&target.real&&n(result.actualRestored)>0){const st=kiState(source,'KI-160');st.roundHeal=n(st.roundHeal)+n(result.actualRestored);const threshold=n(source.resources.maxHp)*.20;while(st.roundHeal>=threshold&&n(st.beats)<3){st.roundHeal-=threshold;st.beats=n(st.beats)+1;}}
  if(hasKept(source,'KI-171')&&target.id!==source.id&&target.real&&n(result.actualRestored)>=n(target.resources.maxHp)*.10)kiState(source,'KI-171').threads=Math.min(3,n(kiState(source,'KI-171').threads)+1);
  if(hasKept(source,'KI-179')&&kiState(source,'KI-179').wardline===target.id)putEffect(target,{id:'ki-179-holy-charge',sourceActorId:source.id,turns:2,memory:{nextHitHolyPct:25}});
 }
 if(target.keptState){
  if(hasKept(target,'KI-028')&&hpPct(target)<35&&!kiState(target,'KI-028').triggered){kiState(target,'KI-028').triggered=true;kiState(target,'KI-028').sureReturn=true;}
  if(hasKept(target,'KI-066')&&kiState(target,'KI-066').active){const ally=(combat.actors||[]).find(a=>a.id===kiState(target,'KI-066').allyId&&alive(a));if(ally)healPct(ally,3);kiState(target,'KI-066').active=false;}
  if(hasKept(target,'KI-073'))kiState(target,'KI-073').warm=true;
 }
}


function grantBloodShield(actor,amount){
 if(!actor||!hasKept(actor,'KI-214')||!(n(amount)>0))return 0;
 const capAmount=n(actor.resources?.maxHp)*.4444;
 const layers=actor.resources?.shieldLayers||[];
 const existing=layers.filter(x=>x.abilityId==='ki-214-blood-shield').reduce((sum,x)=>sum+n(x.amount),0);
 const room=Math.max(0,capAmount-existing);
 return addShield(actor,Math.min(room,n(amount)),{sourceActorId:actor.id,abilityId:'ki-214-blood-shield',memory:{bloodShield:true}});
}

export function keptAfterLifesteal({actor,ability,actualRestored=0}={}){
 if(!actor||!(n(actualRestored)>0))return {bloodShield:0};
 if(actor.subclass==='Bloodknuckle'&&ability?.subclass==='Bloodknuckle'&&hasKept(actor,'KI-214')){
   return {bloodShield:grantBloodShield(actor,n(actualRestored)*.30)};
 }
 return {bloodShield:0};
}

export function keptAfterBloodknuckleTriggeredHeal({actor,actualRestored=0}={}){
 if(!actor||actor.subclass!=='Bloodknuckle'||!hasKept(actor,'KI-214'))return {bloodShield:0};
 return {bloodShield:grantBloodShield(actor,n(actualRestored))};
}

export function keptBeforeShield({combat,source,target,ability,component}={}){
 const out={finalShieldPct:0};if(!source?.keptState)return out;const first=firstShieldPacket(source);
 if(isSummon(source)){out.finalShieldPct+=n(summonMemory(source).actionNumericalBonusPct);}
 if(hasKept(source,'KI-124')&&kiState(source,'KI-124').circuitAction)out.finalShieldPct+=20;
 if(hasKept(source,'KI-152'))out.finalShieldPct+=n(kiState(source,'KI-152').actionPct);
 const bare=(target?.effects||[]).find(e=>e.id==='ki-034-bare');if(bare){out.finalShieldPct-=20;target.effects=target.effects.filter(e=>e!==bare);}
 if(hasKept(source,'KI-059')&&kiState(source,'KI-059').cleanSpend&&n(ability?.energyCost)===0){out.finalShieldPct+=20;kiState(source,'KI-059').cleanSpend=false;}
 if(hasKept(source,'KI-081')&&negativeCount(source)>=2&&first)out.finalShieldPct+=15;
 if(hasKept(source,'KI-099')&&first){const st=kiState(source,'KI-099');if(st.lastCategory==='Damage'){st.stacks=Math.min(3,n(st.stacks)+1);out.finalShieldPct+=st.stacks>=3?25:0;}st.lastCategory='Support';}
 if(hasKept(source,'KI-106')&&kiState(source,'KI-106').wind&&kiState(source,'KI-106').stone){out.finalShieldPct+=25;kiState(source,'KI-106').wind=false;kiState(source,'KI-106').stone=false;}
 if(hasKept(source,'KI-107')&&n(kiState(source,'KI-107').current)>0){out.finalShieldPct+=n(kiState(source,'KI-107').current)*8;kiState(source,'KI-107').current=0;}
 if(hasKept(source,'KI-108')&&n(kiState(source,'KI-108').consumeDividend)>0){out.finalShieldPct+=n(kiState(source,'KI-108').consumeDividend)*5;kiState(source,'KI-108').consumeDividend=0;}
 if(hasKept(source,'KI-143')&&kiState(source,'KI-143').overdraw&&n(ability?.energyCost)===0)out.finalShieldPct+=25;
 if(hasKept(source,'KI-159')&&kiState(source,'KI-159').surgebackReady){out.finalShieldPct+=25;kiState(source,'KI-159').surgebackReady=false;}
 if(hasKept(source,'KI-164')&&n(source.keptState.action?.energyAtStart)>=3){out.finalShieldPct+=25;kiState(source,'KI-164').invoked=true;}
 if(hasKept(source,'KI-165')&&n(source.keptState.action?.energyAtStart)===1&&!source.keptState.turn['KI-165']){out.finalShieldPct+=20;target.explicitInitiativeBonus=n(target.explicitInitiativeBonus)+1;source.keptState.turn['KI-165']=true;}
 if(hasKept(source,'KI-166')&&n(source.turnControl?.turnsStarted)===1&&kiState(source,'KI-166').chosen==='Support')out.finalShieldPct+=35;
 if(hasKept(source,'KI-169')&&kiState(source,'KI-169').empower){out.finalShieldPct+=30;kiState(source,'KI-169').empower=false;}
 if(hasKept(source,'KI-177')&&kiState(source,'KI-177').phrase){out.finalShieldPct+=25;kiState(source,'KI-177').phrase=false;}
 if(hasKept(source,'KI-181')&&kiState(source,'KI-181').active)out.finalShieldPct+=25;
 if(hasKept(source,'KI-156')&&n(kiState(source,'KI-156').distillates)>0){out.finalShieldPct+=20;kiState(source,'KI-156').distillates-=1;putEffect(target,{id:'ki-156-alchemy-care',sourceActorId:source.id,turns:1,modifiers:{incomingHealingPct:15}});}
 return out;
}

export function keptAfterShield({combat,source,target,ability,component,result}={}){
 if(!source?.keptState||!target)return;
 if(hasKept(source,'KI-127')&&target.real===false){addShield(source,Math.min(n(source.resources.maxHp)*.08,n(result.amount)*.30),{sourceActorId:source.id,abilityId:'ki-127-kinward'});}
 if(hasKept(source,'KI-157')&&target.id!==source.id&&target.real){addShield(source,Math.min(n(source.resources.maxHp)*.10,n(result.amount)*.30),{sourceActorId:source.id,abilityId:'ki-157-reciprocity'});kiState(source,'KI-157').allyId=target.id;}
 if(hasKept(source,'KI-171')&&target.id!==source.id&&target.real&&n(result.amount)>=n(target.resources.maxHp)*.10)kiState(source,'KI-171').threads=Math.min(3,n(kiState(source,'KI-171').threads)+1);
 if(hasKept(source,'KI-175')){kiState(target,'KI-175').wardfall=true;}
}

export function keptOnActorDefeated({slot,combat,source,target,ability,component,overkill=0,rng=Math.random,helpers={}}={}){
 if(isSummon(target)){
  const owner=summonOwner(combat,target);if(owner&&alive(owner)){
   if(hasKept(owner,'KI-125')&&!kiState(owner,'KI-125').used){const st=kiState(owner,'KI-125');st.used=true;st.borrowedBodyRider=true;st.borrowedBodyType=summonPrimaryType(target);st.borrowedUntil=n(owner.turnControl?.turnsStarted)+2;addShield(owner,n(owner.resources.maxHp)*.15,{sourceActorId:owner.id,abilityId:'ki-125-borrowed-body'});const g=grantEnergy(owner,1);if(g)keptOnBonusEnergy({slot,combat,actor:owner,amount:g,helpers});}
   if(hasKept(owner,'KI-154')){const st=kiState(owner,'KI-154'),round=String(combat?.round||1);if(st.fallenRound!==round){st.fallenRound=round;st.fallenEcho=true;st.fallenType=summonPrimaryType(target);st.fallenMaxHp=n(target.resources?.maxHp);st.fallenUntil=n(owner.turnControl?.turnsStarted)+2;}}
  }
 }
 if(!source?.keptState)return;
 if(hasKept(source,'KI-191')&&n(overkill)>0&&target.real)heal(source,Math.min(n(source.resources.maxHp)*.10,n(overkill)*.35));
 if(hasKept(source,'KI-198')){const poisons=(target.effects||[]).filter(e=>e.sourceActorId===source.id&&e.memory?.statusKind==='Poison');if(poisons.length){const strongest=Math.min(n(component?.base)*.20,Math.max(...poisons.map(e=>n(e.memory?.tickBase))));const others=enemies(combat,source).filter(e=>e.id!==target.id);if(others.length)for(const e of others)putEffect(e,{id:`ki-198-blight-${target.id}`,sourceActorId:source.id,negative:true,turns:2,memory:{statusKind:'Poison',tickBase:strongest,tickTiming:'owner-turn-end',noBlight:true}});else healPct(source,5);}}
}

export function keptOnNegativeRemoved({slot,combat,source,target,effect,helpers={}}={}){
 if(!source?.keptState||!target||target.id===source.id||!target.real||!effect?.negative||effect.removable===false||effect.memory?.hardControl)return;
 if(hasKept(source,'KI-117')){const st=kiState(source,'KI-117');st.usedAllies=st.usedAllies||{};if(!st.usedAllies[target.id]){st.usedAllies[target.id]=true;putEffect(source,{id:'ki-117-clean-current',sourceActorId:source.id,turns:2,memory:{otherId:target.id,fired:false,statusKind:'Clean Current'}});putEffect(target,{id:'ki-117-clean-current',sourceActorId:source.id,turns:2,memory:{otherId:source.id,fired:false,statusKind:'Clean Current'}});}}
 if(hasKept(source,'KI-148')&&!kiState(source,'KI-148').used){kiState(source,'KI-148').used=true;const g=grantEnergy(source,1);if(g)keptOnBonusEnergy({slot,combat,actor:source,amount:g,helpers});addShield(target,n(target.resources.maxHp)*.10,{sourceActorId:source.id,abilityId:'ki-148-clean-hand'});putEffect(target,{id:'ki-148-clean-hand',sourceActorId:source.id,turns:2,memory:{statusKind:'Clean Hand'}});}
}

export function keptOnPositiveRemoved({slot,combat,source,target,effect,helpers={}}={}){
 if(!source?.keptState||!target||target.side===source.side||!effect||effect.negative||effect.removable===false||!hasKept(source,'KI-118'))return;
 const st=kiState(source,'KI-118');st.cooldowns=st.cooldowns||{};if(n(st.cooldowns[target.id])>0)return;st.cooldowns[target.id]=3;
 const keys=Object.keys(effect.modifiers||{});let role='offense';
 if(keys.some(k=>/incomingDamage|block|dodge|resistance|shield/i.test(k)))role='defense';
 else if(keys.some(k=>/healing|energy|resource/i.test(k)))role='resource';
 if(role==='offense')st.harvest='offense';
 else if(role==='defense')addShield(source,n(source.resources.maxHp)*.08,{sourceActorId:source.id,abilityId:'ki-118-harvested-light'});
 else{const g=grantEnergy(source,1);if(g)keptOnBonusEnergy({slot,combat,actor:source,amount:g,helpers});}
}

export function keptOnStatusApplied({slot,combat,source,target,effect,helpers={}}={}){
 if(target?.keptState){const kind=effect?.memory?.statusKind;
  if(hasKept(target,'KI-025')&&!kiState(target,'KI-025').used&&effect.negative&&effect.removable!==false&&!effect.memory?.hardControl){kiState(target,'KI-025').used=true;if(effect.duration?.remaining)effect.duration.remaining=Math.max(1,n(effect.duration.remaining)-1);effect.memory.firstward=true;}
  if(hasKept(target,'KI-077')&&kind==='Poison'&&effect.duration?.remaining)effect.duration.remaining=Math.max(1,n(effect.duration.remaining)-1);
  if(hasKept(target,'KI-080')&&effect.negative&&!effect.memory?.hardControl&&!target.keptState.round['KI-080']){target.keptState.round['KI-080']=true;kiState(target,'KI-080').reflex={sourceId:source?.id,effect:{modifiers:{...(effect.modifiers||{})},remaining:n(effect.duration?.remaining)}};}
  if(hasKept(target,'KI-151')&&!kiState(target,'KI-151').used&&effect.negative&&!effect.memory?.hardControl&&Object.keys(effect.modifiers||{}).length&&source){kiState(target,'KI-151').used=true;const mods=Object.fromEntries(Object.entries(effect.modifiers||{}).map(([k,v])=>[k,n(v)*.6]));putEffect(source,{id:'ki-151-mirrored',sourceActorId:target.id,negative:true,turns:Math.max(1,n(effect.duration?.remaining,1)),modifiers:mods,memory:{statusKind:'Mirrored Debuff'}});}
  if(hasKept(target,'KI-199')&&effect.negative&&!target.keptState.round['KI-199']){target.keptState.round['KI-199']=true;kiState(target,'KI-199').thread=kind==='Burn'?'Burn':kind==='Poison'?'Poison':['Chill','Freeze','Deep Freeze'].includes(kind)?'Chill':'Other';}
 }
 if(source?.keptState&&effect?.negative){
  if(hasKept(source,'KI-085')&&!kiState(source,'KI-085').used&&!effect.memory?.hardControl&&Object.keys(effect.modifiers||{}).some(k=>Number.isFinite(Number(effect.modifiers[k])))){for(const k of Object.keys(effect.modifiers||{}))if(Number.isFinite(Number(effect.modifiers[k])))effect.modifiers[k]=n(effect.modifiers[k])*1.20;effect.memory={...(effect.memory||{}),freshCut:true};kiState(source,'KI-085').used=true;}
  if(hasKept(source,'KI-079'))putEffect(target,{id:'ki-079-mirror',sourceActorId:source.id,turns:2});
  if(hasKept(source,'KI-086')&&!kiState(source,'KI-086').used&&!effect.memory?.hardControl&&effect.duration?.remaining){effect.duration.remaining+=1;kiState(source,'KI-086').used=true;}
  if(hasKept(source,'KI-116')){const prior=negativeCount(target);if(prior>=2)putEffect(target,{id:'ki-116-weave-link',sourceActorId:source.id,negative:true,turns:2,memory:{statusKind:'Weave Link'}});}
  if(hasKept(source,'KI-150')&&negativeCount(target)>=3){const st=kiState(source,'KI-150');st.seen=st.seen||{};if(!st.seen[target.id]){st.seen[target.id]=true;st.tokens=n(st.tokens)+1;const g=grantEnergy(source,1);if(g)keptOnBonusEnergy({slot,combat,actor:source,amount:g,helpers});}}
  if(hasKept(source,'KI-173')&&negativeCount(target)>=3)putEffect(target,{id:'ki-173-architecture',sourceActorId:source.id,turns:2,memory:{statusKind:'Architecture'}});
 }
}

export function keptOnStatusExpired({slot,combat,source,target,effect,natural=true,remainingBefore=0,helpers={}}={}){
 if(target?.keptState){const kind=effect?.memory?.statusKind;
  if(hasKept(target,'KI-025')&&effect.memory?.firstward)putEffect(target,{id:'ki-025-psychic-ward',sourceActorId:target.id,turns:2,memory:{resistanceType:'Psychic',resistancePct:10}});
  if(hasKept(target,'KI-077')&&kind==='Poison')kiState(target,'KI-077').venomCharge=true;
  if(hasKept(target,'KI-078')&&kind==='Burn')kiState(target,'KI-078').cinderSkin=true;
  if(hasKept(target,'KI-082')&&natural&&effect.negative&&!target.keptState.turn['KI-082']){target.keptState.turn['KI-082']=true;healPct(target,3);kiState(target,'KI-082').closure=true;}
 }
 if(source?.keptState){
  const kind=effect?.memory?.statusKind;
  if(hasKept(source,'KI-085')&&effect?.memory?.freshCut&&alive(target)){if(helpers.rider)helpers.rider(source,target,{id:'ki-085-fresh-cut',components:[]},{base:10,damageType:'Poison',scaling:{}},20,'Poison',{canCrit:false});else fallbackIndirectDamage(combat,source,target,2,'Poison');}
  if(hasKept(source,'KI-187')&&kind==='Burn'){const st=kiState(source,'KI-187');st.cooldowns=st.cooldowns||{};if(n(st.cooldowns[target.id])<=0){st.cooldowns[target.id]=2;const pct=Math.max(30,Math.min(90,30*Math.max(1,n(remainingBefore,1))));if(helpers.rider)helpers.rider(source,target,{id:'ki-187-cinderburst',components:[]},{base:100,damageType:'Fire'},pct,'Fire',{canCrit:false});else fallbackIndirectDamage(combat,source,target,pct,'Fire');for(const e of enemies(combat,source).filter(x=>x.id!==target.id)){if(helpers.rider)helpers.rider(source,e,{id:'ki-187-cinderburst-splash',components:[]},{base:100,damageType:'Fire'},pct*.4,'Fire',{canCrit:false});else fallbackIndirectDamage(combat,source,e,pct*.4,'Fire');}}}
  if(source.subclass==='Dreadcantor'&&hasKept(source,'KI-240')&&effect.negative&&natural&&!effect.memory?.lingeringExtended){const mods=Object.fromEntries(Object.entries(effect.modifiers||{}).map(([k,v])=>[k,n(v)*.5]));putEffect(target,{id:`${effect.id}-lingering`,sourceActorId:source.id,negative:true,turns:2,modifiers:mods,memory:{...(effect.memory||{}),lingeringExtended:true}});}
 }
}

export function keptEndTurn({slot,combat,actor,helpers={}}={}){
 if(!actor?.keptState)return;
 const cat=actor.keptState.action?.category||null;
 if(isSummon(actor)){
  const owner=summonOwner(combat,actor),mem=summonMemory(actor),round=String(combat?.round||1);mem.actedRounds=mem.actedRounds||{};mem.actedRounds[round]=true;
  if(owner){
   if(hasKept(owner,'KI-093')){const st=kiState(owner,'KI-093');if(st.actionRound!==round){st.actionRound=round;st.energyGainWindow=true;st.actingSummonId=actor.id;}}
   if(hasKept(owner,'KI-152')){const st=kiState(owner,'KI-152');st.ownerNextPct=-8;if(allActiveSummonsActedThisRound(combat,owner))st.ownerNextPct=20;}
   if(hasKept(owner,'KI-153')){const st=kiState(owner,'KI-153');st.bodyNotes=st.bodyNotes||{};const role=summonRoleIndex(combat,owner,actor);if(role<=3)st.bodyNotes[role]=true;}
   if(hasKept(owner,'KI-172'))roleEcho(owner,summonRoleIndex(combat,owner,actor));
  }
  mem.hoststepCategory=null;mem.actionNumericalBonusPct=0;
 }
 if(hasKept(actor,'KI-010')){const st=kiState(actor,'KI-010');if(!st.targetedThisTurn&&!st.triggered){st.triggered=true;st.veiled=true;}st.targetedThisTurn=false;}
 if(hasKept(actor,'KI-020')){kiState(actor,'KI-020').breathbank=actor.keptState.action?.damagePacket!==true;}
 if(hasKept(actor,'KI-052')&&kiState(actor,'KI-052').tempo)kiState(actor,'KI-052').lastCategory=cat;
 if(hasKept(actor,'KI-056')&&n(actor.resources.energy)===0){kiState(actor,'KI-056').emptyCircuit=true;}
 if(hasKept(actor,'KI-058')&&kiState(actor,'KI-058').charged){addShield(actor,n(actor.resources.maxHp)*.05,{sourceActorId:actor.id,abilityId:'ki-058-current-shelter'});kiState(actor,'KI-058').charged=false;}
 if(hasKept(actor,'KI-060')&&n(actor.resources.energy)>=3&&!kiState(actor,'KI-060').spark&&n(kiState(actor,'KI-060').cooldown)<=0)kiState(actor,'KI-060').spark=true;
 if(hasKept(actor,'KI-063')&&n(actor.turnControl?.turnsStarted)>=1){};
 if(hasKept(actor,'KI-099'))kiState(actor,'KI-099').lastCategory=cat;
 if(hasKept(actor,'KI-107'))kiState(actor,'KI-107').current=Math.min(3,Math.max(0,n(actor.resources.energy)-1));
 if(hasKept(actor,'KI-141')&&cat==='Support')kiState(actor,'KI-141').stage=0;
 if(hasKept(actor,'KI-142')&&n(actor.resources.energy)===0&&n(kiState(actor,'KI-142').cooldown)<=0){kiState(actor,'KI-142').zeroLoop=true;kiState(actor,'KI-142').readyOnTurn=n(actor.turnControl?.turnsStarted)+1;kiState(actor,'KI-142').cooldown=2;}
 if(hasKept(actor,'KI-144')){const st=kiState(actor,'KI-144');if(st.ghostwake&&n(actor.turnControl?.turnsStarted)>n(st.startedTurn||0)){st.ghostwake=false;st.dodged=false;}if(n(actor.resources.energy)<n(actor.resources.maxEnergy))st.wasBelowMax=true;}
 if(hasKept(actor,'KI-160')){const st=kiState(actor,'KI-160');if(n(st.beats)>0){st.readyBeats=n(st.beats);actor.explicitInitiativeBonus=n(actor.explicitInitiativeBonus)+n(st.beats);st.beats=0;}st.roundHeal=0;}
 if(hasKept(actor,'KI-164')&&kiState(actor,'KI-164').invoked){actor.resources.energy=Math.max(0,n(actor.resources.energy)-1);kiState(actor,'KI-164').invoked=false;}
 if(hasKept(actor,'KI-166')&&kiState(actor,'KI-166').chosen==='Support')kiState(actor,'KI-166').aggroBoost=false;
 if(hasKept(actor,'KI-176')&&hpPct(actor)>75&&n(kiState(actor,'KI-176').authority)>0){const st=kiState(actor,'KI-176'),t=(combat.actors||[]).find(a=>a.id===st.targetId&&alive(a));if(t)helpers.flatDamage?.(actor,t,n(st.authority),'Dark',{canCrit:false});for(const a of allies(combat,actor,{real:true}))addShield(a,n(st.authority)*.25,{sourceActorId:actor.id,abilityId:'ki-176-authority'});st.authority=0;}
 if(hasKept(actor,'KI-177')){const st=kiState(actor,'KI-177');st.sequence=st.sequence||[];const mapped=cat==='Support'?'Support':cat==='Damage'?'Damage':'Utility';if(st.sequence.at(-1)!==mapped){if(st.sequence.includes(mapped))st.sequence=[mapped];else st.sequence.push(mapped);}if(st.sequence.length>=3){st.phrase=true;st.sequence=[];}}
 if(hasKept(actor,'KI-181')&&kiState(actor,'KI-181').active)kiState(actor,'KI-181').active=false;
 actor.keptState.lastActionCategory=cat;
 if(hasKept(actor,'KI-124'))kiState(actor,'KI-124').circuitAction=false;
 if(hasKept(actor,'KI-152'))kiState(actor,'KI-152').actionPct=0;
 if(hasKept(actor,'KI-125')&&n(kiState(actor,'KI-125').borrowedUntil)<n(actor.turnControl?.turnsStarted))kiState(actor,'KI-125').borrowedBodyRider=false;
 if(hasKept(actor,'KI-154')&&n(kiState(actor,'KI-154').fallenUntil)<n(actor.turnControl?.turnsStarted))kiState(actor,'KI-154').fallenEcho=false;
 if(hasKept(actor,'KI-045')&&kiState(actor,'KI-045').cushionReady&&n(kiState(actor,'KI-045').cushionUntil)<=n(actor.turnControl?.turnsStarted)){kiState(actor,'KI-045').cushionReady=false;kiState(actor,'KI-045').pendingSourceId=null;}
 // Internal cooldowns are owner-turn clocks.
 for(const id of keptIds(actor)){const st=kiState(actor,id);for(const k of ['cooldown'])if(n(st[k])>0)st[k]=Math.max(0,n(st[k])-1);if(st.cooldowns)for(const k of Object.keys(st.cooldowns))st.cooldowns[k]=Math.max(0,n(st.cooldowns[k])-1);}
}

export function keptStartRound(combat){for(const a of combat?.actors||[]){if(!a.keptState)continue;kiState(a,'KI-160').roundHeal=0;}}

export function keptVictoryRecovery(run,combat){
 const party=(combat?.actors||[]).filter(a=>a.side==='party'&&a.real), noRealAllyDefeated=party.every(alive);
 run.keptCampsiteEffects=run.keptCampsiteEffects||{};
 for(const actor of party){
  if(!alive(actor))continue;
  if(hasKept(actor,'KI-195'))healPct(actor,10);
  if(hasKept(actor,'KI-098')&&hpPct(actor)>50){const restored=healPct(actor,5);if(restored===0)run.keptCampsiteEffects[actor.id]={...(run.keptCampsiteEffects[actor.id]||{}),steadyReturnRecoveryStrengthPct:20};}
 }
 if(noRealAllyDefeated){for(const owner of party.filter(a=>alive(a)&&hasKept(a,'KI-136'))){for(const ally of party.filter(alive)){healPct(ally,4);run.keptCampsiteEffects[ally.id]={...(run.keptCampsiteEffects[ally.id]||{}),aftercareStatusRemovalHealPct:5,sourceActorId:owner.id};}}}
 return combat;
}

export function keptActiveAbilities(actor){return keptActiveAbilityDefinitions(actor);}

export function executeKeptActiveAbility(slot,{kiAbilityId,targetId=null,rng=Math.random,helpers={}}={}){
 const next=typeof structuredClone==='function'?structuredClone(slot):JSON.parse(JSON.stringify(slot));
 const combat=next?.campaign?.state?.combat;if(!combat?.turn||combat.turn.actionTaken)return {ok:false,error:'No unused combat action is available.'};const actor=(combat.actors||[]).find(a=>a.id===combat.turn.actorId);if(!actor)return {ok:false,error:'Current combatant is missing.'};
 const def=keptActiveAbilityDefinitions(actor).find(a=>a.id===kiAbilityId);if(!def)return {ok:false,error:'That Kept Impression does not grant this active ability.'};
 const cdKey=`ki:${def.kiId}`;if(n(actor.cooldowns?.[cdKey]?.remaining)>0)return {ok:false,error:`Cooldown: ${actor.cooldowns[cdKey].remaining} turn(s) remaining.`};if(n(actor.resources.energy)<n(def.energyCost))return {ok:false,error:`Requires ${def.energyCost} Energy.`};
 let target=actor;if(def.targetMode==='single-enemy')target=(combat.actors||[]).find(a=>a.id===targetId&&a.side!==actor.side&&alive(a));if(def.targetMode==='single-ally')target=(combat.actors||[]).find(a=>a.id===targetId&&a.side===actor.side&&a.real&&a.id!==actor.id&&alive(a));if(!target)return {ok:false,error:'Choose a legal target.'};
 const indirectDamage=(src,tgt,amount,type='Force')=>{let dmg=Math.max(0,n(amount));const resist=n(tgt.resistances?.[type]);dmg=Math.max(0,Math.round(dmg*(1-resist/100)));let remaining=dmg;for(const layer of (tgt.resources.shieldLayers||[])){if(remaining<=0)break;const take=Math.min(remaining,Math.max(0,n(layer.amount)));layer.amount-=take;remaining-=take;}tgt.resources.shieldLayers=(tgt.resources.shieldLayers||[]).filter(l=>n(l.amount)>0);tgt.resources.shield=(tgt.resources.shieldLayers||[]).reduce((q,l)=>q+n(l.amount),0);const hp=Math.min(n(tgt.resources.hp),remaining);tgt.resources.hp=Math.max(0,n(tgt.resources.hp)-hp);return hp;};
 const useHelpers={...helpers,flatDamage:helpers.flatDamage||((src,tgt,amount,type)=>indirectDamage(src,tgt,amount,type)),rider:helpers.rider||((src,tgt,ab,comp,pct,type)=>indirectDamage(src,tgt,n(comp?.base)*n(pct)/100,type)),lastRiderDamage:n(helpers.lastRiderDamage)};
 keptBeforeAction({combat,actor,ability:{...def,components:[]}});actor.resources.energy=Math.max(0,n(actor.resources.energy)-n(def.energyCost));actor.cooldowns=actor.cooldowns||{};if(def.cooldown>0)actor.cooldowns[cdKey]={remaining:def.cooldown,appliedOnTurn:n(actor.turnControl?.turnsStarted)};
 keptEnergySpent({slot:next,combat,actor,ability:def,amount:def.energyCost,helpers:useHelpers,rng});
 const results=[];
 if(def.kiId==='KI-004'){selfNonlethalDamage(actor,n(actor.resources.hp)*.10);addShield(target,n(target.resources.maxHp)*.15,{sourceActorId:actor.id,abilityId:def.id});putEffect(target,{id:'ki-004-woundshare',sourceActorId:actor.id,turns:2,memory:{statusKind:'Woundshare',copyDamagePct:20}});results.push({type:'woundshare',targetId:target.id});}
 if(def.kiId==='KI-188'){const poison=(target.effects||[]).find(e=>e.sourceActorId===actor.id&&e.memory?.statusKind==='Poison'&&n(e.duration?.remaining)>0);if(!poison)return {ok:false,error:'Venomburst requires one of your Poison effects on the target.'};const turns=Math.min(3,n(poison.duration.remaining));poison.duration.remaining-=turns;useHelpers.flatDamage?.(actor,target,n(poison.memory?.tickBase||10)*turns,'Poison',{canCrit:false});for(const e of enemies(combat,actor).filter(x=>x.id!==target.id))putEffect(e,{id:`ki-188-poison-${actor.id}`,sourceActorId:actor.id,negative:true,turns:2,memory:{statusKind:'Poison',tickBase:10,tickTiming:'owner-turn-end'}});results.push({type:'venomburst',turns});}
 if(def.kiId==='KI-190'){const eligible=(target.effects||[]).filter(e=>e.sourceActorId===actor.id&&e.negative&&!e.memory?.hardControl&&n(e.duration?.remaining)>0).slice(0,4);if(eligible.length<3)return {ok:false,error:'Cascade Detonation requires at least 3 different eligible negative statuses you applied.'};let total=0;for(const e of eligible){e.duration.remaining=Math.max(0,n(e.duration.remaining)-1);const k=e.memory?.statusKind||'';const type=k==='Burn'?'Fire':k==='Poison'?'Poison':k==='Chill'?'Cold':Object.keys(e.modifiers||{}).some(x=>x.includes('block'))?'Force':'Psychic';const pct=['Burn','Poison'].includes(k)?35:k==='Chill'?30:type==='Force'?30:25;total+=useHelpers.rider?.(actor,target,def,{base:100,damageType:type},pct,type,{canCrit:false})||0;}for(const e of enemies(combat,actor).filter(x=>x.id!==target.id))useHelpers.flatDamage?.(actor,e,total*.4,'Psychic',{canCrit:false});results.push({type:'cascade',statuses:eligible.length});}
 if(def.kiId==='KI-196'){kiState(actor,'KI-196').active=true;results.push({type:'borrow-tomorrow'});}
 combat.turn.actionTaken=true;combat.turn.actionType='ability';combat.turn.actionPayload={kiAbilityId:def.id,targetId};combat.turn.canEndTurn=true;combat.log?.push({type:'kept-active',actorId:actor.id,kiId:def.kiId,abilityId:def.id,targetId});return {ok:true,slot:next,combat:typeof structuredClone==='function'?structuredClone(combat):JSON.parse(JSON.stringify(combat)),results};
}
