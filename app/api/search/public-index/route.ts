import { getPublicIndexJson } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(getPublicIndexJson(), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
