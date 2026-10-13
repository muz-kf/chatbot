import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-12 w-full resize-none bg-transparent text-[15px] leading-6 text-ink outline-none placeholder:text-stone-400 disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
