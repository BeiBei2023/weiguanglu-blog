import { getSession } from "@/lib/auth/session";
import { getPrivateIndexJson } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(getPrivateIndexJson(), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
