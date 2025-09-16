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
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;

      set({
        messages: [...get().messages, newMessage],
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;

      socket.off('newMessage');

  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),

  getUserById: async (userId) => {
    const { users } = get();
    // Check if user is already in the store
    const user = users.find(u => u._id === userId);
    if (user) {
      return user;
    }

    // If not, fetch from the API
    try {
      const res = await axiosInstance.get(`/users/${userId}`);
      const fetchedUser = res.data;
      // Add the new user to the users array without removing existing ones
      set(state => ({ users: [...state.users, fetchedUser] }));
      return fetchedUser;
    } catch (error) {
      console.error('Failed to fetch user by ID:', error);
      toast.error(error.response?.data?.message || 'Failed to get user details');
      return null;
    }
  },

}));
