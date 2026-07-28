import "server-only";
import { cache } from "react";
import { parseAppEnv } from "./schema";

export const getServerEnv = cache(() =>
  parseAppEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }),
);
