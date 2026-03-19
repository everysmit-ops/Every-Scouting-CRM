interface LogoProps {
  variant?: "full" | "icon" | "text";
  className?: string;
  size?: number;
  theme?: "light" | "dark" | "auto";
}

export function Logo({ variant = "full", className = "", size = 32, theme = "auto" }: LogoProps) {
  const getColors = () => {
    if (theme === "auto") {
      return {
        primary: "currentColor",
        secondary: "currentColor",
      };
    }
    if (theme === "dark") {
      return {
        primary: "#F8FAFC",
        secondary: "#CBD5E1",
      };
    }
    return {
      primary: "#0F172A",
      secondary: "#64748B",
    };
  };

  const colors = getColors();

  if (variant === "icon") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <path d="M16 4L11 12L16 10L21 12L16 4Z" fill={colors.primary} />
        <path
          d="M16 8V14M16 18V24M8 16H14M18 16H24"
          stroke={colors.primary}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2" fill={colors.primary} />
      </svg>
    );
  }

  if (variant === "text") {
    return (
      <svg
        width={size * 5.5}
        height={size}
        viewBox="0 0 176 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <text
          x="0"
          y="22"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="20"
          fontWeight="600"
          fill={colors.primary}
          letterSpacing="-0.02em"
        >
          Every
        </text>
        <text
          x="65"
          y="22"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="20"
          fontWeight="400"
          fill={colors.secondary}
          letterSpacing="-0.01em"
        >
          Scouting
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={size * 7.5}
      height={size}
      viewBox="0 0 240 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M16 3L12 9L16 7.5L20 9L16 3Z" fill={colors.primary} />
      <path
        d="M16 6V11M16 13.5V19M6 12.5H11M13.5 12.5H21"
        stroke={colors.primary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="12.5" r="1.5" fill={colors.primary} />
      <text
        x="44"
        y="21"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="18"
        fontWeight="600"
        fill={colors.primary}
        letterSpacing="-0.02em"
      >
        Every
      </text>
      <text
        x="103"
        y="21"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="18"
        fontWeight="400"
        fill={colors.secondary}
        letterSpacing="-0.01em"
      >
        Scouting
      </text>
    </svg>
  );
}
