import { PostEditor } from "@/components/admin/post-editor";

export const metadata = { title: "新建文章" };

function todayLocal(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export default function AdminNewPage() {
  return (
    <PostEditor
      mode="create"
      initial={{
        title: "",
        date: todayLocal(),
        tags: "",
        description: "",
        visibility: "draft",
        series: "",
        seriesOrder: "",
        content: "",
      }}
    />
  );
}
