export function attendanceSummary(attended, total, threshold = 75) {
  const attendedCount = Number(attended);
  const totalCount = Number(total);
  const cutoff = Number(threshold);
  if (!Number.isInteger(attendedCount) || !Number.isInteger(totalCount) || !Number.isInteger(cutoff) || attendedCount < 0 || totalCount < 0 || attendedCount > totalCount || cutoff < 0 || cutoff > 100) {
    throw new Error("Attendance values must be valid counts and the threshold must be between 0 and 100%.");
  }
  const percentage = totalCount === 0 ? 0 : (attendedCount / totalCount) * 100;
  return { attended: attendedCount, total: totalCount, percentage, threshold: cutoff, eligible: totalCount > 0 && percentage >= cutoff };
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function validateAttendanceCsv(text, knownStudentIds = []) {
  const errors = [];
  let rows;
  try { rows = parseCsvRows(String(text ?? "").replace(/^\uFEFF/, "")); }
  catch (error) { return { valid: false, rows: [], errors: [error.message] }; }
  if (!rows.length) return { valid: false, rows: [], errors: ["The CSV file is empty."] };
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[\s_-]/g, ""));
  const aliases = { studentid: ["studentid", "id"], attendedclasses: ["attendedclasses", "attended"], totalclasses: ["totalclasses", "total"] };
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex((header) => names.includes(header))]));
  const missing = Object.entries(columns).filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length) {
    const labels = { studentid: "studentId", attendedclasses: "attendedClasses", totalclasses: "totalClasses" };
    return { valid: false, rows: [], errors: [`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((name) => labels[name]).join(", ")}.`] };
  }
  const known = new Set(knownStudentIds.map((id) => String(id).trim().toUpperCase()));
  const seen = new Set();
  const accepted = [];
  rows.slice(1).forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const studentId = (cells[columns.studentid] ?? "").trim();
    const attendedText = (cells[columns.attendedclasses] ?? "").trim();
    const totalText = (cells[columns.totalclasses] ?? "").trim();
    if (!studentId) { errors.push(`Row ${line}: studentId is required.`); return; }
    const key = studentId.toUpperCase();
    if (seen.has(key)) { errors.push(`Row ${line}: duplicate student ID ${studentId}.`); return; }
    seen.add(key);
    if (known.size && !known.has(key)) { errors.push(`Row ${line}: student ID ${studentId} does not exist in the student records.`); return; }
    if (!/^\d+$/.test(attendedText) || !/^\d+$/.test(totalText)) { errors.push(`Row ${line}: attendedClasses and totalClasses must be whole numbers.`); return; }
    const attendedClasses = Number(attendedText);
    const totalClasses = Number(totalText);
    if (totalClasses < 1 || attendedClasses > totalClasses) { errors.push(`Row ${line}: use totalClasses greater than zero and attendedClasses no greater than totalClasses.`); return; }
    accepted.push({ studentId, attendedClasses, totalClasses });
  });
  if (rows.length === 1) errors.push("The CSV has headers but no attendance records.");
  return { valid: errors.length === 0, rows: errors.length ? [] : accepted, errors };
}