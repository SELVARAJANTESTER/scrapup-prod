Preprod_3 snapshot - created by automated agent

Location:
  c:\Users\celva\Downloads\Working Scrapup\exported-assets\snapshots\Preprod_3

Files included (current as of snapshot):
- server.js            : Backend Express server (API + SSE + Firestore/fallback logic)
- app.js               : Frontend application logic (PickMyScrapApp)
- app.api.js           : Frontend API shim and helpers
- home.html            : Main frontend HTML used by the app (renamed from index1.html)
- package.json         : Project manifest and dependencies
- app_data_fallback.json : Local fallback dataset (scrapTypes, dealers, users, requests)
- tools/assign_flow_test.js : Puppeteer E2E test script for assign/accept/complete flow
- SNAPSHOT_README.txt  : This manifest file

Notes:
- This snapshot contains working copies of the key server, client, fallback data, test script, and manifest required to restore a preproduction environment named "Preprod_3".
- No compression or external upload was performed. If you want, I can create a ZIP archive of this folder and/or compute checksums for each file.

To restore:
1) Copy the files from this folder back into the project root (overwrite as needed).
2) Run `npm install` at project root to ensure dependencies are installed.
3) Start server with `node server.js` (or `npm start`).

If you want a ZIP archive, checksums, or an integrity manifest, tell me and I'll create them now.
