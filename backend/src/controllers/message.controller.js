import User from "../models/user.models.js";
import Message from "../models/message.models.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
export const getUserForSidebar=async(req,res)=>{
    try {
        const loggedInUserId=req.user._id;
        const filteredUsers=await User.find({_id:{$ne:loggedInUserId}}).select('-password');
        
        // Get unread message counts for each user
        const usersWithUnreadCounts = await Promise.all(
            filteredUsers.map(async (user) => {
                const unreadCount = await Message.countDocuments({
                    senderId: user._id,
                    receiverId: loggedInUserId,
                    isRead: false
                });
                return {
                    ...user.toObject(),
                    unreadCount
                };
            })
        );
        
        console.log(usersWithUnreadCounts)
        res.status(200).json(usersWithUnreadCounts)
        
    } catch (error) {
        console.log('Error in the getUserForSidebar controller ', error.message);
        res.status(500).json({message:'server error'});
        
    }
}


export const getMessages=async (req,res)=>{
try {
    const {id:userToChatId}=req.params;
    const myId=req.user._id;


    const messages= await Message.find({ 
        $or:[
            {senderId:myId,receiverId:userToChatId},
            {senderId:userToChatId,receiverId:myId}
        ],   
    });

    // Mark messages as read when fetching them
    await Message.updateMany(
        {
            senderId: userToChatId,
            receiverId: myId,
            isRead: false
        },
        {
            isRead: true,
            readAt: new Date()
        }
    );

    res.status(200).json({messages});
} catch (error) {
    console.log('Error in the getMessages controller ', error.message);
    res.status(500).json({message:'server error'});
}
}


export const sendMessage=async (req,res)=>{
    try {
        const {text,image}=req.body;
        const{id:receiverId}=req.params;
        const senderId=req.user._id;

        let imageUrl;

        if (image){
            const uploadResponse=await cloudinary.uploader.upload(image);
            imageUrl=uploadResponse.secure_url;
        }
        const newMessage=new Message({
            senderId,
            receiverId,
            text,
            image:imageUrl,
        });
        await newMessage.save();



const receiverSocketId = getReceiverSocketId(receiverId);
const senderSocketId = getReceiverSocketId(senderId);

if (receiverSocketId) {
  io.to(receiverSocketId).emit("newMessage", newMessage);
}
if (senderSocketId) {
  io.to(senderSocketId).emit("newMessage", newMessage); // keeps sender in sync too
}

res.status(201).json({ newMessage });


    } catch (error) {
        console.log('Error in the sendMessage controller ', error.message);
        res.status(500).json({message:'server error'});
    }
}

export const markMessagesAsRead = async (req, res) => {
    try {
        const { id: senderId } = req.params;
        const receiverId = req.user._id;

        await Message.updateMany(
            {
                senderId: senderId,
                receiverId: receiverId,
                isRead: false
            },
            {
                isRead: true,
                readAt: new Date()
            }
        );

        // Emit socket event to update unread counts
        const receiverSocketId = getReceiverSocketId(receiverId);
        const senderSocketId = getReceiverSocketId(senderId);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("messagesRead", { senderId });
        }
        if (senderSocketId) {
            io.to(senderSocketId).emit("messagesRead", { senderId, receiverId });
        }

        res.status(200).json({ message: "Messages marked as read" });
    } catch (error) {
        console.log('Error in markMessagesAsRead controller:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
}
