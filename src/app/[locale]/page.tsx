import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  return <Home params={params} />;
}

async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Announcement />
      <Hero />
      <Categories />
      <ValueProps />
      <Popular />
      <Matrix />
      <Stats />
      <Promise />
      <CtaBand />
    </>
  );
}

function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`mx-auto max-w-[1266px] px-5 2xl:px-12 ${className}`}>
      {children}
    </section>
  );
}

function Announcement() {
  const t = useTranslations('Announcement');
  return (
    <div className="bg-neutral-900 text-white">
      <Section className="flex h-[42px] items-center justify-center gap-3 text-sm">
        <span className="hidden h-1.5 w-1.5 rounded-full bg-[#ffec5a] sm:block" />
        <p className="truncate text-center text-neutral-200">{t('text')}</p>
        <Link href="/about" className="shrink-0 font-semibold text-[#ffec5a] hover:underline">
          {t('action')} →
        </Link>
      </Section>
    </div>
  );
}

function Hero() {
  const t = useTranslations('Hero');
  return (
    <div className="bg-gradient-to-b from-white to-[#f8f8f8]">
      <Section className="grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <span className="inline-flex items-center rounded-full bg-[#ffec5a] px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-900">
            {t('eyebrow')}
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">{t('subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/quote" className="rounded-lg bg-neutral-900 px-7 py-3.5 font-semibold text-white transition hover:bg-neutral-700">
              {t('cta')}
            </Link>
            <Link href="/products" className="rounded-lg border border-neutral-300 bg-white px-7 py-3.5 font-semibold text-neutral-900 transition hover:border-neutral-900">
              {t('secondary')}
            </Link>
          </div>
          <p className="mt-6 text-sm text-neutral-500">{t('trust')}</p>
        </div>
        <HeroMock />
      </Section>
    </div>
  );
}

// 纯 CSS 的包装样机（不依赖外部图片，避免远程图配置问题）
function HeroMock() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-700" />
      <div className="absolute inset-0 rounded-3xl opacity-20 [background:radial-gradient(circle_at_30%_20%,#ffec5a,transparent_45%)]" />
      <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] rounded-2xl bg-[#ffec5a] shadow-2xl" />
      <div className="absolute left-1/2 top-1/2 flex h-52 w-52 -translate-x-1/2 -translate-y-1/2 translate-x-[-30%] translate-y-[-24%] rotate-[6deg] items-center justify-center rounded-2xl bg-white/95 shadow-xl">
        <span className="text-5xl font-black text-neutral-900">P</span>
      </div>
      <div className="absolute bottom-8 right-8 rounded-xl bg-white/95 px-4 py-3 text-right shadow-lg">
        <p className="text-xs text-neutral-500">MOQ</p>
        <p className="text-lg font-bold text-neutral-900">50 pcs</p>
      </div>
    </div>
  );
}

