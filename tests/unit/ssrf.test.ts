import { describe, expect, it } from "vitest";
import {
  assertSafeUrlShape,
  isBlockedHostname,
  isPrivateIp,
  SsrfError,
} from "@/lib/security/ssrf";

describe("protecao SSRF", () => {
  it("bloqueia esquemas nao permitidos", () => {
    expect(() => assertSafeUrlShape("file:///etc/passwd")).toThrow(SsrfError);
    expect(() => assertSafeUrlShape("ftp://example.com/file")).toThrow(SsrfError);
    expect(() => assertSafeUrlShape("javascript:alert(1)")).toThrow(SsrfError);
  });

  it("bloqueia credenciais embutidas na URL", () => {
    expect(() => assertSafeUrlShape("http://user:pass@example.com")).toThrow(SsrfError);
  });

  it("bloqueia hosts internos e metadata de nuvem", () => {
    expect(() => assertSafeUrlShape("http://localhost/admin")).toThrow(SsrfError);
    expect(() => assertSafeUrlShape("http://169.254.169.254/latest/meta-data")).toThrow(SsrfError);
    expect(() => assertSafeUrlShape("http://metadata.google.internal/")).toThrow(SsrfError);
    expect(isBlockedHostname("service.internal")).toBe(true);
    expect(isBlockedHostname("acervo.digital")).toBe(false);
  });

  it("bloqueia portas fora da allowlist", () => {
    expect(() => assertSafeUrlShape("http://example.com:22/")).toThrow(SsrfError);
    expect(() => assertSafeUrlShape("https://example.com:443/ok")).not.toThrow();
  });

  it("identifica IPs privados, loopback e link-local", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("172.16.10.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });
});
