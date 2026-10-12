# TechEventPass

**Smart Technical Event Permission and Attendance Portal**

TechEventPass connects student permission requests to an assigned proctor and an event in-charge. Attendance eligibility is explicit, decisions stay human, and every workflow step has a visible status and history.

## Run locally

1. Open this folder in VS Code.
2. Open **Terminal → New Terminal** and run `npm.cmd start`.
3. Open `http://localhost:8000` in your browser. Keep the terminal open while using the app.
4. Switch roles from the profile at the bottom of the sidebar or the avatar in the top bar.

The included Node server only serves static files; no backend is needed for the demo. In PowerShell, run the test suite with `npm.cmd test` (the `npm.ps1` shim can be blocked by the default script execution policy). No runtime npm packages are required for demo mode.

## Demo accounts

Select a role from the account menu; these are demo identities, not authenticated accounts:

| Role | Demo user | Details |
| --- | --- | --- |
| Student | Sat | 25EU02086, Computer Science, 39/46 classes (84.8%) |
| Proctor | Jaya | Reviews requests from the assigned sample students |
| Event In-Charge | Tejaswini | Manages events, attendance, policy and final decisions |

The sample directory also includes students above and below 75%, requests at multiple workflow stages, and four upcoming events. **LOCAL DEMO** means records are kept in this browser's `localStorage`; they are not secure, shared, or stored in Firebase. Use **Settings → Reset demo data** to restore the original sample set. No passwords are needed in demo mode.

## Included workflows

- Students can see attendance, eligibility, active events, request history, decision remarks, notifications, and the EventPass readiness checklist.
- Ineligible students, expired event deadlines, duplicate requests, and incomplete reasons are blocked before submission.
- Proctors only see their assigned students' requests and can recommend or reject; rejection requires remarks.
- Event in-charges see the shared request queue, make final decisions only after recommendation, manage events and student records, and set the attendance threshold.
- CSV imports validate required headers, integer counts, duplicate IDs, unknown student IDs, and attended-versus-total values before applying changes. Use **Download template** for a starter file.
- The readiness indicator explains attendance, completeness, deadline, workflow status, and the next responsible role. It is not an approval score.

## Project map

- `index.html`, `css/style.css`: responsive dashboard shell and visual system.
- `js/app.js`: role-specific screens, dialogs, navigation, and actions.
- `js/data.js`: sample data, local persistence, readiness explanations, and guarded workflow transitions.
- `js/attendance.js`: eligibility calculation and CSV parsing/validation.
- `js/firebase.js`, `firebase-config.js`: optional Firebase Auth and Firestore adapter. The browser config contains public Firebase web identifiers only.
- `firestore.rules`: server-enforced role, record visibility, attendance-at-submission, and approval transition checks.
- `functions/set-role.mjs`: trusted Admin SDK helper for assigning custom role claims.
- `functions/seed-firestore.mjs`: trusted Admin SDK helper for loading sample event/student/request records.
- `tests/core.test.js`: behavior tests for eligibility, CSV validation, authorization guards, and the full approval path.

## Connect Firebase (optional)

Local demo is the ready-to-run default. Firebase is not configured until you complete these steps. A Firebase project, internet connection, and enabled Email/Password Authentication are required; the static frontend is free to host, and Firebase usage must remain within your project's free-tier quotas.

1. Create a Firebase project. Enable **Authentication → Sign-in method → Email/Password** and create a **Cloud Firestore** database.
2. In Firebase project settings, register a Web app. Copy its `apiKey`, `authDomain`, `projectId`, and `appId` into `firebase-config.js`. These web config values are public; never put a service-account key in this file or any frontend file.
3. Install the Firebase CLI if needed, sign in, select your project, and deploy the rules before adding real student data:

   ```powershell
   npm.cmd install --global firebase-tools
   firebase.cmd login
   firebase.cmd use --add
   firebase.cmd deploy --only firestore:rules,firestore:indexes
   ```

