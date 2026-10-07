import { getActiveInfo, isOtaAuthorized, isValidProject, otaUnauthorized, readActiveFirmware } from "@/lib/ota";

export const dynamic = "force-dynamic";

type Params = Promise<{ project: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  if (!isOtaAuthorized(request)) return otaUnauthorized();

  const { project } = await params;
  if (!isValidProject(project)) return new Response("Bad project", { status: 400 });

  const buf = readActiveFirmware(project);
  if (!buf) return new Response(`No firmware available for '${project}'`, { status: 404 });

  const info = getActiveInfo(project);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
      "X-Firmware-Version": info?.version ?? "",
      "X-Firmware-MD5": info?.md5 ?? "",
    },
  });
}
