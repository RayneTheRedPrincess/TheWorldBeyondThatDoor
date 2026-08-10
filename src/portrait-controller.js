function slug(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}

const MODERN_KEYS=['portraitSystemId','portraitIdentity','portraitRace','portraitGender','portraitSubclass','portraitAsset','portraitColors','portraitMasks','portraitStyleVersion','portraitBaseId','portraitHairStyleId','portraitOutfitId','portraitSubclassAccentId','portraitLayers'];
function clearModernAppearance(appearance={}){const next={...appearance};for(const key of MODERN_KEYS)delete next[key];return next;}

// Beta 3 compatibility library for class families whose final static art is not installed yet.
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
  const next=clone(slot);next.character.appearance={...clearModernAppearance(next.character.appearance||{}),portraitId:chosen.id,portraitAsset:chosen.asset,portraitSubclass:chosen.subclass};
  return {ok:true,slot:next,portrait:chosen};
}

export function portraitIdentityId({race,gender,subclass}={}){return `${slug(race)}:${slug(gender)}:${slug(subclass)}`;}

export function staticPortraitDescriptor({race,gender,subclass}={},portraitSystem){
  const rules=portraitSystem?.vesselPortraits||{};
  if(!race||!subclass||!(rules.genders||[]).includes(String(gender)))return null;
  const id=portraitIdentityId({race,gender,subclass});
  const root=String(rules.assetRoot||'./assets/portraits/vessels-static').replace(/\/$/,'');
  const asset=`${root}/${slug(race)}/${slug(subclass)}/${slug(gender)}.png`;
  const runtimeRoot=String(rules.runtimeAssetRoot||'./assets/portraits/vessels-static-webp').replace(/\/$/,'');
  const runtimeAvifRoot=String(rules.runtimeAvifAssetRoot||'./assets/portraits/vessels-static-avif').replace(/\/$/,'');
  const thumbnailRoot=String(rules.thumbnailRuntimeAssetRoot||'./assets/portraits/vessels-static-128-webp').replace(/\/$/,'');
  const thumbnailAvifRoot=String(rules.thumbnailAvifAssetRoot||'./assets/portraits/vessels-static-128-avif').replace(/\/$/,'');
  const leaf=`${slug(race)}/${slug(subclass)}/${slug(gender)}`;
  const displayAsset=`${thumbnailRoot}/${leaf}.webp`;
  const displayAvifAsset=`${thumbnailAvifRoot}/${leaf}.avif`;
  const fullDisplayAsset=`${runtimeRoot}/${leaf}.webp`;
  const fullDisplayAvifAsset=`${runtimeAvifRoot}/${leaf}.avif`;
  return {id,race:String(race),gender:String(gender),subclass:String(subclass),label:`${race} · ${String(gender)[0].toUpperCase()+String(gender).slice(1)} · ${subclass}`,asset,displayAsset,displayAvifAsset,fullDisplayAsset,fullDisplayAvifAsset,ready:(rules.readyPortraitIds||[]).includes(id),systemId:String(rules.systemId||'static-v1')};
}

export function staticPortraitOptionsForSlot(slot,subclassCatalog,portraitSystem){
  if(!slot?.character)return [];
  const family=[...new Set((subclassCatalog?.abilities||[]).filter(a=>a.baseClass===slot.character.baseClass).map(a=>a.subclass))].sort();
  const genders=portraitSystem?.vesselPortraits?.genders||['male','female'];
  const out=[];
  for(const subclass of family)for(const gender of genders){const d=staticPortraitDescriptor({race:slot.character.race,gender,subclass},portraitSystem);if(d?.ready)out.push(d);}
  return out;
}

export function selectStaticVesselPortrait(slot,{portraitId}={},subclassCatalog,portraitSystem){
  if(!slot?.character)return {ok:false,error:'A Vessel is required.'};
  if(slot?.campaign?.active||slot?.campaign?.settlement)return {ok:false,error:'Portraits can only be changed in the Tavern between campaigns.'};
  const options=staticPortraitOptionsForSlot(slot,subclassCatalog,portraitSystem);
  const chosen=options.find(x=>x.id===portraitId);if(!chosen)return {ok:false,error:'Choose an installed portrait for this Vessel’s current race and class family.'};
  const next=clone(slot);
  next.character.appearance={...clearModernAppearance(next.character.appearance||{}),portraitSystemId:chosen.systemId,portraitIdentity:chosen.id,portraitRace:chosen.race,portraitGender:chosen.gender,portraitSubclass:chosen.subclass,portraitAsset:chosen.asset};
  delete next.character.appearance.portraitId;
  return {ok:true,slot:next,portrait:chosen};
}

export function tavernAdventurerPortraitOptions(entry){
  if(!entry)return [];
  const values=[entry.portrait,...(Array.isArray(entry.portraitAlternates)?entry.portraitAlternates:[])].filter(Boolean).map(String);
  return [...new Set(values)].map((asset,index)=>({id:index===0?'canonical':`alternate-${index}`,asset,canonical:index===0}));
}
