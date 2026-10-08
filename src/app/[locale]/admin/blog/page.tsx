import { prisma } from '@/lib/prisma';
import { deletePost } from '@/features/admin/actions';
import { PostEditor } from '@/components/admin/PostEditor';

export const dynamic = 'force-dynamic';

export default async function AdminBlogPage() {
    const posts = await prisma.post.findMany({ orderBy: { updatedAt: 'desc' } });

    return (
        <div className="space-y-8">
            <section>
                <h2 className="mb-3 text-base font-bold text-neutral-900">新建文章</h2>
                <PostEditor />
            </section>
            <section>
                <h2 className="mb-3 text-base font-bold text-neutral-900">现有文章 · {posts.length}</h2>
                {posts.length === 0 ? (
                    <p className="text-neutral-500">还没有文章，用上方表单创建。</p>
                ) : (
                    <div className="space-y-5">
                        {posts.map((p) => (
                            <div key={p.id} className="space-y-2">
                                <PostEditor item={p} />
                                <form action={deletePost}>
                                    <input type="hidden" name="id" value={p.id} />
                                    <button className="text-xs text-[#ff4d4f] hover:underline">删除「{p.title}」</button>
                                </form>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
