import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { parsePricingProduct } from '@/lib/pricing';
import { ProductConfigurator } from '@/components/quote/ProductConfigurator';

export default function ProductDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
    return <Detail params={params} />;
}

async function Detail({ params }: { params: Promise<{ locale: string; slug: string }> }) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    const product = await prisma.product.findUnique({ where: { slug }, include: { category: true } });
    if (!product || !product.active) notFound();
    const session = await auth();
    const isLoggedIn = Boolean(session?.user);

    const pricing = parsePricingProduct({
        pricingMode: product.pricingMode,
        basePrice: Number(product.basePrice),
        pricePerSqm: product.pricePerSqm == null ? null : Number(product.pricePerSqm),
        attributes: product.attributes,
        quantityTiers: product.quantityTiers,
        currency: product.currency,
    });

    return (
        <main className="mx-auto max-w-5xl px-5 py-10 2xl:px-12">
            <Link href="/products" className="text-sm text-neutral-500 hover:text-neutral-900">← All products</Link>
            <div className="mb-8 mt-3">
                <p className="text-xs uppercase tracking-wide text-neutral-400">{String((product.category.name as any)?.en ?? '')}</p>
                <h1 className="mt-1 text-3xl font-black text-neutral-900">{String((product.name as any)?.en ?? product.slug)}</h1>
                {Boolean((product.description as any)?.en) && <p className="mt-2 max-w-2xl text-neutral-600">{String((product.description as any).en)}</p>}
            </div>
            <ProductConfigurator
                product={{
                    id: product.id,
                    slug: product.slug,
                    name: String((product.name as any)?.en ?? product.slug),
                    description: String((product.description as any)?.en ?? ''),
                    pricing,
                }}
                isLoggedIn={isLoggedIn}
                loginHref="/login"
            />
        </main>
    );
}
