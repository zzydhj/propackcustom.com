import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { mapProductConfig, type CfgGroup } from '@/lib/config-engine';
import { ProductConfigurator } from '@/components/quote/ProductConfigurator';
import { ProductToc, type TocItem } from '@/components/product/ProductToc';

const en = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return String(o.en ?? Object.values(o)[0] ?? '');
    }
    return '';
};

function groupValue(g: CfgGroup): string {
    if (g.selectType === 'dimension') return `Width × Height (${g.unit || 'mm'})${g.min != null ? ` · ${g.min}–${g.max ?? '∞'}` : ''}`;
    if (g.selectType === 'single' || g.selectType === 'multi') return g.options.map((o) => o.name).join(', ') || '—';
    if (g.selectType === 'number') return `Numeric${g.min != null ? ` (${g.min}–${g.max ?? '∞'})` : ''}`;
    if (g.selectType === 'file') return 'File upload';
    return 'Custom text';
}

const TOC: TocItem[] = [
    { id: 'configuration', label: 'Configuration' },
    { id: 'pricing', label: 'Quantity & Pricing' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'upload', label: 'Upload Artwork' },
    { id: 'place-order', label: 'Place Order' },
    { id: 'specifications', label: 'Specifications' },
    { id: 'faq', label: 'FAQ' },
];

const NOTES = [
    'Upload print-ready artwork (PDF/AI/PSD/PNG/JPG/CDR). We review every file before production.',
    'Bleed 3mm and convert fonts to outlines for best results.',
    'Standard lead time is 5–9 business days after artwork approval.',
    'Volume discounts apply automatically at higher quantities.',
];

const FAQ = [
    { q: 'How is my price calculated?', a: 'Your price is based on the selected material, size and finishing options, multiplied by quantity — with automatic volume discounts at higher tiers.' },
    { q: 'Can I order a sample first?', a: 'Yes. Choose a small quantity, or contact us about a sample kit before committing to a full run.' },
    { q: 'What file format should I upload?', a: 'Print-ready PDF is preferred. AI, PSD, PNG, JPG and CDR are also accepted. Include 3mm bleed and outline your fonts.' },
    { q: 'Do you ship internationally?', a: 'We ship worldwide via DHL, FedEx and UPS. Add your address at checkout to see available options.' },
];

export default function ProductDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
    return <Detail params={params} />;
}

