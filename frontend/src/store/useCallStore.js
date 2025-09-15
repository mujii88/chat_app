import { create } from 'zustand';
import toast from 'react-hot-toast';

// Simple helper to ensure we have a global hidden audio element for remote stream playback
function ensureRemoteAudioEl() {
  let el = document.getElementById('remote-audio');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'remote-audio';
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
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
    socket.on('call:invite', ({ from }) => {
      // Show ringing; wait for user to accept/reject
      set({ ringing: true, incomingFrom: from, peerUserId: from, isCalling: false, inCall: false });
      toast((t) => (
        `Incoming call`
      ));
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
      const { outgoingTo } = get();
      if (!outgoingTo || outgoingTo !== from) return;
      console.log('Call rejected', reason);
      set({ isCalling: false, outgoingTo: null, peerUserId: null });
      toast.error('Call declined');
    });

    socket.on('call:end', ({ from }) => {
      const { peerUserId, ending } = get();
      if (peerUserId !== from || ending) return;
      // Remote ended the call; do not emit back to avoid loops
      get().endCall({ remote: true });
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
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('webrtc:answer', async ({ answer }) => {
      try {
        const pc = get().pc;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        set({ inCall: true, isCalling: false });
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
      socket.emit('call:invite', { to: calleeUserId });
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
  },

  rejectCall: async (reason = 'declined') => {
    const { socket, incomingFrom } = get();
    if (!socket || !incomingFrom) return;
    socket.emit('call:reject', { to: incomingFrom, reason });
    set({ ringing: false, incomingFrom: null, peerUserId: null });
    toast('Declined call');
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
    set({ pc: null, localStream: null, remoteStream: null, inCall: false, isCalling: false, peerUserId: null, outgoingTo: null, ringing: false, incomingFrom: null, ending: false });
    if (!silent) {
      toast('Call ended');
    }
  },
}));
