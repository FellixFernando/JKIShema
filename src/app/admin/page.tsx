import { redirect } from 'next/navigation';

export default function AdminPage() {
  // We'll build the dashboard here in Ticket 05.
  // For now, it's just a protected empty route.
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Admin Dashboard (Protected)</h1>
      <p>Welcome to the secure admin area.</p>
    </div>
  );
}