4. Create Firebase Authentication users for the event in-charge, proctors, and students. Role values are exactly `Event In-Charge`, `Proctor`, and `Student`.
5. For custom claims and sample data, install the Admin SDK and use Application Default Credentials from a trusted administrator machine. Never deploy or commit those credentials:

   ```powershell
   npm.cmd install --prefix functions
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\firebase-admin-service-account.json"
   $env:FIREBASE_PROJECT_ID = "your-firebase-project-id"
   node functions/set-role.mjs "admin@example.edu" "Event In-Charge" "Tejaswini"
   node functions/set-role.mjs "proctor@example.edu" "Proctor" "Jaya"
   node functions/set-role.mjs "sat@example.edu" "Student" "Sat"
   ```

   Repeat `set-role` for every account. This privileged script assigns claims; do not expose a role-changing endpoint to ordinary users. Users must sign in again after a claim changes.
6. Link each sample student to Firebase Authentication UIDs and seed Firestore from the same trusted machine. Set one environment variable per student (`25EU02086` becomes `TECHEVENT_STUDENT_UID_25EU02086`):

   ```powershell
   $env:TECHEVENT_ADMIN_UID = "tejaswini-auth-uid"
   $env:TECHEVENT_PROCTOR_UID = "jaya-auth-uid"
   $env:TECHEVENT_PROCTOR_2_UID = "arjun-das-auth-uid"
   $env:TECHEVENT_STUDENT_UID_25EU02086 = "sat-auth-uid"
   # Set TECHEVENT_STUDENT_UID_STU_24023, _STU_24031, _STU_24042, and _STU_24056 too.
   node functions/seed-firestore.mjs
   ```

   Students without UID mappings and their sample requests are skipped. Run the seed script only when you intend to replace the sample config/events/records.
7. Reload the app and choose **Sign in with Firebase**. Add student profile UIDs and proctor UIDs under **Students** when managing real accounts. `LOCAL DEMO` and `FIREBASE CLOUD` are intentionally labeled differently.

### Firebase security notes

Firestore rules use verified Firebase custom claims, not role names sent by the browser. Student reads are limited to their own student/request records; proctors can read assigned students and requests; only event in-charges can edit attendance/config/events and make final decisions. The rules also recheck attendance against Firestore when a student creates a request and require a proctor recommendation before a final decision. Requests store `studentUid`, `proctorUid`, `createdAtMs`, and `history` to support these checks.

The trusted seed/role utilities use the Admin SDK and bypass Firestore rules by design. Keep the service-account file outside the repository and remove its environment variable when finished. For a production college deployment, add an institution-controlled account-provisioning process, audit logging, verified document storage, privacy/retention policy, and backend validation/notification delivery. The optional document field in this MVP stores a reference string only; it does not upload or securely store files. Firebase Auth and Firestore must be configured/deployed by you before cloud mode can work.

## Deploy

### Firebase Hosting

After completing Firebase setup and `firebase use --add`, deploy the static frontend and Firestore rules:

```powershell
firebase.cmd deploy --only hosting,firestore:rules,firestore:indexes
```

Add the deployed hosting domain under **Firebase Authentication → Settings → Authorized domains**. Configure the same `firebase-config.js` values in the copy you deploy. Cloud records require deployed Firestore rules and correctly assigned custom claims.

### GitHub Pages

GitHub Pages can host the static demo at no cost. Push the project to your existing repository, then in GitHub open **Settings → Pages**, choose **Deploy from a branch**, select the intended branch and `/ (root)`, and save. Use the published Pages URL. GitHub Pages will run the local demo; Firebase cloud mode additionally requires that domain in Firebase's authorized domains and a configured Firebase project/rules.

## Push to your existing GitHub repository

The project has not been committed or pushed. In the VS Code terminal, verify your existing remote and branch first, then stage and push:

```powershell
git status
git remote -v
git add index.html css js tests functions firestore.rules firestore.indexes.json firebase.json firebase-config.js sample-attendance.csv README.md package.json server.mjs .gitignore
git commit -m "Build TechEventPass permission portal"
git push -u origin <your-branch>
```

If no remote is configured, add your existing GitHub repository URL with `git remote add origin <repository-url>` before pushing. Do not stage service-account files or secrets.