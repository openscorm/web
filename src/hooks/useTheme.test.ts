import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

// jsdom has no matchMedia, so the OS preference is stubbed per test.
function stubSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: dark, addEventListener() {}, removeEventListener() {} }),
  );
}

// jsdom keeps cookies for the whole file, so every name has to be expired.
function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    document.cookie = `${pair.split("=")[0].trim()}=; path=/; max-age=0`;
  }
}

// Matches the carrier the hook actually reads, not any name ending in "theme".
function themeCookie() {
  return document.cookie.match(/(?:^|;\s*)theme=(dark|light)\b/)?.[1] ?? null;
}

beforeEach(() => {
  clearCookies();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  stubSystemDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolution order", () => {
  it("honors the shared cookie", () => {
    document.cookie = "theme=dark; path=/";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("lets the cookie win over localStorage, so a www toggle beats a stale app value", () => {
    document.cookie = "theme=light; path=/";
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("falls back to localStorage when no cookie is present", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("follows the OS when nothing is stored anywhere", () => {
    stubSystemDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("does not let the OS override an explicit light choice", () => {
    stubSystemDark(true);
    document.cookie = "theme=light; path=/";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("ignores a cookie whose name merely ends in theme", () => {
    document.cookie = "mytheme=dark; path=/";
    stubSystemDark(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });
});

describe("persistence", () => {
  it("writes both carriers on an explicit toggle", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    expect(themeCookie()).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("does not persist an OS-derived default on mount", () => {
    // Writing on mount would freeze the OS value into stored state and push it
    // to www via the cookie, stopping both surfaces tracking later OS changes.
    stubSystemDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(themeCookie()).toBeNull();
    expect(localStorage.getItem("theme")).toBeNull();
  });
});
