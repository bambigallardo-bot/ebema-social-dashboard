import { NextResponse } from "next/server";

// Protección opcional por usuario/contraseña (HTTP Basic).
// Si DASHBOARD_USER y DASHBOARD_PASSWORD están vacíos -> link ABIERTO.
export function middleware(req) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.split(" ")[1]);
      const i = decoded.indexOf(":");
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch (_) {}
  }

  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ebema Social Dashboard"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
