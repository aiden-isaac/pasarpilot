import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../../../src/trading/db.js';
import { migrate } from '../../../src/trading/migrate.js';
import { seed } from '../../../src/trading/setup.js';
export const id = () => randomUUID();
export async function accounts() {
 const admin=pool('fixture'); await migrate(admin);
 if(!(await admin.query('SELECT 1 FROM trading.sellers')).rowCount) await seed(admin,[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')]);
 const rows=(await admin.query('SELECT * FROM trading.sources ORDER BY tenant')).rows;
 await admin.end(); return rows;
}
