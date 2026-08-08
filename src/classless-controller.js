const UNLOCKS={
  0:{base:2,subclass:0,resourceImprint:false},
  2:{base:3,subclass:0,resourceImprint:false},
  4:{base:3,subclass:0,resourceImprint:true},
  6:{base:4,subclass:0,resourceImprint:true},
  8:{base:4,subclass:1,resourceImprint:true},
  10:{base:5,subclass:1,resourceImprint:true},
  12:{base:5,subclass:2,resourceImprint:true}
};
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
export function classlessLimits(rank=0){let out=UNLOCKS[0];for(const [r,v] of Object.entries(UNLOCKS))if(Number(rank)>=Number(r))out=v;return clone(out);}
function baseList(c){return Array.isArray(c?.abilities)?c.abilities:[];}
function subList(c){return Array.isArray(c?.abilities)?c.abilities:[];}
function normalizeImprint(value){if(!value||typeof value!=='object')return null;if(value.subclass)return {subclass:String(value.subclass)};if(value.baseClass)return {baseClass:String(value.baseClass)};return null;}
export function validateClasslessConfig(config,{rank=0,baseAbilities,subclassAbilities,baseClasses=[],subclasses=[]}={}){
  const limits=classlessLimits(rank);const c=config&&typeof config==='object'?config:{};
  const baseIds=[...new Set(Array.isArray(c.baseAbilityIds)?c.baseAbilityIds.map(String):[])];
  const subIds=[...new Set(Array.isArray(c.subclassAbilityIds)?c.subclassAbilityIds.map(String):[])];
  const imprint=normalizeImprint(c.resourceImprint);
  const errors=[];const knownBase=new Map(baseList(baseAbilities).map(a=>[a.id,a]));const knownSub=new Map(subList(subclassAbilities).map(a=>[a.id,a]));
  if(baseIds.length>limits.base)errors.push(`Classless Rank ${rank} allows ${limits.base} Base Ability selection(s).`);
  if(subIds.length>limits.subclass)errors.push(`Classless Rank ${rank} allows ${limits.subclass} Subclass Ability selection(s).`);
  for(const id of baseIds)if(!knownBase.has(id))errors.push(`Unknown Base Ability selection: ${id}`);
  for(const id of subIds)if(!knownSub.has(id))errors.push(`Unknown Subclass Ability selection: ${id}`);
  if(imprint&&!limits.resourceImprint)errors.push('Resource Imprint unlocks at Classless Chronicle Rank 4.');
  if(imprint?.baseClass&&baseClasses.length&&!baseClasses.includes(imprint.baseClass))errors.push(`Unknown Resource Imprint base class: ${imprint.baseClass}`);
  if(imprint?.subclass&&subclasses.length&&!subclasses.includes(imprint.subclass))errors.push(`Unknown Resource Imprint subclass: ${imprint.subclass}`);
  return {ok:errors.length===0,errors,value:{baseAbilityIds:baseIds.slice(0,limits.base),subclassAbilityIds:subIds.slice(0,limits.subclass),resourceImprint:limits.resourceImprint?imprint:null}};
}
export function updateClasslessConfig(slot,patch,options={}){if(!slot?.character)return {ok:false,error:'A bound Vessel is required.'};if(slot.campaign?.active||slot.campaign?.settlement)return {ok:false,error:'Classless selections can only change between campaigns.'};const proposed={...(slot.classlessConfig||{}),...(patch||{})};const valid=validateClasslessConfig(proposed,options);if(!valid.ok)return {ok:false,error:valid.errors[0],errors:valid.errors};const next=clone(slot);next.classlessConfig=valid.value;return {ok:true,slot:next,config:clone(valid.value)};}
export function classlessConfigSummary(slot,options={}){const valid=validateClasslessConfig(slot?.classlessConfig||{},options);return {...valid,limits:classlessLimits(options.rank||0)};}
