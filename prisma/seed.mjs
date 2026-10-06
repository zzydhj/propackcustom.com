import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  let cat = await prisma.category.findFirst({ where: { slug: 'mailer-boxes' } });
  if (!cat) {
    cat = await prisma.category.create({
      data: { slug: 'mailer-boxes', name: { en: 'Mailer Boxes', zh: '快递盒' } },
    });
  }

  const existing = await prisma.product.count();
  if (existing === 0) {
    const products = [
      { slug: 'kraft-mailer-box', name: { en: 'Kraft Mailer Box' }, basePrice: 0.42, currency: 'USD' },
      { slug: 'custom-shipping-box', name: { en: 'Custom Shipping Box' }, basePrice: 0.55, currency: 'USD' },
      { slug: 'rigid-gift-box', name: { en: 'Rigid Gift Box' }, basePrice: 1.2, currency: 'USD' },
      { slug: 'sticker-sheet', name: { en: 'Die-cut Sticker Sheet' }, basePrice: 0.09, currency: 'USD' },
    ];
    for (const p of products) {
      await prisma.product.create({
        data: { ...p, description: { en: '' }, categoryId: cat.id, images: [] },
      });
    }
  }

  const quotes = await prisma.quote.count();
  if (quotes === 0) {
    await prisma.quote.create({
      data: {
        productName: 'Kraft Mailer Box',
        quantity: 2000,
        country: 'United States',
        contactName: 'Demo Buyer',
        email: 'buyer@example.com',
        notes: 'Full-color logo, matte lamination, ship to LA.',
        detail: { material: '350g kraft', size: '30x20x10cm' },
      },
    });
  }

  // ── 演示账号：超管 + 客户（开发邮箱+密码登录用）──
  async function ensureUser(email, name, role) {
    const found = await prisma.user.findUnique({ where: { email } });
    if (found) {
      return prisma.user.update({ where: { id: found.id }, data: { role, name, emailVerified: new Date() } });
    }
    return prisma.user.create({ data: { email, name, role, emailVerified: new Date() } });
  }
  const admin = await ensureUser('admin@propackcustom.com', 'Site Admin', 'ADMIN');
  const customer = await ensureUser('customer@propackcustom.com', 'Demo Customer', 'CUSTOMER');

  // 给客户一笔初始充值，便于查看余额/流水
  const txnCount = await prisma.walletTransaction.count({ where: { userId: customer.id } });
  if (txnCount === 0) {
    const amount = 500;
    await prisma.walletTransaction.create({
      data: { userId: customer.id, type: 'TOPUP', amount, balanceAfter: amount, currency: 'USD', note: '初始演示额度' },
    });
    await prisma.user.update({ where: { id: customer.id }, data: { balance: amount } });
  }

  console.log(`Seed done. Admin: ${admin.email} | Customer: ${customer.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
