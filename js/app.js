import { attendanceSummary, validateAttendanceCsv } from "./attendance.js";
import { attendanceFor, createSeedData, finalizeRequest, getEvent, getStudent, importAttendance, loadDemoData, readinessFor, requestsForStudent, reviewRequest, saveDemoData, submitRequest } from "./data.js";
import { firebaseSignIn, firebaseSignOut, isFirebaseConfigured, loadCloudData, saveCloudRecord } from "./firebase.js";

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRegion = document.querySelector("#toast-region");
const roles = {
  student: { id: "25EU02086", name: "Sat", role: "Student", short: "Student" },
  proctor: { id: "faculty-1", name: "Jaya", role: "Proctor", short: "Proctor" },
  admin: { id: "event-admin", name: "Tejaswini", role: "Event In-Charge", short: "Event In-Charge" }
};
let data = loadDemoData().data;
let actor = roles.student;
let cloudMode = false;
let cloudIdentity = null;
let currentView = location.hash.slice(1) || "dashboard";
let requestFilter = "all";
let eventSearch = "";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const initials = (name) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const prettyDate = (date, options = { month: "short", day: "numeric", year: "numeric" }) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", options) : "—";
const roleClass = () => actor.role === "Student" ? "student" : actor.role === "Proctor" ? "proctor" : "admin";
const visibleRequests = () => actor.role === "Student" ? requestsForStudent(data, actor.id) : actor.role === "Proctor" ? data.requests.filter((request) => getStudent(data, request.studentId)?.proctorId === actor.id) : data.requests;
const studentContext = () => actor.role === "Student" ? getStudent(data, actor.id) : null;

function toast(message, kind = "success") {
  const element = document.createElement("div");
  element.className = `toast ${kind}`;
  element.textContent = message;
  toastRegion.append(element);
  setTimeout(() => element.remove(), 3300);
}

function persistDemo() { if (!cloudMode) saveDemoData(data); }

async function persistRequest(request) {
  if (!cloudMode) { persistDemo(); return; }
  const student = getStudent(data, request.studentId);
  await saveCloudRecord("requests", request.id, { ...request, studentUid: request.studentUid || student?.uid, proctorUid: request.proctorUid || student?.proctorUid || student?.proctorId });
  const notification = data.notifications.find((item) => item.studentId === request.studentId && item.at === request.updatedAt);
  if (notification && student?.uid) await saveCloudRecord("notifications", notification.id, { ...notification, studentUid: student.uid, proctorUid: student.proctorUid || student.proctorId });
}

async function persistStudent(student) {
  if (!cloudMode) { persistDemo(); return; }
  await saveCloudRecord("students", student.id, student);
}

function icon(name) {
  const paths = {
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1m2-9a3 3 0 1 0-1-5.8M18 14a5 5 0 0 1 3 4.5V20"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 2-1.5Z"/><path d="M14 3.5V9h5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}

function heading(eyebrow, title, subtitle, actions = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}

function metric(label, value, note, iconName, noteClass = "") {
  return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(iconName)}</span></div><div class="metric-value">${value}</div><div class="metric-note ${noteClass}">${note}</div></article>`;
}

function badge(status) {
  const klass = { Pending: "pending", Recommended: "recommended", Approved: "approved", Rejected: "rejected" }[status] || "pending";
  return `<span class="status-badge status-${klass}"><i></i>${escapeHtml(status)}</span>`;
}

function eligibilityBadge(eligible) {
  return `<span class="status-badge ${eligible ? "status-approved" : "status-ineligible"}"><i></i>${eligible ? "Eligible" : "Ineligible"}</span>`;
}

function requestReadiness(request) {
  const result = readinessFor(data, request);
  return `<span class="readiness-inline readiness-${result.color}" title="${escapeHtml(result.reasons.join(" "))}">${result.color === "green" ? "Ready" : result.color === "red" ? "Action needed" : "In review"}</span>`;
}

function personCell(student) {
  if (!student) return "<span>Unknown student</span>";
  return `<span class="person-cell"><span class="person-avatar">${initials(escapeHtml(student.name))}</span><span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.id)} · ${escapeHtml(student.department)}</small></span></span>`;
}

function requestTable(requests, options = {}) {
  const isStudent = actor.role === "Student";
  const rows = requests.map((request) => {
    const student = getStudent(data, request.studentId);
    const event = getEvent(data, request.eventId);
    const person = isStudent ? `<span class="person-cell"><span class="person-avatar">${initials(actor.name)}</span><span><strong>${escapeHtml(event?.title || "Event removed")}</strong><small>${prettyDate(event?.date)}</small></span></span>` : personCell(student);
    const eventText = isStudent ? escapeHtml(student?.department || "—") : escapeHtml(event?.title || "Event removed");
    const actions = actor.role === "Proctor" && request.status === "Pending"
      ? `<button class="button button-secondary" data-action="details" data-id="${escapeHtml(request.id)}">Review</button>`
      : actor.role === "Event In-Charge" && request.status === "Recommended"
        ? `<button class="button button-secondary" data-action="details" data-id="${escapeHtml(request.id)}">Decide</button>`
        : `<button class="button button-quiet" data-action="details" data-id="${escapeHtml(request.id)}">View details</button>`;
    return `<tr><td>${person}</td><td>${eventText}</td><td>${prettyDate(request.createdAt)}</td><td>${badge(request.status)}</td><td>${requestReadiness(request)}</td><td>${actions}</td></tr>`;
  }).join("");
  const firstHeader = isStudent ? "Event" : "Student";
  const secondHeader = isStudent ? "Department" : "Requested event";
  return `<div class="table-wrap"><table><thead><tr><th>${firstHeader}</th><th>${secondHeader}</th><th>Submitted</th><th>Status</th><th>Readiness</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state"><strong>No requests yet</strong>${options.empty || "New requests will appear here."}</div></td></tr>`}</tbody></table></div>`;
}

