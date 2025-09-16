import {Server, Socket } from 'socket.io';
import http from  'http';
import express from 'express';
import User from '../models/user.models.js';


const app=express()
const server=http.createServer(app);


const io=new Server(server,{
    cors:{
        origin:['http://localhost:5173']
    }
});
export function getReceiverSocketId(userId){
    return userSocketMap[userId]
}
const userSocketMap={
    
}

io.on('connection',(socket)=>{



    console.log('A user Conencted',socket.id)
    const userId=socket.handshake.query.userId


    if (userId) userSocketMap[userId]=socket.id
    io.emit('getOnlineUsers',Object.keys(userSocketMap));

    // Call invitation signaling
    socket.on('call:invite', async ({ to, fromUser }) => {
        try {
            const receiverSocketId = getReceiverSocketId(to);
            if (!receiverSocketId) return;
            let caller = fromUser;
            if (!caller) {
                const user = await User.findById(userId).select('fullName profilePic');
                if (user) {
                    caller = { _id: String(user._id), fullName: user.fullName, profilePic: user.profilePic };
                }
            }
            io.to(receiverSocketId).emit('call:invite', { from: userId, fromUser: caller });
        } catch (e) {
            const receiverSocketId = getReceiverSocketId(to);
            if (receiverSocketId) io.to(receiverSocketId).emit('call:invite', { from: userId });
        }
    });

    socket.on('call:accept', ({ to }) => {
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call:accept', { from: userId });
        }
    });

    socket.on('call:reject', ({ to, reason }) => {
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call:reject', { from: userId, reason });
        }
    });

    socket.on('call:end', ({ to }) => {
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call:end', { from: userId });
        }
    });

    // WebRTC signaling relay
    socket.on('webrtc:offer', ({ offer, to }) => {
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('webrtc:offer', { offer, from: userId });
        }
    });

    socket.on('webrtc:answer', ({ answer, to }) => {
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('webrtc:answer', { answer, from: userId });
        }
    });

    socket.on('webrtc:ice-candidate', ({ candidate, to }) => {
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('webrtc:ice-candidate', { candidate, from: userId });
        }
    });




    socket.on('disconnect',()=>{
        console.log('A user DisConnected', socket.id)
        delete userSocketMap[userId];
        io.emit('getOnlineUsers',Object.keys(userSocketMap));
    })

});




export {io,app,server}