import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createSeedData } from "../js/data.js";

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error("Set FIREBASE_PROJECT_ID before running this trusted seed script.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore();
const seed = createSeedData();
const studentUid = (id) => process.env[`TECHEVENT_STUDENT_UID_${id.replace(/[^A-Za-z0-9]/g, "_")}`];
const proctorUid = (id) => process.env[id === "faculty-1" ? "TECHEVENT_PROCTOR_UID" : "TECHEVENT_PROCTOR_2_UID"];
const adminUid = process.env.TECHEVENT_ADMIN_UID;
const batch = db.batch();

batch.set(db.doc("config/settings"), { threshold: seed.threshold, updatedAt: new Date().toISOString() });
for (const event of seed.events) {
  batch.set(db.doc(`events/${event.id}`), { ...event, deadlineEpoch: new Date(`${event.deadline}T23:59:59`).getTime() });
}
for (const student of seed.students) {
  const uid = studentUid(student.id);
  const assignedProctorUid = proctorUid(student.proctorId);
  if (!uid || !assignedProctorUid) {
    console.warn(`Skipping ${student.id}: set its student UID and assigned proctor UID environment variables to seed it.`);
    continue;
  }
  batch.set(db.doc(`students/${student.id}`), {
    ...student,
    studentId: student.id,
    uid,
    proctorUid: assignedProctorUid
  });
}
for (const item of seed.requests) {
  const student = seed.students.find((record) => record.id === item.studentId);
  const uid = student && studentUid(student.id);
  const assignedProctorUid = student && proctorUid(student.proctorId);
  if (!uid || !assignedProctorUid) continue;
  const history = item.history.map((entry) => ({
    ...entry,
    actorUid: entry.role === "Student" ? uid : entry.role === "Proctor" ? assignedProctorUid : adminUid || ""
  }));
  batch.set(db.doc(`requests/${item.id}`), {
    ...item,
    studentUid: uid,
    proctorUid: assignedProctorUid,
    createdAtMs: Date.parse(item.createdAt),
    updatedAtMs: Date.parse(item.updatedAt),
    history
  });
}

await batch.commit();
console.log("Seed data written. Re-running replaces the demo records with the sample values.");