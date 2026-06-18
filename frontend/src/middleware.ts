import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: {
    signIn: "/login",
  },
})

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/issues/:path*",
    "/preferences/:path*",
    "/reports/:path*",
    "/scan-history/:path*",
  ],
}
