/** 評価の星。0.5 刻みで塗り分け、数値も読み上げに残す */
export function Stars({
  rating,
  count,
  className = "",
}: {
  rating: number;
  /** レビュー件数。あれば星の右に出す */
  count?: number;
  className?: string;
}) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span aria-hidden="true" className="flex">
        {[1, 2, 3, 4, 5].map((position) => {
          const fill = Math.min(Math.max(rounded - position + 1, 0), 1);
          return (
            <svg key={position} viewBox="0 0 20 20" className="h-3.5 w-3.5">
              <defs>
                <linearGradient id={`star-${position}-${fill}`}>
                  <stop offset={`${fill * 100}%`} stopColor="var(--color-accent)" />
                  <stop offset={`${fill * 100}%`} stopColor="var(--color-line)" />
                </linearGradient>
              </defs>
              <path
                d="M10 1.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"
                fill={`url(#star-${position}-${fill})`}
              />
            </svg>
          );
        })}
      </span>
      <span className="tnum text-[12px] text-muted">
        {rating.toFixed(1)}
        {count !== undefined ? `(${count})` : ""}
      </span>
    </span>
  );
}
