import { firebaseConfig } from "../firebase-config.js";

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
let sdkPromise;
let app;
let auth;
let db;

export function isFirebaseConfigured() { return configured; }
async function sdk() {
  if (!configured) throw new Error("Firebase is not configured. This action is available only in local demo mode.");
  if (!sdkPromise) sdkPromise = Promise.all([
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
  ]).then(([appSdk, authSdk, firestoreSdk]) => {
    app = appSdk.initializeApp(firebaseConfig);
    auth = authSdk.getAuth(app);
    db = firestoreSdk.getFirestore(app);
    return { authSdk, firestoreSdk };
  });
  return sdkPromise;
}

export async function firebaseSignIn(email, password) {
  const { authSdk } = await sdk();
  const credential = await authSdk.signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdTokenResult(true);
  const role = token.claims.role;
  if (!role || !["Student", "Proctor", "Event In-Charge"].includes(role)) {
    await authSdk.signOut(auth);
    throw new Error("This account has no authorized role claim. Ask the Firebase project administrator to assign one.");
  }
  return { uid: credential.user.uid, email: credential.user.email, role, name: token.claims.name || credential.user.displayName || credential.user.email };
}

export async function firebaseSignOut() {
  const { authSdk } = await sdk();
  await authSdk.signOut(auth);
}

export async function loadCloudData(user) {
  const { firestoreSdk } = await sdk();
  const collectionRef = (name) => firestoreSdk.collection(db, name);
  const getRecords = async (name, ...constraints) => {
    const reference = constraints.length ? firestoreSdk.query(collectionRef(name), ...constraints) : collectionRef(name);
    const snapshot = await firestoreSdk.getDocs(reference);
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  };
  const where = firestoreSdk.where;
  const [events, settingsSnapshot] = await Promise.all([
    getRecords("events"),
    firestoreSdk.getDoc(firestoreSdk.doc(db, "config", "settings"))
  ]);
  let students;
  let requests;
  let notifications = [];
  if (user.role === "Student") {
    [students, requests, notifications] = await Promise.all([
      getRecords("students", where("uid", "==", user.uid)),
      getRecords("requests", where("studentUid", "==", user.uid)),
      getRecords("notifications", where("studentUid", "==", user.uid))
    ]);
  } else if (user.role === "Proctor") {
    students = await getRecords("students", where("proctorUid", "==", user.uid));
    requests = await getRecords("requests", where("proctorUid", "==", user.uid));
  } else if (user.role === "Event In-Charge") {
    [students, requests, notifications] = await Promise.all([
      getRecords("students"), getRecords("requests"), getRecords("notifications")
    ]);
  } else throw new Error("This account role is not supported.");
  students = students.map((student) => ({ ...student, proctorId: student.proctorUid || student.proctorId }));
  const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {};
  return { threshold: settings.threshold ?? 75, students, events, requests, notifications, currentUserId: user.uid };
}

export async function saveCloudRecord(collectionName, id, record) {
  const { firestoreSdk } = await sdk();
  await firestoreSdk.setDoc(firestoreSdk.doc(db, collectionName, id), record);
}