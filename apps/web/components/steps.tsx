"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface Step {
  id: string;
  title: string;
  body: string;
  panel: ReactNode;
}

const ACTIVE_BAND = "-40% 0px -55% 0px";

const number = (index: number): string => String(index + 1).padStart(2, "0");

export const Steps = ({ steps }: { steps: readonly Step[] }) => {
  const [active, setActive] = useState(0);
  const panels = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const indexes = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = indexes.get(entry.target);
          if (entry.isIntersecting && index !== undefined) {
            setActive(index);
          }
        }
      },
      { rootMargin: ACTIVE_BAND }
    );
    for (const [index, panel] of panels.current.entries()) {
      if (panel) {
        indexes.set(panel, index);
        observer.observe(panel);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)]">
      <ol className="sticky top-28 hidden self-start lg:block">
        {steps.map((step, index) => {
          const current = index === active;
          return (
            <li key={step.id}>
              <a
                aria-current={current ? "step" : undefined}
                className="group relative block py-5 pl-6"
                href={`#${step.id}`}
              >
                <span
                  className={`absolute inset-y-5 left-0 w-0.5 rounded-full transition-colors duration-300 ${current ? "bg-gray-1000" : "bg-transparent"}`}
                />
                <span className="block font-mono text-xs text-gray-900">
                  {number(index)}
                </span>
                <span
                  className={`mt-2 block font-serif text-[1.75rem] leading-tight tracking-[-0.02em] transition-colors duration-300 ${current ? "text-gray-1000" : "text-gray-700 group-hover:text-gray-900"}`}
                >
                  {step.title}
                </span>
                <span
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${current ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <span className="overflow-hidden">
                    <span className="block max-w-sm pt-3 leading-relaxed text-gray-900">
                      {step.body}
                    </span>
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>

      <div className="space-y-14 lg:space-y-28">
        {steps.map((step, index) => (
          <div
            className="scroll-mt-28"
            id={step.id}
            key={step.id}
            ref={(node) => {
              panels.current[index] = node;
            }}
          >
            <div className="mb-6 lg:hidden">
              <span className="font-mono text-xs text-gray-900">
                {number(index)}
              </span>
              <h3 className="mt-2 font-serif text-[1.75rem] leading-tight tracking-[-0.02em]">
                {step.title}
              </h3>
              <p className="mt-3 leading-relaxed text-gray-900">{step.body}</p>
            </div>
            {step.panel}
          </div>
        ))}
      </div>
    </div>
  );
};
