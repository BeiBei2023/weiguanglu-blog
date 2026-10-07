import { notFound } from "next/navigation";
import { getPostBySlug } from "@/lib/content";
import { readPostRaw } from "@/lib/content/admin";
import { PostEditor } from "@/components/admin/post-editor";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return { title: post ? `编辑 · ${post.title}` : "编辑" };
}

export default async function EditPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const raw = readPostRaw(slug);
  if (!post || !raw) notFound();

  return (
    <PostEditor
      mode="edit"
      slug={slug}
      version={raw.hash}
      initial={{
        title: post.title,
        date: post.date,
        tags: post.tags.join(", "),
        description: post.description,
        visibility: post.visibility,
        series: post.series ?? "",
        seriesOrder: post.seriesOrder != null ? String(post.seriesOrder) : "",
        content: post.content,
      }}
    />
  );
}
