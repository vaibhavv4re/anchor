import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { CategoryRepository } from '../businessos/platform/repositories/categoryRepository.js';

console.log('--- CATEGORIES IN OFFLINE STORE ---');
const catList = offlineStore.getCollection('inventory_categories') || [];
console.log(`Count in inventory_categories: ${catList.length}`);
catList.forEach(c => console.log(`  Code: ${c.categoryCode || c.category_code} | Name: ${c.categoryName || c.category_name}`));

console.log('\n--- CATEGORIES IN MASTER INVENTORY ---');
const invList = offlineStore.getCollection('inventory') || [];
const invCatCodes = new Set(invList.map(i => i.categoryCode || i.category_code || i.category).filter(Boolean));
console.log(`Unique Category Codes in Master Inventory (${invList.length} items): ${invCatCodes.size}`);
Array.from(invCatCodes).forEach(code => console.log(`  Code: ${code}`));
