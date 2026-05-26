// Railway build 前切换数据库为 PostgreSQL
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'server', 'src', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

schema = schema.replace(
  /provider = "sqlite"/,
  'provider = "postgresql"'
);
schema = schema.replace(
  /url\s*=\s*"file:\.\/dev\.db"/,
  'url = env("DATABASE_URL")'
);
// PostgreSQL 不支持 autoincrement()，改为使用默认的 uuid
schema = schema.replace(/@default\(autoincrement\(\)\)/g, '@default(uuid())');

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('Switched to PostgreSQL for Railway deployment');
