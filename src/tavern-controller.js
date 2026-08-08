export const TAVERN_ROOMS = Object.freeze([
  { id: 'main-hall', name: 'Main Hall' },
  { id: 'mara-bar', name: "Mara's Bar" },
  { id: 'krass-library', name: "Krass's Magical Library" },
  { id: 'mantle-room', name: 'Mantle Room' },
  { id: 'training-chambers', name: 'Tutorial / Training Chambers' },
  { id: 'records-room', name: 'Trophy / Records Room' },
  { id: 'vessel-rooms', name: 'Character Creation & Vessel / Player Rooms' },
  { id: 'adventurer-quarters', name: 'Tavern Adventurer Quarters' }
]);

const ROOM_IDS = new Set(TAVERN_ROOMS.map(room => room.id));

export class TavernController {
  constructor() {
    this.slotNumber = null;
    this.roomId = 'main-hall';
  }

  enter(slotNumber, preferredRoom = 'main-hall') {
    this.slotNumber = slotNumber;
    this.roomId = ROOM_IDS.has(preferredRoom) ? preferredRoom : 'main-hall';
  }

  leave() {
    this.slotNumber = null;
    this.roomId = 'main-hall';
  }

  go(roomId) {
    if (!ROOM_IDS.has(roomId)) throw new RangeError(`Unknown Tavern room: ${roomId}`);
    this.roomId = roomId;
    return this.roomId;
  }

  currentRoom() {
    return TAVERN_ROOMS.find(room => room.id === this.roomId) || TAVERN_ROOMS[0];
  }
}
