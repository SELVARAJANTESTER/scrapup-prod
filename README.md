ScrapCollect - Local Backend + Frontend

This package contains a demo frontend and a lightweight Express backend that
integrates with Firebase Firestore when a service account JSON is provided.

Quick start (Windows PowerShell):

1. Install dependencies
   npm install

2. (Optional) Add your Firebase service account JSON at
   ./firebase-service-account.json

3. Start the server
   npm start

4. Open http://localhost:3000/index1.html in your browser

Notes:
- If no Firebase service account is provided, the server will fall back to using
  the bundled data in `app_data_fallback.json` and persist new requests to that
  file. This fallback is intended for local testing only and is not suitable
  for production.

- To deploy to production, configure a Firebase project, create a Firestore
  database, and provide a service account JSON with proper permissions.

Security:
- Do not commit your Firebase service account JSON to public repositories.
