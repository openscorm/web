import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useImpression } from "@/hooks/useImpression";
import { capture } from "@/lib/analytics";

// Impressions fire at render, deduped
// per page-view, not per React re-render. These pin the latch so a chatty
// re-render (a capacity snapshot refetch, a filter keystroke) cannot inflate an
// impression count.
vi.mock("@/lib/analytics", () => ({ capture: vi.fn() }));
const mockCapture = vi.mocked(capture);

describe("useImpression", () => {
  beforeEach(() => mockCapture.mockClear());

  it("fires once when the condition is already true at mount", () => {
    renderHook(() => useImpression("capacity_warning_shown", true, { surface: "library_banner" }));
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith("capacity_warning_shown", {
      surface: "library_banner",
    });
  });

  it("does not fire while the condition is false", () => {
    renderHook(() => useImpression("upload_blocked_shown", false));
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("does not re-fire on re-render while the condition stays true", () => {
    const { rerender } = renderHook(({ when }) => useImpression("pricing_viewed", when), {
      initialProps: { when: true },
    });
    rerender({ when: true });
    rerender({ when: true });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("fires exactly once on a false to true transition and stays latched", () => {
    const { rerender } = renderHook(({ when }) => useImpression("capacity_warning_shown", when), {
      initialProps: { when: false },
    });
    expect(mockCapture).not.toHaveBeenCalled();

    rerender({ when: true });
    expect(mockCapture).toHaveBeenCalledTimes(1);

    rerender({ when: false });
    rerender({ when: true });
    expect(mockCapture).toHaveBeenCalledTimes(1); // latched; no second emit
  });
});
