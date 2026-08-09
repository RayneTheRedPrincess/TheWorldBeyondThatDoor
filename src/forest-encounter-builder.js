import { attachCombatToCampaign } from './combat-controller.js';
import { combinedCharacterStats, maxHpFor } from './character-progression.js';
import { applyKeptPreCombatStats, keptMaxHpMultiplier } from './kept-impression-state.js';
import { aggregateEquipmentEffects, applyEquipmentCoreStats } from './equipment-controller.js';
const CORE_STATS = ['STR','DEX','CON','INT','FTH','CHA','LCK'];

function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function unit(rng) { const n=Number(rng()); return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0; }
function randint(min,max,rng) { return Math.floor(unit(rng)*(max-min+1))+min; }
function findMainHand(equipment={}) {
  return equipment.mainHand || equipment['Main Hand'] || equipment.main_hand || null;
}
function classRole(baseClass) {
  const roles={Warrior:'Frontline',Rogue:'Damage',Brawler:'Frontline',Mage:'Damage',Cleric:'Healer',Ranger:'Damage',Bard:'Support',Sorcerer:'Damage',Warlock:'Damage',Paladin:'Support',Druid:'Support'};
  return roles[baseClass] || 'Adventurer';
}
export function getForestDepthTier(forestEnemies, depth) {
  return (forestEnemies?.depthTiers||[]).find(t=>depth>=Number(t.start)&&depth<=Number(t.end)) || null;
}
export function getEnemyCountRange(realPartySize, forestEnemies) {
  const size=Math.max(1,Math.min(4,Math.trunc(Number(realPartySize)||1)));
  const range=forestEnemies?.rules?.partySizeEnemyCount?.[String(size)] || [size,size+1];
  return [Number(range[0]),Number(range[1])];
}
export function rollEnemyCount(realPartySize, forestEnemies, rng=Math.random) {
  const [min,max]=getEnemyCountRange(realPartySize,forestEnemies); return randint(min,max,rng);
}
function scaleBase(base,mult) { return Math.max(0,Math.round(Number(base||0)*Number(mult||1)*10)/10); }
function scaledAbility(ability,tier) {
  const a=clone(ability);
  a.components=(a.components||[]).map(c=>({ ...c, base: scaleBase(c.base,tier.damageMultiplier) }));
  return a;
}
export function scaleEnemyTemplate(template, tier, ordinal=1) {
  const stats={};
  for (const stat of CORE_STATS) {
    const base=Number(template.stats?.[stat]||0);
    stats[stat]=base>0 ? base+Number(tier?.statAdd||0) : 0;
  }
  const basic={...clone(template.basicAttack),base:scaleBase(template.basicAttack?.base,tier?.damageMultiplier)};
  return {
    id:`enemy-${template.id}-${ordinal}`,
    name:template.name,
    side:'enemy',kind:'enemy',control:'ai',real:true,
    level:Number(template.level||tier?.level||1),stats,
    maxHp:Math.max(1,Math.round(Number(template.baseMaxHp||1)*Number(tier?.hpMultiplier||1))),
    combatRole:template.role,portraitAsset:template.portrait||null,enemyTemplateId:template.id,enemyAi:clone(template.ai||{}),basicAttack:basic,
    abilityIds:(template.abilities||[]).map(a=>a.id),
    enemyAbilities:(template.abilities||[]).map(a=>scaledAbility(a,tier)),
    expReward:Math.max(0,Math.round(Number(template.baseExpReward||0)+Number(tier?.expAdd||0))),
    onyxReward:Math.max(0,Math.round(Number(template.baseOnyxReward||0)+Number(tier?.onyxAdd||0))),
    resistances:clone(template.resistances||{})
  };
}
function specialEnemySpec(template, ordinal=1, scaling={maxHpMultiplier:1,damageMultiplier:1}) {
  const damageMultiplier=Number(scaling.damageMultiplier||1), maxHpMultiplier=Number(scaling.maxHpMultiplier||1);
  return {
    id:`enemy-${template.id}-${ordinal}`,name:template.name,side:'enemy',kind:'enemy',control:'ai',real:true,
    level:Number(template.level||1),stats:clone(template.stats||{}),maxHp:Math.max(1,Math.round(Number(template.baseMaxHp||1)*maxHpMultiplier)),combatRole:template.role,portraitAsset:template.portrait||null,
    enemyTemplateId:template.id,enemyAi:clone(template.ai||{}),basicAttack:{...clone(template.basicAttack||{}),base:scaleBase(template.basicAttack?.base||1,damageMultiplier)},
    abilityIds:(template.abilities||[]).map(a=>a.id),enemyAbilities:(template.abilities||[]).map(a=>({...clone(a),components:(a.components||[]).map(c=>c.type==='damage'?{...c,base:scaleBase(c.base,damageMultiplier)}:clone(c))})),expReward:Number(template.expReward||0),onyxReward:Number(template.onyxReward||0),resistances:clone(template.resistances||{}),
    partyScaling:{maxHpMultiplier,damageMultiplier}
  };
}
function chooseRegularTemplates(forestEnemies, tierIndex, count, rng) {
  const pool=(forestEnemies?.regularEnemies||[]).filter(e=>tierIndex>=Number(e.minTier||1)&&tierIndex<=Number(e.maxTier||6));
  if (!pool.length) throw new Error(`No Forest enemies are eligible for tier ${tierIndex}.`);
  const chosen=[]; const seen=new Map();
  for (let i=0;i<count;i++) {
    let candidates=pool.filter(e=>(seen.get(e.id)||0)<2);
    if (!candidates.length) candidates=pool;
    const pick=candidates[Math.floor(unit(rng)*candidates.length)];
    chosen.push(pick); seen.set(pick.id,(seen.get(pick.id)||0)+1);
  }
  return chosen;
}
function rollMaterialCache(templates,rng,realPartySize,forestEnemies) {
  const totals={};
  const size=Math.max(1,Math.min(4,Math.trunc(Number(realPartySize)||1)));
  const normalRange=forestEnemies?.rules?.normalMaterialDropByRealPartySize?.[String(size)]||[size,Math.max(size,size+1)];
  const coreQty=Number(forestEnemies?.rules?.soulfireCoreDropByRealPartySize?.[String(size)]||size);
  for (const t of templates) for (const mat of (t.materials||[])) {
    const soul=mat.materialKind==='soulfire-core';
    const qty=soul?coreQty:randint(Number(normalRange[0]),Number(normalRange[1]),rng);
    const cur=totals[mat.id]||{id:mat.id,name:mat.name,quantity:0,materialKind:mat.materialKind||'ordinary-enemy',sourceId:mat.sourceId||t.id}; cur.quantity+=qty; totals[mat.id]=cur;
  }
  return Object.values(totals);
}
function trainerCombatSpec(trainer, scaling={maxHpMultiplier:1,damageMultiplier:1}) {
  const c=trainer?.combat||{}; const damageMultiplier=Number(scaling.damageMultiplier||1), maxHpMultiplier=Number(scaling.maxHpMultiplier||1);
  const scaledAbilities=(c.abilities||[]).map(a=>({...clone(a),components:(a.components||[]).map(comp=>comp.type==='damage'?{...clone(comp),base:scaleBase(comp.base,damageMultiplier)}:clone(comp))}));
  return {
    id:`trainer-${trainer.id}`,name:trainer.name,side:'enemy',kind:'enemy',control:'ai',real:true,level:Number(c.level||4),stats:clone(c.stats||{}),
    maxHp:Math.max(1,Math.round(Number(c.baseMaxHp||36)*maxHpMultiplier)),combatRole:c.role||`${trainer.subclass} Trainer`,enemyTemplateId:`trainer:${trainer.id}`,
    enemyAi:clone(c.ai||{}),basicAttack:{...clone(c.basicAttack||{}),base:scaleBase(c.basicAttack?.base||3,damageMultiplier)},abilityIds:scaledAbilities.map(a=>a.id),enemyAbilities:scaledAbilities,
    expReward:Number(c.expReward||0),onyxReward:Number(c.onyxReward||0),resistances:clone(c.resistances||{}),partyScaling:{maxHpMultiplier,damageMultiplier},trainerId:trainer.id,trainerSubclass:trainer.subclass,portraitAsset:`./assets/portraits/vessels/${String(trainer.subclass||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}/male-01.png`
  };
}
export function buildForestTrainerRoster({forestTrainers,forestEnemies,trainerId,realPartySize=1}={}) {
  const trainer=(forestTrainers?.entries||[]).find(t=>t.id===trainerId); if(!trainer)throw new Error(`Unknown Forest Trainer: ${trainerId}`);
  const size=Math.max(1,Math.min(4,Math.trunc(Number(realPartySize)||1))); const scaling=forestEnemies?.rules?.bossMinibossPartyScaling?.[String(size)]||{maxHpMultiplier:1,damageMultiplier:1};
  const actor=trainerCombatSpec(trainer,scaling); const coreQty=Number(forestTrainers?.rules?.soulfireCoreDropByRealPartySize?.[String(size)]||size);
  return {tierId:'trainer',templates:[trainer],actorSpecs:[actor],materialCache:[{id:trainer.soulfireCore.id,name:trainer.soulfireCore.name,quantity:coreQty,materialKind:'soulfire-core',sourceId:trainer.id}],rewardCache:{exp:Number(actor.expReward||0),rawOnyx:Number(actor.onyxReward||0)}};
}

