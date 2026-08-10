function collectionFor(manifest,type){
  if(type==='trainer')return manifest?.trainers||[];
  if(type==='enemy')return manifest?.enemies||[];
  return manifest?.events||[];
}

function findEntry(manifest,type,id){
  if(!id)return null;
  return collectionFor(manifest,type).find(entry=>entry?.id===id)||null;
}

export function routeArtKeyForCard(card){
  if(card?.trainer)return 'trainer';
  if(card?.combat)return 'combat';
  return ['landmark','helpful-person','discovery'].includes(card?.kind)?card.kind:'event';
}

export function fallbackRouteArtForCard(card){
  return `./assets/route-art/${routeArtKeyForCard(card)}.svg`;
}

export function eventCardPortraitEntry(card,manifest){
  const type=card?.trainer?'trainer':'event';
  const id=card?.trainer?card?.trainerId:card?.eventId;
  return findEntry(manifest,type,id);
}

export function eventCardPortraitDescriptor(card,manifest){
  const entry=eventCardPortraitEntry(card,manifest);
  const fallback=entry?.fallbackAsset||fallbackRouteArtForCard(card);
  if(entry?.ready&&entry?.targetCanonicalAsset&&entry?.avifAsset&&entry?.webpAsset){
    return {
      ready:true,
      type:card?.trainer?'trainer':'event',
      id:entry.id,
      canonicalAsset:entry.targetCanonicalAsset,
      avifAsset:entry.avifAsset,
      webpAsset:entry.webpAsset,
      fallbackAsset:fallback,
      width:400,
      height:224,
      plannedPhase:Number(entry.plannedPhase||0)||null
    };
  }
  return {
    ready:false,
    type:card?.trainer?'trainer':'event',
    id:entry?.id||(card?.trainer?card?.trainerId:card?.eventId)||null,
    canonicalAsset:entry?.targetCanonicalAsset||null,
    avifAsset:entry?.avifAsset||null,
    webpAsset:entry?.webpAsset||null,
    fallbackAsset:fallback,
    width:200,
    height:112,
    plannedPhase:Number(entry?.plannedPhase||0)||null
  };
}

export function enemyPortraitInventoryEntry(enemyId,manifest){
  return findEntry(manifest,'enemy',enemyId);
}
