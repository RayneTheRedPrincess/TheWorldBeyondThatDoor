const imageCache = new Map();
const compositeCache = new Map();
const MAX_COMPOSITES = 24;

function loadImage(src){
  if(!src) return Promise.reject(new Error('Missing portrait image source.'));
  if(imageCache.has(src)) return imageCache.get(src);
  const promise=new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Portrait asset could not load: ${src}`));img.src=src;});
  imageCache.set(src,promise);return promise;
}
function keyFor(base,masks,colors){return `${base}|${Object.entries(masks||{}).sort().map(([k,v])=>`${k}:${v}`).join(',')}|${Object.entries(colors||{}).sort().map(([k,v])=>`${k}:${v}`).join(',')}`;}
function trimCache(){while(compositeCache.size>MAX_COMPOSITES){const first=compositeCache.keys().next().value;compositeCache.delete(first);}}

async function buildComposite(base,masks,colors){
  const baseImg=await loadImage(base);
  const canvas=document.createElement('canvas');canvas.width=baseImg.naturalWidth||baseImg.width;canvas.height=baseImg.naturalHeight||baseImg.height;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(baseImg,0,0,canvas.width,canvas.height);
  const entries=Object.entries(masks||{}).filter(([id,src])=>src&&colors?.[id]);
  for(const [id,src] of entries){
    const maskImg=await loadImage(src);const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const lctx=layer.getContext('2d');
    lctx.clearRect(0,0,layer.width,layer.height);lctx.drawImage(maskImg,0,0,layer.width,layer.height);lctx.globalCompositeOperation='source-in';lctx.fillStyle=colors[id];lctx.fillRect(0,0,layer.width,layer.height);lctx.globalCompositeOperation='source-over';
    ctx.save();ctx.globalCompositeOperation='color';ctx.globalAlpha=id==='skin'?.82:id==='eyes'?1:id==='accentGlow'?.95:.9;ctx.drawImage(layer,0,0);ctx.restore();
  }
  return canvas;
}

function compositeSource(base,masks,colors,{cache=true}={}){const key=keyFor(base,masks,colors);if(cache&&compositeCache.has(key))return compositeCache.get(key);const p=buildComposite(base,masks,colors);if(cache){compositeCache.set(key,p);trimCache();}return p;}

export async function renderPortraitCompositeElement(node,{colors=null,cache=true}={}){
  if(!node)return false;const base=node.dataset.base||'';let masks={},savedColors={};
  try{masks=JSON.parse(node.dataset.masks||'{}');savedColors=JSON.parse(node.dataset.colors||'{}');}catch{return false;}
  const useColors=colors||savedColors;const canvas=node.querySelector('canvas');if(!canvas||!base)return false;
  try{const source=await compositeSource(base,masks,useColors,{cache});canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0);node.classList.add('portrait-composite-ready');return true;}catch(err){node.classList.add('portrait-composite-failed');console.warn(err);return false;}
}

export function mountPortraitComposites(root=document){for(const node of root.querySelectorAll('[data-portrait-composite]'))renderPortraitCompositeElement(node);}
export function clearPortraitCompositeCache(){compositeCache.clear();}
