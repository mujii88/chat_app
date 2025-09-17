import { create } from 'zustand';
import toast from 'react-hot-toast';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from './useAuthStore';
import notificationSound from '../lib/notificationSound';

export const useChatStore = create((set, get) => ({

  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  unreadCounts: {},

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get('/messages/users');
      console.log(res);
      set({ users: res.data });
      
      // Extract unread counts from users data
      const unreadCounts = {};
      res.data.forEach(user => {
        unreadCounts[user._id] = user.unreadCount || 0;
      });
      set({ unreadCounts });
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
      
      // Mark messages as read and update unread count
      const { unreadCounts } = get();
      if (unreadCounts[userId] > 0) {
        set({ 
          unreadCounts: { 
            ...unreadCounts, 
            [userId]: 0 
          } 
        });
      }
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

    socket.on("newMessage", (newMessage) => {
      const { unreadCounts, selectedUser } = get();
      const { authUser } = useAuthStore.getState();
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser?._id;
      const isMessageFromMe = newMessage.senderId === authUser._id;
      
      if (isMessageSentFromSelectedUser) {
        // Message from currently selected user - add to messages
        set({
          messages: [...get().messages, newMessage],
        });
        
        // Play notification sound for incoming messages (not from me)
        if (!isMessageFromMe) {
          notificationSound.playNotificationSound();
        }
      } else {
        // Message from other user - increment unread count
        set({
          unreadCounts: {
            ...unreadCounts,
            [newMessage.senderId]: (unreadCounts[newMessage.senderId] || 0) + 1
          }
        });
        
        // Play notification sound for new messages (not from me)
        if (!isMessageFromMe) {
          notificationSound.playNotificationSound();
        }
      }
    });

    socket.on("messagesRead", ({ senderId }) => {
      const { unreadCounts } = get();
      set({
        unreadCounts: {
          ...unreadCounts,
          [senderId]: 0
        }
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;

    socket.off('newMessage');
    socket.off('messagesRead');
  },

  setSelectedUser: (selectedUser) => {
    set({ selectedUser });
    
    // Mark messages as read when selecting a user
    if (selectedUser) {
      const { unreadCounts } = get();
      if (unreadCounts[selectedUser._id] > 0) {
        set({ 
          unreadCounts: { 
            ...unreadCounts, 
            [selectedUser._id]: 0 
          } 
        });
      }
    }
  },

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
