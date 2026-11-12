import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingRow } from "../SettingRow";

describe("SettingRow", () => {
  it("renders label and description", () => {
    render(
      <SettingRow label="Dark mode" description="Enable dark color scheme">
        <button>Toggle</button>
      </SettingRow>,
    );

    expect(screen.getByText("Dark mode")).toBeInTheDocument();
    expect(screen.getByText("Enable dark color scheme")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <SettingRow label="Theme">
        <button>Toggle</button>
      </SettingRow>,
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("Toggle")).toBeInTheDocument();
  });
});
