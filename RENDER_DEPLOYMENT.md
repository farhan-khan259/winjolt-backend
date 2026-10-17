# Deploy the WinJolt API on Render

## Before deploying

- Use a MongoDB Atlas cluster. MongoDB transactions are required, so the cluster must run as a replica set (Atlas clusters do).
- In Atlas **Network Access**, allow connections from Render. The simplest initial setting is `0.0.0.0/0`; use tighter network rules when your Render plan and Atlas setup support them.
- Keep `.env` local. Add secrets in Render's Environment page, never in Git.

## Create the web service

1. In Render, choose **New > Web Service** and connect the backend GitHub repository.
2. Set **Runtime** to `Node`.
3. Set **Build Command** to `npm ci`.
4. Set **Start Command** to `npm start`.
5. Set **Health Check Path** to `/health`.
6. Add the required environment variables below, then deploy.

The checked-in `render.yaml` contains the same service settings and can alternatively be used with **New > Blueprint**.

Use a paid backend plan for a functional production deployment. Render free web services spin down when idle, lose local uploads, do not provide shell access, and block outbound SMTP ports 25, 465, and 587. That prevents this app's SMTP-based verification and admin one-time codes from working. A free backend is useful only for a limited preview unless the email integration is changed to an HTTPS-based provider API.

## Required environment variables

```text
NODE_ENV=production
MONGODB_URI=<MongoDB Atlas connection string>
JWT_SECRET=<at least 32 cryptographically random characters>
FRONTEND_URL=https://<your-frontend>.onrender.com
PUBLIC_WEB_URL=https://<your-frontend>.onrender.com
PAYMENT_PROVIDER=disabled
GLOBAL_ENTRY_PAUSED=true
WALLET_REDEMPTION_ENABLED=false
FREE_ENTRY_ENABLED=false
```

Do not set `PORT`; Render supplies it. `FRONTEND_URL` accepts a comma-separated list when both the Render domain and a custom domain must be allowed.

Optional production variables are documented in `.env.example`, including Stripe and SMTP settings. Keep payments disabled and entry intake paused until the required provider, compliance, and operational checks are complete.

## Initial administrator

Set `ADMIN_EMAIL` and a temporary `ADMIN_PASSWORD` in the local backend `.env`, point `MONGODB_URI` at the production Atlas database, and run locally:

```sh
npm run seed
```

Then remove the password from the local `.env`. If the backend uses a paid Render plan, you can instead add those two values temporarily in Render and run the same command from the service's **Shell**. Admin sign-in requests a one-time code by email, so working SMTP settings are required.

## Uploaded files

Uploads use `UPLOAD_DIR` when it is set and otherwise use the repository's `uploads` directory. Render's default filesystem is ephemeral, so uploaded evidence and campaign images can disappear after a restart or deploy.

For persistent uploads, use a paid web service, attach a Render persistent disk, mount it at `/opt/render/project/src/uploads`, and set:

```text
UPLOAD_DIR=/opt/render/project/src/uploads
```

For a service that needs multiple instances, use object storage instead of a single attached disk.

## Verify

Open `https://<your-backend>.onrender.com/health`. It should return JSON with `"status":"ok"`.

