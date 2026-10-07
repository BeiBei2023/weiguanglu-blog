import { PageSkeleton } from "@/components/ui/skeleton-page";

/** 工作站各页的加载骨架（切页时的占位） */
export default function WorkspaceLoading() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8">
      <PageSkeleton blocks={4} />
    </div>
  );
}
