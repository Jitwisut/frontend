import mongoose from 'mongoose';
import dotenv from 'dotenv'
dotenv.config()
const url = process.env.MONGO_URL;
export const Connectdb=async () => {
    try{
       await mongoose.connect(url!)    
    }catch(err){
        console.log("Fila to connect mongodb",err)
    }
}