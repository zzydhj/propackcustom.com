// 数据驱动的「属性联动规则引擎」（归一化三表）—— 前后端共用的纯逻辑。
//
// 四层模型：
//   字典层  AttributeGroup(selectType/displayType/…) + AttributeOption
//   结构层  group.parentOptionId —— 仅当父选项被选中时渲染该组（模切→刀版/直角），不走规则
//   规则层  DependencyRule：source 选项被选中 → 对 target 组施加
//           allowed(白名单,交集) / disabled(黑名单,并集) / hidden(并集) / forced_checked(最小 priority 优先)
//   计价层  option.priceAdjust(FIXED/PERCENT) + product.basePrice + quantityTiers（独立 price_rule 表下一期）
//
// 核心原则：每次都用「全部已选」重算到不动点（非 if-else 链），任意顺序/回退都自洽；
// 服务端下单前同样调用，绝不信任前端。

export type SelectType = 'single' | 'multi' | 'number' | 'text' | 'dimension' | 'file';
export type DisplayType = 'button' | 'radio' | 'checkbox' | 'dropdown';
export type OptionDefaultState = 'enabled' | 'disabled' | 'hidden';

export type CfgOption = {
    id: string;
    name: string;
    sort: number;
    parentOptionId?: string | null;
    defaultState: OptionDefaultState;
    isDefaultChecked: boolean;
    priceAdjustType: 'FIXED' | 'PERCENT';
    priceAdjust: number;
};

export type CfgGroup = {
    id: string;
    name: string;
    selectType: SelectType;
    displayType: DisplayType;
    unit?: string | null;
    isRequired: boolean;
    sort: number;
    min?: number | null;
    max?: number | null;
    parentOptionId?: string | null; // 结构层：父选项被选中才渲染本组
    options: CfgOption[];
};

export type CfgRule = {
    id: string;
    sourceOptionId: string;
    targetGroupId: string;
    allowedOptionIds: string[];
    disabledOptionIds: string[];
    hiddenOptionIds: string[];
    forcedCheckedOptionId?: string | null;
    priority: number;
};

export type QuantityTier = { min: number; discountPct: number };
export type Dimension = { width: number; height: number };
// 选择值：以 groupId 为键。single→optionId；multi→optionId[]；number→number；text/file→string；dimension→{width,height}
export type Selections = Record<string, string | string[] | number | Dimension | undefined>;

export type ProductConfig = {
    pricingMode: 'FIXED' | 'AREA';
    basePrice: number;
    pricePerSqm: number | null;
    currency: string;
    quantityTiers: QuantityTier[];
    groups: CfgGroup[];
    rules: CfgRule[];
};

export type OptionState = { hidden: boolean; disabled: boolean; forced: boolean; selectable: boolean };
export type GroupState = { hidden: boolean; unavailable: boolean };
export type ConfigState = {
    selections: Selections;
    optionState: Record<string, OptionState>;
    groupState: Record<string, GroupState>;
    autoChecked: string[]; // 由 forced 自动加入的选项（条件消失时回收）
};

export type PriceBreakdown = {
    currency: string;
    unitBase: number;
    fixedAdd: number;
    percentAdd: number;
    unitBeforeTier: number;
    discountPct: number;
    finalUnit: number;
    quantity: number;
    total: number;
    areaSqm: number;
};

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

const hasOptions = (g: CfgGroup) => g.selectType === 'single' || g.selectType === 'multi';

// 当前被选中的所有 option id（single/multi 组）
function selectedOptionIds(groups: CfgGroup[], selections: Selections): Set<string> {
    const set = new Set<string>();
    for (const g of groups) {
        if (!hasOptions(g)) continue;
        const v = selections[g.id];
        if (g.selectType === 'single' && typeof v === 'string' && v) set.add(v);
        else if (g.selectType === 'multi' && Array.isArray(v)) for (const x of v) if (x) set.add(String(x));
    }
    return set;
}

type PassResult = {
    selections: Selections;
    optionState: Record<string, OptionState>;
    groupState: Record<string, GroupState>;
    autoChecked: Set<string>;
    changed: boolean;
};

