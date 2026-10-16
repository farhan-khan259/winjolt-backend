const { AppError } = require("./errors");

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new AppError(422, "INVALID_DOB", "Enter a valid date of birth.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AppError(422, "INVALID_DOB", "Enter a valid date of birth.");
  }
  return { year, month, day, date };
}

function londonToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function isAtLeast18(value, now) {
  const dob = parseIsoDate(value);
  const today = londonToday(now);
  if (dob.year > today.year || (dob.year === today.year && (dob.month > today.month || (dob.month === today.month && dob.day > today.day)))) {
    throw new AppError(422, "INVALID_DOB", "Enter a valid date of birth.");
  }
  const eighteenthYear = dob.year + 18;
  let anniversaryMonth = dob.month;
  let anniversaryDay = dob.day;
  // Approved default for a 29-Feb birthday in a non-leap year: eligibility on 1 March.
  if (dob.month === 2 && dob.day === 29 && new Date(Date.UTC(eighteenthYear, 1, 29)).getUTCMonth() !== 1) {
    anniversaryMonth = 3;
    anniversaryDay = 1;
  }
  return today.year > eighteenthYear || (today.year === eighteenthYear && (today.month > anniversaryMonth || (today.month === anniversaryMonth && today.day >= anniversaryDay)));
}

module.exports = { parseIsoDate, londonToday, isAtLeast18 };
