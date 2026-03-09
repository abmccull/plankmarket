"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { useProStatus } from "@/hooks/use-pro-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Plus, X, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

interface BuyerTagsProps {
  buyerId: string;
}

const TAG_REGEX = /^[a-zA-Z0-9\s\-_]+$/;
const MAX_TAG_LENGTH = 50;

export function BuyerTags({ buyerId }: BuyerTagsProps) {
  const { isPro, isLoading: proLoading } = useProStatus();
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);

  const utils = trpc.useUtils();

  const { data: tags, isLoading: tagsLoading } =
    trpc.crm.getTagsForBuyer.useQuery(
      { buyerId },
      { enabled: isPro && !proLoading }
    );

  const { data: allTags } = trpc.crm.getAllTags.useQuery(undefined, {
    enabled: isPro && isAdding,
  });

  const addMutation = trpc.crm.addTag.useMutation({
    onSuccess: () => {
      utils.crm.getTagsForBuyer.invalidate({ buyerId });
      utils.crm.getAllTags.invalidate();
      setInputValue("");
      setIsAdding(false);
      toast.success("Tag added");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to add tag"));
    },
  });

  const removeMutation = trpc.crm.removeTag.useMutation({
    onSuccess: () => {
      utils.crm.getTagsForBuyer.invalidate({ buyerId });
      toast.success("Tag removed");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to remove tag"));
    },
  });

  // Filter suggestions based on input, excluding already-applied tags
  const suggestions = useMemo(() => {
    if (!allTags || !inputValue.trim()) return [];
    const existingTagNames = new Set(tags?.map((t) => t.tag) ?? []);
    const query = inputValue.trim().toLowerCase();
    return allTags.filter(
      (t) => t.includes(query) && !existingTagNames.has(t)
    );
  }, [allTags, inputValue, tags]);

  // Focus input when adding mode activates
  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddTag = (tagName: string) => {
    const trimmed = tagName.trim().toLowerCase();
    if (!trimmed) return;

    if (!TAG_REGEX.test(trimmed)) {
      toast.error(
        "Tags can only contain letters, numbers, spaces, hyphens, or underscores"
      );
      return;
    }

    addMutation.mutate({ buyerId, tag: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag(inputValue);
    }
    if (e.key === "Escape") {
      setIsAdding(false);
      setInputValue("");
    }
  };

  if (proLoading) {
    return <Skeleton className="h-8 w-32 rounded-md" />;
  }

  if (!isPro) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-xs">Tags (Pro)</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium text-muted-foreground">Tags</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tagsLoading ? (
          <>
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </>
        ) : (
          <>
            {tags?.map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="gap-1 pr-1 text-xs"
              >
                {tag.tag}
                <button
                  type="button"
                  onClick={() => removeMutation.mutate({ tagId: tag.id })}
                  disabled={removeMutation.isPending}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  aria-label={`Remove tag "${tag.tag}"`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}

            {tags?.length === 0 && !isAdding && (
              <span className="text-xs text-muted-foreground">No tags yet</span>
            )}
          </>
        )}

        {isAdding ? (
          <div className="relative">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay to allow suggestion click
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              placeholder="Type a tag..."
              maxLength={MAX_TAG_LENGTH}
              className="h-7 w-32 text-xs"
              aria-label="New tag name"
              disabled={addMutation.isPending}
            />
            {addMutation.isPending && (
              <Loader2
                className="absolute right-2 top-1.5 h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            )}

            {showSuggestions && suggestions.length > 0 && (
              <ul
                ref={suggestionsRef}
                role="listbox"
                aria-label="Tag suggestions"
                className="absolute left-0 top-full z-50 mt-1 max-h-32 w-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {suggestions.map((s) => (
                  <li
                    key={s}
                    role="option"
                    aria-selected={false}
                    className="cursor-pointer rounded-sm px-2 py-1 text-xs hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAddTag(s);
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add tag
          </Button>
        )}
      </div>
    </div>
  );
}
