'use client';

import { useState } from 'react';
import { saveDesign } from '@/features/design/actions';

// 作品保存流程：全屏编辑器与快速定制页共用同一份状态机（匿名也可存，归属由服务端按 userId/email 认领）
type Args = {
    productType: string;
    designId?: string;
    templateId?: string | null;
    name?: string;
    ready: boolean;
    exportJSON: () => string;
};

export function useDesignSave({ productType, designId, templateId, name, ready, exportJSON }: Args) {
    const [title, setTitle] = useState(name ?? 'Untitled design');
    const [savedId, setSavedId] = useState<string | undefined>(designId);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    /** 成功返回作品 id，失败返回 undefined（错误文案写进 msg） */
    async function save(): Promise<string | undefined> {
        if (!ready) return undefined;
        setSaving(true);
        setMsg('');
        const res = await saveDesign({
            id: savedId,
            sceneJson: exportJSON(),
            name: title,
            templateId: templateId ?? undefined,
            productType,
        });
        setSaving(false);
        if (res.ok && res.id) {
            setSavedId(res.id);
            setMsg('Saved ✓');
            return res.id;
        }
        setMsg(res.error === 'forbidden' ? 'You cannot save this design' : 'Save failed');
        return undefined;
    }

    // 侧栏只有一行状态位：保存与导出共用（导出PDF 也要往里写进度）
    return { title, setTitle, savedId, saving, msg, setStatus: setMsg, save };
}
