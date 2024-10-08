
import mongoose,{Schema} from "mongoose";

const Userschema=new Schema(
    {
        username: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        password: {
            type: String,
            required: true
        },
        role: {
            type: String,
            required: false,
            default: "user"
        },
        // ฟิลด์สำหรับจัดการล็อกอินผิดพลาด
        loginAttempts: {
          type: Number,
          required: false,
          default: 0 // เริ่มต้นจาก 0
        },
        isLocked: {
          type: Boolean,
          required: false,
          default: false // บัญชีเริ่มต้นจะไม่ถูกล็อก
        },
        lockoutEndTime: {
          type: Date,
          required: false
        }
      },
        
    {timestamps: true}
)

const User=mongoose.models.user||mongoose.model("User",Userschema)

export default User;