import { z } from "zod";

const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use http or https",
  })
  .transform((value) => value.replace(/\/$/, ""));

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().regex(/^sb_secret_[A-Za-z0-9_-]+$/),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatError(error: z.ZodError): Error {
  const message = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid environment: ${message}`);
}

export function parsePublicEnv(
  source: Record<string, string | undefined>,
): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) throw formatError(result.error);
  return result.data;
}

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) throw formatError(result.error);
  return result.data;
}
