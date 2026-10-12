"use client";

import { useEffect, useState } from "react";

import { CheckIcon, CopyIcon } from "./icons";

const COPIED_MS = 2000;

/** A shell command with a button that copies it. */
export const CopyCommand = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Without clipboard access, the command is still there to select.
    }
  };

  return (
    <div className="bg-gray-1000 text-background-100 inline-flex h-12 max-w-full items-center gap-3 rounded-full pr-1.5 pl-5 font-mono text-sm shadow-[0_8px_24px_-8px_var(--ds-shadow-200)]">
      <span aria-hidden className="text-gray-600 select-none">
        $
      </span>
      <code className="truncate">{command}</code>
      <button
        aria-label={copied ? "Copied" : `Copy ${command}`}
        className="hover:bg-background-100/15 hover:text-background-100 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-gray-500 transition-colors duration-150 active:scale-95"
        onClick={copy}
        type="button"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
};
