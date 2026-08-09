import { escapeHtml } from './shared.js';
export function portraitInnerMarkup({asset,alt='',draggable=false}={}){
  if(!asset)return '';
  return `<img src="${escapeHtml(asset)}" alt="${escapeHtml(alt)}" ${draggable?'':'draggable="false"'} loading="lazy">`;
}
