import { generateToken } from '../lib/utils.js';
import User from '../models/user.models.js';
import bcrypt from 'bcryptjs';
import cloudinary from '../lib/cloudinary.js';
export const signup=async (req, res) => {
    const{fullName,email,password}=req.body;
    try {

        if (password.length <6){
            return res.status(400).json({message:'password must be atleast 6 characters long'});
        }
        const user=await User.findOne({email});
        if (user){
            return res.status(400).json({message:'user already exist'});  
        }

        const salt=await bcrypt.genSalt(10);
        const hashedPassword=await bcrypt.hash(password,salt);
        const newUser=new User({
            fullName,
            email,
            password:hashedPassword
        })

        if (newUser){
            const token = generateToken(newUser._id,res)
            await newUser.save();
            res.status(201).json({
                _id:newUser._id,
                fullName:newUser.fullName,
                email:newUser.email,
                profilePic:newUser.profilePic,
                token,
              
            })

        }else{
            res.status(400).json({message:'invalid user data'});
        }

          

    }catch(error){
        console.log('Error in the signup controller ', error.message);
        res.status(500).json({message:'server error'});

    }
};


export const login=async (req, res) => {
    const {email,password}=req.body;
    try {
        const user=await User.findOne({email});
        if (!user){
            return res.status(400).json({message:'user does not exist'});
        }

        const isCorrect=await bcrypt.compare(password,user.password);
        if (!isCorrect){
            return res.status(400).json({message:'wrong password'});
            
        }

        const token = generateToken(user._id,res)
        res.status(200).json({
            _id:user._id,
            fullName:user.fullName,
            email:user.email,
            profilePic:user.profilePic,
            token,
        })


        
    } catch (error) {
        console.log('Error in the login controller ', error.message);
        res.status(500).json({message:'server error'});
        
    }
};


export const logout=(req, res) => {
   try {
    res.cookie('token','',{
        maxAge:0});
    res.status(200).json({message:'logged out successfully'});
   } catch (error) {
       console.log('Error in the logout controller ', error.message);
       res.status(500).json({message:'server error'});
   }
};

export const updateProfile=async (req,res)=>{
    try {
        const {profilePic}=req.body;
        const userId=req.user._id

        if (!profilePic){
            return res.status(400).json({message:'profile picture is required'});
        }

        const uploadResponse=await cloudinary.uploader.upload(profilePic)
        const updatedUser=await User.findByIdAndUpdate(userId,
            {profilePic:uploadResponse.secure_url},
            {new:true});

        res.status(200).json(updatedUser)
            

        
        
    } catch (error) {
        console.log('Error in the updateProfile controller ', error.message);
        res.status(500).json({message:'server error'});
        
    }

}

export const checkAuth=(req,res)=>{
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.log('Error in the checkAuth controller ', error.message);
        res.status(500).json({message:'server error'});

    }
}