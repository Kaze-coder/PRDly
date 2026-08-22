const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const tables = await p.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
    console.log('TABLES IN DB:');
    tables.forEach((t) => console.log('  - ' + t.table_name));
    const u = await p.user.count();
    console.log('\nusers count:', u);
    console.log('\nOK: database reachable & schema synced');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await p.$disconnect();
  }
})();
