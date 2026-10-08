import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Design Studio — Templates',
    description: 'Browse custom packaging and label templates, design online in your browser, then order.',
};

export default async function DesignHomePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    const templates = await prisma.designTemplate.findMany({
        where: { active: true },
        orderBy: [{ productType: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    });

    const byType = templates.reduce<Record<string, typeof templates>>((acc, t) => {
        (acc[t.productType] ??= []).push(t);
        return acc;
    }, {});

    return (
        <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
            <h1 className="text-3xl font-black text-neutral-900 sm:text-4xl">Design Studio</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">
                Pick a sized template, design your packaging right in the browser — text, artwork and dielines — then send it straight to order.
            </p>

            {Object.keys(byType).length === 0 ? (
                <p className="mt-12 text-neutral-500">No templates yet.</p>
            ) : (
                Object.entries(byType).map(([type, list]) => (
                    <section key={type} className="mt-10">
                        <h2 className="text-lg font-bold capitalize text-neutral-900">{type}</h2>
                        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                            {list.map((tpl) => (
                                <Link
                                    key={tpl.slug}
                                    href={`/design/${tpl.productType}?template=${tpl.slug}`}
                                    className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
                                >
                                    <div
                                        className="mb-3 grid w-full place-items-center overflow-hidden rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-100 [&>svg]:h-auto [&>svg]:w-full"
                                        style={{ aspectRatio: `${tpl.widthMm ?? 1} / ${tpl.heightMm ?? 1}` }}
                                        dangerouslySetInnerHTML={{ __html: tpl.dielineSvg ?? '<svg viewBox="0 0 1 1"></svg>' }}
                                    />
                                    <p className="font-semibold text-neutral-900 group-hover:underline">{tpl.name}</p>
                                    <p className="mt-0.5 text-xs text-neutral-500">{tpl.widthMm ?? '—'} × {tpl.heightMm ?? '—'} mm · bleed {tpl.bleedMm}mm</p>
                                </Link>
                            ))}
                        </div>
                    </section>
                ))
            )}
        </main>
    );
}
