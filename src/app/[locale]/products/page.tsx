import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { localeText, localeTextOr } from '@/lib/locale-text';
import DesignPendingHint from '@/components/product/DesignPendingHint';

export default function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
    return <List params={params} />;
}

async function List({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const products = await prisma.product.findMany({
        where: { active: true },
        orderBy: { slug: 'asc' },
        include: { category: true },
    });
    const rows = products.map((p) => ({
        slug: p.slug,
        name: localeTextOr(p.name, p.slug),
        category: localeText(p.category.name),
        currency: p.currency,
        basePrice: Number(p.basePrice),
        pricingMode: p.pricingMode as string,
        images: p.images,
    }));

    return (
        <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
            <h1 className="mb-2 text-3xl font-black text-neutral-900">Products</h1>
            <p className="mb-8 text-neutral-500">Configure size, material and finishes — get an instant factory-direct price.</p>
            <DesignPendingHint />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((p) => (
                    <Link key={p.slug} href={`/products/${p.slug}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-lg">
                        <div className="grid h-40 place-items-center bg-neutral-100 text-neutral-300">
                            {/* 产品图在 R2 公网域名上，未配 next/image 的 remotePatterns 前先直链（与 SiteNav 缩略图同策略） */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {p.images[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-4xl">📦</span>}
                        </div>
                        <div className="p-5">
                            {p.category && <p className="text-xs uppercase tracking-wide text-neutral-400">{p.category}</p>}
                            <p className="mt-1 font-bold text-neutral-900 group-hover:underline">{p.name}</p>
                            <p className="mt-2 text-sm text-neutral-500">
                                {p.pricingMode === 'AREA' ? 'Priced by size' : `From ${p.currency} ${p.basePrice.toFixed(2)}`}
                            </p>
                        </div>
                    </Link>
                ))}
                {rows.length === 0 && <p className="text-neutral-500">No products yet. Ask an admin to add some.</p>}
            </div>
        </main>
    );
}
