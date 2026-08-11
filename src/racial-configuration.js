function clone(v){return v==null?v:(typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v)));}
function s(v){return String(v??'').trim();}
function optionsMap(list=[]){return new Map(list.map(x=>[s(x.id),x]));}
export const CONFIGURABLE_RACES=Object.freeze(['Rhazekai','Veyssryn','Faervani','Kyravari','Rifthari','Demon']);

function hasHolyDragonbloodedAwakening(spec){
 const kept=Array.isArray(spec?.keptImpressions)?spec.keptImpressions:[];
 return kept.includes('KI-267')&&s(spec?.keptImpressionChoices?.['KI-267']?.damageType)==='Holy';
}
export function hasCompleteRacialConfiguration(race,config){const r=s(race),c=config&&typeof config==='object'?config:{};if(!CONFIGURABLE_RACES.includes(r))return true;if(r==='Rhazekai')return Boolean(s(c.organ));if(r==='Veyssryn')return Boolean(s(c.mainCore))&&Array.isArray(c.auxiliaryCores)&&c.auxiliaryCores.length===2&&c.auxiliaryCores.every(x=>Boolean(s(x)))&&new Set([s(c.mainCore),...c.auxiliaryCores.map(s)]).size===3;if(r==='Faervani')return Boolean(s(c.instinct));if(r==='Kyravari')return Boolean(s(c.crest));if(r==='Rifthari')return Boolean(s(c.manifestation));if(r==='Demon')return Boolean(s(c.origin))&&Boolean(s(c.vice));return true;}
export function racialDefinition(race,data){return data?.races?.[s(race)]||null;}
export function raceRequiresConfiguration(race,data){return Boolean(racialDefinition(race,data))||CONFIGURABLE_RACES.includes(s(race));}
export function validateRacialConfiguration(race,config,data){
 const def=racialDefinition(race,data);if(!def)return{ok:true,errors:[],value:null};const errors=[];const raw=config&&typeof config==='object'?config:{};
 if(def.type==='single'){
  const val=s(raw[def.key]),opts=optionsMap(def.options);if(!opts.has(val))errors.push(`Choose a ${def.label}.`);
  return{ok:!errors.length,errors,value:errors.length?null:{[def.key]:val}};
 }
 if(def.type==='paired'){
  const value={};for(const group of def.groups||[]){const val=s(raw[group.key]),opts=optionsMap(group.options);if(!opts.has(val))errors.push(`Choose a ${group.label}.`);value[group.key]=val;}
  return{ok:!errors.length,errors,value:errors.length?null:value};
 }
 if(def.type==='core-triad'){
  const opts=optionsMap(def.coreOptions),main=s(raw.mainCore),aux=Array.isArray(raw.auxiliaryCores)?raw.auxiliaryCores.map(s):[s(raw.auxiliaryCore1),s(raw.auxiliaryCore2)];
  const chosen=[main,...aux];if(!opts.has(main))errors.push('Choose a Main Core.');if(aux.length!==2||aux.some(x=>!opts.has(x)))errors.push('Choose exactly two Auxiliary Cores.');if(chosen.filter(Boolean).length===3&&new Set(chosen).size!==3)errors.push('Main and Auxiliary Core types must all be different.');
  const coreElements={};for(const id of chosen){const opt=opts.get(id);if(opt?.requiresDamageType){const type=s(raw.coreElements?.[id]||raw[`${id}DamageType`]);if(!(data?.damageTypeOptions||[]).includes(type))errors.push(`Choose a damage type for ${opt.label}.`);else coreElements[id]=type;}}
  return{ok:!errors.length,errors,value:errors.length?null:{mainCore:main,auxiliaryCores:aux,coreElements}};
 }
 return{ok:false,errors:['Unsupported racial configuration type.'],value:null};
}
export function readRacialConfigurationFromForm(fd,race,data,prefix='racial'){
 const def=racialDefinition(race,data);if(!def)return null;
 if(def.type==='single')return{[def.key]:s(fd.get(`${prefix}_${def.key}`))};
 if(def.type==='paired')return Object.fromEntries((def.groups||[]).map(g=>[g.key,s(fd.get(`${prefix}_${g.key}`))]));
 if(def.type==='core-triad'){
  const coreElements={};for(const id of ['ward','prism']){const v=s(fd.get(`${prefix}_${id}_damage_type`));if(v)coreElements[id]=v;}
  return{mainCore:s(fd.get(`${prefix}_main_core`)),auxiliaryCores:[s(fd.get(`${prefix}_aux_core_1`)),s(fd.get(`${prefix}_aux_core_2`))],coreElements};
 }
 return null;
}
export function racialConfigurationSummary(race,config,data){
 const def=racialDefinition(race,data);if(!def)return'Fixed racial features';const v=validateRacialConfiguration(race,config,data);if(!v.ok)return'Configuration required';
 if(def.type==='single')return def.options.find(x=>x.id===v.value[def.key])?.label||'Configured';
 if(def.type==='paired')return(def.groups||[]).map(g=>g.options.find(x=>x.id===v.value[g.key])?.label).filter(Boolean).join(' + ');
 if(def.type==='core-triad'){const label=id=>def.coreOptions.find(x=>x.id===id)?.label||id;return`Main ${label(v.value.mainCore)} · Aux ${v.value.auxiliaryCores.map(label).join(' / ')}`;}
 return'Configured';
}
export function coreMultiplierFor(config,coreId){if(config?.mainCore===coreId)return 1.5;if((config?.auxiliaryCores||[]).includes(coreId))return .5;return 0;}
export function applyRacialConfigurationToCombatSpec(spec,race,config,data=null){
 const valid=data?validateRacialConfiguration(race,config,data):{ok:hasCompleteRacialConfiguration(race,config),value:clone(config)};if(!valid.ok)return spec;const next=clone(spec);next.racialConfiguration=clone(valid.value);next.racialModifiers=next.racialModifiers||{};next.resistances={...(next.resistances||{})};
 if(race==='Rhazekai'){
  const fallback={"furnace-lung":{id:'furnace-lung',label:'Furnace Lung',element:'Fire'},rime:{id:'rime',label:'Rime',element:'Cold'},storm:{id:'storm',label:'Storm',element:'Lightning'},venom:{id:'venom',label:'Venom',element:'Poison'},resonance:{id:'resonance',label:'Resonance',element:'Force'},"radiant-crucible":{id:'radiant-crucible',label:'Radiant Crucible',element:'Holy'}};const def=racialDefinition(race,data),organ=def?.options?.find(x=>x.id===valid.value.organ)||fallback[valid.value.organ];next.maxHp=Math.max(1,Math.round(Number(next.maxHp||1)*1.05));next.resistances.Physical=Number(next.resistances.Physical||0)+5;const radiantAwakened=organ?.id==='radiant-crucible'&&hasHolyDragonbloodedAwakening(next);if(organ?.element){const racialResistance=organ.id==='radiant-crucible'?(radiantAwakened?10:5):10;next.resistances[organ.element]=Number(next.resistances[organ.element]||0)+racialResistance;}next.racialAbilities=organ?[{id:`rhazekai:${organ.id}`,name:organ.label==='Radiant Crucible'?'Crucible Ray':organ.label==='Furnace Lung'?'Furnace Breath':organ.label==='Rime'?'Rime Exhalation':organ.label==='Storm'?'Forked Storm':organ.label==='Venom'?'Venom Jet':'Resonant Burst',racialSource:'Rhazekai',organId:organ.id,damageType:organ.element,energyCost:3,cooldown:6,summary:organ.summary,radiantAwakened}]:[];next.racialModifiers.physicalConsumableHealingPct=-10;
 }
 if(race==='Veyssryn'){
  const c=valid.value;const addMod=(k,n)=>{next.equipmentModifiers={...(next.equipmentModifiers||{}),[k]:Number(next.equipmentModifiers?.[k]||0)+n};};const addDefense=(k,n)=>{next[k]=Number(next[k]||0)+n;};
  for(const id of [c.mainCore,...c.auxiliaryCores]){const m=coreMultiplierFor(c,id);if(id==='iron'){addDefense('blockChanceBonusPct',5*m);addDefense('blockedDamageReductionBonusPct',5*m);}if(id==='quick'){next.explicitInitiativeBonus=Number(next.explicitInitiativeBonus||0)+2*m;addDefense('dodgeChanceBonusPct',3*m);}if(id==='ember'){addMod('damageCritChancePct',4*m);addMod('criticalDamagePct',8*m);}if(id==='mender'){addMod('incomingHealingPct',10*m);next.racialModifiers.campsiteRecoveryPct=Number(next.racialModifiers.campsiteRecoveryPct||0)+10*m;}if(id==='arc'){addMod('energyGainPct',8*m);next.racialModifiers.firstEnergyGainBonusPct=Number(next.racialModifiers.firstEnergyGainBonusPct||0)+12*m;}if(id==='ward'){const t=c.coreElements.ward;if(t)next.resistances[t]=Number(next.resistances[t]||0)+12*m;}if(id==='pulse'){addMod('outgoingHealingPct',8*m);addMod('shieldStrengthPct',8*m);}if(id==='anchor'){next.maxHp=Math.max(1,Math.round(Number(next.maxHp||1)*(1+.08*m)));next.resistances.Physical=Number(next.resistances.Physical||0)+6*m;}if(id==='prism'){const t=c.coreElements.prism;if(t){next.racialModifiers.damageTypeFinalPct=next.racialModifiers.damageTypeFinalPct||{};next.racialModifiers.damageTypeFinalPct[t]=Number(next.racialModifiers.damageTypeFinalPct[t]||0)+8*m;next.racialModifiers.damageTypeCritChancePct=next.racialModifiers.damageTypeCritChancePct||{};next.racialModifiers.damageTypeCritChancePct[t]=Number(next.racialModifiers.damageTypeCritChancePct[t]||0)+4*m;}}if(id==='echo')next.racialModifiers.echoPct=Number(next.racialModifiers.echoPct||0)+10*m;}
 }
 if(race==='Faervani'){
  const i=valid.value.instinct;if(i==='flight')next.dodgeChanceBonusPct=Number(next.dodgeChanceBonusPct||0)+12;if(i==='endurance')next.maxHp=Math.max(1,Math.round(Number(next.maxHp||1)*1.21));next.racialModifiers.faervaniInstinct=i;
 }
 if(race==='Kyravari'){
  next.explicitInitiativeBonus=Number(next.explicitInitiativeBonus||0)+1;next.dodgeChanceBonusPct=Number(next.dodgeChanceBonusPct||0)+2;if(valid.value.crest==='fan')next.dodgeChanceBonusPct+=12;next.racialModifiers.kyravariCrest=valid.value.crest;
 }
 if(race==='Rifthari'){
  const m=valid.value.manifestation,def=racialDefinition(race,data),opt=def?.options?.find(x=>x.id===m),t=opt?.element||({ember:'Fire',rime:'Cold',storm:'Lightning',stone:'Physical',venom:'Poison',distortion:'Force'}[m]);if(m==='stone'){next.resistances.Physical=Number(next.resistances.Physical||0)+12;next.maxHp=Math.max(1,Math.round(Number(next.maxHp||1)*1.10));}else if(t){next.resistances[t]=Number(next.resistances[t]||0)+15;next.racialModifiers.damageTypeFinalPct=next.racialModifiers.damageTypeFinalPct||{};next.racialModifiers.damageTypeFinalPct[t]=Number(next.racialModifiers.damageTypeFinalPct[t]||0)+(m==='venom'?15:12);}next.racialModifiers.rifthariManifestation=m;
 }
 if(race==='Demon'){next.racialModifiers.demonOrigin=valid.value.origin;next.racialModifiers.demonVice=valid.value.vice;}
 return next;
}
