import { useState } from "react";

interface GuardOfferProps {
  /** The phrase the user just banned. */
  phrase: string;
  /** Turns the Writing guard on. Rejects with the reason it failed. */
  onEnable: () => Promise<void>;
  onDismiss: () => void;
}

/**
 * Asked once, right after the first Hard rule, because that's when the
 * guard's job is concrete. It stays until answered: consent shouldn't time out.
 */
export function GuardOffer({ phrase, onEnable, onDismiss }: GuardOfferProps) {
  const [state, setState] = useState<
    { kind: "ask" | "saving" | "on" } | { kind: "error"; message: string }
  >({ kind: "ask" });

  const enable = async () => {
    setState({ kind: "saving" });
    try {
      await onEnable();
      setState({ kind: "on" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="guard-offer" role="status">
      {state.kind === "on" ? (
        <>
          <p className="guard-offer-text">
            Writing guard is on. Claude Code will be stopped from writing “{phrase}”.
          </p>
          <div className="guard-offer-actions">
            <button type="button" className="note-action-btn note-action-btn--primary" onClick={onDismiss}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="guard-offer-text">
            Margin will underline “{phrase}” wherever you read it. To stop Claude Code writing it too,
            turn on the Writing guard. It adds one file to <code>~/.claude/hooks</code>; you can turn it
            off in Settings → Integrations.
          </p>
          {state.kind === "error" && (
            <p className="guard-offer-error" role="alert">
              Couldn’t turn it on: {state.message}
            </p>
          )}
          <div className="guard-offer-actions">
            <button type="button" className="note-action-btn" onClick={onDismiss}>
              Not now
            </button>
            <button
              type="button"
              className="note-action-btn note-action-btn--primary"
              onClick={() => void enable()}
              disabled={state.kind === "saving"}
            >
              Turn on Writing guard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
