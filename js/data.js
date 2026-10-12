import { attendanceSummary } from "./attendance.js";

const STORAGE_KEY = "techeventpass-demo-v1";
const today = new Date();
const future = (days) => { const date = new Date(today); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const past = (days) => { const date = new Date(today); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10); };

export function createSeedData() {
  const students = [
    { id: "25EU02086", name: "Sat", email: "sat@demo.edu", department: "Computer Science", year: "2nd Year", section: "A", proctorId: "faculty-1", attendedClasses: 39, totalClasses: 46 },
    { id: "STU-24023", name: "Meera Iyer", email: "meera@demo.edu", department: "Computer Science", year: "2nd Year", section: "A", proctorId: "faculty-1", attendedClasses: 35, totalClasses: 46 },
    { id: "STU-24031", name: "Ishaan Reddy", email: "ishaan@demo.edu", department: "Electronics", year: "3rd Year", section: "B", proctorId: "faculty-1", attendedClasses: 43, totalClasses: 48 },
    { id: "STU-24042", name: "Diya Nair", email: "diya@demo.edu", department: "Information Technology", year: "2nd Year", section: "A", proctorId: "faculty-2", attendedClasses: 31, totalClasses: 46 },
    { id: "STU-24056", name: "Kabir Rao", email: "kabir@demo.edu", department: "Computer Science", year: "4th Year", section: "A", proctorId: "faculty-1", attendedClasses: 41, totalClasses: 46 }
  ];
  const events = [
    { id: "evt-build", title: "Build / Break / Repeat", category: "HACKATHON", date: future(19), venue: "Innovation Hub · Block C", deadline: future(11), description: "A 24-hour campus build sprint for teams who like turning ambitious ideas into working prototypes.", organizer: "CSE Student Chapter", active: true },
    { id: "evt-circuit", title: "CircuitVerse 2026", category: "TECHNICAL FEST", date: future(32), venue: "Main Auditorium", deadline: future(23), description: "Two days of embedded systems, robotics and hardware challenges with industry mentors.", organizer: "IEEE Student Branch", active: true },
    { id: "evt-open", title: "Open Source Connect", category: "WORKSHOP", date: future(43), venue: "Seminar Hall 2", deadline: future(35), description: "A practical introduction to contributing to open source projects and building in public.", organizer: "Developer Society", active: true },
    { id: "evt-data", title: "Data for Good Lab", category: "WORKSHOP", date: future(55), venue: "Computing Lab 4", deadline: future(48), description: "Explore responsible data science through a community-focused project sprint.", organizer: "AI & Data Club", active: true }
  ];
  const requests = [
    { id: "req-1001", studentId: "25EU02086", eventId: "evt-build", reason: "I would like to prototype an accessibility tool with my project team.", documentRef: "", status: "Pending", createdAt: past(1), updatedAt: past(1), proctorRemarks: "", finalRemarks: "", history: [{ status: "Pending", actor: "Sat", role: "Student", remarks: "Request submitted", at: past(1) }] },
    { id: "req-1002", studentId: "STU-24023", eventId: "evt-circuit", reason: "I am presenting a sensor-network project and would benefit from the hardware track.", documentRef: "Team invitation email", status: "Recommended", createdAt: past(2), updatedAt: past(1), proctorRemarks: "Attendance verified. The project is relevant to the event.", finalRemarks: "", history: [{ status: "Pending", actor: "Meera Iyer", role: "Student", remarks: "Request submitted", at: past(2) }, { status: "Recommended", actor: "Jaya", role: "Proctor", remarks: "Attendance verified. The project is relevant to the event.", at: past(1) }] },
    { id: "req-1003", studentId: "STU-24031", eventId: "evt-open", reason: "I want to learn how to contribute documentation and testing fixes.", documentRef: "", status: "Approved", createdAt: past(5), updatedAt: past(3), proctorRemarks: "Good academic fit.", finalRemarks: "Approved. Please share your learning notes with the department.", history: [{ status: "Pending", actor: "Ishaan Reddy", role: "Student", remarks: "Request submitted", at: past(5) }, { status: "Recommended", actor: "Jaya", role: "Proctor", remarks: "Good academic fit.", at: past(4) }, { status: "Approved", actor: "Tejaswini", role: "Event In-Charge", remarks: "Approved. Please share your learning notes with the department.", at: past(3) }] },
    { id: "req-1004", studentId: "STU-24042", eventId: "evt-data", reason: "I am interested in applied machine learning for community projects.", documentRef: "", status: "Pending", createdAt: past(1), updatedAt: past(1), proctorRemarks: "", finalRemarks: "", history: [{ status: "Pending", actor: "Diya Nair", role: "Student", remarks: "Request submitted", at: past(1) }] }
  ];
  return { threshold: 75, students, events, requests, notifications: [], currentUserId: "25EU02086" };
}

