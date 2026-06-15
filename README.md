# The Forge

The Forge is a React Native Expo MVP for logging training, sauna, cold plunge, and daily readiness with Supabase authentication and user-specific storage.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Add your Supabase values to `.env`.

4. Run the app:

```bash
npm start
```

## Supabase setup

Run the SQL in `supabase/schema.sql` in your Supabase SQL editor. Then use the project URL and anon key from Supabase Project Settings > API.
