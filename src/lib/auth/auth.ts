// src/lib/auth/auth.ts
// Skeleton for NextAuth.js GitHub Integration

import NextAuth, { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: { params: { scope: "read:user" } },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Create or retrieve relay token for the user here
      if (session?.user) {
        // Mock Relay Token for MVP
        (session.user as any).relayToken = `relay_${token.sub}`;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};

export default NextAuth(authOptions);
