import { withAuth } from "next-auth/middleware";

export default withAuth({
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "default_secret_for_development",
  callbacks: {
    authorized: ({ req, token }) => {
      const path = req.nextUrl.pathname;
      if (path.startsWith("/admin/login")) {
        return true;
      }
      const hasCookie =
        !!req.cookies.get("next-auth.session-token")?.value ||
        !!req.cookies.get("__Secure-next-auth.session-token")?.value;
      return !!token || hasCookie;
    },
  },
});

export const config = {
  matcher: ["/admin/:path*"],
};
