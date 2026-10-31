import { db } from './db.js';
import { resetDatabase, seedDatabase } from './seed.js';

const reset = process.argv.includes('--reset');
if (reset) {
  resetDatabase(db);
  console.log('Cleared existing Tempo data.');
}
await seedDatabase(db);
console.log('Seeded Tempo demo data.');
console.log('Customer: tebogo@tempo.demo / demo1234');
console.log('Owner:    kagiso@tempo.demo / demo1234');
