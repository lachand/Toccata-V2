import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ApiError } from "./api";

/** Traduit un code d'erreur de l'API en texte. Les codes sont stables ; les phrases vivent ici, dans le catalogue. */
export function useErrorText() {
  const { t } = useLingui();
  return (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : "internal";
    switch (code) {
      case "invalid_credentials":
        return t`Incorrect username or password.`;
      case "locked": {
        const minutes = Math.max(1, Math.ceil(((e as ApiError).retryAfterSeconds ?? 60) / 60));
        return plural(minutes, { one: "Too many attempts. Try again in # minute.", other: "Too many attempts. Try again in # minutes." });
      }
      case "rate_limited":
        return t`Too many requests. Try again in a moment.`;
      case "network":
        return t`Server unreachable. Check the connection.`;
      case "username_taken":
        return t`This username is already taken.`;
      case "signup_closed":
        return t`Sign-ups are closed. An invitation code from your school may be required.`;
      case "weak_password": {
        const reason = (e as ApiError).details["reason"];
        if (reason === "too_short") return t`The password must have at least 12 characters.`;
        if (reason === "contains_username") return t`The password must not contain the username or the displayed name.`;
        if (reason === "too_common") return t`This password is too common or easy to guess.`;
        return t`The password is too simple.`;
      }
      case "invalid_input":
        return t`Check the fields and try again.`;
      case "forbidden":
      case "unauthorized":
        return t`This action is not allowed.`;
      case "not_found":
        return t`Not found.`;
      default:
        return t`Something went wrong. Try again.`;
    }
  };
}
