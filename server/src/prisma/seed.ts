import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始填充演示数据...');

  // 清理旧数据
  await prisma.transaction.deleteMany();
  await prisma.monthlyMatch.deleteMany();
  await prisma.monthlyListing.deleteMany();
  await prisma.monthlyTrade.deleteMany();
  await prisma.annualClearingResult.deleteMany();
  await prisma.annualBid.deleteMany();
  await prisma.annualTrade.deleteMany();
  await prisma.generatorUnit.deleteMany();
  await prisma.generatorProfile.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.user.deleteMany();

  // 注册电力交易所
  const exchange = await prisma.user.create({
    data: { username: 'exchange', role: 'EXCHANGE' },
  });
  console.log(`交易所: ${exchange.username}`);

  // 注册发电公司 1
  const gen1 = await prisma.user.create({
    data: {
      username: 'gen_hydro_wind',
      role: 'GENERATOR',
      generatorProfile: {
        create: {
          companyName: '绿色能源发电公司',
          units: {
            create: [
              { type: '水电', capacityMW: 500, marginalCost: 280 },
              { type: '风电', capacityMW: 200, marginalCost: 350 },
            ],
          },
        },
      },
    },
  });
  console.log(`发电公司: ${gen1.username} (总容量 700MW)`);

  // 注册发电公司 2
  const gen2 = await prisma.user.create({
    data: {
      username: 'gen_thermal',
      role: 'GENERATOR',
      generatorProfile: {
        create: {
          companyName: '火电能源公司',
          units: {
            create: [
              { type: '火电', capacityMW: 600, marginalCost: 380 },
              { type: '光伏', capacityMW: 100, marginalCost: 420 },
            ],
          },
        },
      },
    },
  });
  console.log(`发电公司: ${gen2.username} (总容量 700MW)`);

  // 注册售电公司 1
  const seller1 = await prisma.user.create({
    data: {
      username: 'seller_indust',
      role: 'SELLER',
      sellerProfile: {
        create: { companyName: '工业售电公司', loadMW: 800 },
      },
    },
  });
  console.log(`售电公司: ${seller1.username} (负荷 800MW)`);

  // 注册售电公司 2
  const seller2 = await prisma.user.create({
    data: {
      username: 'seller_comm',
      role: 'SELLER',
      sellerProfile: {
        create: { companyName: '商业售电公司', loadMW: 600 },
      },
    },
  });
  console.log(`售电公司: ${seller2.username} (负荷 600MW)`);

  console.log('\n演示数据填充完成！');
  console.log('可用账号: exchange, gen_hydro_wind, gen_thermal, seller_indust, seller_comm');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