function readinessPanel(request) {
  if (!request) return `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">EventPass readiness</h2><p class="panel-subtitle">Transparent checks before permission can move forward</p></div></div><div class="empty-state"><strong>No active request</strong>Submit an event request to see its readiness checks.</div></section>`;
  const result = readinessFor(data, request);
  const checks = result.reasons.map((reason) => `<div class="readiness-check ${result.color === "yellow" ? "pending" : ""}">${icon(result.color === "yellow" ? "clock" : "check")}<span>${escapeHtml(reason)}</span></div>`).join("");
  const colors = { green: "#25845c", yellow: "#a46b13", red: "#bf4853" };
  const progress = request.status === "Approved" ? 300 : request.status === "Recommended" ? 200 : request.status === "Pending" ? 100 : 0;
  return `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">Smart EventPass readiness</h2><p class="panel-subtitle">A transparent checklist, never an automated decision</p></div>${badge(request.status)}</div><div class="readiness-feature"><div class="readiness-gauge" style="background:conic-gradient(${colors[result.color]} ${progress}deg,#eef0f5 ${progress}deg 360deg)"><strong>${request.status === "Approved" ? "3/3" : request.status === "Recommended" ? "2/3" : request.status === "Pending" ? "1/3" : "!"}<small>workflow</small></strong></div><div class="readiness-copy"><h3>${escapeHtml(getEvent(data, request.eventId)?.title || "Permission request")}</h3><p>${result.color === "red" ? "This request needs attention before it can progress." : result.color === "green" ? "All checks are clear and final approval is recorded." : "Your request is moving through the review process."}</p><span class="readiness-label" style="color:${colors[result.color]};background:${result.color === "green" ? "var(--green-bg)" : result.color === "red" ? "var(--red-bg)" : "var(--amber-bg)"}"><i></i>${result.label}</span></div></div><div class="readiness-list">${checks}<div class="readiness-next">Next action · ${escapeHtml(result.nextAction)}</div></div></section>`;
}

function eventRows(events) {
  if (!events.length) return `<div class="empty-state"><strong>No upcoming events</strong>New opportunities will appear here.</div>`;
  return events.slice(0, 4).map((event) => {
    const date = new Date(`${event.date}T12:00:00`);
    return `<div class="event-row"><span class="date-tile"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}</small></span><span class="event-info"><strong>${escapeHtml(event.title)}</strong><small>${prettyDate(event.date)} · ${escapeHtml(event.venue)}</small></span><span class="event-tag">${escapeHtml(event.category)}</span></div>`;
  }).join("");
}

function studentDashboard() {
  const student = studentContext();
  if (!student) return `<div class="notice-banner">This demo identity has no student profile. Switch to a seeded student account to view student details.</div>`;
  const attendance = attendanceFor(data, student);
  const requests = requestsForStudent(data, student.id);
  const activeRequest = requests.find((item) => !["Approved", "Rejected"].includes(item.status)) || requests[0];
  const upcoming = data.events.filter((event) => event.active && event.date >= new Date().toISOString().slice(0, 10));
  const eligible = attendance.eligible;
  const actions = `<button class="button button-primary" data-action="goto-events">${icon("plus")} Find an event</button>`;
  return `${heading("STUDENT PORTAL", `Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${escapeHtml(student.name.split(" ")[0])}`, `${escapeHtml(student.department)} · ${escapeHtml(student.year)} · Student ID ${escapeHtml(student.id)}`, actions)}
    <div class="metrics-grid">${metric("Attendance this semester", `${attendance.percentage.toFixed(1)}%`, `${attendance.attended} of ${attendance.total} classes attended`, "calendar", eligible ? "positive" : "")}${metric("Eligibility status", eligible ? "Eligible" : "Ineligible", `Minimum requirement: ${data.threshold}%`, eligible ? "check" : "clock", eligible ? "positive" : "")}${metric("My requests", requests.length, `${requests.filter((item) => item.status === "Pending" || item.status === "Recommended").length} currently in review`, "file")}${metric("Upcoming opportunities", upcoming.length, "Technical events accepting requests", "people")}</div>
    ${!eligible ? `<div class="notice-banner"><strong>Permission requests are currently unavailable.</strong> Your attendance is ${attendance.percentage.toFixed(1)}%, below the ${data.threshold}% requirement. Keep attending classes and check back after attendance is updated.</div>` : ""}
    <div class="overview-grid"><div>${readinessPanel(activeRequest)}<section class="panel section-gap"><div class="panel-header"><div><h2 class="panel-title">My request history</h2><p class="panel-subtitle">Follow each permission decision from submission to outcome</p></div><button class="text-link" data-view="requests">View all</button></div>${requestTable(requests.slice(0, 4), { empty: "Explore technical events and send a permission request." })}</section></div><div><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Upcoming events</h2><p class="panel-subtitle">Find your next learning opportunity</p></div><button class="text-link" data-view="events">See all</button></div>${eventRows(upcoming)}</section><section class="panel section-gap"><div class="panel-header"><div><h2 class="panel-title">Attendance snapshot</h2><p class="panel-subtitle">Current semester · ${student.year}</p></div></div>${attendanceCard(student)}</section></div></div>`;
}

function attendanceCard(student) {
  const attendance = attendanceFor(data, student);
  const width = Math.min(100, attendance.percentage);
  return `<div class="attendance-card"><div class="attendance-head"><strong>${attendance.percentage.toFixed(1)}%</strong><span class="status-badge ${attendance.eligible ? "status-approved" : "status-ineligible"}"><i></i>${attendance.eligible ? "Eligible" : "Ineligible"}</span></div><div class="progress-track"><span style="width:${width}%"></span></div><div class="attendance-foot"><span>${attendance.attended} classes attended</span><span>${attendance.total} total</span></div><div class="eligibility-note">Attendance requirement is <strong>${data.threshold}%</strong>.${attendance.eligible ? ` You are ${(attendance.percentage - data.threshold).toFixed(1)} points above the minimum.` : ` You need ${Math.ceil((data.threshold * attendance.total - 100 * attendance.attended) / (100 - data.threshold))} consecutive attended class(es) to reach eligibility.`}</div></div>`;
}

function proctorDashboard() {
  const requests = visibleRequests();
  const pending = requests.filter((request) => request.status === "Pending");
  const recommended = requests.filter((request) => request.status === "Recommended");
  const needsAttention = requests.filter((request) => readinessFor(data, request).color === "red").length;
  return `${heading("PROCTOR WORKSPACE", "Review student requests", "Check eligibility, add a clear recommendation, and keep the decision trail complete.", `<button class="button button-secondary" data-action="refresh">${icon("clock")} Refresh data</button>`)}
    <div class="metrics-grid">${metric("Assigned students", data.students.filter((student) => student.proctorId === actor.id).length, "Students in your proctor group", "people")}${metric("Awaiting review", pending.length, "Requests requiring your recommendation", "clock")}${metric("Recommended", recommended.length, "Waiting for event in-charge", "check")}${metric("Readiness alerts", needsAttention, "Eligibility or information needs attention", "file")}</div>
    <section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">Assigned permission requests</h2><p class="panel-subtitle">Only requests from students assigned to your proctor account are shown.</p></div><span class="status-badge status-pending"><i></i>${pending.length} pending</span></div>${requestFilters()}${requestTable(filteredRequests(requests))}</section>`;
}

