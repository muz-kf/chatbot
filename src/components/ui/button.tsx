import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "icon";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:pointer-events-none disabled:opacity-45",
        variant === "default" && "bg-ink text-white hover:bg-black",
        variant === "ghost" && "text-stone-500 hover:bg-stone-100 hover:text-ink",
        variant === "outline" && "border border-stone-200 bg-white text-ink hover:bg-stone-50",
        size === "default" && "h-10 px-4",
        size === "icon" && "size-10",
        className,
      )}
      {...props}
    />
  );
}
