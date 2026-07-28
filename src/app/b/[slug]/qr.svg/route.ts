import { getQrBoardBySlug } from "@/features/boards/qr/queries";
import {
  canonicalBoardUrl,
  generateQrSvg,
} from "@/features/boards/qr/qr";

type QrRouteContext = {
  params: Promise<{ slug: string }>;
};

const commonHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request, { params }: QrRouteContext) {
  const { slug } = await params;
  const board = await getQrBoardBySlug(slug);
  if (!board) {
    return new Response("Not Found", { status: 404, headers: commonHeaders });
  }

  try {
    const svg = await generateQrSvg(canonicalBoardUrl(board.slug));
    const disposition = new URL(request.url).searchParams.has("preview")
      ? "inline"
      : "attachment";
    return new Response(svg, {
      headers: {
        ...commonHeaders,
        "Content-Disposition": `${disposition}; filename="${board.slug}-qr.svg"`,
        "Content-Type": "image/svg+xml; charset=utf-8",
      },
    });
  } catch {
    return new Response("QR generation failed", {
      status: 500,
      headers: commonHeaders,
    });
  }
}
