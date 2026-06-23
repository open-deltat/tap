import { constantTimeEqual } from "./crypto";

/**
 * Whether the supplied credentials match. Both fields are compared unconditionally and the results
 * are AND-ed only after both compares have run, so the check time leaks neither which field was
 * wrong nor whether the password comparison happened. A plain `a && b` would short-circuit the
 * second compare and reintroduce that timing channel.
 */
export function credentialsMatch(
  user: string,
  pass: string,
  expectedUser: string,
  expectedPass: string,
): boolean {
  const userOk = constantTimeEqual(user, expectedUser);
  const passOk = constantTimeEqual(pass, expectedPass);
  return userOk && passOk;
}
