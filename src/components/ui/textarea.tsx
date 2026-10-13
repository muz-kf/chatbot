import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-12 w-full resize-none bg-transparent text-[15px] leading-6 text-ink outline-none placeholder:text-stone-400 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
