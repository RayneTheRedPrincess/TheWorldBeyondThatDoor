import { isProgressionFeatureUnlocked, PROGRESSION_FEATURES } from './progression-features.js';

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function getChronicleFamilyTree(chronicleTrees, familyName) {
  return chronicleTrees?.families?.find(family => family.name === familyName) || null;
}

export function getChronicleFamilyState(account, familyName) {
  const raw = account?.chronicle?.families?.[familyName] || {};
  return {
    rank: Math.max(0, Math.min(30, Number(raw.rank || 0))),
    progress: Math.max(0, Number(raw.progress || 0)),
    purchasedNodes: Array.isArray(raw.purchasedNodes) ? [...new Set(raw.purchasedNodes)] : []
  };
}

export function getChronicleAllocation(account, chronicleTrees, familyName) {
  const tree = getChronicleFamilyTree(chronicleTrees, familyName);
  if (!tree) return null;
  const state = getChronicleFamilyState(account, familyName);
  const nodeMap = new Map(tree.nodes.map(node => [node.id, node]));
  const purchasedNodes = state.purchasedNodes.filter(id => nodeMap.has(id));
  const spentCP = purchasedNodes.reduce((sum, id) => sum + nodeMap.get(id).cost, 0);
  const corePurchased = purchasedNodes.filter(id => nodeMap.get(id).category === 'core').length;
  const maxActive = chronicleTrees.global.maxActiveCP;
  const earnedCP = Math.min(maxActive, state.rank * chronicleTrees.global.pointsPerRank);
  return { tree, state: { ...state, purchasedNodes }, spentCP, corePurchased, earnedCP, availableCP: Math.max(0, earnedCP - spentCP) };
}

export function canPurchaseChronicleNode({ account, chronicleTrees, familyName, nodeId, activeCampaign = false }) {
  if (!isProgressionFeatureUnlocked(account, PROGRESSION_FEATURES.CHRONICLE)) return { ok: false, reason: 'The Chronicle of Paths has not opened yet.' };
  if (activeCampaign) return { ok: false, reason: 'Chronicle allocations cannot be changed during an active campaign.' };
  const allocation = getChronicleAllocation(account, chronicleTrees, familyName);
  if (!allocation) return { ok: false, reason: 'Unknown Chronicle family.' };
  const node = allocation.tree.nodes.find(item => item.id === nodeId);
  if (!node) return { ok: false, reason: 'Unknown Chronicle node.' };
  if (allocation.state.purchasedNodes.includes(nodeId)) return { ok: false, reason: 'That Chronicle node is already active.' };
  if (allocation.availableCP < node.cost) return { ok: false, reason: 'Not enough Chronicle Points.' };
  const requirements = node.requirements || {};
  if (allocation.state.rank < Number(requirements.rank || 0)) return { ok: false, reason: `Chronicle Rank ${requirements.rank} is required.` };
  if (allocation.corePurchased < Number(requirements.corePurchased || 0)) return { ok: false, reason: `${requirements.corePurchased} Core nodes are required.` };
  if (node.previous && !allocation.state.purchasedNodes.includes(node.previous)) return { ok: false, reason: 'Purchase the previous node in this discipline first.' };
  if (allocation.spentCP < Number(requirements.spentCP || 0)) return { ok: false, reason: `${requirements.spentCP} spent Chronicle Points are required.` };
  if (allocation.spentCP + node.cost > chronicleTrees.global.maxActiveCP) return { ok: false, reason: 'This would exceed the 30-Point active Chronicle limit.' };
  return { ok: true, node, allocation };
}

export function purchaseChronicleNode(args) {
  const check = canPurchaseChronicleNode(args);
  if (!check.ok) return check;
  const next = clone(args.account);
  next.chronicle = next.chronicle || { families: {}, classless: { rank: 0, progress: 0 } };
  next.chronicle.families = next.chronicle.families || {};
  const state = getChronicleFamilyState(next, args.familyName);
  next.chronicle.families[args.familyName] = { ...state, purchasedNodes: [...state.purchasedNodes, args.nodeId] };
  return { ok: true, account: next };
}

export function respecChronicleFamily({ account, chronicleTrees, familyName, activeCampaign = false }) {
  if (!isProgressionFeatureUnlocked(account, PROGRESSION_FEATURES.CHRONICLE)) return { ok: false, error: 'The Chronicle of Paths has not opened yet.' };
  if (activeCampaign) return { ok: false, error: 'Chronicle allocations cannot be changed during an active campaign.' };
  if (!getChronicleFamilyTree(chronicleTrees, familyName)) return { ok: false, error: 'Unknown Chronicle family.' };
  const next = clone(account);
  next.chronicle = next.chronicle || { families: {}, classless: { rank: 0, progress: 0 } };
  next.chronicle.families = next.chronicle.families || {};
  const state = getChronicleFamilyState(next, familyName);
  next.chronicle.families[familyName] = { ...state, purchasedNodes: [] };
  return { ok: true, account: next };
}