function adminDashboard() {
  const requests = data.requests;
  const pending = requests.filter((request) => request.status === "Pending").length;
  const recommended = requests.filter((request) => request.status === "Recommended").length;
  const approved = requests.filter((request) => request.status === "Approved").length;
  const rejected = requests.filter((request) => request.status === "Rejected").length;
  const participation = data.events.map((event) => ({ event, count: requests.filter((request) => request.eventId === event.id).length })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...participation.map((item) => item.count));
  const rows = participation.map(({ event, count }) => `<div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(event.title)}</strong><small>${count} permission request${count === 1 ? "" : "s"}</small></div><div style="width:38%;display:flex;align-items:center;gap:9px"><div class="progress-track" style="flex:1;margin:0"><span style="width:${count / maxCount * 100}%"></span></div><strong style="font-size:10px">${count}</strong></div></div>`).join("");
  return `${heading("EVENT IN-CHARGE", "Permission overview", "Review requests, decision progress and event participation.", `<button class="button button-secondary" data-action="refresh">${icon("clock")} Refresh data</button><button class="button button-primary" data-action="new-event">${icon("plus")} Create event</button>`)}
    <div class="metrics-grid">${metric("Total requests", requests.length, "Across all technical events", "file")}${metric("Awaiting proctor", pending, "Not yet recommended", "clock")}${metric("Awaiting final decision", recommended, "Proctor recommended", "people")}${metric("Approved / rejected", `${approved} / ${rejected}`, "Final decisions recorded", "check")}</div>
    <div class="overview-grid"><section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">Decision queue</h2><p class="panel-subtitle">Recommended requests are ready for your final decision.</p></div><button class="text-link" data-view="requests">All requests</button></div>${requestTable(requests.filter((request) => request.status === "Recommended").slice(0, 5), { empty: "Recommended requests will appear here." })}</section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Event participation</h2><p class="panel-subtitle">Requests by event</p></div></div>${rows || `<div class="empty-state">Create an event to start tracking participation.</div>`}</section></div>
    <section class="panel section-gap"><div class="panel-header"><div><h2 class="panel-title">Latest request activity</h2><p class="panel-subtitle">Recent workflow changes and readiness context</p></div><button class="text-link" data-view="requests">Open request register</button></div>${requestTable([...requests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5))}</section>`;
}

function filteredRequests(requests) {
  if (requestFilter === "all") return requests;
  return requests.filter((request) => request.status === requestFilter);
}

function requestFilters() {
  const statuses = ["all", "Pending", "Recommended", "Approved", "Rejected"];
  const departments = [...new Set(data.students.map((student) => student.department))];
  return `<div class="table-toolbar"><label class="search-box">${icon("search")}<input id="request-search" placeholder="Search student or event" aria-label="Search permission requests"></label><select class="filter-select" id="status-filter" aria-label="Filter by status">${statuses.map((status) => `<option value="${status}" ${requestFilter === status ? "selected" : ""}>${status === "all" ? "All statuses" : status}</option>`).join("")}</select><select class="filter-select" id="department-filter" aria-label="Filter by department"><option value="all">All departments</option>${departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join("")}</select><select class="filter-select" id="event-filter" aria-label="Filter by event"><option value="all">All events</option>${data.events.map((event) => `<option value="${event.id}">${escapeHtml(event.title)}</option>`).join("")}</select><select class="filter-select" id="sort-filter" aria-label="Sort permission requests"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="event">Event A–Z</option></select></div>`;
}

function sortRequests(requests, sort = "newest") {
  return [...requests].sort((first, second) => sort === "oldest"
    ? first.createdAt.localeCompare(second.createdAt)
    : sort === "event"
      ? (getEvent(data, first.eventId)?.title || "").localeCompare(getEvent(data, second.eventId)?.title || "")
      : second.createdAt.localeCompare(first.createdAt));
}

function requestsView() {
  const requests = visibleRequests();
  const title = actor.role === "Student" ? "My requests" : actor.role === "Proctor" ? "Proctor review queue" : "Permission register";
  const subtitle = actor.role === "Student" ? "Every submission and decision, together in one place." : actor.role === "Proctor" ? "Review requests assigned to your student group." : "Search and track the complete approval workflow.";
  return `${heading("REQUEST MANAGEMENT", title, subtitle, `<button class="button button-secondary" data-action="refresh">${icon("clock")} Refresh</button>`)}<section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">${requests.length} request${requests.length === 1 ? "" : "s"}</h2><p class="panel-subtitle">Readiness is informational; each approval remains a human decision.</p></div></div>${requestFilters()}<div id="requests-table">${requestTable(sortRequests(filteredRequests(requests)))}</div></section>`;
}

function eventCard(event) {
  const alreadyRequested = actor.role === "Student" && data.requests.some((request) => request.studentId === actor.id && request.eventId === event.id);
  const attendance = actor.role === "Student" && studentContext() ? attendanceFor(data, studentContext()) : null;
  const deadlinePassed = new Date(`${event.deadline}T23:59:59`) < new Date();
  const canRequest = actor.role === "Student" && attendance?.eligible && !deadlinePassed && !alreadyRequested;
  const action = actor.role === "Student" ? alreadyRequested ? `<button class="button button-secondary" disabled>Request submitted</button>` : canRequest ? `<button class="button button-primary" data-action="new-request" data-id="${event.id}">Request permission</button>` : `<button class="button button-secondary" disabled>${deadlinePassed ? "Deadline passed" : "Attendance required"}</button>` : `<button class="button button-secondary" data-action="event-info" data-id="${event.id}">Event details</button>`;
  return `<article class="event-card"><div class="event-card-banner"><span>${escapeHtml(event.category)}${actor.role === "Event In-Charge" && !event.active ? " · ARCHIVED" : ""}</span><h3>${escapeHtml(event.title)}</h3></div><div class="event-card-body"><div class="event-meta"><span>${icon("calendar")}${prettyDate(event.date)}</span><span>${icon("pin")}${escapeHtml(event.venue)}</span><span>${icon("people")}${escapeHtml(event.organizer)}</span></div><p class="panel-subtitle">${escapeHtml(event.description)}</p><div class="event-card-footer"><span class="deadline-text">REGISTRATION DEADLINE<strong>${prettyDate(event.deadline)}</strong></span>${actor.role === "Event In-Charge" ? `<span style="display:flex;gap:5px"><button class="button button-secondary" data-action="edit-event" data-id="${event.id}">Edit</button><button class="button button-secondary" data-action="toggle-event" data-id="${event.id}">${event.active ? "Archive" : "Reopen"}</button></span>` : action}</div></div></article>`;
}

