import { withAuth } from "next-auth/middleware";
import { authorizedCallback } from "@/lib/auth-guard";

if (!process.env.NEXTAUTH_SECRET?.trim()) {
  throw new Error("NEXTAUTH_SECRET is required");
}

export default withAuth({
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    authorized: authorizedCallback,
  },
});

export const config = {
  matcher: ["/admin/:path*"],
};
