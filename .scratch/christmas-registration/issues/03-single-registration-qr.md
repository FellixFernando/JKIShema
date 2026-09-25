# 03 — Single Attendee Registration Flow & QR Generation

**What to build:** An end-to-end flow where a single user registers via the public form, is saved to the database (with duplicate checks), and a mock WhatsApp log is created for the generated QR token.

**Blocked by:** 02-landing-page-dynamic-toggle

**Status:** ready-for-agent

- [ ] Write API tests for registration endpoint (duplicate rejection, successful insertion, mock logging) (TDD Approach).
- [ ] Create the public registration form UI.
- [ ] Implement backend API to validate `(full_name, whatsapp_number)` constraint.
- [ ] Generate unique `qr_token` and save participant to DB.
- [ ] Implement Mock WhatsApp Service to log the sent QR code.
- [ ] Ensure tests pass.
