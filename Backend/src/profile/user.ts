import cookie from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import cookies from "cookie";
import { ConnectionStates, set } from "mongoose";

export const Profile = (app: Elysia) =>
  app.group("/user", (app) =>
    app
      .use(
        jwt({
          name: "jwt",
          secret: "your-secret-key",
        })
      )
      .derive(async ({ jwt, set, request }) => {
        const Cookieheaders = request.headers.get("cookie") || "";
        const cookieparse = cookies.parse(Cookieheaders);
        const auth = cookieparse.auth;
        if (!auth) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const decoded = await jwt.verify(auth);
        if (typeof decoded !== "object" || decoded === null) {
          set.status = 401;
          return { error: "Invalid token" };
        }
        set.status = 200;
        return { decoded };
      })
      .use(cookie())
      .get("/profile", async ({ decoded, set }) => {
        if (!decoded) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const { username, email } = decoded as {
          username: string;
          email: string;
        };
        return {
          User: username,
          Email: email,
        };
      })
  );