// 单趟计算：基于传入 selections 求激活源 → 归并规则 → 算四态 → 应用 forced/回收/prune
function pass(cfg: ProductConfig, selIn: Selections, prevAuto: Set<string>): PassResult {
    const sel: Selections = { ...selIn };
    const optionState: Record<string, OptionState> = {};
    const groupState: Record<string, GroupState> = {};
    const selected = selectedOptionIds(cfg.groups, sel);
    const forcedByGroup: Record<string, string | null> = {};

    for (const g of cfg.groups) {
        const structHidden = !!g.parentOptionId && !selected.has(g.parentOptionId);

        // 命中该组、且 source 已被选中的规则；按 priority 升序（数字小的优先），再按 id 稳定排序
        const active = cfg.rules
            .filter((r) => r.targetGroupId === g.id && selected.has(r.sourceOptionId))
            .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

        // allowed 取交集（只并入非空白名单；无任何非空白名单 = 不限制）
        let allowed: Set<string> | null = null;
        const disabledSet = new Set<string>();
        const hiddenSet = new Set<string>();
        let forced: string | null = null;
        for (const r of active) {
            if (r.allowedOptionIds.length) {
                const s = new Set<string>(r.allowedOptionIds);
                if (allowed === null) {
                    allowed = s;
                } else {
                    const next = new Set<string>();
                    for (const x of allowed) if (s.has(x)) next.add(x);
                    allowed = next;
                }
            }
            for (const id of r.disabledOptionIds) disabledSet.add(id);
            for (const id of r.hiddenOptionIds) hiddenSet.add(id);
            if (forced === null && r.forcedCheckedOptionId) forced = r.forcedCheckedOptionId; // 最小 priority 优先
        }

        let anySelectable = false;
        for (const o of g.options) {
            const hidden = structHidden || o.defaultState === 'hidden' || hiddenSet.has(o.id);
            const notAllowed = allowed !== null && !allowed.has(o.id);
            const disabled = !hidden && (o.defaultState === 'disabled' || disabledSet.has(o.id) || notAllowed);
            const selectable = !hidden && !disabled;
            const isForced = selectable && forced === o.id;
            optionState[o.id] = { hidden, disabled, forced: isForced, selectable };
            if (selectable) anySelectable = true;
        }
        // 组：结构隐藏；或「有选项但无可选项」（allowed 交集空/全禁用）→ unavailable
        groupState[g.id] = { hidden: structHidden, unavailable: !structHidden && g.options.length > 0 && !anySelectable };
        forcedByGroup[g.id] = forced && optionState[forced]?.selectable ? forced : null;
    }

    // 回收：上一趟 forced 自动加入、本趟不再 forced 的选项 → 从选择中移除
    const newAuto = new Set<string>();
    for (const gid of Object.keys(forcedByGroup)) {
        const f = forcedByGroup[gid];
        if (f) newAuto.add(f);
    }
    const groupOfOption = new Map<string, CfgGroup>();
    for (const g of cfg.groups) for (const o of g.options) groupOfOption.set(o.id, g);
    for (const id of prevAuto) {
        if (newAuto.has(id)) continue;
        const g = groupOfOption.get(id);
        if (!g) continue;
        if (g.selectType === 'single' && sel[g.id] === id) delete sel[g.id];
        else if (g.selectType === 'multi' && Array.isArray(sel[g.id])) {
            sel[g.id] = (sel[g.id] as string[]).filter((x) => x !== id);
        }
    }

    // 应用 forced（锁定为已选）
    for (const g of cfg.groups) {
        const f = forcedByGroup[g.id];
        if (!f) continue;
        if (g.selectType === 'single') sel[g.id] = f;
        else if (g.selectType === 'multi') {
            const arr = Array.isArray(sel[g.id]) ? [...(sel[g.id] as string[])] : [];
            if (!arr.includes(f)) arr.push(f);
            sel[g.id] = arr;
        }
    }

    // prune：结构隐藏的组清空；single/multi 移除不可选项
    for (const g of cfg.groups) {
        if (groupState[g.id].hidden) {
            if (sel[g.id] !== undefined) delete sel[g.id];
            continue;
        }
        if (g.selectType === 'single') {
            const v = sel[g.id];
            if (typeof v === 'string' && v && !optionState[v]?.selectable) delete sel[g.id];
        } else if (g.selectType === 'multi') {
            const arr = Array.isArray(sel[g.id]) ? (sel[g.id] as string[]) : null;
            if (arr) {
                const kept = arr.filter((id) => optionState[id]?.selectable);
                if (kept.length !== arr.length) sel[g.id] = kept;
            }
        }
    }

    const changed =
        JSON.stringify(normSel(sel)) !== JSON.stringify(normSel(selIn)) ||
        newAuto.size !== prevAuto.size ||
        [...newAuto].some((x) => !prevAuto.has(x));
    return { selections: sel, optionState, groupState, autoChecked: newAuto, changed };
}

