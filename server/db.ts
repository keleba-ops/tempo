import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { initSchema } from './schema.js';

const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'tempo.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
initSchema(db);
export { dbPath };
