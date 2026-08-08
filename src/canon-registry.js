function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Canon validation failed: ${message}`);
}

export class CanonRegistry {
  constructor({ authority, keptImpressions, keptImpressionRuntime, accountBootstrap, chronicleTrees, regions, combatRules, baseAbilities, subclassAbilities, baseResources, forestEnemies, forestEvents, forestTrainers, characterProgression, tavernAdventurers, equipmentConsumablesStatus, forestCrafting, tavernServices, tutorialsHelp }) {
    this.authority = deepFreeze(authority);
    this.keptImpressions = deepFreeze(keptImpressions);
    this.keptImpressionRuntime = deepFreeze(keptImpressionRuntime);
    this.accountBootstrap = deepFreeze(accountBootstrap);
    this.chronicleTrees = deepFreeze(chronicleTrees);
    this.regions = deepFreeze(regions);
    this.combatRules = deepFreeze(combatRules);
    this.baseAbilities = deepFreeze(baseAbilities);
    this.subclassAbilities = deepFreeze(subclassAbilities);
    this.baseResources = deepFreeze(baseResources);
    this.forestEnemies = deepFreeze(forestEnemies);
    this.forestEvents = deepFreeze(forestEvents);
    this.forestTrainers = deepFreeze(forestTrainers);
    this.characterProgression = deepFreeze(characterProgression);
    this.tavernAdventurers = deepFreeze(tavernAdventurers);
    this.equipmentConsumablesStatus = deepFreeze(equipmentConsumablesStatus);
    this.forestCrafting = deepFreeze(forestCrafting);
    this.tavernServices = deepFreeze(tavernServices);
    this.tutorialsHelp = deepFreeze(tutorialsHelp);
    this.baseAbilityIndex = new Map((baseAbilities?.abilities || []).map(entry => [entry.id, entry]));
    this.subclassAbilityIndex = new Map((subclassAbilities?.abilities || []).map(entry => [entry.id, entry]));
    this.keptIndex = new Map((keptImpressions.entries || []).map(entry => [entry.id, entry]));
    this.validate();
  }

  static async load() {
    const [authorityResponse, keptResponse, keptRuntimeResponse, bootstrapResponse, chronicleResponse, regionsResponse, combatRulesResponse, baseAbilitiesResponse, subclassAbilitiesResponse, baseResourcesResponse, forestEnemiesResponse, forestEventsResponse, forestTrainersResponse, characterProgressionResponse, tavernAdventurersResponse, equipmentResponse, forestCraftingResponse, tavernServicesResponse, tutorialsHelpResponse] = await Promise.all([
      fetch('./data/canon-authority.json', { cache: 'no-cache' }),
      fetch('./data/kept-impressions.json', { cache: 'no-cache' }),
      fetch('./data/kept-impression-runtime.json', { cache: 'no-cache' }),
      fetch('./data/account-bootstrap.json', { cache: 'no-cache' }),
      fetch('./data/chronicle-trees.json', { cache: 'no-cache' }),
      fetch('./data/regions.json', { cache: 'no-cache' }),
      fetch('./data/combat-rules.json', { cache: 'no-cache' }),
      fetch('./data/base-abilities.json', { cache: 'no-cache' }),
      fetch('./data/subclass-abilities.json', { cache: 'no-cache' }),
      fetch('./data/base-class-resources.json', { cache: 'no-cache' }),
      fetch('./data/forest-enemies.json', { cache: 'no-cache' }),
      fetch('./data/forest-events.json', { cache: 'no-cache' }),
      fetch('./data/forest-trainers.json', { cache: 'no-cache' }),
      fetch('./data/character-progression.json', { cache: 'no-cache' }),
      fetch('./data/tavern-adventurers.json', { cache: 'no-cache' }),
      fetch('./data/equipment-consumables-status.json', { cache: 'no-cache' }),
      fetch('./data/forest-crafting.json', { cache: 'no-cache' }),
      fetch('./data/tavern-services.json', { cache: 'no-cache' }),
      fetch('./data/tutorials-help.json', { cache: 'no-cache' })
    ]);
    if (!authorityResponse.ok || !keptResponse.ok || !keptRuntimeResponse.ok || !bootstrapResponse.ok || !chronicleResponse.ok || !regionsResponse.ok || !combatRulesResponse.ok || !baseAbilitiesResponse.ok || !subclassAbilitiesResponse.ok || !baseResourcesResponse.ok || !forestEnemiesResponse.ok || !forestEventsResponse.ok || !forestTrainersResponse.ok || !characterProgressionResponse.ok || !tavernAdventurersResponse.ok || !equipmentResponse.ok || !forestCraftingResponse.ok || !tavernServicesResponse.ok || !tutorialsHelpResponse.ok) {
      throw new Error('Canonical data files could not be loaded.');
    }
    return new CanonRegistry({
      authority: await authorityResponse.json(),
      keptImpressions: await keptResponse.json(),
      keptImpressionRuntime: await keptRuntimeResponse.json(),
      accountBootstrap: await bootstrapResponse.json(),
      chronicleTrees: await chronicleResponse.json(),
      regions: await regionsResponse.json(),
      combatRules: await combatRulesResponse.json(),
      baseAbilities: await baseAbilitiesResponse.json(),
      subclassAbilities: await subclassAbilitiesResponse.json(),
      baseResources: await baseResourcesResponse.json(),
      forestEnemies: await forestEnemiesResponse.json(),
      forestEvents: await forestEventsResponse.json(),
      forestTrainers: await forestTrainersResponse.json(),
      characterProgression: await characterProgressionResponse.json(),
      tavernAdventurers: await tavernAdventurersResponse.json(),
      equipmentConsumablesStatus: await equipmentResponse.json(),
      forestCrafting: await forestCraftingResponse.json(),
      tavernServices: await tavernServicesResponse.json(),
      tutorialsHelp: await tutorialsHelpResponse.json()
    });
  }

  validate() {
    const families = this.authority.class_families;
    assert(Array.isArray(families) && families.length === 11, 'expected 11 base class families');
    const classEntities = families.flatMap(f => f.entities || []);
    assert(classEntities.length === 44, 'expected 44 class entities');
    const abilityCount = classEntities.reduce((sum, e) => sum + (e.abilities?.length || 0), 0);
    assert(abilityCount === 187, 'expected 187 class/subclass abilities');
    assert(this.authority.races?.count === 16, 'expected 16 races');

    const entries = this.keptImpressions.entries;
    assert(Array.isArray(entries) && entries.length === 266, 'expected 266 Kept Impressions');
    const ids = new Set(entries.map(e => e.id));
    assert(ids.size === 266, 'Kept Impression IDs must be unique');
    assert(ids.has('KI-001') && ids.has('KI-182') && ids.has('KI-266'), 'Kept Impression range must include KI-001, KI-182 and KI-266');
    assert(entries.find(e => e.id === 'KI-182')?.slots === 6, 'Classless must cost 6 Kept Impression slots');
    assert(this.keptImpressionRuntime?.entries?.length===266,'I11 runtime registry must own all 266 Kept Impressions');
    assert(new Set(this.keptImpressionRuntime.entries.map(e=>e.id)).size===266,'I11 runtime registry ids must be unique');

    const raceNames = new Set(this.authority.races.names);
    assert(Array.isArray(this.accountBootstrap.startingUnlockedRaces), 'starting unlocked races must be an array');
    for (const race of this.accountBootstrap.startingUnlockedRaces) assert(raceNames.has(race), `starter race ${race} must exist in canon`);
    assert(this.accountBootstrap.baseClassAvailability === 'all-approved-base-classes', 'base class availability policy mismatch');
    assert(this.accountBootstrap.startingProgressionFeatures?.mantle === false, 'Mantle must not start as a required/unlocked early system');
    assert(this.accountBootstrap.startingProgressionFeatures?.chronicle === false, 'Chronicle must not start as a required/unlocked early system');

    assert(this.chronicleTrees?.families?.length === 11, 'expected 11 normal Chronicle trees');
    const chronicleNodes = this.chronicleTrees.families.flatMap(f => f.nodes || []);
    assert(chronicleNodes.length === 352, 'expected 352 normal Chronicle nodes');
    for (const family of this.chronicleTrees.families) {
      assert(family.nodes.length === 32, `${family.name} must have 32 Chronicle nodes`);
      assert(family.nodes.reduce((sum, node) => sum + node.cost, 0) === 49, `${family.name} Chronicle full cost must be 49 CP`);
    }

    const forest = this.regions?.regions?.find(region => region.id === 'forest');
    assert(forest?.depthCount === 30, 'Forest must contain exactly 30 Depth');
    assert(forest?.cardsPerStep === 3, 'each expedition step must offer exactly 3 event cards');
    assert(forest?.introductoryBand?.start === 1 && forest?.introductoryBand?.end === 5, 'Forest introductory band must be Depths 1-5');
    assert(forest?.trainerEligibility?.start === 3 && forest?.trainerEligibility?.end === 29, 'trainer eligibility must be Depths 3-29');
    assert(Number(forest?.completionReward?.onyx) === 100 && Number(forest?.completionReward?.chronicleProgress) === 4, 'I16 Forest completion reward must be +100 Onyx / +4 Chronicle Progress');
    assert(forest?.nextRegion?.id === 'bog-of-lost-souls' && forest?.nextRegion?.expectedEntryLevel?.join(',') === '5,6' && Number(forest?.nextRegion?.targetEndLevel) === 12, 'I16 Forest boundary must preserve the Bog Level 5-6 -> 12 pacing target');

    assert(this.combatRules?.energy?.combatStart === 0, 'combat Energy must start at 0');
    assert(this.combatRules?.energy?.naturalStartOfTurnGain === 1, 'natural turn Energy must be exactly +1');
    assert(this.combatRules?.energy?.naturalGainUsesEnergyGainPercent === false, 'natural +1 Energy must not roll Energy Gain %');
    assert(this.combatRules?.playerTurn?.actionsPerTurn === 1, 'player turns must use exactly one action');
    assert(this.combatRules?.guard?.dodgeResolvesBeforeGuardBlock === true, 'Dodge must resolve before Guard block');
    assert(this.combatRules?.energy?.maximumEnergy === 7, 'Base Maximum Energy must be 7');
    assert(this.combatRules?.defense?.dodgeChanceCapPct === 85 && this.combatRules?.defense?.blockChanceCapPct === 85, 'Dodge and Block caps must both be 85%');
    assert(this.combatRules?.cooldowns?.newCooldownTicksOnApplicationTurn === false, 'new cooldowns must not tick on their application turn');
    assert(this.baseAbilities?.count === 55 && this.baseAbilities?.abilities?.length === 55, 'expected 55 approved base-class abilities');
    assert(new Set(this.baseAbilities.abilities.map(a => a.id)).size === 55, 'base ability ids must be unique');
    for (const ability of this.baseAbilities.abilities) assert(this.getBaseClasses().includes(ability.baseClass), `unknown base ability class ${ability.baseClass}`);
    assert(this.subclassAbilities?.count === 132 && this.subclassAbilities?.subclassCount === 33 && this.subclassAbilities?.abilities?.length === 132, 'expected 132 approved subclass abilities across 33 subclasses');
    assert(new Set(this.subclassAbilities.abilities.map(a=>a.id)).size === 132, 'subclass ability ids must be unique');
    const subclassNames=new Set(this.authority.class_families.flatMap(f=>(f.entities||[]).filter(e=>e.name!==f.base_class).map(e=>e.name)));
    assert(subclassNames.size===33,'expected 33 approved subclasses');
    for(const subclass of subclassNames){const abilities=this.subclassAbilities.abilities.filter(a=>a.subclass===subclass).sort((a,b)=>a.slot-b.slot);assert(abilities.length===4,`${subclass} must have four subclass abilities`);assert(abilities.map(a=>a.level).join(',')==='3,5,7,9',`${subclass} subclass abilities must unlock at Levels 3/5/7/9`);}
    const scaling=this.forestEnemies?.rules?.bossMinibossPartyScaling||{};
    assert(Number(scaling['1']?.maxHpMultiplier)===1&&Number(scaling['1']?.damageMultiplier)===1,'solo boss scaling mismatch');
    assert(Number(scaling['2']?.maxHpMultiplier)===1.55&&Number(scaling['2']?.damageMultiplier)===1.15,'two-person boss scaling mismatch');
    assert(Number(scaling['3']?.maxHpMultiplier)===2.10&&Number(scaling['3']?.damageMultiplier)===1.30,'three-person boss scaling mismatch');
    assert(Number(scaling['4']?.maxHpMultiplier)===2.70&&Number(scaling['4']?.damageMultiplier)===1.45,'four-person boss scaling mismatch');
    assert(Object.keys(this.baseResources?.resources || {}).length === 11, 'expected 11 base-class resource definitions');
    assert(Array.isArray(this.forestEnemies?.regularEnemies) && this.forestEnemies.regularEnemies.length === 12, 'expected 12 regular Forest enemy types');
    assert(this.forestEnemies?.miniboss?.fixedDepth === 15, 'Forest miniboss must be fixed at Depth 15');
    assert(this.forestEnemies?.boss?.fixedDepth === 30, 'Forest boss must be fixed at Depth 30');
    assert(this.forestEnemies?.rules?.enemiesUseConsumables === false, 'enemies must never use consumables');
    assert(this.forestEnemies?.rules?.enemiesCanGuard === false, 'enemies cannot Guard');
    assert(this.forestEnemies?.rules?.enemyHasBasicAttack === true && this.forestEnemies?.rules?.enemyCanCharge === true, 'enemies need Basic Attack and Charge');
    assert(this.characterProgression?.baseMaxHp === 10 && this.characterProgression?.hpPerCon === 2 && this.characterProgression?.hpPerLevelAfterFirst === 3, 'I9 HP progression constants mismatch');
    assert(this.characterProgression?.chroniclePerOnyxDivisor === 25, 'Chronicle Progress must derive from Onyx at 1/25 rate');
    assert(Array.isArray(this.tavernAdventurers?.entries) && this.tavernAdventurers.entries.length === 13, 'expected 13 preserved Tavern Adventurer profiles');
    assert(new Set(this.tavernAdventurers.entries.map(e=>e.id)).size === 13, 'Tavern Adventurer ids must be unique');

    const i14Events=this.forestEvents;
    assert(i14Events?.rules?.noDefinitionRepeatsWithinCampaign===true,'I14 Forest event definitions must never repeat within a campaign');
    assert(i14Events?.rules?.nonTrainerNoncombatUsesSingleCoreStatCheck===true,'I14 non-Trainer noncombat events must use singular core-stat checks');
    assert(Array.isArray(i14Events?.events)&&i14Events.events.length>=140,'I14 requires a large unique Forest event catalogue');
    assert(new Set(i14Events.events.map(e=>e.id)).size===i14Events.events.length,'I14 Forest event ids must be unique');
    for(const e of i14Events.events.filter(e=>e.kind!=='combat')) assert(e.check&&['STR','DEX','CON','INT','FTH','CHA','LCK'].includes(e.check.stat),'every I14 non-Trainer event must define one core-stat check');
    const i14Trainers=this.forestTrainers;
    assert(i14Trainers?.count===17&&i14Trainers?.entries?.length===17,'I14 Forest must contain exactly 17 Trainers');
    assert(Number(i14Trainers?.rules?.matchingBaseClassAnchorChancePct)===95,'I14 matching base-class Trainer anchor must be 95%');
    assert(Number(i14Trainers?.rules?.activeRosterMin)===6&&Number(i14Trainers?.rules?.activeRosterMax)===8,'I14 active Trainer roster must contain 6–8 Trainers');
    assert(new Set(i14Trainers.entries.map(t=>t.id)).size===17,'I14 Trainer ids must be unique');
    assert(i14Trainers.entries.every(t=>Array.isArray(t.soulfireItemIds)&&t.soulfireItemIds.length===3),'each I14 Trainer must own exactly three SoulFire craftables');

    const i12=this.equipmentConsumablesStatus;
    assert(i12?.rules?.armorMitigationPct?.Light===0&&i12?.rules?.armorMitigationPct?.Medium===5&&i12?.rules?.armorMitigationPct?.Heavy===10,'I12 armor mitigation must be 0/5/10');
    assert(Number(i12?.rules?.heavyChestInitiativePenalty)===-2,'Heavy Chest must impose -2 Initiative');
    assert(i12?.rules?.weaponBaseDamage===false&&i12?.rules?.dualWieldAddsAttacks===false,'weapons must not add Base Damage or extra attacks');
    assert(Number(i12?.rules?.baseConsumableEquipCapacity)===1&&Number(i12?.rules?.usesPerBattle)===1,'I12 base consumable equip/use limits must both be one');
    assert(Array.isArray(i12?.equipment)&&i12.equipment.length>=10,'I12 starter equipment catalogue is missing');
    assert(Array.isArray(i12?.consumables)&&i12.consumables.length>=6&&i12.consumables.filter(x=>x.subtype==='Food').length>=6,'I12 consumables should be predominantly fantasy Food');
    for(const id of ['Burn','Poison','Bleed']){const st=i12.statuses?.find(x=>x.id===id);assert(st?.periodic===true&&st?.canCrit===true&&st?.tickTiming==='owner-turn-start'&&st?.dodgeableTick===false&&st?.blockableTick===false,`${id} I12 periodic status rules mismatch`);}

    const i13=this.forestCrafting;
    assert(i13?.rules?.location==='Campsite'&&i13?.rules?.enemyEquipmentDrops===false,'I13 crafting must be Campsite-only with no enemy equipment drops');
    assert(Array.isArray(i13?.sets)&&i13.sets.length===14,'I13 must define 14 Forest armor sets');
    assert(i13.sets.every(s=>s.pieceIds?.length===4&&s.bonuses?.map(b=>b.pieces).join(',')==='2,3,4'&&s.definingThreshold===3),'I13 sets must be four pieces with 2/3/4 bonuses and defining 3-piece threshold');
    assert(i13?.catalogueSummary?.armorPieces===56&&i13?.catalogueSummary?.sourceWeapons===28,'I13 major Forest equipment count mismatch');
    assert(i13?.catalogueSummary?.charms===30,'I13 Forest charm catalogue must contain 30 craftable charms');
    assert(i13?.rules?.soulfireCoreDeterministic===true,'SoulfireCore drops must be deterministic');
    assert(i13?.rules?.normalMaterialDropByRealPartySize?.['1']?.join(',')==='1,3'&&i13?.rules?.normalMaterialDropByRealPartySize?.['4']?.join(',')==='4,5','I13 normal material drop ranges mismatch');
    assert(this.equipmentConsumablesStatus?.rules?.rarities?.join(',')==='Normal,SoulFire','I13 supports only Normal and SoulFire rarity');
    assert(i13?.rules?.trainerSoulfireHookStatus==='live-17-trainer-roster'&&i13?.catalogueSummary?.trainerSoulfireItems===51,'I14 Trainer SoulFire crafting authority mismatch');
    assert(this.tavernServices?.mara?.offersAtATime===3&&this.tavernServices?.mara?.activeQuestLimit===1,'I15 Mara quest offer/active limits mismatch');
    assert(this.tavernServices?.tavernAdventurerRecruitment?.freeStarterIds?.length===6,'I15 requires six free Tavern Adventurers');
    assert(this.tutorialsHelp?.mandatoryStarter?.reward?.keptImpressionTokens===2&&this.tutorialsHelp?.mandatoryStarter?.reward?.maxSlotCost===3,'I18 starter reward must be exactly two 3-slot-or-lower KI tokens');
    assert(this.tutorialsHelp?.mandatoryStarter?.skipAllowed===true,'I18 starter tutorial must grant its reward even when skipped');
    assert(this.tutorialsHelp?.tutorials?.length===8,'I18 must retain exactly eight replayable named tutorials');
    assert(this.tutorialsHelp?.helpEntries?.length>=20,'I18 Help Codex must cover the current core systems');
  }

  getBaseClasses() { return this.authority.class_families.map(f => f.base_class); }

  getBaseClassDetails() {
    return this.authority.class_families.map(family => {
      const base = family.entities.find(entity => entity.name === family.base_class);
      return { name: family.base_class, role: base?.role || '', scalingIdentity: [...(base?.scaling_identity || [])] };
    });
  }

  getRaces() { return [...this.authority.races.names]; }

  getSubclassesForBase(baseClass) {
    const family = this.authority.class_families.find(f => f.base_class === baseClass);
    if (!family) return [];
    return family.entities.filter(entity => entity.name !== baseClass).map(entity => entity.name);
  }

  getClassFamily(baseClass) {
    return this.authority.class_families.find(f => f.base_class === baseClass) || null;
  }

  getChronicleSummary() { return this.authority.chronicle; }
  getChronicleTrees() { return this.chronicleTrees; }
  getKeptImpressions() { return this.keptImpressions.entries; }
  getKeptImpression(id) { const entry = this.keptIndex.get(id); return entry ? { ...entry } : null; }
  getKeptImpressionRuntime() { return this.keptImpressionRuntime; }
  getRegions() { return this.regions; }
  getBaseAbilities() { return this.baseAbilities; }
  getBaseAbility(id) { const entry = this.baseAbilityIndex.get(id); return entry ? (typeof structuredClone === 'function' ? structuredClone(entry) : JSON.parse(JSON.stringify(entry))) : null; }
  getSubclassAbilities() { return this.subclassAbilities; }
  getSubclassAbility(id) { const entry=this.subclassAbilityIndex.get(id); return entry ? (typeof structuredClone === 'function' ? structuredClone(entry) : JSON.parse(JSON.stringify(entry))) : null; }
  getBaseResources() { return this.baseResources; }
  getForestEvents() { return this.forestEvents; }
  getForestTrainers() { return this.forestTrainers; }
  getForestEnemies() { return this.forestEnemies; }
  getCharacterProgression() { return this.characterProgression; }
  getTavernAdventurers() { return this.tavernAdventurers; }
  getForestCrafting() { return this.forestCrafting; }
  getEquipmentConsumablesStatus() { return this.equipmentConsumablesStatus; }
  getCombatRules() { return this.combatRules; }
  getTavernServices() { return this.tavernServices; }
  getTutorialsHelp() { return this.tutorialsHelp; }
  getAccountBootstrap() { return this.accountBootstrap; }
}
