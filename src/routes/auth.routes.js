import express from 'express'
import verifyToken from '../middlewares/verifyToken.js';

const router = express.Router();
router.post('/login', async (req,res)=>{
  try{
    const {email}= req.body;
    const token =jsonwebtoken.sign(
      {email},
      process.env.JWT_SECRET,
      {expiresIn:process.env.JWT_EXPIRES_IN || "7d"}
    );
    res.send({
      success:true,
      message:"Login Successful",
      token,
    });
  }catch(error){
     res.status(500).send({
      success:false,
      message:error.message,
     });
  }
});
router.get("/profile", verifyToken,(req,res)=>{
  res.send({
message:"Profile data",
user:req.user,
  })
})

export default router;