async function Detail({ params }: { params: Promise<{ locale: string; slug: string }> }) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    const product = await prisma.product.findUnique({
        where: { slug },
        include: {
            category: true,
            attributeGroups: { orderBy: { sort: 'asc' }, include: { options: { orderBy: { sort: 'asc' } } } },
            dependencyRules: true,
        },
    });
    if (!product || !product.active) notFound();
    const session = await auth();
    const isLoggedIn = Boolean(session?.user);

    const related = await prisma.product.findMany({
        where: { active: true, id: { not: product.id } },
        take: 4,
        select: { slug: true, name: true, images: true, basePrice: true, currency: true },
    });

    const config = mapProductConfig({
        pricingMode: product.pricingMode,
        basePrice: product.basePrice,
        pricePerSqm: product.pricePerSqm,
        currency: product.currency,
        quantityTiers: product.quantityTiers,
        attributeGroups: product.attributeGroups,
        dependencyRules: product.dependencyRules,
    });

    const name = en(product.name) || product.slug;
    const categoryName = en(product.category.name);
    const description = en(product.description);
    const moq = config.quantityTiers.length ? Math.min(...config.quantityTiers.map((t) => t.min)) : 1;

    return (
        <main className="mx-auto max-w-[1440px] px-5 py-8 2xl:px-12">

            {/* Breadcrumb */}
            <nav className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
                <Link href="/" className="hover:text-neutral-900">Home</Link>
                <span className="text-neutral-300">/</span>
                <Link href="/products" className="hover:text-neutral-900">Products</Link>
                {categoryName && (<><span className="text-neutral-300">/</span><Link href="/products" className="hover:text-neutral-900">{categoryName}</Link></>)}
                <span className="text-neutral-300">/</span>
                <span className="font-medium text-neutral-900">{name}</span>
            </nav>

            {/* Banner */}
            <div className="mt-4 rounded-2xl bg-gradient-to-b from-[#fff7bd] to-transparent px-6 py-6">
                {categoryName && <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{categoryName}</p>}
                <h1 className="mt-1 text-3xl font-black text-neutral-900 sm:text-4xl">{name}</h1>
            </div>

            {/* Body: center (config) + right rail (notes / recommended) */}
            <div className="relative mt-8">
                <ProductToc items={TOC} />
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                    {/* Center */}
                    <div className="min-w-0 space-y-8">
                        <ProductConfigurator
                            product={{ id: product.id, slug: product.slug, name, description }}
                            config={config}
                            isLoggedIn={isLoggedIn}
                            loginHref="/login"
                        />

                        {/* Specifications */}
                        <section id="specifications" className="scroll-mt-28 rounded-2xl border border-neutral-200 bg-white p-6">
                            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-900"><span className="h-4 w-1.5 rounded bg-[#ffec5a]" />Specifications</h2>
                            <div className="overflow-hidden rounded-xl border border-neutral-200">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-neutral-100">
                                        {config.groups.map((g) => (
                                            <tr key={g.id}>
                                                <td className="w-40 bg-neutral-50 px-4 py-3 font-medium text-neutral-500">{g.name}</td>
                                                <td className="px-4 py-3 text-neutral-800">{groupValue(g)}</td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <td className="bg-neutral-50 px-4 py-3 font-medium text-neutral-500">Pricing model</td>
                                            <td className="px-4 py-3 text-neutral-800">{config.pricingMode === 'AREA' ? `Price per m² · ${config.currency} ${config.pricePerSqm ?? 0}` : `Base price (before volume discounts) · ${config.currency} ${config.basePrice}`}</td>
                                        </tr>
                                        <tr>
                                            <td className="bg-neutral-50 px-4 py-3 font-medium text-neutral-500">Minimum order</td>
                                            <td className="px-4 py-3 text-neutral-800">{moq.toLocaleString()} units</td>
                                        </tr>
                                        {config.quantityTiers.length > 0 && (
                                            <tr>
                                                <td className="bg-neutral-50 px-4 py-3 font-medium text-neutral-500">Volume tiers</td>
                                                <td className="px-4 py-3 text-neutral-800">{config.quantityTiers.map((t) => `${t.min.toLocaleString()}+ −${t.discountPct}%`).join('  ·  ')}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* FAQ */}
                        <section id="faq" className="scroll-mt-28 rounded-2xl border border-neutral-200 bg-white p-6">
                            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-900"><span className="h-4 w-1.5 rounded bg-[#ffec5a]" />FAQ</h2>
                            <div className="divide-y divide-neutral-100">
                                {FAQ.map((f) => (
                                    <div key={f.q} className="py-4 first:pt-0 last:pb-0">
                                        <p className="font-semibold text-neutral-900">{f.q}</p>
                                        <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{f.a}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Right rail */}
                    <aside>
                        <div className="space-y-6 lg:sticky lg:top-28">
                            {/* Ordering notes */}
                            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                                <h3 className="mb-3 text-center text-base font-bold text-neutral-900">Ordering Notes</h3>
                                <ul className="space-y-3 text-sm text-neutral-600">
                                    {NOTES.map((n, i) => (
                                        <li key={i} className="flex gap-2"><span className="mt-0.5 text-neutral-300">{i + 1}.</span>{n}</li>
                                    ))}
                                </ul>
                            </div>

                            {/* Need a hand */}
                            <div className="rounded-2xl bg-neutral-900 p-5 text-white">
                                <p className="text-sm font-semibold">Need a hand?</p>
                                <p className="mt-1 text-sm text-neutral-300">Talk to a packaging specialist about materials, sizes and artwork.</p>
                                <Link href="/quote" className="mt-4 block rounded-lg bg-[#ffec5a] py-2.5 text-center text-sm font-bold text-neutral-900 transition hover:brightness-95">Get a Quote</Link>
                            </div>

                            {/* Recommended */}
                            {related.length > 0 && (
                                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                                    <h3 className="mb-3 text-base font-bold text-neutral-900">Recommended</h3>
                                    <ul className="space-y-3">
                                        {related.map((r) => (
                                            <li key={r.slug}>
                                                <Link href={`/products/${r.slug}`} className="group flex items-center gap-3">
                                                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 font-display text-lg font-black text-neutral-300">
                                                        {r.images?.[0] ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={r.images[0]} alt="" className="h-full w-full object-cover" />
                                                        ) : (
                                                            en(r.name).slice(0, 1)
                                                        )}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-semibold text-neutral-800 group-hover:text-neutral-900">{en(r.name)}</span>
                                                        <span className="block text-xs text-neutral-400">from {r.currency} {Number(r.basePrice).toFixed(2)}</span>
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
