import { NextRequest, NextResponse } from "next/server";
import { OPERATOR_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth-constants";

const PUBLIC_PATHS = [
  "/login",
  "/system",
  "/operator/login",
  "/api/auth/login",
  "/api/operator/auth/login",
  "/api/public",
  "/api/test",
  "/api/workflows",
  "/api/widget.js",
  "/widget",
];

const PUBLIC_EXACT_PATHS = ["/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/operator")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/operator")) {
    const operatorSession = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
    if (!operatorSession) {
      return NextResponse.redirect(new URL("/operator/login", request.url));
    }

    return NextResponse.next();
  }

  const adminSession = request.cookies.get(SESSION_COOKIE)?.value;
  const operatorSession = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (!adminSession) {
    if (operatorSession) {
      return NextResponse.redirect(new URL("/operator", request.url));
    }
    return NextResponse.redirect(new URL("/system", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
