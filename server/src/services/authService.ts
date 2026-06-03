import prisma from '../prisma/client';

export async function deleteUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('用户不存在');
  if (user.role === 'EXCHANGE') throw new Error('不能注销交易所账号');

  // 删除用户及其关联数据（Cascade 已配置）
  await prisma.user.delete({ where: { id: userId } });
}

export interface RegisterData {
  username: string;
  role: string;
  companyName?: string;
  loadMW?: number;
  units?: { type: string; capacityMW: number; marginalCost: number }[];
}

export interface UpdateProfileData {
  companyName?: string;
  loadMW?: number;
  units?: { id?: string; type: string; capacityMW: number; marginalCost: number }[];
}

export async function registerUser(data: RegisterData) {
  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) {
    throw new Error('该账号已存在');
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username: data.username, role: data.role },
    });

    if (data.role === 'GENERATOR') {
      await tx.generatorProfile.create({
        data: {
          userId: user.id,
          companyName: data.companyName || data.username,
          units: data.units && data.units.length > 0 ? {
            create: data.units,
          } : undefined,
        },
      });
    } else if (data.role === 'SELLER') {
      await tx.sellerProfile.create({
        data: {
          userId: user.id,
          companyName: data.companyName || data.username,
          loadMW: data.loadMW || 0,
        },
      });
    }

    return user;
  });
}

export async function loginUser(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      generatorProfile: { include: { units: true } },
      sellerProfile: true,
    },
  });
  if (!user) {
    throw new Error('账号不存在');
  }
  return user;
}

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      generatorProfile: { include: { units: true } },
      sellerProfile: true,
    },
  });
}

export async function updateProfile(userId: string, data: UpdateProfileData) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { generatorProfile: true, sellerProfile: true },
  });
  if (!user) throw new Error('用户不存在');

  if (user.role === 'GENERATOR' && user.generatorProfile) {
    return prisma.$transaction(async (tx) => {
      if (data.companyName) {
        await tx.generatorProfile.update({
          where: { id: user.generatorProfile!.id },
          data: { companyName: data.companyName },
        });
      }
      if (data.units) {
        // 删除不在新列表中的机组
        const newUnitIds = data.units.filter(u => u.id).map(u => u.id!);
        await tx.generatorUnit.deleteMany({
          where: {
            profileId: user.generatorProfile!.id,
            id: { notIn: newUnitIds },
          },
        });
        // 更新或创建机组
        for (const unit of data.units) {
          if (unit.id) {
            await tx.generatorUnit.update({
              where: { id: unit.id },
              data: { type: unit.type, capacityMW: unit.capacityMW, marginalCost: unit.marginalCost },
            });
          } else {
            await tx.generatorUnit.create({
              data: {
                profileId: user.generatorProfile!.id,
                type: unit.type,
                capacityMW: unit.capacityMW,
                marginalCost: unit.marginalCost,
              },
            });
          }
        }
      }
      return tx.generatorProfile.findUnique({
        where: { id: user.generatorProfile!.id },
        include: { units: true },
      });
    });
  } else if (user.role === 'SELLER' && user.sellerProfile) {
    return prisma.sellerProfile.update({
      where: { id: user.sellerProfile.id },
      data: {
        ...(data.companyName ? { companyName: data.companyName } : {}),
        ...(data.loadMW !== undefined ? { loadMW: data.loadMW } : {}),
      },
    });
  }
  throw new Error('无法修改该角色信息');
}

export async function listCompanies(role: string) {
  if (role === 'GENERATOR') {
    return prisma.generatorProfile.findMany({
      include: { units: true, user: { select: { username: true, id: true } } },
    });
  }
  if (role === 'SELLER') {
    return prisma.sellerProfile.findMany({
      include: { user: { select: { username: true, id: true } } },
    });
  }
  return [];
}
