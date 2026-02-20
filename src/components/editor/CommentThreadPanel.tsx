import { useState, useEffect, useRef, useCallback } from "react";
import type { Comment, CommentThread } from "@/types/annotations";

interface CommentThreadPanelProps {
  threads: CommentThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onResolve: (threadId: string, resolved: boolean) => void;
  onDelete: (threadId: string) => void;
  onAddComment: (threadId: string, content: string) => Promise<void>;
  getComments: (threadId: string) => Promise<Comment[]>;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ThreadDetail({
  thread,
  onResolve,
  onDelete,
  onClose,
  onAddComment,
  getComments,
}: {
  thread: CommentThread;
  onResolve: (threadId: string, resolved: boolean) => void;
  onDelete: (threadId: string) => void;
  onClose: () => void;
  onAddComment: (threadId: string, content: string) => Promise<void>;
  getComments: (threadId: string) => Promise<Comment[]>;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async () => {
    setIsLoadingComments(true);
    const loaded = await getComments(thread.id);
    setComments(loaded);
    setIsLoadingComments(false);
  }, [thread.id, getComments]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleSubmit = async () => {
    const trimmed = newComment.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    await onAddComment(thread.id, trimmed);
    setNewComment("");
    await loadComments();
    setIsSubmitting(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h3 className="text-sm font-medium text-stone-800">Thread</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          aria-label="Close panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4L12 12M12 4L4 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Quoted text */}
      <div className="border-b border-stone-100 px-4 py-3">
        <blockquote className="border-l-2 border-stone-300 pl-3 text-sm italic text-stone-500">
          {thread.text_content.length > 120
            ? `${thread.text_content.slice(0, 120)}...`
            : thread.text_content}
        </blockquote>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onResolve(thread.id, !thread.resolved)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              thread.resolved
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {thread.resolved ? "Resolved" : "Resolve"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(thread.id)}
            className="rounded px-2 py-0.5 text-xs text-stone-400 transition-colors hover:text-red-500"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {isLoadingComments ? (
          <div className="py-8 text-center text-sm text-stone-400">
            Loading...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-stone-400">
            No comments yet. Start the conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg bg-stone-50 px-3 py-2"
              >
                <p className="text-sm text-stone-700">{comment.content}</p>
                <span className="mt-1 block text-xs text-stone-400">
                  {formatTimestamp(comment.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Add comment input */}
      <div className="border-t border-stone-200 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment..."
            className="flex-1 resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 placeholder:text-stone-400 focus:border-stone-300 focus:outline-none"
            rows={2}
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!newComment.trim() || isSubmitting}
            className="self-end rounded-lg bg-stone-800 px-3 py-2 text-sm text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-400">
          {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to send
        </p>
      </div>
    </div>
  );
}

export function CommentThreadPanel({
  threads,
  activeThreadId,
  onSelectThread,
  onResolve,
  onDelete,
  onAddComment,
  getComments,
}: CommentThreadPanelProps) {
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!activeThreadId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSelectThread(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeThreadId, onSelectThread]);

  if (!activeThreadId || !activeThread) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/5"
        onClick={() => onSelectThread(null)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-40 flex h-full flex-col border-l border-stone-200 bg-white shadow-xl"
        style={{ width: 320 }}
      >
        <ThreadDetail
          thread={activeThread}
          onResolve={onResolve}
          onDelete={(id) => {
            onDelete(id);
            onSelectThread(null);
          }}
          onClose={() => onSelectThread(null)}
          onAddComment={onAddComment}
          getComments={getComments}
        />
      </div>
    </>
  );
}
