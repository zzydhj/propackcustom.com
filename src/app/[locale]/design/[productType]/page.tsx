import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { DesignStudio } from '@/components/design/DesignStudio';

export const metadata: Metadata = {
    title: 'Design Studio — Create Your Packaging Online',
    description: 'Design custom packaging and labels online — text, artwork and dielines in your browser, then order directly.',
};

export default async function DesignPage({ params }: { params: Promise<{ locale: string; productType: string }> }) {
    const { locale, productType } = await params;
    setRequestLocale(locale);

    return (
        <main className="mx-auto max-w-[1100px] px-5 py-8">
            <DesignStudio productType={productType} />
        </main>
    );
}
