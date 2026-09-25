# 06 — On-Site QR Scanner & Check-in Flow

**What to build:** A protected admin route accessible only via smartphone that scans QR codes, verifies the `qr_token`, and updates the participant's status to `CHECKED_IN` with real-time feedback. Includes manual check-in from the table.

**Blocked by:** 05-admin-participant-dashboard

**Status:** ready-for-agent

- [ ] Write tests for QR validation endpoint and manual check-in logic (TDD Approach).
- [ ] Implement device detection to restrict QR Scanner UI to smartphones.
- [ ] Integrate `html5-qrcode` to build the web-based scanner UI.
- [ ] Build the backend endpoint to validate `qr_token` and update status (returning Green/Yellow/Red responses).
- [ ] Add a "Manual Check-in" button to the Admin Participant table.
- [ ] Ensure tests pass.
