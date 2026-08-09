import { escapeHtml } from './shared.js';
export function portraitInnerMarkup({asset,masks=null,colors=null,alt='',draggable=false}={}){
  if(!asset)return '';
  if(!masks||!colors||!Object.keys(masks).length)return `<img src="${escapeHtml(asset)}" alt="${escapeHtml(alt)}" ${draggable?'':'draggable="false"'}>`;
  return `<span class="portrait-composite" data-portrait-composite data-base="${escapeHtml(asset)}" data-masks="${escapeHtml(JSON.stringify(masks))}" data-colors="${escapeHtml(JSON.stringify(colors))}"><img class="portrait-base-fallback" src="${escapeHtml(asset)}" alt="${escapeHtml(alt)}" ${draggable?'':'draggable="false"'}><canvas aria-hidden="true"></canvas></span>`;
}
