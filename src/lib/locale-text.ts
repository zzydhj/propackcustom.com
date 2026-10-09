// Prisma 里 Product/Category/Spec 的 name/description 是 Json 多语言列（{ en, zh, ... }）。
// 之前到处写 `(x as any)?.en`，既绕过类型又把空值散在各处；统一走这里。
export function localeText(value: unknown, locale = 'en'): string {
    if (!value || typeof value !== 'object') return '';
    const map = value as Record<string, unknown>;
    return String(map[locale] ?? map.en ?? '');
}

/** 多语言列取不到值时的兜底（列表页常用 slug 顶上） */
export function localeTextOr(value: unknown, fallback: string, locale = 'en'): string {
    const text = localeText(value, locale);
    return text || fallback;
}
