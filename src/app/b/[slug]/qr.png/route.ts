import { getQrBoardBySlug } from "@/features/boards/qr/queries";
import {
  canonicalBoardUrl,
  generateQrPng,
} from "@/features/boards/qr/qr";

type QrRouteContext = {
  params: Promise<{ slug: string }>;
};

const commonHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_request: Request, { params }: QrRouteContext) {
  const { slug } = await params;
  const board = await getQrBoardBySlug(slug);
  if (!board) {
    return new Response("Not Found", { status: 404, headers: commonHeaders });
  }

  try {
    const png = await generateQrPng(canonicalBoardUrl(board.slug));
    return new Response(new Uint8Array(png), {
      headers: {
        ...commonHeaders,
        "Content-Disposition": `attachment; filename="${board.slug}-qr.png"`,
        "Content-Type": "image/png",
      },
    });
  } catch {
    return new Response("QR generation failed", {
      status: 500,
      headers: commonHeaders,
    });
  }
}
