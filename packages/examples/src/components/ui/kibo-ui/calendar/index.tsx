"use client";

// Vendored from Kibo UI (https://www.kibo-ui.com/components/calendar), MIT-licensed, copy-in by
// design. Trimmed for this demo: the month/year combobox pickers (which pull cmdk/command) are
// dropped in favour of a plain prev/next pager + label, and CalendarBody gains a configurable
// per-day cap and a click-to-expand callback so a gym schedule can surface class times instead of
// the upstream "dot + name, max 3/day" overview. The jotai month/year core is kept as upstream.

import { getDay, getDaysInMonth, isSameDay } from "date-fns";
import { atom, useAtom } from "jotai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createContext,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { Button } from "../../button";
import { cn } from "@open-deltat/shared/utils";

export type CalendarState = {
  month: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  year: number;
};

const monthAtom = atom<CalendarState["month"]>(
  new Date().getMonth() as CalendarState["month"]
);
const yearAtom = atom<CalendarState["year"]>(new Date().getFullYear());

export const useCalendarMonth = () => useAtom(monthAtom);
export const useCalendarYear = () => useAtom(yearAtom);

type CalendarContextProps = {
  locale: Intl.LocalesArgument;
  startDay: number;
};

const CalendarContext = createContext<CalendarContextProps>({
  locale: "en-US",
  startDay: 0,
});

export type Status = {
  id: string;
  name: string;
  color: string;
};

export type Feature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: Status;
};

export const monthsForLocale = (
  localeName: Intl.LocalesArgument,
  monthFormat: Intl.DateTimeFormatOptions["month"] = "long"
) => {
  const format = new Intl.DateTimeFormat(localeName, { month: monthFormat })
    .format;

  return [...new Array(12).keys()].map((m) =>
    format(new Date(Date.UTC(2021, m, 2)))
  );
};

export const daysForLocale = (locale: Intl.LocalesArgument, startDay: number) => {
  const weekdays: string[] = [];
  const baseDate = new Date(2024, 0, startDay);

  for (let i = 0; i < 7; i++) {
    weekdays.push(
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(baseDate)
    );
    baseDate.setDate(baseDate.getDate() + 1);
  }

  return weekdays;
};

type OutOfBoundsDayProps = {
  day: number;
};

const OutOfBoundsDay = ({ day }: OutOfBoundsDayProps) => (
  <div className="relative h-full w-full bg-white/[0.015] p-1 text-right text-[11px] text-zinc-600">
    {day}
  </div>
);

export type CalendarBodyProps = {
  features: Feature[];
  children: (props: { feature: Feature }) => ReactNode;
  /** How many features to show in a day cell before collapsing to "+N more". */
  max?: number;
  /** Clicking a day with features invokes this with that day's date and its features. */
  onSelectDay?: (date: Date, features: Feature[]) => void;
};

export const CalendarBody = ({
  features,
  children,
  max = 3,
  onSelectDay,
}: CalendarBodyProps) => {
  const [month] = useCalendarMonth();
  const [year] = useCalendarYear();
  const { startDay } = useContext(CalendarContext);

  const currentMonthDate = useMemo(() => new Date(year, month, 1), [year, month]);
  const daysInMonth = useMemo(
    () => getDaysInMonth(currentMonthDate),
    [currentMonthDate]
  );
  const firstDay = useMemo(
    () => (getDay(currentMonthDate) - startDay + 7) % 7,
    [currentMonthDate, startDay]
  );

  const prevMonthData = useMemo(() => {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevMonthYear = month === 0 ? year - 1 : year;
    const prevMonthDays = getDaysInMonth(new Date(prevMonthYear, prevMonth, 1));
    const prevMonthDaysArray = Array.from(
      { length: prevMonthDays },
      (_, i) => i + 1
    );
    return { prevMonthDays, prevMonthDaysArray };
  }, [month, year]);

  const nextMonthData = useMemo(() => {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextMonthYear = month === 11 ? year + 1 : year;
    const nextMonthDays = getDaysInMonth(new Date(nextMonthYear, nextMonth, 1));
    const nextMonthDaysArray = Array.from(
      { length: nextMonthDays },
      (_, i) => i + 1
    );
    return { nextMonthDaysArray };
  }, [month, year]);

  const featuresByDay = useMemo(() => {
    const result: { [day: number]: Feature[] } = {};
    for (let day = 1; day <= daysInMonth; day++) {
      result[day] = features
        .filter((feature) =>
          isSameDay(new Date(feature.startAt), new Date(year, month, day))
        )
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    }
    return result;
  }, [features, daysInMonth, year, month]);

  const days: ReactNode[] = [];

  for (let i = 0; i < firstDay; i++) {
    const day =
      prevMonthData.prevMonthDaysArray[prevMonthData.prevMonthDays - firstDay + i];

    if (day) {
      days.push(<OutOfBoundsDay day={day} key={`prev-${i}`} />);
    }
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const featuresForDay = featuresByDay[day] || [];
    const hasFeatures = featuresForDay.length > 0;
    const clickable = hasFeatures && Boolean(onSelectDay);
    const cellClass = "relative flex h-full w-full flex-col gap-1 p-1.5 text-left text-xs";

    const content = (
      <>
        <span className="text-right text-[11px] text-zinc-500">{day}</span>
        <div className="flex flex-col gap-1">
          {featuresForDay.slice(0, max).map((feature) => children({ feature }))}
        </div>
        {featuresForDay.length > max && (
          <span className="mt-auto block text-[10px] text-emerald-300/80">
            +{featuresForDay.length - max} more
          </span>
        )}
      </>
    );

    // A clickable day is a real <button> so it is focusable and Enter/Space-activatable; a day with
    // nothing to open stays a plain div.
    days.push(
      clickable ? (
        <button
          type="button"
          key={day}
          aria-label={`${featuresForDay.length} ${featuresForDay.length === 1 ? "item" : "items"} on day ${day}`}
          onClick={() => onSelectDay?.(new Date(year, month, day), featuresForDay)}
          className={cn(
            cellClass,
            "cursor-pointer transition-colors hover:bg-emerald-400/[0.07] focus:outline-none focus-visible:bg-emerald-400/[0.07]"
          )}
        >
          {content}
        </button>
      ) : (
        <div className={cellClass} key={day}>
          {content}
        </div>
      )
    );
  }

  const remainingDays = 7 - ((firstDay + daysInMonth) % 7);
  if (remainingDays < 7) {
    for (let i = 0; i < remainingDays; i++) {
      const day = nextMonthData.nextMonthDaysArray[i];

      if (day) {
        days.push(<OutOfBoundsDay day={day} key={`next-${i}`} />);
      }
    }
  }

  return (
    <div className="grid flex-grow grid-cols-7">
      {days.map((day, index) => (
        <div
          className={cn(
            "relative min-h-[5.5rem] overflow-hidden border-t border-r border-white/[0.06]",
            index % 7 === 6 && "border-r-0"
          )}
          key={index}
        >
          {day}
        </div>
      ))}
    </div>
  );
};

