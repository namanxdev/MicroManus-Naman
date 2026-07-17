import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

function copyResponseCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const authenticatedPages = path === "/subscribe"
    || path === "/settings"
    || path === "/usage"
    || path === "/chat"
    || path.startsWith("/chat/");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    if (!authenticatedPages) return response;
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    destination.searchParams.set("auth_error", "configuration");
    return NextResponse.redirect(destination);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser verifies the session with Supabase; do not authorize from getSession.
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user && authenticatedPages) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    destination.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return copyResponseCookies(response, NextResponse.redirect(destination));
  }

  const paywalledPage = path === "/settings"
    || path === "/usage"
    || path === "/chat"
    || path.startsWith("/chat/");
  if (user && paywalledPage) {
    const { data: entitlement } = await supabase
      .from("entitlements")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!entitlement) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/subscribe";
      destination.search = "";
      return copyResponseCookies(response, NextResponse.redirect(destination));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
