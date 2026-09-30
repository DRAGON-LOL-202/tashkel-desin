import type { Season } from "../../types";

interface YearEventProps {
  season: Season;
  onClick: () => void;
}

function readableTextColor(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return "#ffffff";

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 155 ? "#10211d" : "#ffffff";
}

export function YearEvent({ season, onClick }: YearEventProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={`${season.title} | ${season.startDate} - ${season.endDate}`}
      className="h-5 w-full rounded-md px-1.5 text-[10px] font-semibold leading-5 truncate text-start shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/50"
      style={{ backgroundColor: season.color, color: readableTextColor(season.color) }}
    >
      {season.title}
    </button>
  );
}
