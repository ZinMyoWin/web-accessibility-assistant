interface ScoreRingProps {
  score: number | null
  size?: number
}

export function ScoreRing({ score, size = 110 }: ScoreRingProps) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={(size - 8) / 2}
              fill="none"
              stroke="var(--border-light)"
              strokeWidth={8}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-muted-foreground">-</span>
            <span className="text-[10px] text-muted-foreground">score pending</span>
          </div>
        </div>
        <span className="mt-2 text-[11px] font-medium text-muted-foreground">
          Accessibility Score
        </span>
      </div>
    )
  }

  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color = score >= 80 ? "var(--primary)" : score >= 50 ? "var(--medium)" : "var(--high)"

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-light)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {score}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="mt-2 text-[11px] font-medium text-muted-foreground">
        Accessibility Score
      </span>
    </div>
  )
}
