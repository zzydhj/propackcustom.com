import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { CategoryAdmin } from '@/components/admin/CategoryAdmin';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminCategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
    return <Page params={params} />;
}

async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    await requireAdmin();
    const categories = await prisma.category.findMany({ orderBy: { slug: 'asc' }, include: { _count: { select: { products: true } } } });
    const rows = categories.map((c) => ({ id: c.id, slug: c.slug, name: String((c.name as any)?.en ?? c.slug), productCount: c._count.products }));
    return <View rows={rows} total={categories.length} />;
}

function View({ rows, total }: { rows: { id: string; slug: string; name: string; productCount: number }[]; total: number }) {
    const t = useTranslations('Admin');
    return (
        <div>
            <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('categories')}</h1>
            {total === 0 ? <EmptyState label={t('noCategories')} /> : <CategoryAdmin categories={rows} />}
        </div>
    );
}
