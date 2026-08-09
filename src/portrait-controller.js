function slug(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}

export function portraitOptionsForBase(baseClass,subclassCatalog){
  const subclasses=[...new Set((subclassCatalog?.abilities||[]).filter(a=>a.baseClass===baseClass).map(a=>a.subclass))].sort();
  const out=[];
  for(const subclass of subclasses)for(const presentation of ['male','female'])for(let variant=1;variant<=3;variant++){
    const key=`${slug(subclass)}:${presentation}:${variant}`;
    out.push({id:key,subclass,presentation,variant,asset:`./assets/portraits/vessels/${slug(subclass)}/${presentation}-${String(variant).padStart(2,'0')}.png`});
  }
  return out;
}

export function selectVesselPortrait(slot,{portraitId}={},subclassCatalog){
  if(!slot?.character)return {ok:false,error:'A Vessel is required.'};
  if(slot?.campaign?.active||slot?.campaign?.settlement)return {ok:false,error:'Portraits can only be changed in the Tavern between campaigns.'};
  const options=portraitOptionsForBase(slot.character.baseClass,subclassCatalog);
  const chosen=options.find(x=>x.id===portraitId);if(!chosen)return {ok:false,error:'Choose a portrait from this Vessel’s current base-class portrait families.'};
  const next=clone(slot);next.character.appearance={...(next.character.appearance||{}),portraitId:chosen.id,portraitAsset:chosen.asset,portraitSubclass:chosen.subclass};
  return {ok:true,slot:next,portrait:chosen};
}
