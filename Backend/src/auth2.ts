import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { Connectdb } from "../lib/connect";
import bcrypt, { hash } from 'bcrypt';
import User from "../lib/model";
import dotenv from 'dotenv'
dotenv.config()
interface RegisterBody {
  username: string;
  password: string;
  email: string;
}

interface SignBody {
  username: string;
  password: string;
}

interface VerifiedToken {
  username: string;
  email: string;
}
export const auth3 = (app: Elysia) =>
  app.group('/auth', (app) => { 
    
    // เปลี่ยนชื่อพารามิเตอร์เป็น 'auth' เพื่อหลีกเลี่ยงความสับสนกับ 'app'
    
    app
      .use(
        jwt({
          name: 'jwt',
          secret: process.env.JWT_SECRET!,
        })
      )
      .use(cookie())
      .post('/register', async ({ body,set }) => {
        const { username, password, email } = body as RegisterBody;
       
        if (!username || !password || !email) {
          return { error: 'All fields (username, password, email) are required' };
        }
        await Connectdb();
        const checkuser=await User.findOne({email})
        if(checkuser){
          set.status=401
          return{
            error: "Error email all ready in use"
          }
        }
        
        // นำpassword มาเข้ารหัส 

        
              const hashpass=await bcrypt.hash(password,10)

       
        // นำข้อมูลมาบันทึกในฐานข้อมูล


        const user = await User.create({ username, email, password:hashpass });
        if (!user) {
          set.status = 500;
          return {
            message: "Error not user"
          };
        }

  
        set.status = 200;
        return { message: 'User data received successfully' };
      })
      .post('/login', async ({ body, set,jwt }) => { // ลบเครื่องหมายจุลภาคที่นี่
        const { username, password } = body as SignBody; 
        
       
        
        // เช็คว่าผู้ใช้กรอกข้อมูลครบหรือไม่
        if (!username || !password) {
          set.status = 400;
          return { error: 'Username and password are required' };
        }

        await Connectdb();
        const user = await User.findOne({ username }); 
           // หา user ในฐานข้อมูล
        if (!user) {
          set.status = 401;
          return { error: 'Invalid User' };
        }
       const isMatch=await bcrypt.compare(password,user.password)
        if(!isMatch){
          set.status=401;
          return {
            error: 'Invalid password' 
          }
      }
      //สร้าง payload ไว้บันทึกข้อมูลของuser
      const payload={
        username: user.username,
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      }
      
      set.status = 201;
      const token = await jwt.sign(payload);
    
        // ถ้าเจอผู้ใช้และข้อมูลถูกต้อง
       
       console.log("Token:",token)
       set.cookie = {
        auth: {  // ชื่อคุกกี้
          value: token, // ค่าในคุกกี้
          httpOnly: true, // ทำให้คุกกี้เป็นแบบ HttpOnly
          path: '/', // ระบุเส้นทาง
          // คุณสามารถเพิ่มคุณสมบัติอื่น ๆ ได้ เช่น expires, secure
      }
       }
        return { message: 'Login successful', user};
      });
   
    return app; // คืนค่าอินสแตนซ์ของกลุ่ม
  });

export default auth3;
