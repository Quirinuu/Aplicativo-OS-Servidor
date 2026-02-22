const Database = require('better-sqlite3');
const db = new Database('./osmanager.db');
const r = db.prepare("DELETE FROM orders WHERE optionalDescription LIKE '%[shoficina:%'").run();
console.log('Deletadas:', r.changes);
db.close();