// 归一化选择值以便稳定比较（multi 数组排序、清掉空值）
function normSel(sel: Selections): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(sel).sort()) {
        const v = sel[k];
        if (v === undefined) continue;
        out[k] = Array.isArray(v) ? [...v].sort() : v;
    }
    return out;
}

// 迭代到不动点（最多 10 趟，防环）
export function computeConfigState(cfg: ProductConfig, selections: Selections, prevAutoChecked: string[] = []): ConfigState {
    let sel: Selections = { ...selections };
    let auto = new Set<string>(prevAutoChecked);
    let optionState: Record<string, OptionState> = {};
    let groupState: Record<string, GroupState> = {};
    for (let i = 0; i < 10; i++) {
        const r = pass(cfg, sel, auto);
        sel = r.selections;
        auto = r.autoChecked;
        optionState = r.optionState;
        groupState = r.groupState;
        if (!r.changed) break;
    }
    return { selections: sel, optionState, groupState, autoChecked: [...auto] };
}

// 初始选择：预选 isDefaultChecked 且默认 enabled 的选项
export function initialSelections(cfg: ProductConfig): Selections {
    const s: Selections = {};
    for (const g of cfg.groups) {
        if (g.selectType === 'single') {
            const def = g.options.find((o) => o.isDefaultChecked && o.defaultState === 'enabled');
            if (def) s[g.id] = def.id;
        } else if (g.selectType === 'multi') {
            const defs = g.options.filter((o) => o.isDefaultChecked && o.defaultState === 'enabled').map((o) => o.id);
            if (defs.length) s[g.id] = defs;
        }
    }
    return s;
}

export function getDimension(cfg: ProductConfig, selections: Selections): Dimension | null {
    const g = cfg.groups.find((x) => x.selectType === 'dimension');
    if (!g) return null;
    const v = selections[g.id];
    if (v && typeof v === 'object' && !Array.isArray(v) && 'width' in v) {
        const d = v as Dimension;
        return { width: Number(d.width) || 0, height: Number(d.height) || 0 };
    }
    return null;
}

// 计价：只累加「已选且 selectable」的选项加价（selections 应已是 computeConfigState 修正后的）
export function computeConfigPrice(cfg: ProductConfig, selections: Selections, quantity: number, state?: ConfigState): PriceBreakdown {
    const st = state ?? computeConfigState(cfg, selections);
    const sel = st.selections;

    let unitBase = 0;
    let areaSqm = 0;
    if (cfg.pricingMode === 'AREA') {
        const dim = getDimension(cfg, sel);
        if (dim) areaSqm = (dim.width / 100) * (dim.height / 100);
        unitBase = areaSqm * (cfg.pricePerSqm ?? 0);
    } else {
        unitBase = cfg.basePrice;
    }

    let fixedAdd = 0;
    let percentAdd = 0;
    for (const g of cfg.groups) {
        if (!hasOptions(g)) continue;
        const chosen: string[] = g.selectType === 'single'
            ? (typeof sel[g.id] === 'string' && sel[g.id] ? [sel[g.id] as string] : [])
            : (Array.isArray(sel[g.id]) ? (sel[g.id] as string[]) : []);
        for (const oid of chosen) {
            if (!st.optionState[oid]?.selectable) continue;
            const opt = g.options.find((o) => o.id === oid);
            if (!opt) continue;
            if (opt.priceAdjustType === 'PERCENT') percentAdd += Number(opt.priceAdjust) || 0;
            else fixedAdd += Number(opt.priceAdjust) || 0;
        }
    }

    const unitBeforeTier = (unitBase + fixedAdd) * (1 + percentAdd / 100);
    let discountPct = 0;
    for (const t of [...cfg.quantityTiers].sort((a, b) => a.min - b.min)) {
        if (quantity >= t.min) discountPct = t.discountPct;
    }
    const finalUnit = unitBeforeTier * (1 - discountPct / 100);
    const total = finalUnit * (quantity || 0);

    return { currency: cfg.currency, unitBase, fixedAdd, percentAdd, unitBeforeTier, discountPct, finalUnit, quantity: quantity || 0, total, areaSqm };
}