function migrateDemoData(data) {
  const previousId = "STU-24017";
  const previousStudent = data.students?.find((student) => student.id === previousId);
  if (!previousStudent) return false;
  const previousName = previousStudent.name;
  previousStudent.id = "25EU02086";
  previousStudent.name = "Sat";
  previousStudent.email = "sat@demo.edu";
  data.requests?.forEach((request) => {
    if (request.studentId === previousId) request.studentId = previousStudent.id;
    request.history?.forEach((entry) => {
      if (entry.actor === previousName) entry.actor = "Sat";
      if (entry.role === "Proctor" && entry.actor === "Dr. Nisha Rao") entry.actor = "Jaya";
      if (entry.role === "Event In-Charge" && entry.actor === "Event In-Charge") entry.actor = "Tejaswini";
    });
  });
  data.notifications?.forEach((notification) => {
    if (notification.studentId === previousId) notification.studentId = previousStudent.id;
  });
  if (data.currentUserId === previousId) data.currentUserId = previousStudent.id;
  return true;
}

export function loadDemoData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (migrateDemoData(data)) saveDemoData(data);
      return { data, isDemo: true };
    }
  } catch { /* Use a clean in-memory seed if local storage is unavailable. */ }
  return { data: createSeedData(), isDemo: true };
}

export function saveDemoData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function getStudent(data, studentId) { return data.students.find((student) => student.id === studentId); }
export function getEvent(data, eventId) { return data.events.find((event) => event.id === eventId); }
export function attendanceFor(data, student) { return attendanceSummary(student.attendedClasses, student.totalClasses, data.threshold); }
export function requestsForStudent(data, studentId) { return data.requests.filter((request) => request.studentId === studentId); }

export function readinessFor(data, request) {
  const student = getStudent(data, request.studentId);
  const event = getEvent(data, request.eventId);
  const attendance = student ? attendanceFor(data, student) : null;
  const reasons = [];
  if (!student) reasons.push("Student record is missing.");
  else if (!attendance.eligible) reasons.push(`Attendance is ${attendance.percentage.toFixed(1)}%; the minimum is ${data.threshold}%.`);
  if (!event) reasons.push("Event record is missing.");
  if (!request.reason?.trim()) reasons.push("Participation reason is missing.");
  if (event && new Date(`${event.deadline}T23:59:59`) < new Date(request.createdAt)) reasons.push("The request was submitted after the event deadline.");
  if (request.status === "Rejected") reasons.push(request.finalRemarks || request.proctorRemarks || "The request was rejected.");
  const hardStop = !student || !event || (attendance && !attendance.eligible) || (event && new Date(`${event.deadline}T23:59:59`) < new Date(request.createdAt)) || request.status === "Rejected";
  const complete = reasons.length === 0;
  const approved = request.status === "Approved";
  const color = hardStop ? "red" : complete && approved ? "green" : "yellow";
  let nextAction = "No further action is required.";
  if (hardStop) nextAction = !attendance?.eligible ? "Student: improve attendance before submitting another request." : "Contact the proctor or event in-charge for guidance.";
  else if (request.status === "Pending") nextAction = "Proctor: review attendance and add a recommendation.";
  else if (request.status === "Recommended") nextAction = "Event in-charge: record the final decision.";
  else if (!complete) nextAction = "Student: complete the missing request information.";
  const label = color === "green" ? "READY · APPROVED" : color === "red" ? "ACTION NEEDED" : "IN REVIEW";
  return { color, label, reasons: reasons.length ? reasons : ["Attendance eligible", "Required information is complete", "Submitted before the deadline", approved ? "Final approval recorded" : `Approval progress: ${request.status}`], nextAction, attendance, event, student };
}

