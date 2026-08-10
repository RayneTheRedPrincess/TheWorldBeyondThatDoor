import { portraitDeliveryAssets } from './views/portrait.js';

function unique(values){return [...new Set(values.filter(Boolean).map(String))];}

export function upcomingCombatPortraitAssets(combat={}){
  return unique((combat.actors||[]).map(actor=>actor?.portraitAsset));
}

export function portraitPredecodeCandidates(asset=''){
  const resolved=portraitDeliveryAssets(asset,{size:'full'});
  return (resolved.isStaticVessel||resolved.isStaticContent)?[resolved.avif,resolved.webp]:[resolved.webp];
}

function decodeOne(src,{ImageCtor=globalThis.Image,timeoutMs=1600}={}){
  if(!src||typeof ImageCtor!=='function')return Promise.resolve({ok:false,src,reason:'image-api-unavailable'});
  return new Promise(resolve=>{
    let settled=false;const image=new ImageCtor();
    const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
    const timer=setTimeout(()=>finish({ok:false,src,reason:'timeout'}),Math.max(100,Number(timeoutMs)||1600));
    image.decoding='async';
    const hasDecode=typeof image.decode==='function';
    image.onload=()=>{if(!hasDecode)finish({ok:true,src});};
    image.onerror=()=>finish({ok:false,src,reason:'load-error'});
    image.src=src;
    if(hasDecode){
      Promise.resolve().then(()=>image.decode()).then(()=>finish({ok:true,src})).catch(()=>finish({ok:false,src,reason:'decode-error'}));
    }
  });
}

export async function predecodePortrait(asset,{ImageCtor=globalThis.Image,timeoutMs=1600}={}){
  const candidates=portraitPredecodeCandidates(asset);
  for(const src of candidates){
    const result=await decodeOne(src,{ImageCtor,timeoutMs});
    if(result.ok)return result;
  }
  return {ok:false,src:candidates.at(-1)||String(asset||''),reason:'all-candidates-failed'};
}

export async function predecodeUpcomingCombatPortraits(combat,{ImageCtor=globalThis.Image,timeoutMs=1600}={}){
  const assets=upcomingCombatPortraitAssets(combat);
  if(!assets.length||typeof ImageCtor!=='function')return {attempted:assets.length,decoded:0,failed:assets.length,results:[]};
  const results=await Promise.all(assets.map(asset=>predecodePortrait(asset,{ImageCtor,timeoutMs}).catch(()=>({ok:false,src:asset,reason:'unexpected-error'}))));
  return {attempted:assets.length,decoded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results};
}
