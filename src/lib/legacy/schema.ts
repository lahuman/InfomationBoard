import { z } from "zod";

const qrUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "QR target must use http or https",
  });

const legacyInformationSchema = z
  .object({
    md: z.string().max(200_000, "Markdown must be at most 200000 characters"),
    qr: qrUrl,
  })
  .strict();

export type LegacyInformation = z.infer<typeof legacyInformationSchema>;

export function parseLegacyInformation(input: unknown): LegacyInformation {
  return legacyInformationSchema.parse(input);
}
