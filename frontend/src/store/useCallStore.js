import { create } from 'zustand';
import toast from 'react-hot-toast';
import { useChatStore } from './useChatStore';
import { useAuthStore } from './useAuthStore';

// Simple helper to ensure we have a global hidden audio element for remote stream playback
function ensureRemoteAudioEl() {
  let el = document.getElementById('remote-audio');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'remote-audio';
    el.autoplay = true;
    el.playsInline = true;
    el.muted = false;
    el.volume = 1.0;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

// Ringtone utilities
function ensureRingtoneEl() {
  let el = document.getElementById('incoming-call-tone');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'incoming-call-tone';
    el.loop = true;
    el.preload = 'auto';
    // Louder ringtone asset (can be replaced with a local file later)
    el.src = 'https://actions.google.com/sounds/v1/alarms/old_fashioned_clock_alarm.ogg';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

// WebAudio boost chain for ringtone
// Removed WebAudio chain to avoid InvalidStateError when HMR/hot reload rebinds sources.

async function playRingtone() {
  try {
    const el = ensureRingtoneEl();
    el.muted = false;
    el.volume = 1.0;
    el.currentTime = 0;
    await el.play();
  } catch (e) {
    // Autoplay may be blocked; ignore
    console.warn('Ringtone play blocked by browser', e);
  }
}

function stopRingtone() {
  const el = document.getElementById('incoming-call-tone');
  if (el) {
    try { el.pause(); } catch {}
    el.currentTime = 0;
  }
}

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const useCallStore = create((set, get) => ({
  socket: null,
  pc: null,
  localStream: null,
  remoteStream: null,
  inCall: false,
  isCalling: false,
  peerUserId: null,
  // invitation states
  ringing: false, // true when receiving an invite
  incomingFrom: null, // userId of caller
  outgoingTo: null, // userId of callee when inviting
  ending: false, // guard to avoid duplicate end handling
  incomingCaller: null, // cached caller info { _id, fullName, profilePic }

  attachSocket: (socket) => {
    if (!socket) return;
    const current = get().socket;
    if (current && current.id === socket.id) return; // already attached

    set({ socket });

    socket.off('webrtc:offer');
    socket.off('webrtc:answer');
    socket.off('webrtc:ice-candidate');
    socket.off('call:invite');
    socket.off('call:accept');
    socket.off('call:reject');
    socket.off('call:end');

    // Call invitation handlers
    socket.on('call:invite', ({ from, fromUser }) => {
      // Prefer strictly the backend-provided identity to avoid showing the wrong user
      const auth = useAuthStore.getState();
      const chatState = useChatStore.getState();
      let caller = null;
      if (fromUser && typeof fromUser === 'object') {
        caller = {
          _id: fromUser._id || from,
          fullName: fromUser.fullName,
          profilePic: fromUser.profilePic,
        };
      }
      // Guard against accidentally showing self
      if (caller && auth?.authUser && caller._id === auth.authUser._id) {
        caller = null;
      }
      // Final resolution: if payload missing or equals self, use selected chat user (the one you're in a thread with)
      let resolved = caller ? { _id: caller._id, fullName: caller.fullName, profilePic: caller.profilePic } : null;
      if (!resolved && chatState?.selectedUser) {
        const su = chatState.selectedUser;
        // Only use selectedUser if it is not self
        if (!auth?.authUser || su._id !== auth.authUser._id) {
          resolved = { _id: su._id, fullName: su.fullName, profilePic: su.profilePic };
        }
      }
      set({ ringing: true, incomingFrom: from, peerUserId: from, isCalling: false, inCall: false, incomingCaller: resolved });
      toast(`Incoming call${resolved?.fullName ? ` from ${resolved.fullName}` : ''}`);
      playRingtone();
    });

    socket.on('call:accept', async ({ from }) => {
      // Callee accepted; caller proceeds to create offer
      try {
        const { outgoingTo } = get();
        if (!outgoingTo || outgoingTo !== from) return;
        set({ peerUserId: from });
        await get().preparePeer(from);
        const pc = get().pc;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        get().socket.emit('webrtc:offer', { offer, to: from });
        toast.success('Call accepted. Connecting...');
      } catch (err) {
        console.error('Error proceeding after accept:', err);
        set({ isCalling: false });
      }
    });

    socket.on('call:reject', ({ from, reason }) => {
      const { outgoingTo, incomingFrom, ringing } = get();

      // Handles when the callee rejects the call, notifying the caller.
      if (outgoingTo && outgoingTo === from) {
        console.log('Call rejected by callee', reason);
        set({ isCalling: false, outgoingTo: null, peerUserId: null });
        toast.error('Call declined');
        stopRingtone();
        return;
      }

      // Handles when the caller cancels the call, notifying the callee.
      if (ringing && incomingFrom && incomingFrom === from) {
        console.log('Call cancelled by caller', reason);
        set({ ringing: false, incomingFrom: null, peerUserId: null, incomingCaller: null });
        toast.error('Call cancelled');
        stopRingtone();
        return;
      }
    });

    socket.on('call:end', ({ from }) => {
      const { peerUserId, ending } = get();
      if (peerUserId !== from || ending) return;
      // Remote ended the call; do not emit back to avoid loops
      get().endCall({ remote: true });
      stopRingtone();
    });

    socket.on('webrtc:offer', async ({ offer, from }) => {
      try {
        // Callee side: now create peer and answer
        if (!get().pc) {
          await get().preparePeer(from);
        }
        const pc = get().pc;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        get().socket.emit('webrtc:answer', { answer, to: from });
        set({ inCall: true, isCalling: false, peerUserId: from, ringing: false, incomingFrom: null });
        toast.success('Call connected');
        stopRingtone();
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('webrtc:answer', async ({ answer }) => {
      try {
        const pc = get().pc;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        // Connection should be established soon after answer is set
        set({ inCall: true, isCalling: false, ringing: false });
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    });

    socket.on('webrtc:ice-candidate', async ({ candidate }) => {
      try {
        const pc = get().pc;
        if (!pc || !candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });
  },

  preparePeer: async (peerUserId) => {
    // Cleanup any previous state silently (no toast, no signaling)
    await get().endCall({ silent: true, dontSignal: true });

    const pc = new RTCPeerConnection({ iceServers });
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
      const audioEl = ensureRemoteAudioEl();
      audioEl.srcObject = remoteStream;
      // Attempt to play in case autoplay policies interfere
      try { audioEl.play?.(); } catch {}
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        toast.success('Peer connection established');
      } else if (state === 'failed' || state === 'disconnected') {
        toast.error('Call connection lost');
      }
    };

    pc.onicecandidate = (event) => {
      const { socket } = get();
      if (event.candidate && socket && get().peerUserId) {
        socket.emit('webrtc:ice-candidate', {
          candidate: event.candidate,
          to: get().peerUserId,
        });
      }
    };

    set({ pc, localStream, remoteStream, peerUserId });
  },

  startCall: async (calleeUserId) => {
    const { socket } = get();
    if (!socket) {
      console.warn('Socket not connected');
      return;
    }
    try {
      // Send invitation first; wait for accept before creating offer
      set({ isCalling: true, outgoingTo: calleeUserId, peerUserId: calleeUserId });
      const authUser = useAuthStore.getState().authUser;
      const fromUser = authUser ? { _id: authUser._id, fullName: authUser.fullName, profilePic: authUser.profilePic } : undefined;
      socket.emit('call:invite', { to: calleeUserId, fromUser });
      toast('Calling...');
    } catch (err) {
      console.error('Error starting call:', err);
      set({ isCalling: false, inCall: false });
      toast.error('Failed to start call');
    }
  },

  acceptCall: async () => {
    const { socket, incomingFrom } = get();
    if (!socket || !incomingFrom) return;
    socket.emit('call:accept', { to: incomingFrom });
    // Peer will send offer; we will answer in webrtc:offer handler
    toast.success('Accepted call');
    // Hide popup immediately while we wait for the offer
    set({ ringing: false, incomingFrom: null, incomingCaller: null });
    stopRingtone();
  },

  cancelOutgoingCall: async (reason = 'cancelled') => {
    const { socket, outgoingTo } = get();
    if (!socket || !outgoingTo) return;
    socket.emit('call:reject', { to: outgoingTo, reason });
    set({ isCalling: false, outgoingTo: null, peerUserId: null });
    toast('Call cancelled');
    stopRingtone();
  },

  rejectCall: async (reason = 'declined') => {
    const { socket, incomingFrom } = get();
    if (!socket || !incomingFrom) return;
    socket.emit('call:reject', { to: incomingFrom, reason });
    set({ ringing: false, incomingFrom: null, peerUserId: null });
    toast('Declined call');
    stopRingtone();
  },

  endCall: async (options = {}) => {
    const { remote = false, silent = false, dontSignal = false } = options;
    const { pc, localStream, remoteStream, socket, peerUserId, ending } = get();
    if (ending) return; // already ending
    set({ ending: true });
    if (!remote && !dontSignal && socket && peerUserId) {
      // Local end: notify peer once
      socket.emit('call:end', { to: peerUserId });
    }
    if (pc) {
      try { pc.ontrack = null; pc.onicecandidate = null; pc.close(); } catch {}
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => t.stop());
    }
    const audioEl = document.getElementById('remote-audio');
    if (audioEl) audioEl.srcObject = null;
    set({ pc: null, localStream: null, remoteStream: null, inCall: false, isCalling: false, peerUserId: null, outgoingTo: null, ringing: false, incomingFrom: null, incomingCaller: null, ending: false });
    if (!silent) {
      toast('Call ended');
    }
    stopRingtone();
  },
}));
