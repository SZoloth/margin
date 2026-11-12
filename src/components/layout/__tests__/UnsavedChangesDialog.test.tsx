import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog";

describe("UnsavedChangesDialog", () => {
  it("renders as a modal dialog", () => {
    render(
      <UnsavedChangesDialog
        title="notes.md"
        isVisible
        onCancel={() => {}}
        onCloseWithoutSaving={() => {}}
        onSaveAndClose={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain('"notes.md" has unsaved changes');
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog
        title="notes.md"
        isVisible
        onCancel={onCancel}
        onCloseWithoutSaving={() => {}}
        onSaveAndClose={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the primary action and restores it on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <UnsavedChangesDialog
        title="notes.md"
        isVisible
        onCancel={() => {}}
        onCloseWithoutSaving={() => {}}
        onSaveAndClose={() => {}}
      />,
    );
    expect(document.activeElement?.textContent).toBe("Save and close");

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("traps Tab within the dialog", () => {
    render(
      <UnsavedChangesDialog
        title="notes.md"
        isVisible
        onCancel={() => {}}
        onCloseWithoutSaving={() => {}}
        onSaveAndClose={() => {}}
      />,
    );
    // Focus starts on "Save and close" (last button in DOM order is the close
    // button's sibling — tab order is: close ×, Close without saving, Save)
    const saveButton = screen.getByText("Save and close");
    expect(document.activeElement).toBe(saveButton);

    // Tab from the last focusable element wraps to the first
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Close"));

    // Shift+Tab from the first wraps back to the last
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(saveButton);
  });
});