export type CalendarDatePaginationProps = {
  className?: string;
  /** Clamp navigation to this inclusive [min, max] month window (first-of-month dates). */
  min?: Date;
  max?: Date;
};

export const CalendarDatePagination = ({
  className,
  min,
  max,
}: CalendarDatePaginationProps) => {
  const [month, setMonth] = useCalendarMonth();
  const [year, setYear] = useCalendarYear();

  const atMin = min ? year === min.getFullYear() && month === min.getMonth() : false;
  const atMax = max ? year === max.getFullYear() && month === max.getMonth() : false;

  const handlePreviousMonth = useCallback(() => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth((month - 1) as CalendarState["month"]);
    }
  }, [month, year, setMonth, setYear]);

  const handleNextMonth = useCallback(() => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth((month + 1) as CalendarState["month"]);
    }
  }, [month, year, setMonth, setYear]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        disabled={atMin}
        onClick={handlePreviousMonth}
        size="icon"
        variant="ghost"
      >
        <ChevronLeftIcon size={16} />
      </Button>
      <Button
        disabled={atMax}
        onClick={handleNextMonth}
        size="icon"
        variant="ghost"
      >
        <ChevronRightIcon size={16} />
      </Button>
    </div>
  );
};

export type CalendarLabelProps = {
  className?: string;
};

/** The "June 2026" heading. Replaces the upstream month/year combobox pickers. */
export const CalendarLabel = ({ className }: CalendarLabelProps) => {
  const [month] = useCalendarMonth();
  const [year] = useCalendarYear();
  const { locale } = useContext(CalendarContext);

  const label = useMemo(
    () => `${monthsForLocale(locale)[month]} ${year}`,
    [locale, month, year]
  );

  return <span className={cn("text-sm font-medium text-zinc-200", className)}>{label}</span>;
};

export type CalendarDateProps = {
  children: ReactNode;
};

export const CalendarDate = ({ children }: CalendarDateProps) => (
  <div className="flex items-center justify-between pb-3">{children}</div>
);

export type CalendarHeaderProps = {
  className?: string;
};

export const CalendarHeader = ({ className }: CalendarHeaderProps) => {
  const { locale, startDay } = useContext(CalendarContext);

  const daysData = useMemo(() => daysForLocale(locale, startDay), [locale, startDay]);

  return (
    <div className={cn("grid flex-grow grid-cols-7", className)}>
      {daysData.map((day) => (
        <div
          className="p-2 text-right text-[10px] uppercase tracking-wider text-zinc-500"
          key={day}
        >
          {day}
        </div>
      ))}
    </div>
  );
};

export type CalendarItemProps = {
  feature: Feature;
  className?: string;
};

export const CalendarItem = memo(({ feature, className }: CalendarItemProps) => (
  <div className={cn("flex items-center gap-1.5", className)}>
    <div
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: feature.status.color }}
    />
    <span className="truncate text-zinc-300">{feature.name}</span>
  </div>
));

CalendarItem.displayName = "CalendarItem";

export type CalendarProviderProps = {
  locale?: Intl.LocalesArgument;
  startDay?: number;
  children: ReactNode;
  className?: string;
};

export const CalendarProvider = ({
  locale = "en-US",
  startDay = 0,
  children,
  className,
}: CalendarProviderProps) => (
  <CalendarContext.Provider value={{ locale, startDay }}>
    <div className={cn("relative flex flex-col", className)}>{children}</div>
  </CalendarContext.Provider>
);