function eventsView() {
  const canManage = actor.role === "Event In-Charge";
  const active = data.events.filter((event) => canManage || event.active);
  const query = eventSearch.trim().toLowerCase();
  const events = active.filter((event) => !query || `${event.title} ${event.category} ${event.venue}`.toLowerCase().includes(query));
  const actions = canManage ? `<button class="button button-primary" data-action="new-event">${icon("plus")} Create event</button>` : "";
  return `${heading("CAMPUS CALENDAR", "Technical events", actor.role === "Student" ? "Explore events and submit a permission request before the deadline." : "Browse events and review request participation.", actions)}${actor.role === "Student" && studentContext() && !attendanceFor(data, studentContext()).eligible ? `<div class="notice-banner"><strong>Requesting is disabled.</strong> Your attendance must reach ${data.threshold}% before you can submit a request.</div>` : ""}<div class="table-toolbar" style="padding:0 0 14px"><label class="search-box">${icon("search")}<input id="event-search" placeholder="Search events, category or venue" value="${escapeHtml(eventSearch)}" aria-label="Search technical events"></label></div><div class="event-cards">${events.map(eventCard).join("") || `<section class="panel empty-state"><strong>No matching events</strong>Try a different search.</section>`}</div>`;
}

function attendanceView() {
  if (actor.role === "Student") {
    const student = studentContext();
    return `${heading("ATTENDANCE", "My attendance record", "Eligibility uses attended classes divided by total recorded classes.")}${student ? `<div class="overview-grid"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Semester attendance</h2><p class="panel-subtitle">${escapeHtml(student.department)} · ${escapeHtml(student.year)} · Section ${escapeHtml(student.section)}</p></div></div>${attendanceCard(student)}</section>${readinessPanel(requestsForStudent(data, student.id)[0])}</div>` : `<div class="empty-state">No student profile found.</div>`}`;
  }
  const students = actor.role === "Proctor" ? data.students.filter((student) => student.proctorId === actor.id) : data.students;
  const rows = students.map((student) => {
    const info = attendanceFor(data, student);
    return `<tr><td>${personCell(student)}</td><td>${escapeHtml(student.year)} · ${escapeHtml(student.section)}</td><td>${info.attended} / ${info.total}</td><td><span class="readiness-inline ${info.eligible ? "readiness-green" : "readiness-red"}">${info.percentage.toFixed(1)}%</span></td><td>${eligibilityBadge(info.eligible)}</td>${actor.role === "Event In-Charge" ? `<td><button class="button button-quiet" data-action="edit-student" data-id="${student.id}">Edit attendance</button></td>` : ""}</tr>`;
  }).join("");
  return `${heading("ATTENDANCE REGISTER", actor.role === "Proctor" ? "Assigned student attendance" : "Attendance records", "Eligibility is calculated against the configured college threshold.", actor.role === "Event In-Charge" ? `<button class="button button-secondary" data-action="download-template">${icon("file")} CSV template</button><button class="button button-primary" data-action="open-import">${icon("upload")} Import CSV</button>` : "")}
    ${actor.role === "Event In-Charge" ? `<div class="notice-banner"><strong>Attendance imports replace each listed student's current semester counts.</strong> The CSV is validated in your browser before changes are applied. In sample mode, changes stay in this browser and are not shared with Firebase.</div>` : ""}<section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">${students.length} student records</h2><p class="panel-subtitle">Threshold currently set to ${data.threshold}%</p></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Academic details</th><th>Attended / total</th><th>Attendance</th><th>Eligibility</th>${actor.role === "Event In-Charge" ? "<th></th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function studentsView() {
  const rows = data.students.map((student) => {
    const info = attendanceFor(data, student);
    return `<tr><td>${personCell(student)}</td><td>${escapeHtml(student.year)} · Section ${escapeHtml(student.section)}</td><td>${info.attended} / ${info.total}</td><td>${info.percentage.toFixed(1)}%</td><td>${escapeHtml(student.proctorId === "faculty-1" ? "Jaya" : "Prof. Arjun Das")}</td><td><button class="button button-quiet" data-action="edit-student" data-id="${student.id}">Edit</button></td></tr>`;
  }).join("");
  return `${heading("STUDENT DIRECTORY", "Manage students", "Maintain student records and assigned proctor groups.", `<button class="button button-primary" data-action="new-student">${icon("plus")} Add student</button>`)}<section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">Student records</h2><p class="panel-subtitle">${data.students.length} students · attendance edits are restricted to this role in Firestore.</p></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Year / section</th><th>Attendance</th><th>Rate</th><th>Proctor</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function settingsView() {
  const admins = data.students.filter((student) => student.proctorId === "faculty-1").length;
  return `${heading("PORTAL CONFIGURATION", "Settings & imports", "Manage the college attendance requirement and load validated attendance files.")}
    <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Eligibility policy</h2><p class="panel-subtitle">This threshold is used for every student and permission request.</p></div></div><div class="setting-row"><div class="setting-copy"><strong>Minimum attendance percentage</strong><small>Students below this value cannot submit event permission requests.</small></div><div style="display:flex;align-items:center;gap:8px"><input class="field setting-input" id="threshold-input" type="number" min="0" max="100" value="${data.threshold}" aria-label="Attendance eligibility threshold"><strong>%</strong><button class="button button-primary" data-action="save-threshold">Save</button></div></div><div class="setting-row"><div class="setting-copy"><strong>Attendance import</strong><small>CSV columns: studentId, attendedClasses, totalClasses. ${data.students.length} student profiles will be checked.</small></div><div style="display:flex;gap:7px"><button class="button button-secondary" data-action="download-template">${icon("file")} Download template</button><button class="button button-secondary" data-action="open-import">${icon("upload")} Choose CSV</button></div></div></section>
    <section class="panel section-gap"><div class="panel-header"><div><h2 class="panel-title">Storage & access</h2><p class="panel-subtitle">${cloudMode ? "Connected Firebase session" : "Local sample data is active"}</p></div></div><div class="setting-row"><div class="setting-copy"><strong>${cloudMode ? "Firebase Authentication + Cloud Firestore" : "Browser localStorage"}</strong><small>${cloudMode ? `Signed in as ${escapeHtml(cloudIdentity?.email || actor.name)}. Access depends on deployed Firestore rules.` : "Sample records stay in this browser. They are not secure, shared, or saved to Firebase."}</small></div>${cloudMode ? `<button class="button button-secondary" data-action="cloud-signout">Sign out</button>` : `<button class="button button-secondary" data-action="cloud-signin">Connect Firebase</button>`}</div></section>
    <section class="panel section-gap"><div class="panel-header"><div><h2 class="panel-title">Sample records</h2><p class="panel-subtitle">Reset restores the original local sample records.</p></div><button class="button button-secondary" data-action="reset-demo">Reset local data</button></div><div class="setting-row"><div class="setting-copy"><strong>Attendance</strong><small>Student IDs are matched against the sample student directory.</small></div><span class="status-badge status-approved"><i></i>${data.students.length} records</span></div></section>`;
}

function render() {
  const validViews = actor.role === "Student" ? ["dashboard", "requests", "events", "attendance"] : actor.role === "Proctor" ? ["dashboard", "requests", "events", "attendance"] : ["dashboard", "requests", "events", "attendance", "students", "settings"];
  if (!validViews.includes(currentView)) currentView = "dashboard";
  document.querySelectorAll(".nav-link").forEach((link) => {
    const allowed = validViews.includes(link.dataset.view);
    link.hidden = !allowed;
    link.classList.toggle("active", link.dataset.view === currentView);
  });
  document.querySelector("#nav-count").textContent = String(visibleRequests().filter((request) => actor.role === "Proctor" ? request.status === "Pending" : actor.role === "Event In-Charge" ? request.status === "Recommended" : request.status === "Pending" || request.status === "Recommended").length);
  document.querySelector("#profile-name").textContent = actor.name;
  document.querySelector("#profile-role").textContent = actor.role;
  document.querySelector("#avatar-initials").textContent = initials(actor.name);
  document.querySelector("#top-avatar").textContent = initials(actor.name);
  document.querySelector("#storage-pill").innerHTML = `<i></i> ${cloudMode ? "FIREBASE CLOUD" : "SAMPLE · LOCAL ONLY"}`;
  document.querySelector("#storage-pill").classList.toggle("cloud", cloudMode);
  const names = { dashboard: "Overview", requests: "Permission requests", events: "Technical events", attendance: "Attendance", students: "Students", settings: "Settings" };
  document.querySelector("#breadcrumb-current").textContent = names[currentView];
  const views = { dashboard: () => actor.role === "Student" ? studentDashboard() : actor.role === "Proctor" ? proctorDashboard() : adminDashboard(), requests: requestsView, events: eventsView, attendance: attendanceView, students: studentsView, settings: settingsView };
  app.innerHTML = views[currentView]();
}

function showModal(title, subtitle, body, footer, form = "") {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ${form ? `data-form="${form}"` : ""}><header class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}</section></div>`;
  modalRoot.querySelector(".modal")?.focus();
}

