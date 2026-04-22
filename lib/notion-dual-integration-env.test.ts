import { describe, expect, it } from "vitest";
import {
  NOTION_TOKEN_CALENDAR,
  NOTION_TOKEN_PROFILE,
  NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR,
  NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE,
} from "@/lib/notion-dual-integration-env";

describe("notion-dual-integration-env", () => {
  it("exports exact process.env key spellings", () => {
    expect(NOTION_TOKEN_CALENDAR).toBe("NOTION_TOKEN_CALENDAR");
    expect(NOTION_TOKEN_PROFILE).toBe("NOTION_TOKEN_PROFILE");
    expect(NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR).toBe(
      "NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR",
    );
    expect(NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE).toBe(
      "NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE",
    );
  });
});
