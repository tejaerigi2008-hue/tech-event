import test from "node:test";
import assert from "node:assert/strict";
import { attendanceSummary, validateAttendanceCsv } from "../js/attendance.js";
import { createSeedData, finalizeRequest, readinessFor, reviewRequest, submitRequest } from "../js/data.js";

test("attendance eligibility includes exactly 75 percent", () => {
  assert.equal(attendanceSummary(3, 4, 75).eligible, true);
  assert.equal(attendanceSummary(4, 5, 75).eligible, true);
  assert.equal(attendanceSummary(2, 3, 75).eligible, false);
  assert.equal(attendanceSummary(9, 10, 75).percentage, 90);
});

test("attendance calculation rejects impossible records", () => {
  assert.throws(() => attendanceSummary(6, 5, 75), /valid counts/);
  assert.throws(() => attendanceSummary(2.5, 5, 75), /valid counts/);
  assert.throws(() => attendanceSummary(1, 2, 101), /valid counts/);
});

test("CSV accepts valid records and quoted values", () => {
  const result = validateAttendanceCsv('studentId,attendedClasses,totalClasses\n25EU02086,39,46\n"STU,24023",8,10', ["25EU02086", "STU,24023"]);
  assert.equal(result.valid, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].studentId, "STU,24023");
});

test("CSV reports missing columns, invalid counts, duplicates, and unknown IDs", () => {
  assert.match(validateAttendanceCsv("studentId,attendedClasses\n25EU02086,2").errors.join(" "), /Missing required column/);
  assert.match(validateAttendanceCsv("studentId,attendedClasses,totalClasses\n25EU02086,2.5,4").errors.join(" "), /whole numbers/);
  assert.match(validateAttendanceCsv("studentId,attendedClasses,totalClasses\n25EU02086,2,4\n25EU02086,3,4").errors.join(" "), /duplicate student ID/);
  assert.match(validateAttendanceCsv("studentId,attendedClasses,totalClasses\nSTU-99999,2,4", ["25EU02086"]).errors.join(" "), /does not exist/);
  assert.equal(validateAttendanceCsv("studentId,attendedClasses,totalClasses\n25EU02086,5,4").valid, false);
});

test("student can submit once and full approval history is recorded", () => {
  const data = createSeedData();
  const student = { id: "25EU02086", name: "Sat", role: "Student" };
  const request = submitRequest(data, student, "evt-data", { reason: "Build an accessible campus navigation prototype." });
  assert.equal(request.status, "Pending");
  assert.equal(request.history.length, 1);
  assert.throws(() => submitRequest(data, student, "evt-data", { reason: "A second request for the same event." }), /already have a request/);
  reviewRequest(data, { id: "faculty-1", name: "Jaya", role: "Proctor" }, request.id, "Recommended", "Attendance and event fit verified.");
  finalizeRequest(data, { id: "event-admin", name: "Tejaswini", role: "Event In-Charge" }, request.id, "Approved", "Approved for participation.");
  assert.equal(request.status, "Approved");
  assert.deepEqual(request.history.map((item) => item.status), ["Pending", "Recommended", "Approved"]);
  assert.equal(readinessFor(data, request).color, "green");
});

test("role and workflow guards reject unauthorized or incomplete decisions", () => {
  const data = createSeedData();
  assert.throws(() => submitRequest(data, { id: "STU-24042", name: "Diya", role: "Student" }, "evt-build", { reason: "I want to take part in the hackathon." }), /at least 75%/);
  assert.throws(() => reviewRequest(data, { id: "faculty-2", name: "Other", role: "Proctor" }, "req-1001", "Recommended", "Looks good"), /not assigned/);
  assert.throws(() => finalizeRequest(data, { id: "event-admin", name: "Tejaswini", role: "Event In-Charge" }, "req-1001", "Approved", "Approved"), /recommendation is required/);
  assert.throws(() => reviewRequest(data, { id: "faculty-1", name: "Jaya", role: "Proctor" }, "req-1001", "Rejected", "  "), /Remarks are required/);
  assert.throws(() => finalizeRequest(data, { id: "event-admin", name: "Tejaswini", role: "Event In-Charge" }, "req-1002", "Approved", ""), /remarks are required/);
});