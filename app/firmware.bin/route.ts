import {
  firstProjectWithFirmware,
  getActiveInfo,
  isOtaAuthorized,
  otaUnauthorized,
  readActiveFirmware,
} from "@/lib/ota";

export const dynamic = "force-dynamic";

/** 兼容最旧路径：/firmware.bin → 第一个有固件的项目 */
export async function GET(request: Request) {
  if (!isOtaAuthorized(request)) return otaUnauthorized();

  const project = firstProjectWithFirmware();
  if (!project) return new Response("No firmware available", { status: 404 });

  const buf = readActiveFirmware(project);
  if (!buf) return new Response("No firmware available", { status: 404 });

  const info = getActiveInfo(project);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
      "X-Firmware-Project": project,
      "X-Firmware-Version": info?.version ?? "",
      "X-Firmware-MD5": info?.md5 ?? "",
    },
  });
}
