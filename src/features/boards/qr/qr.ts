import "server-only";
import QRCode from "qrcode";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env/public";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function canonicalBoardUrl(slug: string): string {
  if (!slugSchema.safeParse(slug).success) {
    throw new Error("Invalid board slug");
  }
  return new URL(`/b/${slug}`, getPublicEnv().NEXT_PUBLIC_APP_URL).toString();
}

const qrOptions = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
};

export function generateQrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    ...qrOptions,
    type: "png",
    width: 1024,
  });
}

export function generateQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    ...qrOptions,
    type: "svg",
  });
}
