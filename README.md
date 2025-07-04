# rfx-audit-v4

## Prerequisites
- **Node.js** 20 or later
- **Docker** (for building and running the container)
- Environment variables:
  - `VITE_SUPABASE_URL` – your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` – the Supabase anonymous key
  - `VITE_STRIPE_PUBLISHABLE_KEY` – your Stripe publishable key

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173` by default.

## Docker Deployment
To build and run using Docker:
```bash
docker build -t rfx-audit-v4 .
docker run -p 3002:80 \
  -e VITE_SUPABASE_URL=https://yourproject.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY \
  -e VITE_STRIPE_PUBLISHABLE_KEY=YOUR_STRIPE_KEY \
  rfx-audit-v4
```
Alternatively, use `docker-compose`:
```bash
docker-compose up -d
```
The container uses Nginx to serve the built files. Configure an SPA fallback by adding:
```
location / {
  try_files $uri /index.html;
}
```
to your Nginx config if routes should resolve to `index.html`.

## Supabase Credentials

Update `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_STRIPE_PUBLISHABLE_KEY` in `stack.env` or via environment variables. The frontend creates the Supabase and Stripe clients using these values.

The application requires two environment variables for the Supabase client:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Set them in `stack.env`, a local `.env` file or as environment variables when running Docker. The client in `customSupabaseClient.js` reads these values via `import.meta.env`.

## Basic Scan Webhook
When running a scan, the app invokes the Supabase function `n8n-proxy` with payload:
```json
{ "url": "<target>", "email": "<user email>", "domain_id": "<domain id>", "scan_id": "<scan id>" }
```
The function forwards this data to your configured automation webhook (for example an n8n workflow). Ensure the following environment variables are provided for the function:
- `N8N_WEBHOOK_URL` – destination for scan data
- `SUPABASE_SERVICE_ROLE_KEY` – allows the function to update scan records

