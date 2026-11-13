import { isValid, parseISO } from "date-fns";

export function birthdayInPeriod(birthDate: string, start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !isValid(parseISO(birthDate))) return false;

  const monthDay = birthDate.slice(5);
  const firstYear = Number(start.slice(0, 4)) + Number(monthDay < start.slice(5));
  const lastYear = Number(end.slice(0, 4)) - Number(monthDay > end.slice(5));
  if (monthDay !== "02-29") return firstYear <= lastYear;

  for (let year = Math.ceil(firstYear / 4) * 4; year <= lastYear; year += 4) {
    if (year % 100 !== 0 || year % 400 === 0) return true;
  }
  return false;
}
