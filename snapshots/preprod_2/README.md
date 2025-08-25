<<<<<<< HEAD
# Scrapup
Scrapup web 
=======
ScrapCollect - Local Backend + Frontend

This package contains a demo frontend and a lightweight Express backend that
integrates with Firebase Firestore when a service account JSON is provided.

Quick start (Windows PowerShell):

1. Install dependencies
   # Scrapup / ScrapCollect

   ScrapCollect is a small demo project that includes a static frontend and a
   lightweight Express backend. The backend can integrate with Firebase Firestore
   and Cloud Storage when a service account JSON is provided; otherwise the
   server runs in a local fallback mode using `app_data_fallback.json` for easy
   local testing.

   Quick start (Windows PowerShell)

   1. Install dependencies
      npm install

   2. (Optional) Add your Firebase service account JSON at
      ./firebase-service-account.json

   3. Start the server (default port 3000). Use port 3001 if 3000 is in use:
      $env:PORT=3001; node server.js

   4. Open the frontend in a browser (via Live Server or file):
   http://localhost:3000/home.html or open `customer_login.html` via Live Server

   Notes
   - If no Firebase service account is provided, the server will fall back to using
     the bundled data in `app_data_fallback.json` and persist new requests to that
     file. This fallback is intended for local testing only and is not suitable
     for production.
   - To deploy to production, configure a Firebase project, create a Firestore
     database, and provide a service account JSON with proper permissions.

   Deploying to Netlify (frontend) + Render (backend) — quick guide

   1) Push this repo to GitHub (create a new repo on GitHub first):

   ```powershell
   git init
   git add .
   git commit -m "Initial commit"
   # create repo on GitHub and then:
   git remote add origin https://github.com/<youruser>/<yourrepo>.git
   git branch -M main
   git push -u origin main
   ```

   2) Deploy backend to Render (or Railway):
    - Create a Render account and connect your GitHub repo.
    - New → Web Service → pick the repo and branch.
    - Start command: `node server.js` (set PORT via env if desired).
    - Add any env vars (FIREBASE_SERVICE_ACCOUNT, FIREBASE_STORAGE_BUCKET) as secrets.
    - Deploy and copy the public HTTPS URL Render provides.

   3) Deploy frontend to Netlify (drag & drop or Git-based):
    - In Netlify: New site from Git → connect repo → deploy static files.
    - Or use Netlify Drop to upload the static folder.
   - In `home.html` and `customer_login.html` set `window.__SCRAP_API_BASE` to your backend URL.

   Security
   - Do not commit `firebase-service-account.json` or other secrets to GitHub. Use
     Render/Netlify environment variables for secrets.

   If you want, I can prepare additional deployment scripts or a GitHub Actions
   workflow customized for your Render/Netlify accounts.
