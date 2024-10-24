import { cookie } from "@elysiajs/cookie";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { auth3 } from "./auth2";
import { auth4 } from "./authbyme.d";
import { Connectdb } from "../lib/connect";
import { Profile } from "./profile/user";
import { Carts } from "./cars/cars";

const app = new Elysia();
//auth3(app)
const Startsever = async () => {
  try {
    app
      .use(
        jwt({
          name: "jwt",
          secret: process.env.JWT_SECRET!,
        })
      )

      .use(cors())
      //.use(auth3)
      .use(auth4)
      .use(Profile)
      .use(Carts)
      // .use(Carts2)
      .get("/", () => "Hello Elysia")
      .listen(4000, () => {
        console.log(
          `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
        );
      });
  } catch (err) {
    console.log(err);
  }
};
Startsever();
