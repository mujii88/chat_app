import { create } from 'zustand';
import toast from 'react-hot-toast';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';

export const useChatStore = create((set, get) => ({

  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get('/messages/users');
      console.log(res);
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data.messages });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        messageData
      );
      const newMessage = res.data.newMessage;
      set({ messages: [...messages, newMessage] });
      toast.success("Message successfully stored");
    } catch (error) {
      console.error("Send message failed:", error.response?.data || error.message);
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    const authState = useAuthStore.getState();
    const { selectedUser } = get();

    // Guard clause: Do not proceed if there is no selected user or socket.
    if (!socket || !selectedUser || !authState.user) {
        return;
    }
    
    const myId = authState.user._id;

    socket.on('newMessage', (newMessage) => {
      const { messages } = get();
      
      if (newMessage.senderId === selectedUser._id || newMessage.receiverId === selectedUser._id) {
          set({ messages: [...messages, newMessage] });
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off('newMessage');
    }
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),

}));
