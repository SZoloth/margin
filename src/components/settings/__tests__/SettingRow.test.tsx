// @vitest-environment jsdom
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

  it("generates stable ID and passes aria-labelledby to children", () => {
    render(
      <SettingRow label="Dark mode">
        <button>Toggle</button>
      </SettingRow>,
    );

    const label = screen.getByText("Dark mode");
    expect(label).toHaveAttribute("id", "settings-dark-mode");

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-labelledby", "settings-dark-mode");
  });

  it("uses custom id prop for label ID", () => {
    render(
      <SettingRow label="Theme" id="custom-theme">
        <button>Toggle</button>
      </SettingRow>,
    );

    const label = screen.getByText("Theme");
    expect(label).toHaveAttribute("id", "settings-custom-theme");
  });
});