function Categories() {
  const t = useTranslations('Categories');
  const items = t.raw('items') as { name: string; desc: string }[];
  return (
    <Section className="py-16">
      <SectionHead title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((c) => (
          <Link
            key={c.name}
            href="/products"
            className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-900 hover:shadow-lg"
          >
            <div className="mb-4 h-20 rounded-xl bg-gradient-to-br from-[#f5f5f5] to-[#e9e9e9] transition group-hover:from-[#ffec5a] group-hover:to-[#ffe14d]" />
            <p className="font-bold text-neutral-900">{c.name}</p>
            <p className="mt-1 text-sm text-neutral-500">{c.desc}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function ValueProps() {
  const t = useTranslations('ValueProps');
  const items = t.raw('items') as { title: string; desc: string }[];
  return (
    <div className="bg-white py-16">
      <Section>
        <SectionHead title={t('title')} />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((v, i) => (
            <div key={v.title} className="rounded-2xl bg-[#f8f8f8] p-6">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-neutral-900 text-sm font-bold text-[#ffec5a]">
                0{i + 1}
              </span>
              <p className="mt-4 font-bold text-neutral-900">{v.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{v.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Popular() {
  const t = useTranslations('Popular');
  const cats = useTranslations('Categories');
  const items = cats.raw('items') as { name: string; desc: string }[];
  const top = items.slice(0, 3);
  const rest = items.slice(3, 7);
  return (
    <Section className="py-16">
      <SectionHead title={t('title')} subtitle={t('subtitle')} />
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* 领奖台 */}
        <div className="grid grid-cols-3 items-end gap-3">
          {[1, 0, 2].map((idx) => {
            const c = top[idx];
            const height = idx === 0 ? 'h-64' : idx === 1 ? 'h-52' : 'h-44';
            return (
              <div key={c.name} className={`flex flex-col justify-end rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-100 ${height}`}>
                <div className="mb-2 inline-flex w-fit items-center rounded-full bg-gradient-to-r from-[#fc9797] to-[#fa5151] px-2 py-0.5 text-xs font-bold text-white">
                  TOP {idx + 1}
                </div>
                <div className="h-full rounded-xl bg-gradient-to-br from-[#f5f5f5] to-[#ececec]" />
                <p className="mt-2 truncate text-sm font-semibold text-neutral-900">{c.name}</p>
                <p className="text-xs text-[#FF8F1F]">★ 4.9 · {t('from')} $0.12</p>
              </div>
            );
          })}
        </div>
        {/* 网格 */}
        <div className="grid gap-3 sm:grid-cols-2">
          {rest.map((c, i) => (
            <div key={c.name} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-neutral-100">
              <span className="w-8 shrink-0 text-center text-2xl font-black text-neutral-200">{i + 4}</span>
              <div className="h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-[#f5f5f5] to-[#ececec]" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutral-900">{c.name}</p>
                <p className="truncate text-xs text-neutral-500">{c.desc}</p>
                <p className="text-xs text-[#FF8F1F]">★ 4.8 · {t('from')} $0.09</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Matrix() {
  const t = useTranslations('Matrix');
  const cats = useTranslations('Categories');
  const items = cats.raw('items') as { name: string; desc: string }[];
  return (
    <div className="bg-white py-16">
      <Section>
        <SectionHead title={t('title')} subtitle={t('subtitle')} action={{ href: '/products', label: t('viewAll') }} />
        <div className="mt-10 grid gap-6 rounded-2xl bg-[#f8f8f8] p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul className="space-y-1">
            {items.map((c, i) => (
              <li key={c.name}>
                <Link
                  href="/products"
                  className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition hover:bg-[#ffec5a] ${
                    i === 0 ? 'bg-neutral-900 text-white hover:bg-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  {c.name}
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {items.map((c, i) => (
              <div key={c.name} className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {i % 3 === 0 && (
                  <span className="absolute left-2 top-2 z-10 rounded bg-[#ff4d4f] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t('newTag')}
                  </span>
                )}
                <div className="aspect-square bg-gradient-to-br from-[#f5f5f5] to-[#e9e9e9]" />
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-neutral-900">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{c.desc}</p>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-neutral-900/90 to-transparent p-3 transition group-hover:translate-y-0">
                  <span className="block rounded bg-neutral-900 py-1.5 text-center text-xs font-semibold text-white">
                    {t('getPrice')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Stats() {
  const t = useTranslations('Stats');
  const items = t.raw('items') as { value: string; unit: string; label: string }[];
  return (
    <div className="bg-neutral-900 py-16 text-white">
      <Section>
        <h2 className="text-center text-2xl font-bold sm:text-3xl">{t('title')}</h2>
        <div className="mt-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
          {items.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-4xl font-black sm:text-5xl">
                {s.value}
                <span className="text-[#ffec5a]">{s.unit}</span>
              </p>
              <p className="mt-2 text-sm text-neutral-400">{s.label}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Promise() {
  const t = useTranslations('Promise');
  const tags = t.raw('tags') as string[];
  return (
    <Section className="py-16">
      <SectionHead title={t('title')} />
      <div className="mt-10 flex flex-wrap gap-3">
        {tags.map((tag, i) => (
          <span
            key={tag}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              i % 4 === 0
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : i % 3 === 0
                  ? 'border-[#ffec5a] bg-[#ffec5a] text-neutral-900'
                  : 'border-neutral-200 bg-white text-neutral-700'
            }`}
          >
            {tag}
          </span>
        ))}
      </div>
    </Section>
  );
}

function CtaBand() {
  const t = useTranslations('CTA');
  return (
    <Section className="pb-20">
      <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-gradient-to-r from-[#ffec5a] to-[#ffe14d] px-8 py-12 text-center md:flex-row md:text-left">
        <div>
          <h2 className="text-2xl font-black text-neutral-900 sm:text-3xl">{t('title')}</h2>
          <p className="mt-2 text-neutral-800">{t('subtitle')}</p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Link href="/quote" className="rounded-lg bg-neutral-900 px-6 py-3 font-semibold text-white hover:bg-neutral-700">
            {t('button')}
          </Link>
          <Link href="/contact" className="rounded-lg border border-neutral-900 px-6 py-3 font-semibold text-neutral-900 hover:bg-neutral-900 hover:text-white">
            {t('talkToUs')}
          </Link>
        </div>
      </div>
    </Section>
  );
}

function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-black tracking-tight text-neutral-900 sm:text-[28px]">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-2xl text-neutral-500">
          {subtitle}{' '}
          {action && (
            <Link href={action.href as any} className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
              {action.label}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
