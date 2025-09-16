import React, { useEffect, useState } from "react";
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";

const IncomingCallModal = () => {
    const {
    ringing,
    incomingCaller,
    incomingFrom,
    isCalling,
    outgoingTo,
    acceptCall,
    rejectCall,
    cancelOutgoingCall,
  } = useCallStore();
  const { getUserById } = useChatStore();
  const [calleeInfo, setCalleeInfo] = useState(null);
  const [callerFallback, setCallerFallback] = useState(null);

    useEffect(() => {
    if (isCalling && outgoingTo) {
      const fetchCalleeInfo = async () => {
        const userInfo = await getUserById(outgoingTo);
        setCalleeInfo(userInfo);
      };
      fetchCalleeInfo();
    }
  }, [isCalling, outgoingTo, getUserById]);

    // If backend didn't include full caller info in the invite payload,
    // fall back to fetching the caller user by `incomingFrom` id so the
    // popup shows the actual caller (not the selected/callee user).
    useEffect(() => {
      let mounted = true;
      if (ringing && !incomingCaller && incomingFrom) {
        (async () => {
          try {
            const u = await getUserById(incomingFrom);
            if (mounted) setCallerFallback(u);
          } catch (e) {
            console.warn('Failed to fetch caller info', e);
          }
        })();
      } else {
        setCallerFallback(null);
      }
      return () => { mounted = false; };
    }, [ringing, incomingCaller, incomingFrom, getUserById]);

  const isIncoming = ringing && (incomingCaller || callerFallback);
  const isOutgoing = isCalling && outgoingTo;

  let userInfo = null;
  let callType = '';

  if (isIncoming) {
    userInfo = incomingCaller || callerFallback;
    callType = 'Incoming call';
  } else if (isOutgoing) {
    userInfo = calleeInfo;
    callType = 'Calling...';
  }

  if (!isIncoming && !isOutgoing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-base-100 rounded-xl shadow-xl w-[92%] max-w-sm p-5 border border-base-300">
        <div className="flex items-center gap-3">
          <div className="avatar">
            <div className="w-12 h-12 rounded-full">
              <img src={userInfo?.profilePic || "/avatar.png"} alt={userInfo?.fullName || callType} />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {isIncoming ? (
                <PhoneIncoming className="w-5 h-5 text-success" />
              ) : (
                <PhoneOutgoing className="w-5 h-5 text-primary" />
              )}
              <h3 className="font-semibold">{callType}</h3>
            </div>
            <p className="text-sm text-base-content/70">
              {userInfo?.fullName || "Unknown user"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={isOutgoing ? () => cancelOutgoingCall() : () => rejectCall("declined")}
            className="btn btn-sm btn-error"
            title={isIncoming ? 'Decline' : 'Cancel'}
          >
            <PhoneOff className="w-4 h-4 mr-2" /> {isIncoming ? 'Decline' : 'Cancel'}
          </button>
          {isIncoming && (
            <button
              onClick={acceptCall}
              className="btn btn-sm btn-success"
              title="Accept"
            >
              <Phone className="w-4 h-4 mr-2 rotate-90" /> Accept
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
