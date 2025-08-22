This project includes simple instructions to push to GitHub and deploy the frontend and backend.

Recommended flow (manual):

1. Push repository to GitHub (see README.md)
2. Deploy backend on Render (connect the repo; `node server.js` start command); add FIREBASE_SERVICE_ACCOUNT as an env var if used.
3. Deploy frontend on Netlify and set the frontend `window.__SCRAP_API_BASE` to the Render URL.

Optional: Use GitHub Actions to automatically notify Render/Netlify or to run build steps. Example workflows are for illustration and will likely need editing for your account/project IDs.

Files:
- `.github/workflows/deploy.yml` — example CI that runs on push to `main` and shows where to add deploy steps.

If you'd like, I can customize the workflow with your Render and Netlify deploy tokens.
