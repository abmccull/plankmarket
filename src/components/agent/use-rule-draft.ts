"use client";

import { useState } from "react";

type RuleFields = Record<string, string | boolean>;
const same = (a: RuleFields, b: RuleFields) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Refresh clean forms without discarding local edits or drafts in other tabs. */
export function useRuleDraft<T extends RuleFields>(server: T) {
  const received = JSON.stringify(server);
  const [state, setState] = useState({
    received,
    saved: server,
    draft: server,
  });
  if (state.received !== received) {
    setState({
      received,
      saved: server,
      draft: same(state.draft, state.saved) ? server : state.draft,
    });
  }
  const setField = <K extends keyof T>(key: K, value: T[K]) =>
    setState((current) => ({
      ...current,
      draft: { ...current.draft, [key]: value },
    }));
  const confirm = (saved: T) =>
    setState((current) => ({ ...current, saved, draft: saved }));
  return {
    draft: state.draft,
    saved: state.saved,
    dirty: !same(state.draft, state.saved),
    setField,
    confirm,
  };
}
