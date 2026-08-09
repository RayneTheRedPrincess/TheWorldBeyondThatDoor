function slug(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function isHex(value){return /^#[0-9a-f]{6}$/i.test(String(value||''));}

// Beta 3 compatibility library. Kept until every new realistic portrait identity has a finished asset set.
export function portraitOptionsForBase(baseClass,subclassCatalog){
  const subclasses=[...new Set((subclassCatalog?.abilities||[]).filter(a=>a.baseClass===baseClass).map(a=>a.subclass))].sort();
  const out=[];
  for(const subclass of subclasses)for(const presentation of ['male','female'])for(let variant=1;variant<=3;variant++){
    const key=`${slug(subclass)}:${presentation}:${variant}`;
    out.push({id:key,subclass,presentation,variant,asset:`./assets/portraits/vessels/${slug(subclass)}/${presentation}-${String(variant).padStart(2,'0')}.png`,legacy:true});
  }
  return out;
}

export function selectVesselPortrait(slot,{portraitId}={},subclassCatalog){
  if(!slot?.character)return {ok:false,error:'A Vessel is required.'};
  if(slot?.campaign?.active||slot?.campaign?.settlement)return {ok:false,error:'Portraits can only be changed in the Tavern between campaigns.'};
  const options=portraitOptionsForBase(slot.character.baseClass,subclassCatalog);
  const chosen=options.find(x=>x.id===portraitId);if(!chosen)return {ok:false,error:'Choose a portrait from this Vessel’s current base-class portrait families.'};
  const next=clone(slot);next.character.appearance={...(next.character.appearance||{}),portraitId:chosen.id,portraitAsset:chosen.asset,portraitSubclass:chosen.subclass};
  for(const key of ['portraitSystemId','portraitIdentity','portraitRace','portraitGender','portraitColors','portraitMasks'])delete next.character.appearance[key];
  return {ok:true,slot:next,portrait:chosen};
}

export function portraitIdentityId({race,gender,subclass}={}){
  return `${slug(race)}:${slug(gender)}:${slug(subclass)}`;
}

export function realisticPortraitDescriptor({race,gender,subclass}={},portraitSystem){
  const rules=portraitSystem?.vesselPortraits||{};
  if(!race||!subclass||!(rules.genders||[]).includes(String(gender)))return null;
  const raceSlug=slug(race),subclassSlug=slug(subclass),genderSlug=slug(gender),id=portraitIdentityId({race,gender,subclass});
  const assetRoot=String(rules.assetRoot||'./assets/portraits/vessels-realistic').replace(/\/$/,'');
  const maskRoot=String(rules.maskRoot||'./assets/portrait-masks/vessels-realistic').replace(/\/$/,'');
  const override=rules.identityOverrides?.[id]||{};
  const channels=(rules.channels||[]).map(channel=>({
    id:String(channel.id),label:String(channel.label||channel.id),optional:Boolean(channel.optional),default:isHex(override.defaultColors?.[channel.id])?String(override.defaultColors[channel.id]).toUpperCase():(isHex(channel.default)?String(channel.default).toUpperCase():'#808080'),
    mask:`${maskRoot}/${raceSlug}/${subclassSlug}/${genderSlug}-${slug(channel.maskSuffix||channel.id)}.png`
  }));
  return {id,race:String(race),gender:String(gender),subclass:String(subclass),label:String(override.label||`${race} · ${gender} · ${subclass}`),asset:`${assetRoot}/${raceSlug}/${subclassSlug}/${genderSlug}.png`,channels,ready:(rules.readyPortraitIds||[]).includes(id),systemId:String(rules.systemId||'realistic-v1')};
}

export function normalizePortraitColors(colors={},portraitSystem,portraitIdentity=null){
  const rules=portraitSystem?.vesselPortraits||{},channels=rules.channels||[],override=portraitIdentity?rules.identityOverrides?.[portraitIdentity]||{}:{};const out={};
  for(const channel of channels){const raw=colors?.[channel.id],fallback=override.defaultColors?.[channel.id]||channel.default||'#808080';out[channel.id]=(isHex(raw)?String(raw):String(fallback)).toUpperCase();}
  return out;
}

export function realisticPortraitCombinations({races=[],subclassCatalog=null,portraitSystem=null}={}){
  const subclasses=[...new Set((subclassCatalog?.abilities||[]).map(a=>a.subclass).filter(Boolean))].sort();
  const genders=portraitSystem?.vesselPortraits?.genders||[];const out=[];
  for(const race of races)for(const gender of genders)for(const subclass of subclasses){const d=realisticPortraitDescriptor({race,gender,subclass},portraitSystem);if(d)out.push(d);}
  return out;
}

export function configureRealisticVesselPortrait(slot,{gender,subclass,colors={}}={},subclassCatalog,portraitSystem){
  if(!slot?.character)return {ok:false,error:'A Vessel is required.'};
  if(slot?.campaign?.active||slot?.campaign?.settlement)return {ok:false,error:'Portraits can only be changed in the Tavern between campaigns.'};
  const family=new Set((subclassCatalog?.abilities||[]).filter(a=>a.baseClass===slot.character.baseClass).map(a=>a.subclass));
  if(!family.has(String(subclass||'')))return {ok:false,error:'Choose a subclass portrait from this Vessel’s current base-class family.'};
  const portrait=realisticPortraitDescriptor({race:slot.character.race,gender,subclass},portraitSystem);
  if(!portrait)return {ok:false,error:'Choose a supported portrait gender.'};
  if(!portrait.ready)return {ok:false,error:'That portrait identity is not installed yet.'};
  const next=clone(slot),normalizedColors=normalizePortraitColors(colors,portraitSystem,portrait.id);
  next.character.appearance={...(next.character.appearance||{}),portraitSystemId:portrait.systemId,portraitIdentity:portrait.id,portraitRace:portrait.race,portraitGender:portrait.gender,portraitSubclass:portrait.subclass,portraitAsset:portrait.asset,portraitColors:normalizedColors,portraitMasks:Object.fromEntries(portrait.channels.map(c=>[c.id,c.mask]))};
  delete next.character.appearance.portraitId;
  return {ok:true,slot:next,portrait:{...portrait,colors:normalizedColors}};
}

export function tavernAdventurerPortraitOptions(entry){
  if(!entry)return [];
  const values=[entry.portrait,...(Array.isArray(entry.portraitAlternates)?entry.portraitAlternates:[])].filter(Boolean).map(String);
  return [...new Set(values)].map((asset,index)=>({id:index===0?'canonical':`alternate-${index}`,asset,canonical:index===0}));
}
