import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") || 
                     req.nextUrl.pathname.startsWith("/signup");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isGuestPage = req.nextUrl.pathname.startsWith("/guest");
  const isStaffPage = req.nextUrl.pathname.startsWith("/staff");
  const isHomePage = req.nextUrl.pathname === "/";

  // Allow auth API routes
  if (isApiAuth) {
    return NextResponse.next();
  }

  // Allow home page, guest pages, and staff pages without authentication
  if (isHomePage || isGuestPage || isStaffPage) {
    return NextResponse.next();
  }

  // Redirect logged in users away from auth pages
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/tournaments", req.url));
  }

  // Protect dashboard routes
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