// 校验必填 + 尺寸/数字范围（跳过结构隐藏的组）；返回错误信息（空数组=通过）
export function validateConfig(cfg: ProductConfig, selections: Selections): string[] {
    const st = computeConfigState(cfg, selections);
    const sel = st.selections;
    const errors: string[] = [];
    for (const g of cfg.groups) {
        if (st.groupState[g.id]?.hidden) continue;
        const v = sel[g.id];
        const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        if (g.isRequired) {
            if (st.groupState[g.id]?.unavailable) continue; // 无可选项（配置冲突）→ 不阻断，交由后台冲突检测
            if (empty) { errors.push(`${g.name} is required`); continue; }
            if (g.selectType === 'dimension') {
                const d = v as Dimension;
                if (!d?.width || !d?.height) errors.push(`${g.name} needs width and height`);
            }
        }
        if (g.selectType === 'dimension' && v && typeof v === 'object') {
            const d = v as Dimension;
            if (g.min != null && (d.width < g.min || d.height < g.min)) errors.push(`${g.name} below minimum ${g.min}${g.unit ?? ''}`);
            if (g.max != null && (d.width > g.max || d.height > g.max)) errors.push(`${g.name} above maximum ${g.max}${g.unit ?? ''}`);
        }
        if (g.selectType === 'number' && typeof v === 'number' && v) {
            if (g.min != null && v < g.min) errors.push(`${g.name} below minimum ${g.min}`);
            if (g.max != null && v > g.max) errors.push(`${g.name} above maximum ${g.max}`);
        }
    }
    return errors;
}

// 把 Prisma 查询结果（含 attributeGroups/dependencyRules）映射成可序列化的 ProductConfig
type RawOption = { id: string; name: string; sort: number; parentOptionId: string | null; defaultState: string; isDefaultChecked: boolean; priceAdjustType: string; priceAdjust: unknown };
type RawGroup = { id: string; name: string; selectType: string; displayType: string; unit: string | null; isRequired: boolean; sort: number; min: number | null; max: number | null; parentOptionId: string | null; options: RawOption[] };
type RawRule = { id: string; sourceOptionId: string; targetGroupId: string; allowedOptionIds: unknown; disabledOptionIds: unknown; hiddenOptionIds: unknown; forcedCheckedOptionId: string | null; priority: number };

const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

export function mapProductConfig(p: {
    pricingMode: string;
    basePrice: unknown;
    pricePerSqm: unknown;
    currency: string;
    quantityTiers: unknown;
    attributeGroups: RawGroup[];
    dependencyRules: RawRule[];
}): ProductConfig {
    const groups: CfgGroup[] = (p.attributeGroups ?? [])
        .map((g) => ({
            id: g.id,
            name: g.name,
            selectType: (g.selectType as SelectType) || 'single',
            displayType: (g.displayType as DisplayType) || 'button',
            unit: g.unit ?? null,
            isRequired: !!g.isRequired,
            sort: g.sort ?? 0,
            min: g.min ?? null,
            max: g.max ?? null,
            parentOptionId: g.parentOptionId ?? null,
            options: (g.options ?? [])
                .map((o) => ({
                    id: o.id,
                    name: o.name,
                    sort: o.sort ?? 0,
                    parentOptionId: o.parentOptionId ?? null,
                    defaultState: (o.defaultState as OptionDefaultState) || 'enabled',
                    isDefaultChecked: !!o.isDefaultChecked,
                    priceAdjustType: (o.priceAdjustType as 'FIXED' | 'PERCENT') || 'FIXED',
                    priceAdjust: Number(o.priceAdjust) || 0,
                }))
                .sort((a, b) => a.sort - b.sort),
        }))
        .sort((a, b) => a.sort - b.sort);

    const rules: CfgRule[] = (p.dependencyRules ?? []).map((r) => ({
        id: r.id,
        sourceOptionId: r.sourceOptionId,
        targetGroupId: r.targetGroupId,
        allowedOptionIds: asStrArr(r.allowedOptionIds),
        disabledOptionIds: asStrArr(r.disabledOptionIds),
        hiddenOptionIds: asStrArr(r.hiddenOptionIds),
        forcedCheckedOptionId: r.forcedCheckedOptionId ?? null,
        priority: r.priority ?? 0,
    }));

    return {
        pricingMode: p.pricingMode === 'AREA' ? 'AREA' : 'FIXED',
        basePrice: Number(p.basePrice) || 0,
        pricePerSqm: p.pricePerSqm == null ? null : Number(p.pricePerSqm),
        currency: p.currency || 'USD',
        quantityTiers: Array.isArray(p.quantityTiers) ? (p.quantityTiers as QuantityTier[]) : [],
        groups,
        rules,
    };
}
