import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "../SectionHeader";

describe("SectionHeader", () => {
  it("renders as h3 element", () => {
    render(<SectionHeader title="Appearance" />);

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toBeInTheDocument();
  });

  it("shows title in uppercase", () => {
    render(<SectionHeader title="Appearance" />);

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveClass("uppercase");
    expect(heading).toHaveTextContent("Appearance");
  });
});
