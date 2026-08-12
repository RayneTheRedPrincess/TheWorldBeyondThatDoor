import { isLegacyEquipmentId, legacyBaseItemId, legacyEquipmentId, makeLegacyEquipmentItem } from './legacy-lender.js';
const CORE_STATS=new Set(['STR','DEX','CON','INT','FTH','CHA','LCK']);
const EQUIP_SLOTS=new Set(['mainHand','offHand','accessory','helmet','chest','boots','gloves','charm1','charm2','abilityItem']);
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function byId(catalog){const map=new Map();for(const item of catalog?.equipment||[]){map.set(item.id,item);map.set(legacyEquipmentId(item.id),makeLegacyEquipmentItem(item));}return map;}
function itemFor(value,index){if(!value)return null;if(typeof value==='string')return index.get(value)||null;if(value.id&&index.has(value.id))return index.get(value.id);return value;}
function mismatchMultiplier(baseClass,item,rules){if(!item||item.itemType!=='Weapon')return 1;const type=item.weaponType;if(type==='Physical'&&(rules?.mismatchPhysicalClasses||[]).includes(baseClass))return Number(rules?.mismatchListedStatMultiplier||.8);if(type==='Magic'&&(rules?.mismatchMagicClasses||[]).includes(baseClass))return Number(rules?.mismatchListedStatMultiplier||.8);return 1;}
export function legalEquipmentSlots(item={}){if(item.slot==='charm')return ['charm1','charm2'];if(item.itemType==='Weapon'&&item.slot==='mainHand'&&item.handedness==='one-handed'&&item.offHandCompatible)return ['mainHand','offHand'];return [item.slot];}
function allowedWeapon(baseClass,item,{classless=false}={}){if(!item||item.itemType!=='Weapon'||classless)return {ok:true};if(baseClass==='Brawler'&&item.weaponType!=='Gauntlet')return {ok:false,error:'Brawler can equip only Gauntlet weapons.'};if(baseClass==='Cleric'&&item.weaponType==='Physical')return {ok:false,error:'Cleric cannot equip Physical weapons.'};return {ok:true};}
export function normalizeEquipmentLoadout(equipment={}){const out={};for(const slot of EQUIP_SLOTS){if(equipment?.[slot])out[slot]=typeof equipment[slot]==='string'?equipment[slot]:equipment[slot]?.id||equipment[slot];}return out;}
export function validateEquipmentLoadout(equipment={},catalog,{baseClass=null,classless=false}={}){const index=byId(catalog),errors=[];for(const [slot,value] of Object.entries(equipment||{})){if(!EQUIP_SLOTS.has(slot)){errors.push(`Unknown equipment slot ${slot}.`);continue;}const item=itemFor(value,index);if(!item){errors.push(`Unknown equipment item ${String(value)}.`);continue;}const legalSlots=legalEquipmentSlots(item);if(!legalSlots.includes(slot))errors.push(`${item.name} cannot be equipped in ${slot}.`);const weapon=allowedWeapon(baseClass,item,{classless});if(!weapon.ok)errors.push(weapon.error);}const main=itemFor(equipment?.mainHand,index),off=itemFor(equipment?.offHand,index);if(main?.handedness==='two-handed'&&off)errors.push(`${main.name} is two-handed and cannot be paired with Off Hand equipment.`);if(off?.itemType==='Weapon'&&off.handedness!=='off-hand'&&!(off.handedness==='one-handed'&&off.offHandCompatible))errors.push(`${off.name} is not compatible with the Off Hand slot.`);const duplicateSlots=new Map();for(const [slot,value] of Object.entries(equipment||{})){const id=typeof value==='string'?value:value?.id;if(!id)continue;if(!duplicateSlots.has(id))duplicateSlots.set(id,[]);duplicateSlots.get(id).push(slot);}for(const [id,slots] of duplicateSlots){if(slots.length<=1)continue;const item=index.get(id);const dualWieldCopy=slots.length===2&&slots.includes('mainHand')&&slots.includes('offHand')&&item?.itemType==='Weapon'&&item?.handedness==='one-handed'&&item?.offHandCompatible===true;if(!dualWieldCopy)errors.push(`${item?.name||id} cannot occupy more than one equipment slot.`);}return {ok:errors.length===0,errors};}
function addStats(targetCore,targetMods,listed={},mult=1){for(const [key,val] of Object.entries(listed||{})){const amount=n(val)*mult;if(CORE_STATS.has(key))targetCore[key]+=amount;else targetMods[key]=n(targetMods[key])+amount;}}
function applySetBonuses(resolvedItems,catalog,coreStats,modifiers,resistances){
 const setCounts={};for(const item of resolvedItems){if(item?.setId)setCounts[item.setId]=n(setCounts[item.setId])+1;}
 const applied=[];for(const set of catalog?.sets||[]){const count=n(setCounts[set.id]);if(!count)continue;for(const bonus of set.bonuses||[]){if(count<n(bonus.pieces))continue;addStats(coreStats,modifiers,{...(bonus.coreStats||{}),...(bonus.modifiers||{})},1);for(const [type,val] of Object.entries(bonus.resistances||{}))resistances[type]=n(resistances[type])+n(val);applied.push({setId:set.id,setName:set.name,pieces:n(bonus.pieces)});}}
 return {setCounts,applied};
}
export function aggregateEquipmentEffects(equipment={},catalog,{baseClass=null,classless=false}={}){
 const index=byId(catalog),rules=catalog?.rules||{},validation=validateEquipmentLoadout(equipment,catalog,{baseClass,classless});if(!validation.ok)return {ok:false,errors:validation.errors};
 const coreStats={STR:0,DEX:0,CON:0,INT:0,FTH:0,CHA:0,LCK:0},modifiers={},resistances={};let armorMitigationPct=0,initiativeBonus=0,mainHandWeaponType=null,armorCategory=null,startingShieldPctMax=0;const grantedAbilities=[];const resolved={},resolvedItems=[];
 for(const [slot,value] of Object.entries(equipment||{})){const item=itemFor(value,index);if(!item)continue;resolved[slot]=item.id;resolvedItems.push(item);const mult=mismatchMultiplier(baseClass,item,rules);addStats(coreStats,modifiers,item.listedStats||{},mult);for(const [type,val] of Object.entries(item.resistances||{}))resistances[type]=n(resistances[type])+n(val)*mult;for(const mech of item.mechanics||[])if(mech.type==='start-shield-pct-max-hp')startingShieldPctMax+=n(mech.value);for(const ability of item.grantedAbilities||[])grantedAbilities.push({...clone(ability),sourceItemId:item.id,sourceItemName:item.name});if((slot==='mainHand'||(!mainHandWeaponType&&slot==='offHand'))&&item.itemType==='Weapon')mainHandWeaponType=item.weaponType||null;if(slot==='chest'&&item.itemType==='Armor'&&item.armorCategory){armorCategory=item.armorCategory;armorMitigationPct=n(rules?.armorMitigationPct?.[armorCategory]);if(armorCategory==='Heavy')initiativeBonus+=n(rules?.heavyChestInitiativePenalty||-2);}}
 const setResult=applySetBonuses(resolvedItems,catalog,coreStats,modifiers,resistances);
 return {ok:true,equipment:resolved,coreStats,modifiers,resistances,armorCategory,armorMitigationPct,initiativeBonus,mainHandWeaponType,startingShieldPctMax,grantedAbilities,setCounts:setResult.setCounts,setBonusesApplied:setResult.applied};
}
export function applyEquipmentCoreStats(baseStats={},aggregate={}){const out={...baseStats};for(const key of CORE_STATS)out[key]=n(out[key])+n(aggregate?.coreStats?.[key]);return out;}
function equipmentOwner(run,ownerId='vessel'){
 if(!ownerId||ownerId==='vessel')return {id:'vessel',name:'Otherworlder',equipment:run?.configuration?.equipment||{},baseClass:run?.configuration?.effectiveBaseClass||run?.configuration?.permanentBaseClass||null,classless:Boolean(run?.configuration?.classless),setEquipment:(r,eq)=>{r.configuration.equipment=eq;}};
 const a=run?.adventurers?.[ownerId];if(!a)return null;return {id:ownerId,name:a.name||ownerId,equipment:a.equipment||{},baseClass:a.baseClass||null,classless:false,setEquipment:(r,eq)=>{r.adventurers[ownerId].equipment=eq;}};
}
function inventoryQuantity(run,itemId){return n(run?.inventory?.equipment?.[itemId]?.quantity);}
function equipmentUseCount(run,itemId,{excludeOwnerId=null}={}){
 let count=0;const owners=[equipmentOwner(run,'vessel'),...Object.keys(run?.adventurers||{}).map(id=>equipmentOwner(run,id))].filter(Boolean);
 for(const owner of owners){if(owner.id===excludeOwnerId)continue;for(const v of Object.values(normalizeEquipmentLoadout(owner.equipment)))if(v===itemId)count++;}return count;
}
export function equipmentOwnerState(run,ownerId='vessel'){const owner=equipmentOwner(run,ownerId);return owner?{id:owner.id,name:owner.name,equipment:normalizeEquipmentLoadout(owner.equipment),baseClass:owner.baseClass,classless:owner.classless}:null;}
export function equipRunEquipmentAtCampsite(slot,{itemId,slotKey,catalog,ownerId='vessel'}={}){
 if(!slot?.campaign?.active||slot.campaign.state?.expedition?.state!=='campsite')return {ok:false,error:'Equipment can only be changed at an active Campsite during a campaign.'};const item=byId(catalog).get(itemId);if(!item)return {ok:false,error:'Unknown equipment item.'};if(!EQUIP_SLOTS.has(slotKey))return {ok:false,error:'Unknown equipment slot.'};
 const run=slot.campaign.state,owner=equipmentOwner(run,ownerId);if(!owner)return {ok:false,error:'That deployed character is not available at this Campsite.'};const quantity=inventoryQuantity(run,itemId);const currentEq=normalizeEquipmentLoadout(owner.equipment||{});if(currentEq[slotKey]===itemId)return {ok:true,slot:clone(slot),equipment:clone(currentEq),ownerId:owner.id};const totalUsed=equipmentUseCount(run,itemId),ownerSlots=Object.entries(currentEq).filter(([,v])=>v===itemId).map(([k])=>k);const freeCopies=Math.max(0,quantity-totalUsed);const dualWieldCopy=item.itemType==='Weapon'&&item.handedness==='one-handed'&&item.offHandCompatible===true&&['mainHand','offHand'].includes(slotKey)&&ownerSlots.some(k=>['mainHand','offHand'].includes(k));if(freeCopies<=0&&ownerSlots.length===0)return {ok:false,error:'Every carried copy of that item is already equipped by the party.'};
 const legal=legalEquipmentSlots(item);if(!legal.includes(slotKey))return {ok:false,error:`${item.name} cannot be equipped there.`};
 const next=clone(slot),nextRun=next.campaign.state,nextOwner=equipmentOwner(nextRun,ownerId);const eq=normalizeEquipmentLoadout(nextOwner.equipment||{});if(!(dualWieldCopy&&freeCopies>0)){for(const [k,v] of Object.entries(eq))if(v===itemId)delete eq[k];}eq[slotKey]=itemId;const checked=validateEquipmentLoadout(eq,catalog,{baseClass:nextOwner.baseClass,classless:nextOwner.classless});if(!checked.ok)return {ok:false,error:checked.errors[0],errors:checked.errors};const projectedUses=equipmentUseCount(nextRun,itemId,{excludeOwnerId:nextOwner.id})+Object.values(eq).filter(v=>v===itemId).length;if(projectedUses>quantity)return {ok:false,error:`Only ${quantity} carried ${quantity===1?'copy is':'copies are'} available.`};nextOwner.setEquipment(nextRun,eq);nextRun.crafting=nextRun.crafting||{crafted:[],craftedCount:0,equippedHistory:[]};const hist=new Set(nextRun.crafting.equippedHistory||[]);hist.add(itemId);nextRun.crafting.equippedHistory=[...hist];return {ok:true,slot:next,equipment:clone(eq),ownerId:nextOwner.id};
}
export function unequipRunEquipmentAtCampsite(slot,{slotKey,ownerId='vessel'}={}){if(!slot?.campaign?.active||slot.campaign.state?.expedition?.state!=='campsite')return {ok:false,error:'Equipment can only be changed at an active Campsite during a campaign.'};if(!EQUIP_SLOTS.has(slotKey))return {ok:false,error:'Unknown equipment slot.'};const next=clone(slot),run=next.campaign.state,owner=equipmentOwner(run,ownerId);if(!owner)return {ok:false,error:'That deployed character is not available at this Campsite.'};const eq=normalizeEquipmentLoadout(owner.equipment||{});delete eq[slotKey];owner.setEquipment(run,eq);return {ok:true,slot:next,equipment:clone(eq),ownerId:owner.id};}
export function discardRunEquipmentAtCampsite(slot,{itemId,count=1}={}){
 if(!slot?.campaign?.active||slot.campaign.state?.expedition?.state!=='campsite')return {ok:false,error:'Equipment can only be discarded at an active Campsite during a campaign.'};
 const run=slot.campaign.state,current=Math.max(0,Math.trunc(inventoryQuantity(run,itemId))),equipped=Math.max(0,equipmentUseCount(run,itemId)),requested=Math.max(1,Math.trunc(n(count)||1)),discardable=Math.max(0,current-equipped);
 if(current<=0)return {ok:false,error:'That equipment item is not in the carried inventory.'};
 if(discardable<=0)return {ok:false,error:'Every carried copy of that item is currently equipped. Unequip a copy before discarding it.'};
 const removed=Math.min(requested,discardable),next=clone(slot),entry=next.campaign.state.inventory?.equipment?.[itemId];
 if(!entry)return {ok:false,error:'That equipment item is not in the carried inventory.'};
 const remaining=Math.max(equipped,current-removed);
 if(remaining<=0)delete next.campaign.state.inventory.equipment[itemId];else entry.quantity=remaining;
 return {ok:true,slot:next,itemId,removed,remaining,equippedCount:equipped};
}
export function equipmentInventoryEntries(run,catalog){const index=byId(catalog);return Object.entries(run?.inventory?.equipment||{}).filter(([,v])=>n(v?.quantity)>0).map(([id,v])=>({id,quantity:n(v.quantity),equippedCount:equipmentUseCount(run,id),item:index.get(id)||null,source:v?.source||null,legacy:isLegacyEquipmentId(id)})).filter(x=>x.item);}
export function equipmentCatalogueIndex(catalog){return byId(catalog);}
export function resolveEquipmentItem(value,catalog){return itemFor(value,byId(catalog));}
export function isLegacyEquipment(value){const id=typeof value==='string'?value:value?.id;return isLegacyEquipmentId(id);}
export function baseEquipmentId(value){const id=typeof value==='string'?value:value?.id;return legacyBaseItemId(id);}

