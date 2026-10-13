type DazzMarkProps = {
  className?: string;
};

export function DazzMark({ className }: DazzMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 7.5h22a3.5 3.5 0 0 1 3.5 3.5v16a3.5 3.5 0 0 1-3.5 3.5H22l-7.5 5v-5H9A3.5 3.5 0 0 1 5.5 27V11A3.5 3.5 0 0 1 9 7.5Z"
        fill="currentColor"
      />
      <path
        d="M13 16v6M19 13v9M25 16v6"
        stroke="var(--mark-cutout)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
