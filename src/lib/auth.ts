import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyCredentials } from "@/services/auth.service";

export function resolveNextAuthSecret(env: { NEXTAUTH_SECRET?: string } = process.env): string {
  const secret = env.NEXTAUTH_SECRET?.trim()
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required");
  }
  return secret
}

const secret = resolveNextAuthSecret()

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "admin" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await verifyCredentials(credentials.username, credentials.password);
        
        if (user) {
          return {
            id: user.id,
            name: user.username,
            role: user.role,
          };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    }
  },
  pages: {
    signIn: '/admin/login',
  },
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60,
    updateAge: 60 * 60,
  },
  secret,
};
