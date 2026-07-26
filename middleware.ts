import { NextRequest, NextResponse } from "next/server";

// Simple HTTP Basic Auth in front of the /appointments dashboard. Good
// enough for a single-doctor internal tool; swap for a real auth provider
// (NextAuth, Clerk, Supabase Auth) if you need multiple staff logins later.
export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  // If credentials aren't configured, don't lock the operator out during
  // local dev — just let it through.
  if (!user || !pass) return NextResponse.next();

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [reqUser, reqPass] = decoded.split(":");
      if (reqUser === user && reqPass === pass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Appointments Dashboard"' },
  });
}

export const config = {
  matcher: ["/appointments/:path*"],
};
