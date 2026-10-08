import { prisma } from '@/lib/prisma';
import { deleteVideo } from '@/features/admin/actions';
import { VideoEditor } from '@/components/admin/VideoEditor';

export const dynamic = 'force-dynamic';

export default async function AdminVideosPage() {
    const videos = await prisma.video.findMany({ orderBy: { updatedAt: 'desc' } });

    return (
        <div className="space-y-8">
            <section>
                <h2 className="mb-3 text-base font-bold text-neutral-900">新建视频</h2>
                <VideoEditor />
            </section>
            <section>
                <h2 className="mb-3 text-base font-bold text-neutral-900">现有视频 · {videos.length}</h2>
                {videos.length === 0 ? (
                    <p className="text-neutral-500">还没有视频，用上方表单创建。</p>
                ) : (
                    <div className="grid gap-5 xl:grid-cols-2">
                        {videos.map((v) => (
                            <div key={v.id} className="space-y-2">
                                <VideoEditor item={v} />
                                <form action={deleteVideo}>
                                    <input type="hidden" name="id" value={v.id} />
                                    <button className="text-xs text-[#ff4d4f] hover:underline">删除「{v.title}」</button>
                                </form>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
