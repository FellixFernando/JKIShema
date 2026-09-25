import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ req, token }) => {
      const path = req.nextUrl.pathname;
      if (path.startsWith("/admin/login")) {
        return true;
      }
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/admin/:path*"],
};
