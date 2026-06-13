import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that require an active membership (not just sign-in)
const isMemberRoute = createRouteMatcher([
  "/courses/(.*)",          // all course pages — free courses gate at component level
  "/account(.*)",
]);

// Routes that require any sign-in
const isAuthRoute = createRouteMatcher([
  "/account(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isAuthRoute(req)) {
    await auth.protect();
  }
  // Member-only gating is handled at the component level (CourseGate)
  // so the middleware only needs to protect account pages here
});

export const config = {
  matcher: [
    // Run on all routes except static files and Next.js internals
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
