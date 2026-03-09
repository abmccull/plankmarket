"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useProStatus } from "@/hooks/use-pro-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lock,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  StickyNote,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

interface BuyerNotesProps {
  buyerId: string;
}

const MAX_NOTE_LENGTH = 2000;

function formatTimestamp(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BuyerNotes({ buyerId }: BuyerNotesProps) {
  const { isPro, isLoading: proLoading } = useProStatus();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const utils = trpc.useUtils();

  const { data: notes, isLoading: notesLoading } =
    trpc.crm.getNotesForBuyer.useQuery(
      { buyerId },
      { enabled: isPro && !proLoading }
    );

  const addMutation = trpc.crm.addNote.useMutation({
    onSuccess: () => {
      utils.crm.getNotesForBuyer.invalidate({ buyerId });
      setNewNote("");
      setIsAdding(false);
      toast.success("Note added");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to add note"));
    },
  });

  const updateMutation = trpc.crm.updateNote.useMutation({
    onSuccess: () => {
      utils.crm.getNotesForBuyer.invalidate({ buyerId });
      setEditingId(null);
      setEditingText("");
      toast.success("Note updated");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to update note"));
    },
  });

  const deleteMutation = trpc.crm.deleteNote.useMutation({
    onSuccess: () => {
      utils.crm.getNotesForBuyer.invalidate({ buyerId });
      toast.success("Note deleted");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to delete note"));
    },
  });

  const handleAddNote = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    addMutation.mutate({ buyerId, note: trimmed });
  };

  const handleUpdateNote = (noteId: string) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    updateMutation.mutate({ noteId, note: trimmed });
  };

  const startEditing = (noteId: string, currentText: string) => {
    setEditingId(noteId);
    setEditingText(currentText);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText("");
  };

  if (proLoading) {
    return <Skeleton className="h-10 w-full rounded-md" />;
  }

  if (!isPro) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-xs">Notes (Pro)</span>
      </div>
    );
  }

  const noteCount = notes?.length ?? 0;

  return (
    <div className="space-y-2">
      {/* Header with toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        aria-expanded={isExpanded}
        aria-controls="buyer-notes-panel"
      >
        <div className="flex items-center gap-1.5">
          <StickyNote
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-muted-foreground">
            Notes{noteCount > 0 ? ` (${noteCount})` : ""}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {/* Panel content */}
      {isExpanded && (
        <div id="buyer-notes-panel" className="space-y-3 pl-1">
          {/* Add note button / form */}
          {isAdding ? (
            <div className="space-y-2">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Write a note about this buyer..."
                maxLength={MAX_NOTE_LENGTH}
                rows={3}
                className="text-sm"
                aria-label="New note"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {newNote.length}/{MAX_NOTE_LENGTH}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setIsAdding(false);
                      setNewNote("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addMutation.isPending}
                  >
                    {addMutation.isPending && (
                      <Loader2
                        className="mr-1 h-3 w-3 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
              Add note
            </Button>
          )}

          {/* Notes list */}
          {notesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : noteCount === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No notes yet for this buyer.
            </p>
          ) : (
            <div className="space-y-2">
              {notes?.map((note) => (
                <div
                  key={note.id}
                  className="rounded-md border bg-muted/30 p-2.5 text-sm"
                >
                  {editingId === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        maxLength={MAX_NOTE_LENGTH}
                        rows={3}
                        className="text-sm"
                        aria-label="Edit note"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {editingText.length}/{MAX_NOTE_LENGTH}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={cancelEditing}
                            aria-label="Cancel editing"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleUpdateNote(note.id)}
                            disabled={
                              !editingText.trim() || updateMutation.isPending
                            }
                            aria-label="Save changes"
                          >
                            {updateMutation.isPending ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">
                        {note.note}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <time
                          dateTime={new Date(note.createdAt).toISOString()}
                          className="text-[10px] text-muted-foreground"
                        >
                          {formatTimestamp(note.createdAt)}
                          {note.updatedAt &&
                            new Date(note.updatedAt).getTime() !==
                              new Date(note.createdAt).getTime() &&
                            " (edited)"}
                        </time>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => startEditing(note.id, note.note)}
                            aria-label="Edit note"
                          >
                            <Pencil
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={() =>
                              deleteMutation.mutate({ noteId: note.id })
                            }
                            disabled={deleteMutation.isPending}
                            aria-label="Delete note"
                          >
                            {deleteMutation.isPending ? (
                              <Loader2
                                className="h-3 w-3 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Trash2
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                            )}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
