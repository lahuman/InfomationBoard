import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  StorageMeter,
  formatStorageBytes,
} from "./storage-meter";
import { ACCOUNT_STORAGE_LIMIT_BYTES } from "./images/model";

describe("formatStorageBytes", () => {
  it("formats bytes for the owner dashboard", () => {
    expect(formatStorageBytes(0)).toBe("0 B");
    expect(formatStorageBytes(1_048_576)).toBe("1 MB");
    expect(formatStorageBytes(1_572_864)).toBe("1.5 MB");
  });
});

describe("StorageMeter", () => {
  it("shows current use against the 50 MB account allowance", () => {
    render(<StorageMeter storageBytes={25 * 1_048_576} />);

    const meter = screen.getByRole("meter", { name: "저장공간 사용량" });
    expect(meter).toHaveAttribute("max", String(ACCOUNT_STORAGE_LIMIT_BYTES));
    expect(meter).toHaveAttribute("value", String(25 * 1_048_576));
    expect(screen.getByText("25 MB / 50 MB")).toBeVisible();
    expect(
      screen.getByText(
        "계정당 최대 50MB · 안내판 편집기에서 이미지를 관리할 수 있습니다.",
      ),
    ).toBeVisible();
  });

  it("clamps invalid display values without hiding the recorded total", () => {
    render(<StorageMeter storageBytes={75 * 1_048_576} />);

    expect(
      screen.getByRole("meter", { name: "저장공간 사용량" }),
    ).toHaveAttribute("value", String(ACCOUNT_STORAGE_LIMIT_BYTES));
    expect(screen.getByText("75 MB / 50 MB")).toBeVisible();
  });
});
