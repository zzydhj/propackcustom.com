import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { ProductAdmin } from '@/components/admin/ProductAdmin';
import { ProductEditor, type ProductRow } from '@/components/admin/ProductEditor';
import { mapProductConfig, type ProductConfig } from '@/lib/config-engine';
import { localeText, localeTextOr } from '@/lib/locale-text';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Page params={params} />;
}

async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      orderBy: { slug: 'asc' }, take: 200,
      include: {
        attributeGroups: { orderBy: { sort: 'asc' }, include: { options: { orderBy: { sort: 'asc' } } } },
        dependencyRules: true,
        priceRules: true,
      },
    }),
    prisma.category.findMany({ orderBy: { slug: 'asc' } }),
  ]);

  const catOptions = categories.map((c) => ({ id: c.id, slug: c.slug, name: localeTextOr(c.name, c.slug) }));
  const editors = products.map((p) => ({
    product: {
      id: p.id,
      slug: p.slug,
      name: localeText(p.name),
      description: localeText(p.description),
      basePrice: Number(p.basePrice),
      currency: p.currency,
      categoryId: p.categoryId,
      active: p.active,
      images: p.images,
    },
    config: mapProductConfig({
      pricingMode: p.pricingMode,
      basePrice: p.basePrice,
      pricePerSqm: p.pricePerSqm,
      currency: p.currency,
      quantityTiers: p.quantityTiers,
      attributeGroups: p.attributeGroups,
      dependencyRules: p.dependencyRules,
      priceRules: p.priceRules,
    }),
  }));

  return <ProductsView simple={products.map((p) => ({ id: p.id, slug: p.slug, name: localeText(p.name), basePrice: Number(p.basePrice), currency: p.currency }))} editors={editors} catOptions={catOptions} total={products.length} />;
}

function ProductsView({ simple, editors, catOptions, total }: {
  simple: { id: string; slug: string; name: string; basePrice: number; currency: string }[];
  editors: { product: ProductRow; config: ProductConfig }[];
  catOptions: { id: string; slug: string; name: string }[];
  total: number;
}) {
  const t = useTranslations('Admin');
  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('products')}</h1>
        <ProductAdmin products={simple} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-bold text-neutral-900">{t('productEditor')}</h2>
        {total === 0 ? (
          <EmptyState label={t('products')} />
        ) : (
          <div className="space-y-3">
            {editors.map((e) => (
              <ProductEditor key={e.product.id} product={e.product} categories={catOptions} config={e.config} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