const RECOMMEND_CORE_STATS=['STR','DEX','CON','INT','FTH','CHA','LCK'];
const RECOMMEND_FIXED_SLOTS=['helmet','chest','boots','gloves','accessory','abilityItem'];
function recommendationMember(run,ownerId='vessel'){
 if(!ownerId||ownerId==='vessel')return {id:'vessel',name:run?.party?.find(p=>p.id==='vessel')?.name||'Vessel',baseClass:run?.configuration?.effectiveBaseClass||run?.configuration?.permanentBaseClass||null,subclass:run?.configuration?.classless?null:(run?.configuration?.effectiveSubclass||null),classless:Boolean(run?.configuration?.classless),level:Math.max(1,n(run?.character?.level)||1)};
 const a=run?.adventurers?.[ownerId];if(!a)return null;return {id:a.id,name:a.name||a.id,baseClass:a.baseClass||null,subclass:a.subclass||null,classless:false,level:Math.max(1,n(a.level)||1)};
}
function recommendationAbilities(member,baseAbilities,subclassAbilities){
 if(!member)return [];
 const base=member.classless?[]:(baseAbilities?.abilities||[]).filter(a=>a.baseClass===member.baseClass&&n(a.level||1)<=member.level);
 const sub=member.subclass?(subclassAbilities?.abilities||[]).filter(a=>a.subclass===member.subclass&&n(a.level||1)<=member.level):[];
 return [...base,...sub];
}
function recommendationWeights(member,baseAbilities,subclassAbilities){
 const abilities=recommendationAbilities(member,baseAbilities,subclassAbilities),raw=Object.fromEntries(RECOMMEND_CORE_STATS.map(k=>[k,0]));let damage=0,heal=0,shield=0;
 const wantedWeaponTypes=new Set();
 for(const ability of abilities){
   const abilityWeight=ability?.subclass?3:.5;
   const req=ability?.requirements||{};if(req.weaponType)wantedWeaponTypes.add(req.weaponType);for(const t of req.weaponTypes||[])wantedWeaponTypes.add(t);
   for(const component of ability?.components||[]){
     const type=component?.type,base=Math.max(1,n(component?.base)||1),kindWeight=type==='damage'?1:(type==='heal'?0.9:(type==='shield'?0.9:0.55));
     if(type==='damage')damage++;else if(type==='heal')heal++;else if(type==='shield')shield++;
     for(const [stat,coef] of Object.entries(component?.scaling||{}))if(raw[stat]!==undefined)raw[stat]+=Math.abs(n(coef))*Math.sqrt(base)*kindWeight*abilityWeight;
   }
 }
 const max=Math.max(.0001,...Object.values(raw));const core={};for(const stat of RECOMMEND_CORE_STATS)core[stat]=.35+3.15*(raw[stat]/max);
 core.CON+=.45;core.DEX+=.15;
 if(!abilities.length){
   const defaults={Warrior:['STR','CON'],Rogue:['DEX','LCK'],Brawler:['STR','CON'],Mage:['INT','LCK'],Cleric:['FTH','INT'],Ranger:['DEX','STR'],Bard:['CHA','DEX'],Sorcerer:['INT','CHA'],Warlock:['INT','FTH'],Paladin:['STR','FTH'],Druid:['FTH','CON']};
   for(const [i,stat] of (defaults[member?.baseClass]||['STR','DEX','CON','INT','FTH','CHA','LCK']).entries())core[stat]+=i===0?2.5:1.8;
 }
 const tank=['Warrior','Brawler','Paladin'].includes(member?.baseClass),evasive=['Rogue','Ranger','Bard'].includes(member?.baseClass);
 const modifiers={damageCritChancePct:damage?1.0:.45,criticalDamagePct:damage?.48:.2,blockChancePct:tank?.85:.42,blockedDamageReductionPct:tank?.78:.38,dodgeChancePct:evasive?.88:.48,energyGainPct:.48,incomingHealingPct:tank?.36:.25,outgoingHealingPct:heal?1.0:.22,healingCritChancePct:heal?.72:.12,healingCriticalDamagePct:heal?.42:.08,finalDamagePct:damage?1.5:.65,shieldStrengthPct:shield?1.05:(tank?.65:.35),lifestealPct:damage?.95:.4,aggroPct:tank?.22:.05};
 return {core,modifiers,damage,heal,shield,wantedWeaponTypes};
}
function recommendationItemScore(item,member,weights,catalog){
 if(!item)return -Infinity;const weapon=allowedWeapon(member?.baseClass,item,{classless:member?.classless});if(!weapon.ok)return -Infinity;
 const mult=mismatchMultiplier(member?.baseClass,item,catalog?.rules||{});let score=0;
 for(const [key,val] of Object.entries(item.listedStats||{})){const amount=n(val)*mult;if(weights.core[key]!==undefined)score+=amount*weights.core[key];else score+=amount*n(weights.modifiers[key]||.18);}
 for(const val of Object.values(item.resistances||{}))score+=n(val)*.13*mult;
 for(const mech of item.mechanics||[])if(mech.type==='start-shield-pct-max-hp')score+=n(mech.value)*.28;
 score+=(item.grantedAbilities||[]).length*4.5;
 if(item.itemType==='Armor'&&item.slot==='chest')score+=n(catalog?.rules?.armorMitigationPct?.[item.armorCategory])*.36+n(item.armorCategory==='Heavy'?catalog?.rules?.heavyChestInitiativePenalty:0)*.3;
 if(item.itemType==='Weapon'&&weights.wantedWeaponTypes.size){score+=weights.wantedWeaponTypes.has(item.weaponType)?5.5:-2.5;}
 return score;
}
function recommendationLoadoutScore(loadout,member,weights,catalog){
 const agg=aggregateEquipmentEffects(loadout,catalog,{baseClass:member?.baseClass,classless:member?.classless});if(!agg.ok)return -Infinity;let score=0;
 for(const stat of RECOMMEND_CORE_STATS)score+=n(agg.coreStats?.[stat])*n(weights.core[stat]);
 for(const [key,val] of Object.entries(agg.modifiers||{}))score+=n(val)*n(weights.modifiers[key]||.18);
 for(const val of Object.values(agg.resistances||{}))score+=n(val)*.13;
 score+=n(agg.armorMitigationPct)*.36+n(agg.initiativeBonus)*.3+n(agg.startingShieldPctMax)*.28+(agg.grantedAbilities||[]).length*4.5;
 return score;
}
function availableRecommendationItems(run,ownerId,catalog,member,weights){
 const index=byId(catalog),otherUse=new Map();
 const owners=[equipmentOwner(run,'vessel'),...Object.keys(run?.adventurers||{}).map(id=>equipmentOwner(run,id))].filter(Boolean);
 for(const owner of owners){if(owner.id===ownerId)continue;for(const id of Object.values(normalizeEquipmentLoadout(owner.equipment)))otherUse.set(id,n(otherUse.get(id))+1);}
 const rows=[];for(const [id,entry] of Object.entries(run?.inventory?.equipment||{})){const item=index.get(id);if(!item)continue;const available=Math.max(0,Math.trunc(n(entry?.quantity))-n(otherUse.get(id)));if(available<=0)continue;const score=recommendationItemScore(item,member,weights,catalog);if(!Number.isFinite(score))continue;rows.push({id,item,available,score});}
 return rows;
}
function bestFixedSlot(slot,rows){let best=null;for(const row of rows){if(row.available<1||!legalEquipmentSlots(row.item).includes(slot))continue;if(!best||row.score>best.score)best=row;}return best;}
export function recommendEquipmentLoadout(run,{ownerId='vessel',catalog,baseAbilities=null,subclassAbilities=null}={}){
 const member=recommendationMember(run,ownerId);if(!member)return {ok:false,error:'That selected party member is not available.'};const weights=recommendationWeights(member,baseAbilities,subclassAbilities),rows=availableRecommendationItems(run,ownerId,catalog,member,weights),loadout={};
 for(const slot of RECOMMEND_FIXED_SLOTS){const best=bestFixedSlot(slot,rows);if(best)loadout[slot]=best.id;}
 const charmRows=rows.filter(r=>r.available>=1&&legalEquipmentSlots(r.item).some(s=>s==='charm1'||s==='charm2')).sort((a,b)=>b.score-a.score);const charmPick=[];for(const row of charmRows){if(charmPick.some(x=>x.id===row.id))continue;charmPick.push(row);if(charmPick.length===2)break;}if(charmPick[0])loadout.charm1=charmPick[0].id;if(charmPick[1])loadout.charm2=charmPick[1].id;
 const handRows=rows.filter(r=>legalEquipmentSlots(r.item).some(s=>s==='mainHand'||s==='offHand')).sort((a,b)=>b.score-a.score),mainRows=[null,...handRows.filter(r=>legalEquipmentSlots(r.item).includes('mainHand')).slice(0,16)],offRows=[null,...handRows.filter(r=>legalEquipmentSlots(r.item).includes('offHand')).slice(0,16)];let bestHands={score:0,main:null,off:null};
 for(const main of mainRows)for(const off of offRows){if(!main&&!off)continue;if(main?.item?.handedness==='two-handed'&&off)continue;if(main&&off&&main.id===off.id&&main.available<2)continue;const score=n(main?.score)+n(off?.score)+(main?0.01:0)+(main&&off?0.02:0);if(score>bestHands.score){bestHands={score,main:main?.id||null,off:off?.id||null};}}
 if(bestHands.main)loadout.mainHand=bestHands.main;if(bestHands.off)loadout.offHand=bestHands.off;
 const score=recommendationLoadoutScore(loadout,member,weights,catalog),current=normalizeEquipmentLoadout(equipmentOwner(run,ownerId)?.equipment||{}),currentScore=recommendationLoadoutScore(current,member,weights,catalog);const topStats=[...RECOMMEND_CORE_STATS].sort((a,b)=>weights.core[b]-weights.core[a]).slice(0,3);
 return {ok:true,ownerId:member.id,ownerName:member.name,baseClass:member.baseClass,subclass:member.subclass,loadout,score,currentScore,improvement:score-currentScore,topStats,weights};
}
export function autoEquipRecommendedAtCampsite(slot,{ownerId='vessel',catalog,baseAbilities=null,subclassAbilities=null}={}){
 if(!slot?.campaign?.active||slot.campaign.state?.expedition?.state!=='campsite')return {ok:false,error:'Recommended equipment can only be applied at an active Campsite.'};const rec=recommendEquipmentLoadout(slot.campaign.state,{ownerId,catalog,baseAbilities,subclassAbilities});if(!rec.ok)return rec;const next=clone(slot),run=next.campaign.state,owner=equipmentOwner(run,ownerId);if(!owner)return {ok:false,error:'That selected party member is not available.'};const valid=validateEquipmentLoadout(rec.loadout,catalog,{baseClass:owner.baseClass,classless:owner.classless});if(!valid.ok)return {ok:false,error:valid.errors[0],errors:valid.errors};
 for(const [id,count] of Object.entries(Object.values(rec.loadout).reduce((m,id)=>(m[id]=n(m[id])+1,m),{}))){const qty=inventoryQuantity(run,id),usedElsewhere=equipmentUseCount(run,id,{excludeOwnerId:owner.id});if(usedElsewhere+count>qty)return {ok:false,error:`Not enough carried copies of ${byId(catalog).get(id)?.name||id} are available.`};}
 owner.setEquipment(run,clone(rec.loadout));run.crafting=run.crafting||{crafted:[],craftedCount:0,equippedHistory:[]};const hist=new Set(run.crafting.equippedHistory||[]);for(const id of Object.values(rec.loadout))hist.add(id);run.crafting.equippedHistory=[...hist];return {ok:true,slot:next,recommendation:rec,changed:JSON.stringify(normalizeEquipmentLoadout(equipmentOwner(slot.campaign.state,ownerId)?.equipment||{}))!==JSON.stringify(rec.loadout)};
}

export function scoreEquipmentItemsForRecommendation(run,{ownerId='vessel',catalog,baseAbilities=null,subclassAbilities=null,itemIds=[]}={}){
 const member=recommendationMember(run,ownerId);if(!member)return {ok:false,error:'That selected party member is not available.'};const weights=recommendationWeights(member,baseAbilities,subclassAbilities),index=byId(catalog),scores={};for(const id of itemIds||[]){const item=index.get(id);scores[id]=item?recommendationItemScore(item,member,weights,catalog):-Infinity;}const topStats=[...RECOMMEND_CORE_STATS].sort((a,b)=>weights.core[b]-weights.core[a]).slice(0,3);return {ok:true,ownerId:member.id,ownerName:member.name,baseClass:member.baseClass,subclass:member.subclass,topStats,scores};
}
