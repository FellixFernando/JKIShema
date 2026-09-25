---
labels: ["ready-for-agent"]
---

## Problem Statement

The church currently lacks a centralized digital platform to serve both as their official company profile (showcasing history, vision/mission, and leadership) and as an efficient event management system for their upcoming Christmas Celebration. They need a streamlined way to handle registrations for up to 440 participants, prevent duplicate entries, communicate event details and RSVPs via WhatsApp, and ensure a smooth, friction-free check-in process on the day of the event using QR codes.

## Solution

A responsive web application (mobile-first approach) built with Next.js and PostgreSQL. The public-facing site will act as the church's company profile, complete with a Hero section call-to-action for the Christmas Celebration registration. The system will support group registrations (including children without requiring separate WhatsApp numbers) and automatically generate unique QR codes. These QR codes will be sent via WhatsApp to the primary registrant. On the day of the event, event organizers will use a web-based QR scanner within a secure admin dashboard via their smartphones to quickly check in attendees.

## User Stories

1. As a public visitor, I want to view the church's company profile (About Us, Vision & Mission, Gallery, and Leadership), so that I can learn more about the church.
2. As a potential attendee, I want to see a clear Call to Action to register for the Christmas Celebration on the landing page, so that I can easily sign up.
3. As a primary registrant, I want to register myself by providing my Full Name, WhatsApp Number, and Church Status, so that I can attend the event.
4. As a primary registrant, I want to add multiple participants (including children) in a single registration process, so that I can easily register my entire family at once.
5. As a primary registrant, I want the system to only ask for my WhatsApp number once and use it for any children I register, so that I don't have to provide dummy numbers for my kids.
6. As a primary registrant, I want to receive a unique QR code for each registered person via WhatsApp immediately after registration, so that I have the tickets ready for the event.
7. As an attendee, I want to receive a WhatsApp RSVP reminder 7 days before the event, so that I don't forget the event date.
8. As an attendee, I want to reply "Tidak Hadir" to the RSVP to cancel my registration, so that I can free up the quota for someone else.
9. As an admin, I want the system to automatically block duplicate registrations (same Full Name + WhatsApp number combination), so that the attendee list remains accurate.
10. As a Master Admin, I want to securely log in to the dashboard, so that I can manage the event data.
11. As a Master Admin, I want to create and manage other admin accounts, so that I can delegate tasks to the organizing committee.
12. As an admin, I want to view a real-time statistical overview (Total Quota, Remaining, Checked-in, Cancelled), so that I can monitor event capacity.
13. As an admin, I want to search, filter, and view the complete participant list, so that I can easily find specific attendees.
14. As an admin, I want to export the participant data to a CSV or XLSX file, so that I can perform offline reporting.
15. As an admin, I want to import participant data from a CSV or XLSX file, so that I can easily migrate data if needed.
16. As an admin, I want to perform a manual check-in from the data table, so that I can admit attendees who lost their QR codes.
17. As an on-site organizer, I want to open the QR Scanner tool on my smartphone through the admin dashboard, so that I can scan attendee QR codes.
18. As an on-site organizer, I want the QR scanner to flash Green for a successful check-in, Yellow if already checked in, and Red if invalid, so that I can quickly process the queue.
19. As a Master Admin, I want to manually toggle the public registration form open or closed from the dashboard, so that I can control registrations on the day of the event.
20. As an admin, I want to register walk-in attendees via an On-Site Registration form, so that unexpected guests can be accommodated within the 440 hard limit.

## Implementation Decisions

- **Tech Stack:** Next.js (App Router), PostgreSQL, Prisma ORM, Tailwind CSS, Shadcn UI, NextAuth.js.
- **Data Model:**
  - `Participant`: Handles all attendees. Uniqueness enforced via `(full_name, whatsapp_number)` constraint. Children inherit the primary registrant's WhatsApp number. Status tracking includes `REGISTERED`, `CHECKED_IN`, and `CANCELLED`.
  - `User`: Admin credentials and roles (`MASTER`, `ADMIN`).
  - `SystemConfig`: Key-value store for global toggles (e.g., `is_registration_open`, `max_online_quota`).
- **QR Scanner:** Integrated directly into the web app using `html5-qrcode`. Access is restricted to smartphone devices via user-agent or viewport checks.
- **WhatsApp Integration:** Implemented as a Mock Service (simulating the Meta Cloud API) that logs actions instead of actually calling external APIs, ensuring it is ready for real credentials later.
- **RSVP Webhook Logic:** A mock webhook endpoint will simulate receiving "Tidak Hadir" messages, which will transition the matched participant's status to `CANCELLED`.
- **Form Submission:** Registration endpoints will support batch insertion (arrays) to handle multi-participant group registrations in a single transaction.

## Testing Decisions

- **Good Test Criteria:** Tests will focus entirely on external behavior and API boundaries rather than internal implementation details. For example, registering a user should verify the database state and the mock WhatsApp log, not the specific Prisma methods invoked.
- **Modules to Test:**
  - *Registration API:* Validate duplicate rejection, batch insertion success, and child WhatsApp inheritance.
  - *QR Check-in API:* Verify state transitions from `REGISTERED` to `CHECKED_IN`, and idempotency (handling repeat scans).
  - *RSVP Webhook API:* Ensure "Tidak Hadir" correctly cancels the registration and frees quota.
  - *Admin Authentication:* Ensure protected routes block unauthorized access.
- **Prior Art:** Since this is a greenfield Next.js project, we will establish standard Jest + Supertest (or Next.js native test utilities) testing patterns for the API routes, and React Testing Library for critical UI components like the registration form.

## Out of Scope

- Direct integration with the live Meta WhatsApp Cloud API (mocked for now).
- Payment gateway integration (this is a free event).
- Seat assignment or ticketing tiers (all attendees are general admission).

## Further Notes

- The system has a strict hard limit of 440 participants. The online quota is defaulted to 400, leaving 40 slots for on-site registrations, but this can be adjusted via the `SystemConfig` by the Master Admin.