function closeModal() { modalRoot.innerHTML = ""; }

function detailsModal(request) {
  const event = getEvent(data, request.eventId);
  const student = getStudent(data, request.studentId);
  const readiness = readinessFor(data, request);
  const history = request.history.map((item) => `<div class="notification-item"><strong>${escapeHtml(item.status)} · ${escapeHtml(item.actor)}</strong><p>${escapeHtml(item.remarks)} · ${new Date(item.at).toLocaleString()}</p></div>`).join("");
  const canProctor = actor.role === "Proctor" && request.status === "Pending" && student?.proctorId === actor.id;
  const canFinalize = actor.role === "Event In-Charge" && request.status === "Recommended";
  const actions = canProctor ? `<button class="button button-danger" data-action="open-review" data-id="${request.id}" data-decision="Rejected">Reject</button><button class="button button-primary" data-action="open-review" data-id="${request.id}" data-decision="Recommended">Recommend</button>` : canFinalize ? `<button class="button button-danger" data-action="open-final" data-id="${request.id}" data-decision="Rejected">Reject</button><button class="button button-primary" data-action="open-final" data-id="${request.id}" data-decision="Approved">Approve</button>` : `<button class="button button-secondary" data-action="close-modal">Close</button>`;
  showModal("Permission request", `${escapeHtml(student?.name || "Student")} · ${escapeHtml(event?.title || "Event")}`, `<div class="modal-kicker">${escapeHtml(student?.id || request.studentId)} · ${escapeHtml(student?.department || "—")}</div><p style="font-size:10px;line-height:1.55;color:#666b7e">${escapeHtml(request.reason)}</p>${request.documentRef ? `<p style="font-size:10px;color:#777b8e">Supporting reference: ${escapeHtml(request.documentRef)}</p>` : ""}<div class="setting-row" style="padding:12px 0"><span>Attendance</span><strong>${readiness.attendance?.percentage.toFixed(1) ?? "—"}% · ${readiness.attendance?.eligible ? "Eligible" : "Ineligible"}</strong></div><div class="setting-row" style="padding:12px 0"><span>Request status</span>${badge(request.status)}</div>${request.proctorRemarks ? `<div class="setting-row" style="padding:12px 0"><span>Proctor remarks</span><strong>${escapeHtml(request.proctorRemarks)}</strong></div>` : ""}${request.finalRemarks ? `<div class="setting-row" style="padding:12px 0"><span>Final remarks</span><strong>${escapeHtml(request.finalRemarks)}</strong></div>` : ""}<div class="readiness-box" style="margin:13px 0"><div class="readiness-box-head"><strong>EventPass readiness · ${readiness.color.toUpperCase()}</strong>${badge(request.status)}</div><p class="readiness-explainer">${readiness.reasons.map(escapeHtml).join(" · ")}</p><div class="readiness-next">Next action · ${escapeHtml(readiness.nextAction)}</div></div><h3 class="panel-title" style="margin:18px 0 7px">Decision history</h3>${history}`, actions);
}

