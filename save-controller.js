const ACCOUNT_KEY = "TWBTD_V2_ACCOUNT";
const SLOT_PREFIX = "TWBTD_V2_SLOT_";
const SLOT_COUNT = 9;
const SCHEMA_VERSION = 1;

function slotKey(slotNumber) {
  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > SLOT_COUNT) {
    throw new RangeError(`Slot number must be between 1 and ${SLOT_COUNT}.`);
  }

  return `${SLOT_PREFIX}${slotNumber}`;
}

function readJson(key) {
  const raw = localStorage.getItem(key);

  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[TWBTD] Could not read save key: ${key}`, error);
    return null;
  }
}

function writeJson(key, value) {
  const payload = JSON.stringify(value);
  localStorage.setItem(key, payload);
  return value;
}

function stamp(value) {
  return {
    ...value,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

function createAccountRecord() {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

export const saveController = Object.freeze({
  accountKey: ACCOUNT_KEY,
  slotCount: SLOT_COUNT,

  ensureAccount() {
    const existing = readJson(ACCOUNT_KEY);

    if (existing !== null) {
      return existing;
    }

    return writeJson(ACCOUNT_KEY, createAccountRecord());
  },

  loadAccount() {
    return readJson(ACCOUNT_KEY);
  },

  saveAccount(account) {
    return writeJson(ACCOUNT_KEY, stamp(account));
  },

  loadSlot(slotNumber) {
    return readJson(slotKey(slotNumber));
  },

  saveSlot(slotNumber, slotState) {
    return writeJson(slotKey(slotNumber), stamp(slotState));
  },

  deleteSlot(slotNumber) {
    localStorage.removeItem(slotKey(slotNumber));
  },

  getSlotKey(slotNumber) {
    return slotKey(slotNumber);
  },
});
