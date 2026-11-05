import { NextResponse, type NextRequest } from "next/server";
import { followUpEnabled } from "./lib/access";

export function proxy(request: NextRequest) {
  if (!followUpEnabled && (request.nextUrl.pathname.startsWith("/api/follow-up/") || request.nextUrl.pathname === "/api/follow-up" || request.nextUrl.pathname.startsWith("/meta-review"))) {
    return NextResponse.json({ disabled:true,error:"Follow Up temporariamente desativado." },{status:503,headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/follow-up/:path*", "/meta-review/:path*"] };