function requestForm(eventId) {
  const event = getEvent(data, eventId);
  showModal("Request event permission", event ? `${event.title} · deadline ${prettyDate(event.deadline)}` : "Submit your participation details", `<form id="request-form"><div class="field-grid"><div class="field full"><label for="request-event">Technical event</label><select id="request-event" name="eventId" required>${data.events.filter((item) => item.active).map((item) => `<option value="${item.id}" ${item.id === eventId ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></div><div class="field full"><label for="request-reason">Why would you like to participate?</label><textarea id="request-reason" name="reason" minlength="10" required placeholder="Share what you hope to learn or contribute"></textarea><span class="field-hint">At least 10 characters.</span></div><div class="field full"><label for="request-document">Supporting document reference <span style="font-weight:400">(optional)</span></label><input id="request-document" name="documentRef" placeholder="File name, link, or invitation reference"><span class="field-hint">This field stores a reference only; file uploads are not configured.</span></div></div></form>`, `<button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit" form="request-form">Submit request</button>`, "request");
}

function remarksForm(requestId, decision, final = false) {
  const label = final ? "final decision" : "proctor recommendation";
  showModal(`${decision} permission request`, `Record your ${label} with a note for the student.`, `<form id="remarks-form"><div class="field"><label for="decision-remarks">${decision === "Rejected" || final ? "Remarks (required)" : "Remarks (optional)"}</label><textarea id="decision-remarks" name="remarks" ${decision === "Rejected" || final ? "required" : ""} placeholder="Explain the decision clearly"></textarea></div></form>`, `<button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button ${decision === "Rejected" ? "button-danger" : "button-primary"}" type="submit" form="remarks-form">${decision}</button>`, final ? `final:${requestId}:${decision}` : `review:${requestId}:${decision}`);
}

function eventForm(event = null) {
  const editing = Boolean(event);
  const eventData = event || { title: "", category: "WORKSHOP", date: "", venue: "", deadline: "", description: "", organizer: "" };
  showModal(editing ? "Edit technical event" : "Create technical event", "Event details appear in the student opportunity list.", `<form id="event-form"><div class="field-grid"><div class="field"><label for="event-title">Event name</label><input id="event-title" name="title" required value="${escapeHtml(eventData.title)}"></div><div class="field"><label for="event-category">Category</label><select id="event-category" name="category"><option ${eventData.category === "HACKATHON" ? "selected" : ""}>HACKATHON</option><option ${eventData.category === "TECHNICAL FEST" ? "selected" : ""}>TECHNICAL FEST</option><option ${eventData.category === "WORKSHOP" ? "selected" : ""}>WORKSHOP</option><option ${eventData.category === "CONFERENCE" ? "selected" : ""}>CONFERENCE</option></select></div><div class="field"><label for="event-date">Event date</label><input id="event-date" name="date" type="date" required value="${eventData.date}"></div><div class="field"><label for="event-deadline">Registration deadline</label><input id="event-deadline" name="deadline" type="date" required value="${eventData.deadline}"></div><div class="field full"><label for="event-venue">Venue</label><input id="event-venue" name="venue" required value="${escapeHtml(eventData.venue)}"></div><div class="field full"><label for="event-organizer">Organizer</label><input id="event-organizer" name="organizer" required value="${escapeHtml(eventData.organizer)}"></div><div class="field full"><label for="event-description">Description</label><textarea id="event-description" name="description" required>${escapeHtml(eventData.description)}</textarea></div></div></form>`, `<button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit" form="event-form">${editing ? "Save changes" : "Create event"}</button>`, `event:${event?.id || "new"}`);
}

function studentForm(student = null) {
  const cloudIdentityFields = cloudMode ? `<div class="field full"><label for="student-uid">Student Firebase UID</label><input id="student-uid" name="uid" required value="${escapeHtml(student?.uid || "")}" placeholder="Copy from Firebase Authentication"><span class="field-hint">The UID links this student record to Firebase Authentication.</span></div><div class="field full"><label for="student-proctor">Assigned proctor Firebase UID</label><input name="proctorId" id="student-proctor" required value="${escapeHtml(student?.proctorUid || student?.proctorId || "")}" placeholder="Firebase Authentication UID"></div>` : `<div class="field full"><label for="student-proctor">Assigned proctor</label><select name="proctorId" id="student-proctor"><option value="faculty-1" ${student?.proctorId === "faculty-1" ? "selected" : ""}>Jaya</option><option value="faculty-2" ${student?.proctorId === "faculty-2" ? "selected" : ""}>Prof. Arjun Das</option></select></div>`;
  showModal(student ? "Edit student record" : "Add student", "Manage attendance and the assigned proctor group.", `<form id="student-form"><div class="field-grid"><div class="field"><label for="student-id">Student ID</label><input id="student-id" name="id" required value="${escapeHtml(student?.id || "")}" ${student ? "readonly" : ""}></div><div class="field"><label for="student-name">Full name</label><input id="student-name" name="name" required value="${escapeHtml(student?.name || "")}"></div><div class="field"><label for="student-department">Department</label><input id="student-department" name="department" required value="${escapeHtml(student?.department || "")}"></div><div class="field"><label for="student-year">Academic year</label><input id="student-year" name="year" required value="${escapeHtml(student?.year || "2nd Year")}"></div>${cloudIdentityFields}<div class="field"><label for="student-attended">Attended classes</label><input id="student-attended" name="attendedClasses" type="number" min="0" required value="${student?.attendedClasses ?? 0}"></div><div class="field"><label for="student-total">Total classes</label><input id="student-total" name="totalClasses" type="number" min="1" required value="${student?.totalClasses ?? 1}"></div><div class="field"><label for="student-section">Section</label><input id="student-section" name="section" value="${escapeHtml(student?.section || "A")}"></div>${!cloudMode ? cloudIdentityFields : ""}</div></form>`, `<button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit" form="student-form">Save student</button>`, `student:${student?.id || "new"}`);
}

function accountMenu() {
  const demoButtons = Object.entries(roles).map(([key, account]) => `<button class="demo-chip" data-action="switch-demo" data-role="${key}">${escapeHtml(account.short)} · ${escapeHtml(account.name)}</button>`).join("");
  const firebaseButton = isFirebaseConfigured() ? `<button class="button button-secondary" data-action="cloud-signin">Sign in with Firebase</button>` : `<div class="field-hint">Firebase is not configured. Add project values to firebase-config.js to enable cloud sign-in.</div>`;
  showModal(cloudMode ? "Connected account" : "Switch account", cloudMode ? `Authenticated as ${escapeHtml(cloudIdentity?.email || actor.name)}.` : "Sample accounts share local browser data. They are not secure authentication.", `<div class="demo-account-list">${demoButtons}</div><div style="margin-top:18px">${cloudMode ? `<button class="button button-secondary" data-action="cloud-signout">Sign out of Firebase</button>` : firebaseButton}</div>`, `<button class="button button-secondary" data-action="close-modal">Close</button>`);
}

function notificationsModal() {
  const notes = actor.role === "Student" ? data.notifications.filter((item) => item.studentId === actor.id) : actor.role === "Proctor" ? data.notifications.filter((item) => getStudent(data, item.studentId)?.proctorId === actor.id) : data.notifications;
  const body = notes.length ? notes.slice(0, 12).map((item) => `<div class="notification-item"><strong>${escapeHtml(item.message)}</strong><p>${new Date(item.at).toLocaleString()}</p></div>`).join("") : `<div class="empty-state"><strong>You're all caught up</strong>Workflow updates will appear here.</div>`;
  showModal("Notifications", "Updates linked to your permission workflow.", body, `<button class="button button-secondary" data-action="close-modal">Done</button>`);
}

function downloadTemplate() {
  const csv = "studentId,attendedClasses,totalClasses\n25EU02086,39,46\nSTU-24023,35,46\n";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "sample-attendance.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Attendance CSV template downloaded.");
}

function importDialog() {
  showModal("Import attendance CSV", "Check file structure and student IDs before replacing semester attendance counts.", `<div class="field"><label for="attendance-file">Choose CSV file</label><input id="attendance-file" type="file" accept=".csv,text/csv"><span class="field-hint">Required columns: studentId, attendedClasses, totalClasses. Maximum file size: 1 MB.</span><div id="csv-preview" style="margin-top:10px"></div></div>`, `<button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary" id="confirm-import" disabled>Import records</button>`);
}

async function cloudLoginDialog() {
  if (!isFirebaseConfigured()) { toast("Firebase config is empty. Follow the Firebase setup steps in README.md.", "error"); return; }
  showModal("Sign in to Firebase", "Only authenticated accounts with an assigned role claim can access cloud records.", `<form id="cloud-login-form"><div class="field-grid"><div class="field full"><label for="cloud-email">Email address</label><input id="cloud-email" name="email" type="email" required autocomplete="username"></div><div class="field full"><label for="cloud-password">Password</label><input id="cloud-password" name="password" type="password" required autocomplete="current-password"></div></div></form><p class="field-hint">Firebase accounts use your configured college sign-in. Sample accounts are not Firebase credentials.</p>`, `<button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit" form="cloud-login-form">Sign in</button>`, "cloud-login");
}

async function switchToCloud(identity) {
  const cloudData = await loadCloudData(identity);
  const profile = cloudData.students.find((student) => student.uid === identity.uid);
  if (identity.role === "Student" && !profile) throw new Error("No student profile is linked to this Firebase account.");
  data = { ...cloudData, threshold: cloudData.threshold || 75 };
  cloudIdentity = identity;
  actor = identity.role === "Student" ? { ...identity, id: profile.id } : identity;
  cloudMode = true;
  currentView = "dashboard";
  closeModal();
  render();
}

function requestListForFilter() {
  let requests = filteredRequests(visibleRequests());
  const text = document.querySelector("#request-search")?.value.trim().toLowerCase() || "";
  const department = document.querySelector("#department-filter")?.value || "all";
  const eventId = document.querySelector("#event-filter")?.value || "all";
  if (text) requests = requests.filter((request) => {
    const student = getStudent(data, request.studentId);
    const event = getEvent(data, request.eventId);
    return `${student?.name} ${student?.id} ${event?.title}`.toLowerCase().includes(text);
  });
  if (department !== "all") requests = requests.filter((request) => getStudent(data, request.studentId)?.department === department);
  if (eventId !== "all") requests = requests.filter((request) => request.eventId === eventId);
  requests = sortRequests(requests, document.querySelector("#sort-filter")?.value || "newest");
  const container = document.querySelector("#requests-table");
  if (container) container.innerHTML = requestTable(requests);
}

document.addEventListener("click", async (event) => {
  const navLink = event.target.closest("[data-view]");
  if (navLink) {
    event.preventDefault();
    currentView = navLink.dataset.view;
    history.replaceState(null, "", `#${currentView}`);
    render();
    document.querySelector("#sidebar").classList.remove("open");
    return;
  }
  const control = event.target.closest("[data-action]");
  if (!control) {
    if (event.target.classList.contains("modal-backdrop")) closeModal();
    return;
  }
  const { action, id } = control.dataset;
  if (action === "close-modal") { closeModal(); return; }
  if (action === "goto-events") { currentView = "events"; history.replaceState(null, "", "#events"); render(); return; }
  if (action === "switch-account" || control.id === "account-switch" || control.id === "profile-button") { accountMenu(); return; }
  if (action === "switch-demo") {
    if (cloudMode) { toast("Sign out of Firebase before using a demo account.", "error"); return; }
    actor = roles[control.dataset.role];
    data.currentUserId = actor.id;
    currentView = "dashboard"; closeModal(); persistDemo(); render(); return;
  }
  if (action === "new-request") { requestForm(id); return; }
  if (action === "details") { const request = data.requests.find((item) => item.id === id); if (request) detailsModal(request); return; }
  if (action === "review") { remarksForm(id, "Recommended"); return; }
  if (action === "finalize") { remarksForm(id, "Approved", true); return; }
  if (action === "open-review") { remarksForm(id, control.dataset.decision); return; }
  if (action === "open-final") { remarksForm(id, control.dataset.decision, true); return; }
  if (action === "new-event") { eventForm(); return; }
  if (action === "edit-event") { eventForm(getEvent(data, id)); return; }
  if (action === "toggle-event") {
    const record = getEvent(data, id);
    record.active = !record.active;
    try {
      if (cloudMode) await saveCloudRecord("events", id, record); else persistDemo();
      render(); toast(record.active ? "Event reopened for student requests." : "Event archived; students can no longer request permission.");
    } catch (error) { data = await loadCloudData(cloudIdentity); render(); toast(error.message, "error"); }
    return;
  }
  if (action === "new-student") { studentForm(); return; }
  if (action === "edit-student") { studentForm(getStudent(data, id)); return; }
  if (action === "download-template") { downloadTemplate(); return; }
  if (action === "open-import") { importDialog(); return; }
  if (action === "cloud-signin") { cloudLoginDialog(); return; }
  if (action === "cloud-signout") {
    try { await firebaseSignOut(); data = loadDemoData().data; actor = roles.student; cloudMode = false; cloudIdentity = null; currentView = "dashboard"; closeModal(); render(); toast("Signed out. Returned to local sample mode."); }
    catch (error) { toast(error.message, "error"); }
    return;
  }
  if (action === "refresh") {
    if (cloudMode) { try { data = await loadCloudData(cloudIdentity); render(); toast("Cloud records refreshed."); } catch (error) { toast(error.message, "error"); } }
    else { data = loadDemoData().data; render(); toast("Local sample data refreshed."); }
    return;
  }
  if (action === "save-threshold") {
    const value = Number(document.querySelector("#threshold-input")?.value);
    if (!Number.isInteger(value) || value < 0 || value > 100) { toast("Enter a whole-number threshold between 0 and 100.", "error"); return; }
    data.threshold = value;
    if (cloudMode) {
      try { await saveCloudRecord("config", "settings", { threshold: value, updatedAt: new Date().toISOString() }); }
      catch (error) { data = await loadCloudData(cloudIdentity); render(); toast(`Cloud save failed: ${error.message}`, "error"); return; }
    } else persistDemo();
    render(); toast(`Attendance threshold set to ${value}%.`); return;
  }
  if (action === "reset-demo") {
    if (cloudMode) { toast("Sample data cannot be reset while connected to Firebase.", "error"); return; }
    data = createSeedData(); actor = roles.student; currentView = "dashboard"; saveDemoData(data); render(); toast("Local sample data reset."); return;
  }
  if (action === "event-info") { const ev = getEvent(data, id); showModal(escapeHtml(ev.title), `${prettyDate(ev.date)} · ${escapeHtml(ev.venue)}`, `<p style="font-size:11px;line-height:1.6;color:#6f7486">${escapeHtml(ev.description)}</p><p class="field-hint">Organizer: ${escapeHtml(ev.organizer)} · Registration deadline: ${prettyDate(ev.deadline)}</p>`, `<button class="button button-secondary" data-action="close-modal">Close</button>`); return; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  const modalForm = form.closest(".modal")?.dataset.form || "";
  try {
    if (form.id === "request-form") {
      const request = submitRequest(data, actor, values.eventId, values);
      closeModal(); persistDemo(); await persistRequest(request); currentView = "requests"; render(); toast("Permission request submitted to your proctor.");
    } else if (form.id === "remarks-form") {
      const [, requestId, decision] = modalForm.split(":");
      const request = modalForm.startsWith("final:") ? finalizeRequest(data, actor, requestId, decision, values.remarks) : reviewRequest(data, actor, requestId, decision, values.remarks);
      closeModal(); persistDemo(); await persistRequest(request); render(); toast(`Request ${decision.toLowerCase()} recorded.`);
    } else if (form.id === "event-form") {
      const [, id] = modalForm.split(":");
      const eventRecord = { ...values, active: true, deadlineEpoch: new Date(`${values.deadline}T23:59:59`).getTime(), id: id === "new" ? `evt-${Date.now()}` : id };
      if (id === "new") data.events.push(eventRecord);
      else Object.assign(getEvent(data, id), eventRecord);
      if (cloudMode) await saveCloudRecord("events", eventRecord.id, eventRecord); else persistDemo();
      closeModal(); render(); toast(id === "new" ? "Event created." : "Event updated.");
    } else if (form.id === "student-form") {
      const [, id] = modalForm.split(":");
      const old = id === "new" ? null : getStudent(data, id);
      const student = { ...old, ...values, studentId: values.id, attendedClasses: Number(values.attendedClasses), totalClasses: Number(values.totalClasses), email: old?.email || "", year: values.year || "2nd Year", section: old?.section || "A", proctorId: values.proctorId, ...(cloudMode ? { uid: values.uid || old?.uid, proctorUid: values.proctorId } : {}) };
      attendanceSummary(student.attendedClasses, student.totalClasses, data.threshold);
      if (old) Object.assign(old, student); else data.students.push(student);
      closeModal(); persistDemo(); await persistStudent(student); render(); toast("Student record saved.");
    } else if (form.id === "cloud-login-form") {
      const identity = await firebaseSignIn(values.email, values.password);
      await switchToCloud(identity);
      toast("Connected to Firebase Cloud Firestore.");
    }
  } catch (error) {
    if (cloudMode) { try { data = await loadCloudData(cloudIdentity); render(); } catch { /* Keep the current view if Firestore is unreachable. */ } }
    toast(error.message || "Something went wrong.", "error");
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "status-filter") { requestFilter = event.target.value; requestListForFilter(); }
  if (["request-search", "department-filter", "event-filter", "sort-filter"].includes(event.target.id)) requestListForFilter();
  if (event.target.id === "event-search") { eventSearch = event.target.value; render(); document.querySelector("#event-search")?.focus(); }
  if (event.target.id === "attendance-file") {
    const file = event.target.files?.[0];
    const preview = document.querySelector("#csv-preview");
    const button = document.querySelector("#confirm-import");
    if (!file || !preview || !button) return;
    if (file.size > 1024 * 1024) { preview.innerHTML = `<span class="form-error">File exceeds the 1 MB limit.</span>`; button.disabled = true; return; }
    const text = await file.text();
    const result = validateAttendanceCsv(text, data.students.map((student) => student.id));
    event.target.dataset.csv = text;
    event.target.dataset.valid = String(result.valid);
    preview.innerHTML = result.valid ? `<span class="status-badge status-approved"><i></i>${result.rows.length} valid attendance rows</span><p class="field-hint">${result.rows.map((row) => `${escapeHtml(row.studentId)} ${row.attendedClasses}/${row.totalClasses}`).join(" · ")}</p>` : `<div class="form-error">${result.errors.map(escapeHtml).join("<br>")}</div>`;
    button.disabled = !result.valid;
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "request-search" || event.target.id === "department-filter" || event.target.id === "event-filter" || event.target.id === "sort-filter") requestListForFilter();
});

document.addEventListener("click", async (event) => {
  if (event.target.id === "confirm-import") {
    const fileInput = document.querySelector("#attendance-file");
    if (!fileInput?.dataset.csv || fileInput.dataset.valid !== "true") return;
    const validated = validateAttendanceCsv(fileInput.dataset.csv, data.students.map((student) => student.id));
    try {
      importAttendance(data, validated.rows);
      if (cloudMode) {
        for (const row of validated.rows) await persistStudent(getStudent(data, row.studentId));
      } else persistDemo();
      closeModal(); render(); toast(`Attendance imported for ${validated.rows.length} students.`);
    } catch (error) {
      if (cloudMode) { try { data = await loadCloudData(cloudIdentity); render(); } catch { /* Keep the current view if Firestore is unreachable. */ } }
      toast(error.message, "error");
    }
  }
});

document.querySelector("#account-switch").addEventListener("click", accountMenu);
document.querySelector("#profile-button").addEventListener("click", accountMenu);
document.querySelector("#notification-button").addEventListener("click", notificationsModal);
document.querySelector("#mobile-menu").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
window.addEventListener("hashchange", () => { currentView = location.hash.slice(1) || "dashboard"; render(); });

render();