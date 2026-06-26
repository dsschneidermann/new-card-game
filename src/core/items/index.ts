/** Items & equipment: ItemDef / EquipKind definitions, the item content registry, the Equipment
 *  component and the pure equip / unequip / starting-items operations. */
export type { EquipKind, ItemDef } from './types';
export { EQUIP_KINDS } from './types';
export type { EquippedItem, EquipmentData } from './equipment';
export { Equipment, equipItem, unequipItem, equipStartingItems } from './equipment';
export { ITEM_DEFS, STARTER_EQUIPMENT, itemDef } from './content';
