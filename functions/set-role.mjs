import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email, role, ...nameParts] = process.argv.slice(2);
const allowedRoles = ["Student", "Proctor", "Event In-Charge"];

if (!email || !allowedRoles.includes(role)) {
  console.error('Usage: node set-role.mjs <email> "Student|Proctor|Event In-Charge" [display name]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role, ...(nameParts.length ? { name: nameParts.join(" ") } : {}) });
console.log(`Assigned ${role} to ${email} (${user.uid}). The user must sign in again for the claim to refresh.`);