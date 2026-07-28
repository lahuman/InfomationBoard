export type AuthErrorCode =
  | "rate_limit"
  | "email"
  | "google"
  | "callback"
  | "expired"
  | "network"
  | "unknown";

const messages: Record<AuthErrorCode, string> = {
  rate_limit: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  email: "매직링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
  google: "Google 로그인을 시작하지 못했습니다.",
  callback: "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  expired: "로그인 링크가 만료되었거나 올바르지 않습니다.",
  network: "네트워크 연결을 확인하고 다시 시도해 주세요.",
  unknown: "로그인 중 문제가 발생했습니다. 다시 시도해 주세요.",
};

export function authErrorMessage(
  code: AuthErrorCode,
  _providerMessage?: string,
): string {
  void _providerMessage;
  return messages[code];
}
