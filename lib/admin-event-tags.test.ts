import { describe, expect, it } from "vitest";
import {
  ADMIN_EVENT_TAG_OPTIONS,
  isAdminEventTagKey,
  getAdminEventTagOption,
} from "@/lib/admin-event-tags";

describe("admin-event-tags", () => {
  it("has exactly 6 tag options", () => {
    expect(ADMIN_EVENT_TAG_OPTIONS).toHaveLength(6);
  });

  it("has unique tag keys", () => {
    const keys = ADMIN_EVENT_TAG_OPTIONS.map((o) => o.value);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique colors", () => {
    const colors = ADMIN_EVENT_TAG_OPTIONS.map((o) => o.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it.each(ADMIN_EVENT_TAG_OPTIONS.map((o) => o.value))(
    "isAdminEventTagKey accepts '%s'",
    (key) => {
      expect(isAdminEventTagKey(key)).toBe(true);
    },
  );

  it.each(["amber", "lime", "invalid", "", "blue"])(
    "isAdminEventTagKey rejects removed/invalid key '%s'",
    (key) => {
      expect(isAdminEventTagKey(key)).toBe(false);
    },
  );

  it("isAdminEventTagKey rejects null and undefined", () => {
    expect(isAdminEventTagKey(null)).toBe(false);
    expect(isAdminEventTagKey(undefined)).toBe(false);
  });

  it.each(ADMIN_EVENT_TAG_OPTIONS.map((o) => [o.value, o.label] as const))(
    "getAdminEventTagOption returns correct option for '%s'",
    (key, expectedLabel) => {
      const option = getAdminEventTagOption(key);
      expect(option).not.toBeNull();
      expect(option!.label).toBe(expectedLabel);
      expect(option!.color).toMatch(/^#[0-9a-f]{6}$/);
    },
  );

  it("getAdminEventTagOption returns null for removed/invalid keys", () => {
    expect(getAdminEventTagOption("amber")).toBeNull();
    expect(getAdminEventTagOption("lime")).toBeNull();
    expect(getAdminEventTagOption("invalid")).toBeNull();
    expect(getAdminEventTagOption(null)).toBeNull();
    expect(getAdminEventTagOption(undefined)).toBeNull();
  });

  it("all overlayColors use 0.18 alpha", () => {
    for (const option of ADMIN_EVENT_TAG_OPTIONS) {
      expect(option.overlayColor).toContain("0.18");
      expect(option.overlayColor).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.18\)$/);
    }
  });
});
