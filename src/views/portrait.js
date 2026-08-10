import { escapeHtml } from './shared.js';

const STATIC_MASTER_SEGMENT='/assets/portraits/vessels-static/';
const DELIVERY={
  chooser:{width:128,height:192,avifSegment:'/assets/portraits/vessels-static-128-avif/',webpSegment:'/assets/portraits/vessels-static-128-webp/'},
  full:{width:256,height:384,avifSegment:'/assets/portraits/vessels-static-avif/',webpSegment:'/assets/portraits/vessels-static-webp/'}
};
const CONTENT_DELIVERY=[
  {kind:'enemy',masterSegment:'/assets/portraits/enemies-static/',avifSegment:'/assets/portraits/enemies-static-avif/',webpSegment:'/assets/portraits/enemies-static-webp/',width:256,height:384},
  {kind:'event',masterSegment:'/assets/portraits/events-static/',avifSegment:'/assets/portraits/events-static-400-avif/',webpSegment:'/assets/portraits/events-static-400-webp/',width:400,height:224},
  {kind:'trainer',masterSegment:'/assets/portraits/trainers-static/',avifSegment:'/assets/portraits/trainers-static-400-avif/',webpSegment:'/assets/portraits/trainers-static-400-webp/',width:400,height:224},
  {kind:'adventurer',masterSegment:'/assets/portraits/adventurers-static/',avifSegment:'/assets/portraits/adventurers-static-avif/',webpSegment:'/assets/portraits/adventurers-static-webp/',width:256,height:384}
];

function deliverySize(size='full'){return size==='chooser'||size===128||size==='128'?'chooser':'full';}
export function isStaticVesselPortrait(asset=''){const value=String(asset||'');return value.includes(STATIC_MASTER_SEGMENT)&&/\.png(?:[?#].*)?$/i.test(value);}
export function isStaticContentPortrait(asset=''){const value=String(asset||'');return CONTENT_DELIVERY.some(spec=>value.includes(spec.masterSegment))&&/\.png(?:[?#].*)?$/i.test(value);}
function contentDeliverySpec(asset=''){const value=String(asset||'');return CONTENT_DELIVERY.find(spec=>value.includes(spec.masterSegment))||null;}

export function portraitDeliveryAssets(asset='',{size='full'}={}){
  const value=String(asset||'');
  const key=deliverySize(size);const spec=DELIVERY[key];
  if(isStaticVesselPortrait(value)){
    const clean=value.replace(/\.png(?=[?#]|$)/i,'');
    return {
      canonical:value,
      avif:clean.replace(STATIC_MASTER_SEGMENT,spec.avifSegment)+'.avif',
      webp:clean.replace(STATIC_MASTER_SEGMENT,spec.webpSegment)+'.webp',
      width:spec.width,height:spec.height,size:key,isStaticVessel:true,isStaticContent:false,contentKind:null
    };
  }
  const contentSpec=contentDeliverySpec(value);
  if(contentSpec){
    const clean=value.replace(/\.png(?=[?#]|$)/i,'');
    return {canonical:value,avif:clean.replace(contentSpec.masterSegment,contentSpec.avifSegment)+'.avif',webp:clean.replace(contentSpec.masterSegment,contentSpec.webpSegment)+'.webp',width:contentSpec.width,height:contentSpec.height,size:'content',isStaticVessel:false,isStaticContent:true,contentKind:contentSpec.kind};
  }
  return {canonical:value,avif:value,webp:value,width:null,height:null,size:key,isStaticVessel:false,isStaticContent:false,contentKind:null};
}

// Compatibility helper retained for existing callers/tests. Its default remains
// the 256x384 WebP fallback while AVIF preference is expressed by <picture>.
export function portraitDisplayAsset(asset='',size='full'){
  return portraitDeliveryAssets(asset,{size}).webp;
}

export function portraitAvifAsset(asset='',size='full'){
  return portraitDeliveryAssets(asset,{size}).avif;
}

export function portraitInnerMarkup({asset,alt='',draggable=false,size='full',loading='lazy',fetchPriority=''}={}){
  if(!asset)return '';
  const resolved=portraitDeliveryAssets(asset,{size});
  const dragAttr=draggable?'':' draggable="false"';
  const loadingAttr=loading?` loading="${escapeHtml(loading)}"`:'';
  const fetchAttr=fetchPriority?` fetchpriority="${escapeHtml(fetchPriority)}"`:'';
  if(!resolved.isStaticVessel&&!resolved.isStaticContent){
    return `<img src="${escapeHtml(resolved.webp)}" alt="${escapeHtml(alt)}"${dragAttr}${loadingAttr} decoding="async"${fetchAttr}>`;
  }
  const pictureClass=resolved.isStaticVessel?'vessel-portrait-picture':'content-portrait-picture';
  return `<picture class="${pictureClass}" data-portrait-size="${resolved.size}"${resolved.contentKind?` data-content-kind="${resolved.contentKind}"`:''}><source type="image/avif" srcset="${escapeHtml(resolved.avif)}"><img src="${escapeHtml(resolved.webp)}" alt="${escapeHtml(alt)}" width="${resolved.width}" height="${resolved.height}"${dragAttr}${loadingAttr} decoding="async"${fetchAttr}></picture>`;
}
