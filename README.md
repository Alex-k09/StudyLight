# Study Traffic Lights

Supabase-backed study board:

- `index.html` + `app.js` – traffic-light subjects/topics UI. Guests can work locally, but signing in loads and saves data via Supabase (`subjects` / `topics` tables).
- `login.html` – Supabase email/password auth (sign up + log in) that redirects back to the board.
- `settings.html` – Supabase account controls (update email/password, sign out).
- `supabase.js` – shared Supabase client targeting the provided project URL + anon key.

## Usage

1. Run `supabase-schema.sql` inside your Supabase project and disable email confirmations for instant sessions if desired.
2. Serve the folder with any static server (`npx serve .` etc.) so Supabase auth can run on `http://`.
3. Visit `login.html` to create/log into an account. After authentication you land on the board (`index.html`) where subjects/topics persist online per user.
4. Guests can still manipulate the board; their data stays in localStorage until they sign in. `settings.html` lets signed-in users update credentials or sign out.
