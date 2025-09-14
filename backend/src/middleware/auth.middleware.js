import jwt from 'jsonwebtoken';
import User  from '../models/user.models.js';

export const protectRoute=async (req,res,next)=>{
    try {
        // Prefer token from Authorization header to support per-tab session tokens
        const authHeader = req.headers.authorization || req.headers.Authorization;
        let token;
        if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else {
            token = req.cookies.token;
        }
        if (!token){
            return res.status(401).json({message:'not authorized-No token'});
        }

        const decoded=jwt.verify(token,process.env.JWT_SECRET);
        if (!decoded){
            return res.status(401).json({message:'not authorized-token failed'});
        }

        const user =await User.findById(decoded.userId).select('-password');

        if (!user){
            return res.status(401).json({message:'not authorized-user not found'});
        }
        req.user=user;
        next();
    } catch (error) {
        console.log('Error in the protectRoute middleware ', error.message);
        res.status(500).json({message:'server error'});
    }
}