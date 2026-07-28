import { z } from "zod";

const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use http or https",
  })
  .transform((value) => value.replace(/\/$/, ""));

const appEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpUrl,
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(
  source: Record<string, string | undefined>,
): AppEnv {
  const result = appEnvSchema.safeParse(source);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }

  return result.data;
}