function addHistory(request, status, actor, role, remarks, actorId) {
  const at = new Date().toISOString();
  request.status = status; request.updatedAt = at; request.updatedAtMs = Date.now();
  request.history.push({ status, actor, actorUid: actorId, role, remarks, at });
}

export function submitRequest(data, actor, eventId, details) {
  if (actor.role !== "Student") throw new Error("Only students can submit permission requests.");
  const student = getStudent(data, actor.id);
  const event = getEvent(data, eventId);
  if (!student || !event || !event.active) throw new Error("This student or event is unavailable.");
  if (!attendanceFor(data, student).eligible) throw new Error(`Request blocked: attendance must be at least ${data.threshold}%.`);
  if (new Date(`${event.deadline}T23:59:59`) < new Date()) throw new Error("The registration deadline has passed.");
  if (data.requests.some((request) => request.studentId === student.id && request.eventId === eventId)) throw new Error("You already have a request for this event.");
  const reason = String(details.reason ?? "").trim();
  if (reason.length < 10) throw new Error("Please provide a reason of at least 10 characters.");
  const request = { id: `req-${Date.now()}`, studentId: student.id, eventId, reason, documentRef: String(details.documentRef ?? "").trim(), status: "Pending", createdAt: new Date().toISOString(), createdAtMs: Date.now(), updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), proctorRemarks: "", finalRemarks: "", history: [] };
  addHistory(request, "Pending", actor.name, actor.role, "Request submitted", actor.id);
  data.requests.unshift(request);
  data.notifications.unshift({ id: `note-${Date.now()}`, studentId: student.id, message: `Your request for ${event.title} is now with your proctor.`, at: request.updatedAt, read: false });
  return request;
}

export function reviewRequest(data, actor, requestId, decision, remarks) {
  if (actor.role !== "Proctor") throw new Error("Only an assigned proctor can review requests.");
  const request = data.requests.find((item) => item.id === requestId);
  const student = request && getStudent(data, request.studentId);
  if (!request || !student || student.proctorId !== actor.id) throw new Error("This request is not assigned to you.");
  if (request.status !== "Pending") throw new Error("Only pending requests can receive a proctor recommendation.");
  const text = String(remarks ?? "").trim();
  if (decision === "Rejected" && !text) throw new Error("Remarks are required when rejecting a request.");
  if (!["Recommended", "Rejected"].includes(decision)) throw new Error("Choose recommend or reject.");
  request.proctorRemarks = text;
  addHistory(request, decision, actor.name, actor.role, text || "Proctor recommendation recorded", actor.id);
  data.notifications.unshift({ id: `note-${Date.now()}`, studentId: student.id, message: `Your request is ${decision.toLowerCase()} by your proctor.`, at: request.updatedAt, read: false });
  return request;
}

export function finalizeRequest(data, actor, requestId, decision, remarks) {
  if (actor.role !== "Event In-Charge") throw new Error("Only an event in-charge can record a final decision.");
  const request = data.requests.find((item) => item.id === requestId);
  if (!request) throw new Error("Request not found.");
  if (request.status !== "Recommended") throw new Error("A proctor recommendation is required before the final decision.");
  const text = String(remarks ?? "").trim();
  if (!text) throw new Error("Final decision remarks are required.");
  if (!["Approved", "Rejected"].includes(decision)) throw new Error("Choose approve or reject.");
  request.finalRemarks = text;
  addHistory(request, decision, actor.name, actor.role, text, actor.id);
  data.notifications.unshift({ id: `note-${Date.now()}`, studentId: request.studentId, message: `Your request received a final decision: ${decision}.`, at: request.updatedAt, read: false });
  return request;
}

export function importAttendance(data, rows) {
  const byId = new Map(data.students.map((student) => [student.id.toUpperCase(), student]));
  rows.forEach((row) => {
    const student = byId.get(row.studentId.toUpperCase());
    if (!student) throw new Error(`Student ${row.studentId} was not found.`);
  });
  rows.forEach((row) => {
    const student = byId.get(row.studentId.toUpperCase());
    student.attendedClasses = row.attendedClasses;
    student.totalClasses = row.totalClasses;
  });
}