export function buildForestEnemyRoster({forestEnemies,depth,realPartySize=1,boss=false,miniboss=false,rng=Math.random}={}) {
  const count=rollEnemyCount(realPartySize,forestEnemies,rng);
  if (boss || miniboss) {
    const special=boss?forestEnemies.boss:forestEnemies.miniboss;
    const addTier=(forestEnemies?.depthTiers||[]).find(t=>t.id===(boss?'tier-6':'tier-3'));
    const tierIndex=boss?6:3;
    const adds=Math.max(0,count-1);
    const addTemplates=adds?chooseRegularTemplates(forestEnemies,tierIndex,adds,rng):[];
    const templates=[special,...addTemplates];
    const scaling=forestEnemies?.rules?.bossMinibossPartyScaling?.[String(Math.max(1,Math.min(4,realPartySize)))]||{maxHpMultiplier:1,damageMultiplier:1};
    const actorSpecs=[specialEnemySpec(special,1,scaling),...addTemplates.map((t,i)=>scaleEnemyTemplate(t,addTier,i+2))];
    return {tierId:boss?'boss':'miniboss',templates,actorSpecs,materialCache:rollMaterialCache(templates,rng,realPartySize,forestEnemies),rewardCache:{exp:actorSpecs.reduce((n,a)=>n+Number(a.expReward||0),0),rawOnyx:actorSpecs.reduce((n,a)=>n+Number(a.onyxReward||0),0)}};
  }
  const tier=getForestDepthTier(forestEnemies,depth); if(!tier) throw new Error(`Depth ${depth} is not a regular Forest combat tier.`);
  const tierIndex=Number(String(tier.id).split('-').pop());
  const templates=chooseRegularTemplates(forestEnemies,tierIndex,count,rng);
  const actorSpecs=templates.map((t,i)=>scaleEnemyTemplate(t,tier,i+1));
  return {tierId:tier.id,templates,actorSpecs,materialCache:rollMaterialCache(templates,rng,realPartySize,forestEnemies),rewardCache:{exp:actorSpecs.reduce((n,a)=>n+Number(a.expReward||0),0),rawOnyx:actorSpecs.reduce((n,a)=>n+Number(a.onyxReward||0),0)}};
}
export function buildVesselCombatSpec(run, baseAbilities, subclassAbilities, progression, equipmentCatalog=null) {
  const rawStats=combinedCharacterStats(run?.character||{}); const baseClass=run?.configuration?.effectiveBaseClass;
  const level=Math.max(1,Number(run?.character?.level||1));
  const classless=Boolean(run?.configuration?.classless);
  const selections=run?.configuration?.classlessSelections||{};
  const unlocked=classless?[...new Set(selections.baseAbilityIds||[])].filter(id=>(baseAbilities?.abilities||[]).some(a=>a.id===id&&Number(a.level||1)<=level)):(baseAbilities?.abilities||[]).filter(a=>a.baseClass===baseClass&&Number(a.level||1)<=level).map(a=>a.id);
  const subclass=run?.configuration?.effectiveSubclass||null;
  const keptImpressions=[...new Set(run?.configuration?.keptImpressions||[])]; const keptImpressionChoices=clone(run?.configuration?.keptImpressionChoices||{});
  const equipment=equipmentCatalog?aggregateEquipmentEffects(run?.configuration?.equipment||{},equipmentCatalog,{baseClass:baseClass||run?.configuration?.permanentBaseClass,classless}):{ok:true,coreStats:{},modifiers:{},resistances:{},initiativeBonus:0,armorMitigationPct:0,armorCategory:null,mainHandWeaponType:findMainHand(run?.configuration?.equipment||{})?.weaponType||null,equipment:clone(run?.configuration?.equipment||{})};
  if(!equipment.ok)throw new Error(equipment.errors?.[0]||'Invalid equipment loadout.');
  const equippedStats=applyEquipmentCoreStats(rawStats,equipment);
  const stats=applyKeptPreCombatStats(equippedStats,subclass,keptImpressions,keptImpressionChoices);
  const unlockedSubclass=classless?[...new Set(selections.subclassAbilityIds||[])].filter(id=>(subclassAbilities?.abilities||[]).some(a=>a.id===id&&Number(a.level||1)<=level)):(subclassAbilities?.abilities||[]).filter(a=>a.subclass===subclass&&Number(a.level||1)<=level).map(a=>a.id);
  return {
    id:'vessel',name:run?.party?.find(p=>p.id==='vessel')?.name||'Otherworlder',side:'party',kind:'vessel',control:'player',real:true,
    level,stats,maxHp:Math.max(1,Math.round(maxHpFor({level,con:stats.CON,progression})*keptMaxHpMultiplier(keptImpressions))),hp:Number.isFinite(Number(run?.character?.currentHp))?Math.max(0,Number(run.character.currentHp)):undefined,baseClass:baseClass||null,subclass,
    combatRole:classRole(baseClass),weaponType:equipment.mainHandWeaponType||null,equipment:equipment.equipment,equipmentModifiers:equipment.modifiers,resistances:equipment.resistances,explicitInitiativeBonus:Number(equipment.initiativeBonus||0),armorMitigationPct:Number(equipment.armorMitigationPct||0),armorCategory:equipment.armorCategory||null,startingShieldPctMax:Number(equipment.startingShieldPctMax||0),equipmentAbilities:clone(equipment.grantedAbilities||[]),consumableIds:[...(run?.configuration?.consumables||[])].filter(Boolean),abilityIds:unlocked,subclassAbilityIds:unlockedSubclass,classless,resourceImprint:classless?(selections.resourceImprint||null):null,keptImpressions,keptImpressionChoices,portraitAsset:run?.configuration?.portraitAsset||null,portraitColors:clone(run?.configuration?.portraitColors||null),portraitMasks:clone(run?.configuration?.portraitMasks||null)
  };
}
export function buildTavernAdventurerCombatSpec(state, baseAbilities, subclassAbilities, progression, equipmentCatalog=null) {
  const rawStats=combinedCharacterStats(state||{}); const level=Math.max(1,Number(state?.level||1)); const baseClass=state?.baseClass||null;
  const unlocked=(baseAbilities?.abilities||[]).filter(a=>a.baseClass===baseClass&&Number(a.level||1)<=level).map(a=>a.id);
  const subclass=state?.subclass||null; const keptImpressions=[...new Set(state?.keptImpressions||[])]; const keptImpressionChoices=clone(state?.keptImpressionChoices||{});
  const equipment=equipmentCatalog?aggregateEquipmentEffects(state?.equipment||{},equipmentCatalog,{baseClass,classless:false}):{ok:true,coreStats:{},modifiers:{},resistances:{},initiativeBonus:0,armorMitigationPct:0,armorCategory:null,mainHandWeaponType:null,equipment:clone(state?.equipment||{})};
  if(!equipment.ok)throw new Error(equipment.errors?.[0]||'Invalid Tavern Adventurer starter equipment.');
  const equippedStats=applyEquipmentCoreStats(rawStats,equipment);const stats=applyKeptPreCombatStats(equippedStats,subclass,keptImpressions,keptImpressionChoices);
  const unlockedSubclass=(subclassAbilities?.abilities||[]).filter(a=>a.subclass===subclass&&Number(a.level||1)<=level).map(a=>a.id);
  return {id:state.id,name:state.name,side:'party',kind:'tavern-adventurer',control:'ai',real:true,level,stats,maxHp:Math.max(1,Math.round(maxHpFor({level,con:stats.CON,progression})*keptMaxHpMultiplier(keptImpressions))),hp:Number.isFinite(Number(state?.currentHp))?Math.max(0,Number(state.currentHp)):undefined,baseClass,subclass,combatRole:state.combatRole||classRole(baseClass),personality:state.personality||'Balanced',priority:state.priority||'Balanced',abilityIds:unlocked,subclassAbilityIds:unlockedSubclass,keptImpressions,keptImpressionChoices,weaponType:equipment.mainHandWeaponType||null,equipment:equipment.equipment,equipmentModifiers:equipment.modifiers,resistances:equipment.resistances,explicitInitiativeBonus:Number(equipment.initiativeBonus||0),armorMitigationPct:Number(equipment.armorMitigationPct||0),armorCategory:equipment.armorCategory||null,startingShieldPctMax:Number(equipment.startingShieldPctMax||0),equipmentAbilities:clone(equipment.grantedAbilities||[]),portraitAsset:state?.portrait||null};
}
export function buildPartyCombatSpecs(run, baseAbilities, subclassAbilities, progression, suppliedSpecs=null, equipmentCatalog=null) {
  if (Array.isArray(suppliedSpecs)&&suppliedSpecs.length) return clone(suppliedSpecs);
  return [buildVesselCombatSpec(run,baseAbilities,subclassAbilities,progression,equipmentCatalog),...Object.values(run?.adventurers||{}).map(state=>buildTavernAdventurerCombatSpec(state,baseAbilities,subclassAbilities,progression,equipmentCatalog))];
}
export function attachForestCombat(slot,{forestEnemies,forestTrainers=null,baseAbilities,subclassAbilities,progression=null,equipmentCatalog=null,partyActorSpecs=null,rng=Math.random,now=new Date().toISOString()}={}) {
  if (!slot?.campaign?.active||!slot.campaign.state) return {ok:false,error:'No active campaign.'};
  const run=slot.campaign.state; const expedition=run.expedition; const encounter=expedition?.encounter;
  if (expedition?.state!=='combat-pending'||!encounter?.combat) return {ok:false,error:'No Forest combat is pending.'};
  if (run.combat) return {ok:true,slot:clone(slot),combat:clone(run.combat),alreadyAttached:true};
  const party=buildPartyCombatSpecs(run,baseAbilities,subclassAbilities,progression,partyActorSpecs,equipmentCatalog);
  const realPartySize=Math.max(1,party.filter(a=>a.real!==false).length);
  let roster;
  try { roster=encounter.source==='trainer'&&encounter.trainerId
    ? buildForestTrainerRoster({forestTrainers,forestEnemies,trainerId:encounter.trainerId,realPartySize})
    : buildForestEnemyRoster({forestEnemies,depth:expedition.depth,realPartySize,boss:encounter.boss,miniboss:encounter.miniboss,rng}); }
  catch(error){ return {ok:false,error:error instanceof Error?error.message:String(error)}; }
  const attached=attachCombatToCampaign(slot,{actorSpecs:[...party,...roster.actorSpecs],rng,now});
  if(!attached.ok) return attached;
  const next=attached.slot;
  next.campaign.state.expedition.encounter.enemyRoster=roster.actorSpecs.map(a=>({id:a.id,templateId:a.enemyTemplateId,name:a.name,role:a.combatRole,tier:roster.tierId,maxHp:a.maxHp}));
  next.campaign.state.expedition.encounter.materialCache=clone(roster.materialCache);
  next.campaign.state.expedition.encounter.rewardCache=clone(roster.rewardCache);
  next.campaign.state.expedition.encounter.scalingBasis=encounter.source==='trainer'?'trainer-profile-plus-approved-real-party-size-hp-damage-scaling':((encounter.boss||encounter.miniboss)?'special-enemy-type-and-depth-plus-approved-real-party-size-hp-damage-scaling':'enemy-type-and-depth-tier-only');
  return {ok:true,slot:next,combat:clone(next.campaign.state.combat),roster:clone(next.campaign.state.expedition.encounter.enemyRoster),materialCache:clone(roster.materialCache),rewardCache:clone(roster.rewardCache)};
}
export function awardCurrentForestMaterialCache(slot) {
  if (!slot?.campaign?.active||!slot.campaign.state?.expedition?.encounter) return {ok:false,error:'No active Forest encounter.'};
  const next=clone(slot); const run=next.campaign.state; const encounter=run.expedition.encounter; const cache=encounter.materialCache||[];
  run.inventory=run.inventory||{}; run.inventory.materials=run.inventory.materials||{};
  const awarded=cache.map(item=>({...item}));
  for (const item of cache) run.inventory.materials[item.id]={name:item.name,quantity:Number(run.inventory.materials[item.id]?.quantity||0)+Number(item.quantity||0)};
  // KI-095 Material Thread: ordinary enemy/regional materials only; SoulfireCores are excluded.
  const hasMaterialThread=(run.configuration?.keptImpressions||[]).includes('KI-095');
  if(hasMaterialThread){
    run.keptImpressions=run.keptImpressions||{};const st=run.keptImpressions.materialThread||(run.keptImpressions.materialThread={remainders:{},threadedMaterialId:null});
    for(const item of cache){
      if(item.materialKind==='soulfire-core')continue;
      const accrued=Number(st.remainders[item.id]||0)+Number(item.quantity||0)*.10;const bonus=Math.floor(accrued+1e-9);st.remainders[item.id]=accrued-bonus;
      if(bonus>0){run.inventory.materials[item.id]={name:item.name,quantity:Number(run.inventory.materials[item.id]?.quantity||0)+bonus};awarded.push({id:item.id,name:item.name,quantity:bonus,materialKind:item.materialKind||'ordinary-enemy',source:'KI-095 Material Thread'});if(!st.threadedMaterialId)st.threadedMaterialId=item.id;}
    }
  }
  encounter.materialsAwarded=true;
  return {ok:true,slot:next,materials:clone(awarded)};
}
