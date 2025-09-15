import { X, Phone } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";
import toast from "react-hot-toast";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const { startCall, inCall, isCalling, ringing, incomingFrom, acceptCall, rejectCall, endCall, peerUserId } = useCallStore();

  const handleCall = async () => {
    if (!selectedUser) return;
    const isOnline = onlineUsers.includes(selectedUser._id);
    if (!isOnline) {
      toast.error("User is offline; cannot start call");
      return;
    }
    try {
      await startCall(selectedUser._id);
    } catch (e) {
      console.error('Failed to start call', e);
      toast.error('Failed to start call');
    }
  };



  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img
                src={selectedUser.profilePic || "/avatar.png"}
                alt={selectedUser.fullName}
              />
            </div>
          </div>

          {/* User info */}
          <div>
            <h3 className="font-medium">{selectedUser.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {onlineUsers.includes(selectedUser._id) ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        {/* Actions: Call controls + Close */}
        <div className="flex items-center gap-3">
          {/* Incoming call prompt when ringing from this user */}
          {ringing && (
            <div className="flex items-center gap-2">
              <span className="text-sm">Incoming call...</span>
              <button
                onClick={acceptCall}
                className="btn btn-xs btn-success"
                title="Accept"
              >
                Accept
              </button>
              <button
                onClick={() => rejectCall('declined')}
                className="btn btn-xs btn-error"
                title="Decline"
              >
                Decline
              </button>
            </div>
          )}

          {/* Dialing indicator */}
          {isCalling && peerUserId === selectedUser._id && (
            <span className="text-sm text-base-content/70">Calling...</span>
          )}

          {/* End Call if in a call with this user */}
          {inCall && peerUserId === selectedUser._id && (
            <button
              onClick={endCall}
              className="p-2 rounded-full hover:bg-base-200 transition"
              title="End Call"
            >
              <X className="w-5 h-5 text-red-500" />
            </button>
          )}

          {/* Start call button (disabled while calling or already in call) */}
          {!inCall && (
            <button
              onClick={handleCall}
              className="p-2 rounded-full hover:bg-base-200 transition"
              title={isCalling ? "Calling..." : "Start Call"}
              disabled={isCalling}
            >
              <Phone className="w-5 h-5 text-green-500" />
            </button>
          )}

          {/* Close chat */}
          <button
            onClick={() => setSelectedUser(null)}
            className="p-2 rounded-full hover:bg-base-200 transition"
            title="Close Chat"
          >
            <X className="w-5 h-5 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default ChatHeader;
