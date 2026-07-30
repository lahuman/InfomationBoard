import { z } from "zod";
import { getDeliverableBoardImage } from "@/features/boards/images/delivery";
import { IMAGE_BUCKET } from "@/features/boards/images/model";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const paramsSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    attachmentId: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
  })
  .strict();

type ImageRouteContext = {
  params: Promise<{ slug: string; attachmentId: string }>;
};

function notFoundResponse(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: ImageRouteContext,
): Promise<Response> {
  try {
    const input = paramsSchema.safeParse(await params);
    if (!input.success) return notFoundResponse();

    const image = await getDeliverableBoardImage(
      input.data.slug,
      input.data.attachmentId,
    );
    if (!image) return notFoundResponse();

    const { data, error } = await createAdminSupabaseClient()
      .storage.from(IMAGE_BUCKET)
      .download(image.storagePath);
    if (error || !data || data.size !== image.sizeBytes) {
      return notFoundResponse();
    }

    return new Response(data, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(image.sizeBytes),
        "Content-Type": image.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFoundResponse();
  }
}
