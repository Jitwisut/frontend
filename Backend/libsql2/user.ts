import { Elysia, t } from "elysia";
import { clients } from "../libsql/connect";
import bcrypt from "bcrypt";
export const User = (app: Elysia) => {
  app.post(
    "/login",
    async ({ set, body }) => {
      const { username, password, email } = body;
      if (!username || !password || !email) {
        set.status = 400;
        return { error: "Missing username, password, or email" };
      }
      const user = await clients.query(
        "SELECT * FROM users WHERE username=$1 ",
        [username]
      );
      if (!user.rows[0]) {
        set.status = 404;
        return { error: "User not found" };
      }
      if (user.rows[0].is_locked === true) {
        const currentTime = new Date();
        const lockEndTime = new Date(user.rows[0].lockout_end_time);
        if (currentTime < lockEndTime) {
          set.status = 403;
          return {
            message: `Account is locked untii ${lockEndTime}. Please try again later.`,
          };
        } else {
          await clients.query(
            "UPDATE users SET is_locked=$1,login_attempts = $2, lockout_end_time = $3 WHERE username=$4",
            [false, 0, null, username]
          );
        }
      }
      const isMatch = await bcrypt.compare(password, user.rows[0].password);
      if (!isMatch) {
        set.status = 400;
        user.rows[0].login_attempts++;
        await clients.query(
          "UPDATE users SET login_attempts = $1 WHERE username = $2",
          [user.rows[0].login_attempts, username]
        );
        if (user.rows[0].login_attempts >= 5) {
          const locktime = new Date();
          locktime.setMinutes(locktime.getMinutes() + 15);

          set.status = 432;
          user.rows[0].is_locked = true;
          user.rows[0].lockout_end_time = locktime;
          await clients.query(
            "UPDATE users SET is_locked=$1,lockout_end_time=$2 WHERE username=$3",
            [true, user.rows[0].lockout_end_time, username]
          );
          return { error: "Try many login user is lock 555" };
        }
        return { error: "Please Try again" };
      }
      //อัพเดทข้อมูลในฐานข้อมูล
      await clients.query(
        "UPDATE users SET is_locked=$1, login_attempts=$2 WHERE username=$3",
        [false, 0, username]
      );

      return { message: "Login Success", User: user.rows[0] };
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
        email: t.String(),
      }),
    }
  );
  return app;
};

export default User;
