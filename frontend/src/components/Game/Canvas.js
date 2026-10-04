import React, { useEffect, useRef, useState, useCallback } from "react";
import Sprite from "./Sprite";
import io from "socket.io-client";
import "./styles.css";
import useGame from "./useGame";
import Chat from "./chat";
import {
  MessageCircle,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Maximize2,
  Minimize2,
  PhoneOff,
  GripHorizontal,
  Users,
  LogOut,
  Minus,
} from "lucide-react";
import "./VideoCall.css";
import axios from "axios";

const Canvas = ({
  roomCode = "default",
  initialPlayerName = "",
  userAvatar = "chr1",
}) => {
  const canvasRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const socketRef = useRef(null);
  const animationFrameRef = useRef(null);
  const keysRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    e: false,
  });
  const [showChat, setShowChat] = useState(false);
  const [showNameModal, setShowNameModal] = useState(!initialPlayerName);
  const [tempPlayerName, setTempPlayerName] = useState(initialPlayerName || "");
  const [incomingCall, setIncomingCall] = useState(null);
  const [videoCall, setVideoCall] = useState({
    active: false,
    localStream: null,
    remoteStream: null,
  });
  const peerConnectionRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const [callPeerId, setCallPeerId] = useState(null);
  const callPeerIdRef = useRef(null);

  // 1-on-1 Screen Sharing states
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [callPeerName, setCallPeerName] = useState("");
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const screenStreamRef = useRef(null);
  const cameraVideoTrackRef = useRef(null);
  const localScreenRef = useRef(null);
  const audioContextRef = useRef(null);
  const micAudioTrackRef = useRef(null);

  // Hybrid draggable & maximize state
  const [isCallMaximized, setIsCallMaximized] = useState(false);
  const [callPosition, setCallPosition] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [iceConfig, setIceConfig] = useState(null);
  const iceCandidateQueue = useRef({}); // { peerId: [candidates] }
  const [toast, setToast] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [meetingNameMap, setMeetingNameMap] = useState({}); // { userId: name }
  // Add intro modal state
  const [showIntroModal, setShowIntroModal] = useState(true);

  // Conference Room (Zone 2) Window states
  const [isMeetingMaximized, setIsMeetingMaximized] = useState(false);
  const [isMeetingMinimized, setIsMeetingMinimized] = useState(false);
  const [meetingPosition, setMeetingPosition] = useState({ x: 0, y: 0 });
  const isMeetingDraggingRef = useRef(false);
  const meetingDragStartRef = useRef({ x: 0, y: 0 });

  const {
    player,
    setPlayer,
    otherPlayers,
    boundaries,
    interactionMenu,
    playerName,
    setPlayerName,
    playerCount,
    gameContainerRef,
    checkCollision,
    findValidSpawnPosition,
    checkPlayerInteraction,
    checkNearbyPlayers,
    mapImage,
    backgroundImage,
    playerImages,
    meetingRoomCall,
    isMeetingScreenSharing,
    isMeetingMuted,
    isMeetingVideoOff,
    meetingPresenter,
    meetingParticipantMutes,
    meetingParticipantVideoOff,
    startMeetingScreenShare,
    stopMeetingScreenShare,
    toggleMeetingMic,
    toggleMeetingVideo,
    exitMeetingRoom,
    meetingScreenStreamRef,
  } = useGame(canvasRef, socketRef, keysRef);

  const handleMeetingDragMouseDown = (e) => {
    if (isMeetingMaximized || isMeetingMinimized) return;
    isMeetingDraggingRef.current = true;
    meetingDragStartRef.current = {
      x: e.clientX - meetingPosition.x,
      y: e.clientY - meetingPosition.y,
    };
  };

  const handleMeetingMouseMove = useCallback((e) => {
    if (!isMeetingDraggingRef.current) return;
    setMeetingPosition({
      x: e.clientX - meetingDragStartRef.current.x,
      y: e.clientY - meetingDragStartRef.current.y,
    });
  }, []);

  const handleMeetingMouseUp = useCallback(() => {
    isMeetingDraggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMeetingMouseMove);
    window.addEventListener("mouseup", handleMeetingMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMeetingMouseMove);
      window.removeEventListener("mouseup", handleMeetingMouseUp);
    };
  }, [handleMeetingMouseMove, handleMeetingMouseUp]);

  // Initialize canvas and socket
  const SOCKET_URL =
    process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

  useEffect(() => {
    if (initialPlayerName) {
      setPlayerName(initialPlayerName);
    }
  }, [initialPlayerName, setPlayerName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    setCtx(context);
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      const activeName = initialPlayerName || tempPlayerName || "Explorer";
      socket.emit("joinRoom", {
        roomCode,
        playerName: activeName,
        avatar: userAvatar,
      });
      socket.emit("register", activeName);
    });

    return () => {
      socket.disconnect();
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [roomCode, initialPlayerName, tempPlayerName, userAvatar, SOCKET_URL]);

  // Fetch ICE servers from backend on mount
  useEffect(() => {
    const fetchIceServers = async () => {
      try {
        const res = await axios.get(`${SOCKET_URL}/api/ice-token`);
        setIceConfig(res.data); // expects { iceServers: [...] }
      } catch (err) {
        console.error("Failed to fetch ICE servers:", err);
        // fallback to public STUN if needed
        setIceConfig({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
      }
    };
    fetchIceServers();
  }, [SOCKET_URL]);

  // Handle name submission
  const handleNameSubmit = () => {
    if (!tempPlayerName.trim()) return alert("Please enter a valid name");
    setPlayerName(tempPlayerName);
    setShowNameModal(false);

    // Register the name with the socket and join room
    if (socketRef.current) {
      socketRef.current.emit("joinRoom", {
        roomCode,
        playerName: tempPlayerName,
        avatar: userAvatar,
      });
      socketRef.current.emit("register", tempPlayerName);
    }
  };

  // Game initialization - now depends on playerName being set
  useEffect(() => {
    if (!ctx || !socketRef.current || !playerName || !mapImage) return;

    const initialPlayer = new Sprite({
      position: findValidSpawnPosition(),
      image: playerImages.down,
      frames: { max: 4 },
      sprites: playerImages,
      name: playerName,
      speed: 3,
    });
    setPlayer(initialPlayer);
  }, [
    ctx,
    playerName,
    setPlayer,
    findValidSpawnPosition,
    mapImage,
    playerImages,
  ]);

  // Handle key presses for interaction
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "e" || e.key === "E") {
        checkPlayerInteraction();
      }
      if (e.key in keysRef.current) {
        keysRef.current[e.key] = true;
      }
    };

    const handleKeyUp = (e) => {
      if (e.key in keysRef.current) {
        keysRef.current[e.key] = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [checkPlayerInteraction]);

  // Mouse events for interaction menu
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      interactionMenu.current.handleMouseMove(mouseX, mouseY);
    };

    const handleClick = () => {
      interactionMenu.current.handleClick(otherPlayers);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleClick);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
    };
  }, [otherPlayers, interactionMenu]);

  // Listen for incoming call popup
  useEffect(() => {
    if (!socketRef.current) return;
    const handleReceiveCall = (data) => {
      setIncomingCall(data);
    };
    socketRef.current.on("receiveCall", handleReceiveCall);
    return () => {
      socketRef.current.off("receiveCall", handleReceiveCall);
    };
  }, []);

  // Patch interaction menu to trigger call
  useEffect(() => {
    const currentMenu = interactionMenu.current;
    if (!currentMenu) return;
    const originalHandleClick = currentMenu.handleClick.bind(currentMenu);
    currentMenu.handleClick = (otherPlayers) => {
      if (
        currentMenu.visible &&
        currentMenu.selectedOption === "voiceChat" &&
        currentMenu.targetId
      ) {
        // Voice chat logic (already working)
        const targetId = currentMenu.targetId;
        const targetName = otherPlayers[targetId]?.name || "Colleague";
        callPeerIdRef.current = targetId;
        setCallPeerId(targetId);
        setCallPeerName(targetName);
        setVideoCall((vc) => ({ ...vc, active: true }));
        if (socketRef.current) {
          socketRef.current.emit("callUser", {
            targetId,
            callerName: playerName,
          });
        }
        currentMenu.hide();
        return true;
      }
      // --- Add this for chat option ---
      if (
        currentMenu.visible &&
        currentMenu.selectedOption === "chat" &&
        currentMenu.targetId
      ) {
        openChatWithUser(currentMenu.targetId);
        currentMenu.hide();
        return true;
      }
      return originalHandleClick(otherPlayers);
    };
    return () => {
      if (currentMenu) {
        currentMenu.handleClick = originalHandleClick;
      }
    };
  }, [interactionMenu, playerName]);

  // Cleanup on call end
  const handleEndCall = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    setIsRemoteScreenSharing(false);
    setIsCallMaximized(false);
    setIsPipMinimized(false);
    setCallPosition({ x: 0, y: 0 });
    setCallPeerName("");
    cameraVideoTrackRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    micAudioTrackRef.current = null;

    setVideoCall({ active: false, localStream: null, remoteStream: null });
    const targetPeer = callPeerIdRef.current || callPeerId;
    callPeerIdRef.current = null;
    setCallPeerId(null);

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject
        .getTracks()
        .forEach((track) => track.stop());
    }
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject
        .getTracks()
        .forEach((track) => track.stop());
    }
    if (socketRef.current && targetPeer) {
      socketRef.current.emit("endCall", { to: targetPeer });
    }
    setToast("Call ended");
  }, [callPeerId]);

  // Accept incoming call
  const handleAcceptCall = async () => {
    try {
      if (!iceConfig) return; // Wait for ICE config
      setIncomingCall(null);
      callPeerIdRef.current = incomingCall.callerId;
      setCallPeerId(incomingCall.callerId); // <-- Fix: use incomingCall.callerId, not interactingMenu
      setCallPeerName(incomingCall.callerName || "Colleague");
      setVideoCall((vc) => ({ ...vc, active: true }));

      // Get local media
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      cameraVideoTrackRef.current = localStream.getVideoTracks()[0];
      micAudioTrackRef.current = localStream.getAudioTracks()[0];
      setVideoCall((vc) => ({ ...vc, localStream }));

      // --- Ensure RTCConfiguration is always valid ---
      let rtcConfig = iceConfig;
      if (
        !rtcConfig ||
        typeof rtcConfig !== "object" ||
        !Array.isArray(rtcConfig.iceServers)
      ) {
        rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
      }
      const pc = new window.RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      // Add local tracks
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("ice-candidate", {
            to: incomingCall.callerId,
            candidate: event.candidate,
          });
        }
      };

      // Receive remote stream
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setVideoCall((vc) => ({ ...vc, remoteStream: event.streams[0] }));
        }
      };

      // Remove any existing listeners
      socketRef.current.off("offer");
      socketRef.current.off("ice-candidate");

      // ICE candidate queue for this peer
      iceCandidateQueue.current[incomingCall.callerId] = [];

      // Create and send answer
      socketRef.current.on("offer", async ({ from, offer }) => {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        // Add queued ICE candidates for this peer
        if (iceCandidateQueue.current[from]) {
          for (const candidate of iceCandidateQueue.current[from]) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              console.error("Error adding queued ICE candidate:", err);
            }
          }
          iceCandidateQueue.current[from] = [];
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit("answer", { to: from, answer });
      });

      // Listen for ICE candidates
      socketRef.current.on("ice-candidate", async ({ from, candidate }) => {
        try {
          if (candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
              // Queue ICE candidates until remoteDescription is set
              if (!iceCandidateQueue.current[from])
                iceCandidateQueue.current[from] = [];
              iceCandidateQueue.current[from].push(candidate);
            }
          }
        } catch (err) {
          console.error("Error adding received ICE candidate:", err);
        }
      });

      // Notify caller to start offer
      socketRef.current.emit("acceptCall", { to: incomingCall.callerId });
    } catch (error) {
      console.error("Error in handleAcceptCall:", error);
      handleEndCall();
    }
  };

  // Initiate call as caller
  useEffect(() => {
    if (!callPeerId || !videoCall.active || !iceConfig) return;

    let pc;
    let localStream;

    const startCaller = async () => {
      try {
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }

        // Get local media
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        cameraVideoTrackRef.current = localStream.getVideoTracks()[0];
        micAudioTrackRef.current = localStream.getAudioTracks()[0];
        setVideoCall((vc) => ({ ...vc, localStream }));

        // --- FIX: Ensure RTCConfiguration is always valid ---
        let rtcConfig = iceConfig;
        if (
          !rtcConfig ||
          typeof rtcConfig !== "object" ||
          !Array.isArray(rtcConfig.iceServers)
        ) {
          rtcConfig = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          };
        }
        pc = new window.RTCPeerConnection(rtcConfig);
        peerConnectionRef.current = pc;

        pc.oniceconnectionstatechange = () => {
          console.log("Caller ICE connection state:", pc.iceConnectionState);
        };

        // Add local tracks
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current) {
            socketRef.current.emit("ice-candidate", {
              to: callPeerId,
              candidate: event.candidate,
            });
          }
        };

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setVideoCall((vc) => ({ ...vc, remoteStream: event.streams[0] }));
          }
        };

        // Remove existing listeners
        socketRef.current.off("answer");
        socketRef.current.off("ice-candidate");
        socketRef.current.off("acceptCall");

        // ICE candidate queue for this peer
        iceCandidateQueue.current[callPeerId] = [];

        socketRef.current.on("answer", async ({ from, answer }) => {
          if (pc.signalingState !== "closed") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            // Add queued ICE candidates for this peer
            if (iceCandidateQueue.current[from]) {
              for (const candidate of iceCandidateQueue.current[from]) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                  console.error("Error adding queued ICE candidate:", err);
                }
              }
              iceCandidateQueue.current[from] = [];
            }
          }
        });

        socketRef.current.on("ice-candidate", async ({ from, candidate }) => {
          try {
            if (candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                if (!iceCandidateQueue.current[from])
                  iceCandidateQueue.current[from] = [];
                iceCandidateQueue.current[from].push(candidate);
              }
            }
          } catch (err) {
            console.error("Error adding received ICE candidate:", err);
          }
        });

        socketRef.current.on("acceptCall", async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit("offer", { to: callPeerId, offer });
          } catch (error) {
            console.error("Error creating offer:", error);
          }
        });
      } catch (error) {
        console.error("Error in startCaller:", error);
        handleEndCall();
      }
    };

    startCaller();

    return () => {
      console.log("Cleaning up caller effect");
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (pc) {
        pc.close();
      }
    };
  }, [callPeerId, videoCall.active, iceConfig, handleEndCall]);

  // Stop 1-on-1 screen sharing and restore camera
  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    // Restore camera video track on peer connection without drops
    if (peerConnectionRef.current && cameraVideoTrackRef.current) {
      const senders = peerConnectionRef.current.getSenders();
      const videoSender = senders.find(
        (s) => s.track && s.track.kind === "video"
      ) || senders.find((s) => s.track === null);
      if (videoSender) {
        try {
          await videoSender.replaceTrack(cameraVideoTrackRef.current);
        } catch (err) {
          console.error("Error restoring camera track:", err);
        }
      }
    }

    // Clean up audio mixing context and restore mic audio track
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (peerConnectionRef.current && micAudioTrackRef.current) {
      const senders = peerConnectionRef.current.getSenders();
      const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
      if (audioSender) {
        try {
          await audioSender.replaceTrack(micAudioTrackRef.current);
        } catch (err) {
          console.warn("Error restoring mic audio track:", err);
        }
      }
    }

    // Restore local video element if it was showing screen
    if (localVideoRef.current && videoCall.localStream) {
      localVideoRef.current.srcObject = videoCall.localStream;
      localVideoRef.current.play().catch(() => {});
    }

    // Notify peer of stop
    const targetPeer = callPeerIdRef.current || callPeerId;
    if (socketRef.current && targetPeer) {
      socketRef.current.emit("screen-share-status", {
        to: targetPeer,
        isSharing: false,
      });
    }
  }, [callPeerId, videoCall.localStream]);

  // Toggle 1-on-1 screen sharing (Optimized for ultra-low latency & 30-60 FPS smooth updates)
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      if (!peerConnectionRef.current) {
        console.warn("No active peer connection for screen sharing");
        return;
      }

      // Capture display media with clean, robust options (matching Google Meet & Zoom)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        },
        audio: true,
      });

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenStreamRef.current = stream;

      // When user stops screen sharing via browser floating pill
      screenTrack.onended = () => {
        stopScreenShare();
      };

      // Seamless track replacement on peer connection
      const senders = peerConnectionRef.current.getSenders();
      const videoSender = senders.find(
        (s) => s.track && s.track.kind === "video"
      ) || senders.find((s) => s.track === null);

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      } else {
        console.warn("Could not find video sender to replace track");
      }

      // Mix tab audio if present (e.g. YouTube sound) with microphone
      const screenAudioTrack = stream.getAudioTracks()[0];
      if (screenAudioTrack && micAudioTrackRef.current) {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          audioContextRef.current = audioCtx;
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([micAudioTrackRef.current]));
          const screenSource = audioCtx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
          const dest = audioCtx.createMediaStreamDestination();
          micSource.connect(dest);
          screenSource.connect(dest);
          const mixedTrack = dest.stream.getAudioTracks()[0];

          const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
          if (audioSender) {
            await audioSender.replaceTrack(mixedTrack);
          }
        } catch (audioMixErr) {
          console.warn("Could not mix screen audio:", audioMixErr);
        }
      }

      setIsScreenSharing(true);

      // Attach stream to local preview
      if (localScreenRef.current) {
        localScreenRef.current.srcObject = stream;
        localScreenRef.current.play().catch(() => {});
      }

      // Notify peer to enter presentation mode
      const targetPeer = callPeerIdRef.current || callPeerId;
      if (socketRef.current && targetPeer) {
        socketRef.current.emit("screen-share-status", {
          to: targetPeer,
          isSharing: true,
        });
      }
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "AbortError") {
        console.log("User cancelled screen share picker dialog");
      } else {
        console.error("Error starting screen share:", err);
      }
    }
  };

  // Drag mouse handler
  const handleDragMouseDown = (e) => {
    if (isCallMaximized) return;
    if (e.target.closest("button")) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - callPosition.x,
      y: e.clientY - callPosition.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      setCallPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Listen for remote peer screen sharing status
  useEffect(() => {
    if (!socketRef.current) return;
    const handleRemoteScreenShare = ({ isSharing }) => {
      setIsRemoteScreenSharing(Boolean(isSharing));
      // Immediate force playback resumption when status arrives
      setTimeout(() => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().catch(() => {});
        }
      }, 50);
    };
    socketRef.current.on("screen-share-status", handleRemoteScreenShare);
    return () => {
      socketRef.current.off("screen-share-status", handleRemoteScreenShare);
    };
  }, []);

  // Ensure local screen preview has stream attached
  useEffect(() => {
    if (isScreenSharing && localScreenRef.current && screenStreamRef.current) {
      localScreenRef.current.srcObject = screenStreamRef.current;
      localScreenRef.current.play().catch(() => {});
    }
  }, [isScreenSharing]);

  // Animate toast visibility (no progress bar)
  useEffect(() => {
    if (!toast) return;
    const duration = 2000;
    const timeout = setTimeout(() => {
      setToast(null);
    }, duration);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Attach streams to video elements with error handling and autoplay enforcement
  useEffect(() => {
    if (localVideoRef.current && videoCall.localStream) {
      if (localVideoRef.current.srcObject !== videoCall.localStream) {
        localVideoRef.current.srcObject = videoCall.localStream;
      }
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && videoCall.remoteStream) {
      if (remoteVideoRef.current.srcObject !== videoCall.remoteStream) {
        remoteVideoRef.current.srcObject = videoCall.remoteStream;
      }
      remoteVideoRef.current.play().catch(() => {});

      // Auto-resume playback on track unmute (triggers when track replacement finishes)
      videoCall.remoteStream.getVideoTracks().forEach((track) => {
        track.onunmute = () => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.play().catch(() => {});
          }
        };
      });
    }

    const localVideo = localVideoRef.current;
    const remoteVideo = remoteVideoRef.current;

    if (localVideo) {
      localVideo.onloadedmetadata = () => localVideo.play().catch(() => {});
      localVideo.onerror = (e) => console.error("Local video error:", e);
    }
    if (remoteVideo) {
      remoteVideo.onloadedmetadata = () => remoteVideo.play().catch(() => {});
      remoteVideo.onerror = (e) => console.error("Remote video error:", e);
    }
  }, [videoCall.localStream, videoCall.remoteStream, isScreenSharing, isRemoteScreenSharing]);

  // Listen for call end from peer
  useEffect(() => {
    if (!socketRef.current) return;
    const handlePeerEnd = () => handleEndCall();
    socketRef.current.on("endCall", handlePeerEnd);
    return () => socketRef.current.off("endCall", handlePeerEnd);
  }, [handleEndCall, socketRef]);

  // Listen for player names in meeting room
  useEffect(() => {
    if (!socketRef.current) return;

    // Listen for a mapping of userId to name
    const handleMeetingNames = (data) => {
      setMeetingNameMap(data || {});
    };

    socketRef.current.on("meeting-names", handleMeetingNames);

    // Request names when entering meeting room
    if (meetingRoomCall.active) {
      socketRef.current.emit("requestMeetingNames");
    }

    return () => {
      socketRef.current.off("meeting-names", handleMeetingNames);
    };
  }, [meetingRoomCall.active]);

  // Send our name to others when joining meeting room
  useEffect(() => {
    if (!socketRef.current || !meetingRoomCall.active || !playerName) return;
    socketRef.current.emit("announceMeetingName", { name: playerName });
  }, [meetingRoomCall.active, playerName]);

  // Game loop
  const animate = useCallback(() => {
    if (!player || !ctx || !mapImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw background
    if (backgroundImage) {
      ctx.drawImage(
        backgroundImage,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );
    }

    // Draw map
    ctx.drawImage(mapImage, 0, 0, 1550, 700);

    // --- Draw boundaries (make them visible) ---
    ctx.save();
    ctx.strokeStyle = "rgba(255,0,0,0)"; // Red, semi-transparent
    ctx.lineWidth = 2;
    boundaries.forEach((boundary) => {
      ctx.strokeRect(boundary.x, boundary.y, boundary.width, boundary.height);
    });
    ctx.restore();
    // --- End boundary drawing ---

    // Update player movement
    let moved = false;
    const directions = [
      { key: "ArrowUp", dx: 0, dy: -1, dir: "up" },
      { key: "ArrowDown", dx: 0, dy: 1, dir: "down" },
      { key: "ArrowLeft", dx: -1, dy: 0, dir: "left" },
      { key: "ArrowRight", dx: 1, dy: 0, dir: "right" },
    ];

    directions.forEach(({ key, dx, dy, dir }) => {
      if (keysRef.current[key]) {
        const newX = player.position.x + dx * player.speed;
        const newY = player.position.y + dy * player.speed;

        if (!checkCollision(newX, newY)) {
          player.position.x = newX;
          player.position.y = newY;
          player.setDirection(dir);
          player.moving = true;
          moved = true;
        }
      }
    });

    // Emit movement to server
    if (moved && socketRef.current) {
      socketRef.current.emit("playerMovement", {
        position: player.position,
        direction: player.lastDirection,
        moving: true,
      });
    }

    // Check for nearby players
    checkNearbyPlayers();

    // Draw game elements
    Object.values(otherPlayers).forEach((p) => {
      if (p instanceof Sprite) {
        p.draw(ctx);
      }
    });
    player.draw(ctx);
    interactionMenu.current.draw(ctx);

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [
    player,
    otherPlayers,
    ctx,
    checkCollision,
    checkNearbyPlayers,
    mapImage,
    backgroundImage,
    boundaries,
    interactionMenu,
  ]);

  useEffect(() => {
    if (player && mapImage) {
      animate();
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [animate, player, mapImage]);

  // Add these handlers before the return statement
  const handleToggleMute = () => {
    if (videoCall.localStream) {
      videoCall.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      });
    }
  };

  const handleToggleVideo = () => {
    if (videoCall.localStream) {
      videoCall.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsVideoOff(!track.enabled);
      });
    }
  };

  // Add this state to track which user to chat with
  const [chatTargetId, setChatTargetId] = useState(null);

  // Function to open chat with a specific user
  const openChatWithUser = (userId) => {
    setShowChat(true);
    setChatTargetId(userId);
  };

  return (
    <div className="game-container" ref={gameContainerRef}>
      {/* Intro Modal */}
      {showIntroModal && (
        <div
          className="intro-modal-backdrop"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            background: "rgba(18, 18, 22, 0.85)", // less purple, more neutral/dark
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="intro-modal"
            style={{
              background:
                "linear-gradient(135deg, #18181b 0%, #232136 70%, #7c3aed 100%)",
              borderRadius: "32px",
              padding: "48px 32px 48px 32px", // more padding
              boxShadow: "0 12px 48px #000a, 0 0px 0px #0000",
              textAlign: "center",
              width: "45vw",
              maxWidth: "70vw",
              minHeight: "600px",
              maxHeight: "80vh",
              border: "2px solid #7c3aed",
              fontFamily: "monospace, 'Press Start 2P', 'VT323'", // monospace font
              color: "#e0e6ff",
              letterSpacing: "1px",
              userSelect: "none",
              position: "relative",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              scrollbarWidth: "thin",
              scrollbarColor: "#a78bfa #232136",
            }}
          >
            <style>
              {`
                .intro-modal::-webkit-scrollbar {
                  width: 10px;
                  border-radius: 8px;
                  background: #232136;
                }
                .intro-modal::-webkit-scrollbar-thumb {
                  background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
                  border-radius: 8px;
                  border: 2px solid #232136;
                }
                .intro-modal::-webkit-scrollbar-track {
                  background: #18181b;
                  border-radius: 8px;
                }
              `}
            </style>
            <h2
              style={{
                fontWeight: "bold",
                fontSize: "2.2rem",
                marginBottom: "18px",
                textShadow: "0 2px 8px #7c3aed44", // less purple
                fontFamily: "inherit",
              }}
            >
              Step into
              <img
                src="/images/Gather2.png"
                alt="logo"
                style={{
                  width: "120%",
                  maxWidth: "360px",
                  height: "120px",
                  objectFit: "contain",
                  margin: "0 auto",
                }}
              />
            </h2>
            <div
              style={{
                fontSize: "1.15rem",
                marginBottom: "28px",
                lineHeight: "1.6",
                color: "#bdb4d8",
                fontFamily: "inherit",
              }}
            >
              A virtual space where you can explore, meet others, and chat or
              video call — just like a real office or event, but online!
            </div>
            <div style={{ marginBottom: "22px", width: "100%" }}>
              <div
                style={{
                  marginBottom: "32px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    fontWeight: "bold",
                    color: "#a78bfa",
                    fontSize: "1.1rem",
                    fontFamily: "inherit",
                  }}
                >
                  Move: Arrow keys
                </span>
                <div
                  style={{
                    color: "#bdb4d8",
                    marginBottom: 8,
                    fontFamily: "inherit",
                  }}
                >
                  Use arrow keys to move your player around the map.
                </div>
                <img
                  src="/images/Pixel art keyboard arrow keys_ Keyboard play keys vector icon for 8bit game on white background.jpeg"
                  alt="Arrow keys"
                  style={{
                    height: "36vh",
                    objectFit: "contain",
                    margin: "0 auto",
                    borderRadius: 12,
                    background: "#232136",
                    border: "2px solid #7c3aed",
                    boxShadow: "0 2px 12px #7c3aed22",
                  }}
                />
              </div>
              <div
                style={{
                  marginBottom: "32px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    fontWeight: "bold",
                    color: "#a78bfa",
                    fontSize: "1.1rem",
                    fontFamily: "inherit",
                  }}
                >
                  1-1 Video Call
                </span>
                <div
                  style={{
                    color: "#bdb4d8",
                    marginBottom: 8,
                    fontFamily: "inherit",
                  }}
                >
                  Interact with others for private video calls.
                </div>
                <img
                  src="/images/vc.png"
                  alt="Video Call"
                  style={{
                    height: "36vh",
                    objectFit: "contain",
                    margin: "0 auto",
                    borderRadius: 12,
                    background: "#232136",
                    border: "2px solid #7c3aed",
                    boxShadow: "0 2px 12px #7c3aed22",
                  }}
                />
              </div>
              <div
                style={{
                  marginBottom: "32px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    fontWeight: "bold",
                    color: "#a78bfa",
                    fontSize: "1.1rem",
                    fontFamily: "inherit",
                  }}
                >
                  Conference rooms
                </span>
                <div
                  style={{
                    color: "#bdb4d8",
                    marginBottom: 8,
                    fontFamily: "inherit",
                  }}
                >
                  Step inside the conference room to join the group video
                  conference.
                </div>
                <img
                  src="/images/conference.png"
                  alt="Conference Room"
                  style={{
                    height: "36vh",
                    objectFit: "contain",
                    margin: "0 auto",
                    borderRadius: 12,
                    background: "#232136",
                    border: "2px solid #7c3aed",
                    boxShadow: "0 2px 12px #7c3aed22",
                  }}
                />
              </div>
              <div
                style={{
                  marginBottom: "32px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    fontWeight: "bold",
                    color: "#a78bfa",
                    fontSize: "1.1rem",
                    fontFamily: "inherit",
                  }}
                >
                  Chat with anyone in the room
                </span>
                <div
                  style={{
                    color: "#bdb4d8",
                    marginBottom: 8,
                    fontFamily: "inherit",
                  }}
                >
                  Send messages to anyone in the space.
                </div>
                <img
                  src="/images/chat.png"
                  alt="Chat"
                  style={{
                    height: "36vh",
                    objectFit: "contain",
                    margin: "0 auto",
                    borderRadius: 12,
                    background: "#232136",
                    border: "2px solid #7c3aed",
                    boxShadow: "0 2px 12px #7c3aed22",
                  }}
                />
              </div>
            </div>
            <button
              style={{
                background: "linear-gradient(90deg, #232136 0%, #7c3aed 100%)", // less purple, more dark
                color: "#fff",
                border: "none",
                borderRadius: "14px",
                padding: "18px 0",
                width: "80%",
                fontSize: "1.15rem",
                fontFamily: "inherit",
                fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 2px 8px #7c3aed22",
                letterSpacing: "1px",
                marginTop: "18px",
                transition: "background 0.2s",
              }}
              onClick={() => setShowIntroModal(false)}
            >
              Let's dive in ✨
            </button>
          </div>
        </div>
      )}
      {/* Name Input Modal */}
      {showNameModal && !showIntroModal && (
        <div className="name-modal-backdrop">
          <div className="name-modal">
            <h2 style={{ color: "black" }}>Enter Your Player Name</h2>
            <input
              type="text"
              placeholder="Enter your name"
              value={tempPlayerName}
              onChange={(e) => setTempPlayerName(e.target.value)}
              maxLength="15"
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            />
            <button onClick={handleNameSubmit}>Start Game</button>
          </div>
        </div>
      )}

      <div className="header-bar">
        <div className="game-logo">Virtual Office</div>
        <div className="player-controls">
          <div className="player-name-display">{playerName}</div>
          <div className="player-count">Players: {playerCount}</div>
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef} width={1550} height={650} />
        <div
          style={{
            marginTop: "5px",
            textAlign: "center",
            fontSize: "16px",
            color: "#f8fafc",
            fontFamily: "'Press Start 2P', 'VT323', 'monospace', monospace",
            letterSpacing: "1px",
            background: "linear-gradient(90deg, #23272e 0%, #3a3f4b 100%)",
            borderRadius: "10px",
            padding: "8px 0",
            width: "100%",
            maxWidth: 1550,
            marginLeft: "auto",
            marginRight: "auto",
            boxShadow: "0 2px 12px #4a6cf755",
            border: "2px solid #4a6cf7",
            zIndex: 1000,
            fontWeight: "bold",
            textShadow: "0 2px 8px #2228",
          }}
        >
          Press{" "}
          <span style={{ fontWeight: "bold", color: "#ffe066" }}>"E"</span> key
          when you are near a player to interact with them. Use Arrow keys to
          move your player
        </div>

        <button
          className="chat-button"
          onClick={() => setShowChat(!showChat)}
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            backgroundColor: "#4CAF50",
            border: "none",
            borderRadius: "50%",
            width: "50px",
            height: "50px",
            cursor: "pointer",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MessageCircle
            style={{
              width: "30px",
              height: "30px",
            }}
          />
        </button>
      </div>
      {/* Incoming Call Popup */}
      {incomingCall && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "linear-gradient(90deg, #23272e 0%, #3a3f4b 100%)",
              borderRadius: "18px",
              padding: "38px 48px 32px 48px",
              boxShadow: "0 8px 32px #000a, 0 0px 0px #0000",
              textAlign: "center",
              minWidth: "340px",
              border: "4px solid #4a6cf7",
              fontFamily: "'Press Start 2P', 'VT323', 'monospace', monospace",
              color: "#fff",
              letterSpacing: "1px",
              userSelect: "none",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <span
                style={{
                  fontSize: 34,
                  filter: "drop-shadow(0 2px 0 #222)",
                  marginRight: 4,
                }}
                role="img"
                aria-label="Phone"
              >
                📞
              </span>
              <span
                style={{
                  fontWeight: "bold",
                  color: "#ffe066",
                  textShadow: "0 2px 0 #222, 0 0px 8px #ffe06699",
                  fontSize: 24,
                  letterSpacing: "2px",
                }}
              >
                Incoming Call
              </span>
            </div>
            <div
              style={{
                marginBottom: 24,
                fontSize: 18,
                color: "#fff",
                textShadow: "0 1px 0 #222",
              }}
            >
              <span style={{ color: "#ffe066", fontWeight: "bold" }}>
                {incomingCall.callerName}
              </span>{" "}
              is calling you...
            </div>
            <div
              style={{
                display: "flex",
                gap: 24,
                justifyContent: "center",
                marginTop: 10,
              }}
            >
              <button
                style={{
                  background:
                    "linear-gradient(90deg, #4CAF50 0%, #43e97b 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 32px",
                  fontSize: 18,
                  fontFamily: "inherit",
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px #4CAF5044",
                  letterSpacing: "1px",
                  transition: "background 0.2s",
                  // outline: "3px solid #ffe066", // <-- removed yellow border
                }}
                onClick={handleAcceptCall}
              >
                Accept
              </button>
              <button
                style={{
                  background:
                    "linear-gradient(90deg, #ff4b4b 0%, #ffb199 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 32px",
                  fontSize: 18,
                  fontFamily: "inherit",
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px #ff4b4b44",
                  letterSpacing: "1px",
                  transition: "background 0.2s",
                  // outline: "3px solid #ffe066", // <-- removed yellow border
                }}
                onClick={() => setIncomingCall(null)}
              >
                Reject
              </button>
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 13,
                color: "#aaa",
                letterSpacing: "0.5px",
                fontFamily: "inherit",
                textShadow: "0 1px 0 #222",
              }}
            >
              Socialize for XP!
            </div>
          </div>
        </div>
      )}
      {/* 1-on-1 Video Call & Hybrid Draggable / Maximized Screen Share Modal */}
      {videoCall.active && (
        <div
          className={`gt-call-modal-overlay ${isCallMaximized ? "maximized" : ""}`}
        >
          <div
            className={`gt-call-window ${
              isCallMaximized
                ? "maximized"
                : isScreenSharing || isRemoteScreenSharing
                ? "screenshare-standard"
                : "standard"
            }`}
            style={
              isCallMaximized
                ? {}
                : {
                    transform: `translate(${callPosition.x}px, ${callPosition.y}px)`,
                  }
            }
          >
            {/* Draggable Header */}
            <div
              className="gt-call-header"
              onMouseDown={handleDragMouseDown}
              title={
                isCallMaximized
                  ? "Call window maximized"
                  : "Drag to reposition call window"
              }
            >
              <div className="gt-call-title-area">
                {!isCallMaximized && (
                  <div className="gt-call-drag-icon">
                    <GripHorizontal size={18} />
                  </div>
                )}
                <div className="gt-call-status-dot" />
                <span className="gt-call-title">
                  {callPeerName ? `Call with ${callPeerName}` : "1-on-1 Call"}
                </span>
                {(isScreenSharing || isRemoteScreenSharing) && (
                  <span className="gt-call-badge">
                    <Monitor size={12} />
                    {isScreenSharing
                      ? "Sharing Screen"
                      : `${callPeerName || "Peer"}'s Screen`}
                  </span>
                )}
              </div>

              <div className="gt-call-header-actions">
                <button
                  type="button"
                  className="gt-header-btn"
                  onClick={() => setIsCallMaximized((prev) => !prev)}
                  title={
                    isCallMaximized ? "Restore Window" : "Maximize Full Window"
                  }
                >
                  {isCallMaximized ? (
                    <Minimize2 size={16} />
                  ) : (
                    <Maximize2 size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Video Stage with Persistent Elements (Zero Unmounts, Zero Glitches) */}
            <div
              className={`gt-call-stage ${
                isScreenSharing || isRemoteScreenSharing
                  ? "mode-presentation"
                  : "mode-dual"
              }`}
            >
              {/* 1. Local Screen Preview Box */}
              <div
                className={`gt-video-box ${
                  isScreenSharing ? "gt-box-presentation" : "gt-box-hidden"
                }`}
              >
                <div className="gt-screen-indicator-banner">
                  <Monitor size={14} /> You are presenting your screen
                </div>
                <video
                  ref={localScreenRef}
                  autoPlay
                  playsInline
                  muted
                />
              </div>

              {/* 2. Remote Video Box (Peer Webcam OR Peer Screen) */}
              <div
                className={`gt-video-box ${
                  isRemoteScreenSharing
                    ? "gt-box-presentation"
                    : isScreenSharing
                    ? `gt-box-pip ${isPipMinimized ? "minimized" : ""}`
                    : ""
                }`}
              >
                {isRemoteScreenSharing && (
                  <div className="gt-screen-indicator-banner">
                    <Monitor size={14} /> {callPeerName || "Peer"} is presenting
                  </div>
                )}
                {isScreenSharing && (
                  <button
                    type="button"
                    className="gt-pip-minimize-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPipMinimized((prev) => !prev);
                    }}
                    title={isPipMinimized ? "Expand Camera" : "Minimize Camera"}
                  >
                    {isPipMinimized ? "+" : "−"}
                  </button>
                )}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                />
                <div className="gt-video-nametag">
                  {isRemoteScreenSharing
                    ? `${callPeerName || "Peer"}'s Screen`
                    : callPeerName || "Peer"}
                </div>
              </div>

              {/* 3. Local Camera Box */}
              <div
                className={`gt-video-box ${
                  isRemoteScreenSharing
                    ? `gt-box-pip ${isPipMinimized ? "minimized" : ""}`
                    : isScreenSharing
                    ? "gt-box-hidden"
                    : ""
                }`}
              >
                {isRemoteScreenSharing && (
                  <button
                    type="button"
                    className="gt-pip-minimize-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPipMinimized((prev) => !prev);
                    }}
                    title={isPipMinimized ? "Expand Camera" : "Minimize Camera"}
                  >
                    {isPipMinimized ? "+" : "−"}
                  </button>
                )}
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                />
                <div className="gt-video-nametag">
                  You {isMuted ? "(Muted)" : ""}
                </div>
              </div>
            </div>

            {/* Controls Bar Footer */}
            <div className="gt-call-footer">
              {/* Mic Toggle */}
              <button
                type="button"
                className={`gt-call-btn ${
                  isMuted ? "gt-btn-control-off" : "gt-btn-control-active"
                }`}
                onClick={handleToggleMute}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                <span>{isMuted ? "Unmute" : "Mute"}</span>
              </button>

              {/* Camera Toggle */}
              <button
                type="button"
                className={`gt-call-btn ${
                  isVideoOff ? "gt-btn-control-off" : "gt-btn-control-active"
                }`}
                onClick={handleToggleVideo}
                title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
              >
                {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
                <span>{isVideoOff ? "Start Video" : "Stop Video"}</span>
              </button>

              {/* Screen Share Toggle */}
              <button
                type="button"
                className={`gt-call-btn gt-btn-screenshare ${
                  isScreenSharing ? "active" : ""
                }`}
                onClick={handleToggleScreenShare}
                title={
                  isScreenSharing ? "Stop Sharing Screen" : "Share Your Screen"
                }
              >
                {isScreenSharing ? (
                  <MonitorOff size={18} />
                ) : (
                  <Monitor size={18} />
                )}
                <span>{isScreenSharing ? "Stop Sharing" : "Share Screen"}</span>
              </button>

              {/* End Call */}
              <button
                type="button"
                className="gt-call-btn gt-btn-endcall"
                onClick={handleEndCall}
                title="End Call"
              >
                <PhoneOff size={18} />
                <span>End Call</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Meeting Room Video Conference Window */}
      {meetingRoomCall.active && (
        <div
          className={`gt-conf-modal-overlay ${
            isMeetingMaximized ? "maximized" : ""
          } ${isMeetingMinimized ? "minimized" : ""}`}
        >
          {isMeetingMinimized ? (
            /* Minimized Floating Picture-in-Picture Dock */
            <div className="gt-conf-mini-dock">
              <div className="gt-conf-mini-info">
                <div className="gt-conf-status-dot" />
                <span className="gt-conf-mini-title">Conference Room</span>
                <span className="gt-conf-mini-count">
                  👥 {1 + Object.keys(meetingRoomCall.remoteStreams || {}).length}
                </span>
              </div>
              <div className="gt-conf-mini-actions">
                <button
                  type="button"
                  className="gt-conf-mini-btn"
                  onClick={() => setIsMeetingMinimized(false)}
                  title="Expand Conference Window"
                >
                  <Maximize2 size={15} />
                </button>
                <button
                  type="button"
                  className="gt-conf-mini-btn danger"
                  onClick={exitMeetingRoom}
                  title="Leave Conference"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          ) : (
            /* Full Conference Window (Standard / Maximized) */
            <div
              className={`gt-conf-window ${
                isMeetingMaximized ? "maximized" : "standard"
              }`}
              style={
                isMeetingMaximized
                  ? {}
                  : {
                      transform: `translate(${meetingPosition.x}px, ${meetingPosition.y}px)`,
                    }
              }
            >
              {/* Header */}
              <div
                className="gt-conf-header"
                onMouseDown={handleMeetingDragMouseDown}
                title={
                  isMeetingMaximized
                    ? "Conference Room (Maximized)"
                    : "Drag to reposition Conference Window"
                }
              >
                <div className="gt-conf-title-area">
                  {!isMeetingMaximized && (
                    <div className="gt-conf-drag-icon">
                      <GripHorizontal size={18} />
                    </div>
                  )}
                  <div className="gt-conf-status-dot" />
                  <span className="gt-conf-title">Conference Room • Zone 2</span>
                  <span className="gt-conf-count-badge">
                    <Users size={13} />
                    {1 + Object.keys(meetingRoomCall.remoteStreams || {}).length}{" "}
                    in meeting
                  </span>
                  {(isMeetingScreenSharing || meetingPresenter?.isSharing) && (
                    <span className="gt-conf-presenter-badge">
                      <Monitor size={13} />
                      {isMeetingScreenSharing
                        ? "You are sharing screen"
                        : `${
                            meetingPresenter?.presenterName || "Someone"
                          } is presenting`}
                    </span>
                  )}
                </div>

                <div className="gt-conf-header-actions">
                  <button
                    type="button"
                    className="gt-header-btn"
                    onClick={() => setIsMeetingMinimized(true)}
                    title="Minimize to Corner Mini Player"
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    type="button"
                    className="gt-header-btn"
                    onClick={() => setIsMeetingMaximized((prev) => !prev)}
                    title={
                      isMeetingMaximized
                        ? "Restore Standard Window"
                        : "Maximize Fullscreen"
                    }
                  >
                    {isMeetingMaximized ? (
                      <Minimize2 size={16} />
                    ) : (
                      <Maximize2 size={16} />
                    )}
                  </button>
                </div>
              </div>

              {/* Stage Body */}
              {isMeetingScreenSharing || meetingPresenter?.isSharing ? (
                /* PRESENTATION STAGE MODE */
                <div className="gt-conf-presentation-container">
                  {/* Hero Screen Display */}
                  <div className="gt-conf-hero-stage">
                    <div className="gt-conf-hero-banner">
                      <Monitor size={14} />
                      {isMeetingScreenSharing
                        ? "You are presenting your screen"
                        : `${
                            meetingPresenter?.presenterName || "Participant"
                          }'s Screen`}
                    </div>
                    {isMeetingScreenSharing ? (
                      <video
                        ref={(el) => {
                          if (
                            el &&
                            meetingScreenStreamRef.current &&
                            el.srcObject !== meetingScreenStreamRef.current
                          ) {
                            el.srcObject = meetingScreenStreamRef.current;
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="gt-conf-screen-video"
                      />
                    ) : (
                      <video
                        ref={(el) => {
                          const presenterStream =
                            meetingPresenter?.presenterId &&
                            meetingRoomCall.remoteStreams[
                              meetingPresenter.presenterId
                            ];
                          if (
                            el &&
                            presenterStream &&
                            el.srcObject !== presenterStream
                          ) {
                            el.srcObject = presenterStream;
                          }
                        }}
                        autoPlay
                        playsInline
                        className="gt-conf-screen-video"
                      />
                    )}
                  </div>

                  {/* Bottom Filmstrip of Participants */}
                  <div className="gt-conf-filmstrip">
                    {/* Local Participant Tile */}
                    <div className="gt-conf-filmstrip-tile">
                      {isMeetingVideoOff ? (
                        <div className="gt-conf-avatar-tile">
                          <div className="gt-conf-avatar-circle">
                            {(playerName || "U").charAt(0).toUpperCase()}
                          </div>
                        </div>
                      ) : (
                        <video
                          ref={(el) => {
                            if (
                              el &&
                              meetingRoomCall.localStream &&
                              el.srcObject !== meetingRoomCall.localStream
                            ) {
                              el.srcObject = meetingRoomCall.localStream;
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="gt-conf-filmstrip-video"
                        />
                      )}
                      <div className="gt-conf-tile-name">
                        {playerName || "You"} (You)
                      </div>
                      {isMeetingMuted && (
                        <div className="gt-conf-tile-muted-badge">
                          <MicOff size={11} />
                        </div>
                      )}
                    </div>

                    {/* Remote Participant Tiles */}
                    {Object.entries(meetingRoomCall.remoteStreams || {}).map(
                      ([userId, stream]) => {
                        const rName =
                          meetingNameMap[userId] ||
                          otherPlayers[userId]?.name ||
                          `User ${userId.slice(-4)}`;
                        const isPeerMuted = meetingParticipantMutes[userId];
                        const isPeerVideoOff =
                          meetingParticipantVideoOff[userId];
                        return (
                          <div key={userId} className="gt-conf-filmstrip-tile">
                            {isPeerVideoOff ? (
                              <div className="gt-conf-avatar-tile">
                                <div className="gt-conf-avatar-circle">
                                  {rName.charAt(0).toUpperCase()}
                                </div>
                              </div>
                            ) : (
                              <video
                                ref={(el) => {
                                  if (el && stream && el.srcObject !== stream) {
                                    el.srcObject = stream;
                                  }
                                }}
                                autoPlay
                                playsInline
                                className="gt-conf-filmstrip-video"
                              />
                            )}
                            <div className="gt-conf-tile-name">{rName}</div>
                            {isPeerMuted && (
                              <div className="gt-conf-tile-muted-badge">
                                <MicOff size={11} />
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              ) : (
                /* NORMAL MULTI-USER GRID MODE */
                <div
                  className={`gt-conf-grid gt-conf-grid-${
                    1 +
                      Object.keys(meetingRoomCall.remoteStreams || {}).length <=
                    1
                      ? "1"
                      : 1 +
                          Object.keys(meetingRoomCall.remoteStreams || {})
                            .length ===
                        2
                      ? "2"
                      : 1 +
                          Object.keys(meetingRoomCall.remoteStreams || {})
                            .length <=
                        4
                      ? "4"
                      : "many"
                  }`}
                >
                  {/* Local User Card */}
                  <div className="gt-conf-tile">
                    {isMeetingVideoOff ? (
                      <div className="gt-conf-avatar-tile">
                        <div className="gt-conf-avatar-circle large">
                          {(playerName || "U").charAt(0).toUpperCase()}
                        </div>
                        <span className="gt-conf-avatar-status">
                          Camera Off
                        </span>
                      </div>
                    ) : (
                      <video
                        ref={(el) => {
                          if (
                            el &&
                            meetingRoomCall.localStream &&
                            el.srcObject !== meetingRoomCall.localStream
                          ) {
                            el.srcObject = meetingRoomCall.localStream;
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="gt-conf-tile-video"
                      />
                    )}
                    <div className="gt-conf-tile-name">
                      {playerName || "You"} (You)
                    </div>
                    {isMeetingMuted && (
                      <div className="gt-conf-tile-muted-badge">
                        <MicOff size={13} />
                      </div>
                    )}
                  </div>

                  {/* Remote Users Cards */}
                  {Object.entries(meetingRoomCall.remoteStreams || {}).map(
                    ([userId, stream]) => {
                      const rName =
                        meetingNameMap[userId] ||
                        otherPlayers[userId]?.name ||
                        `User ${userId.slice(-4)}`;
                      const isPeerMuted = meetingParticipantMutes[userId];
                      const isPeerVideoOff =
                        meetingParticipantVideoOff[userId];
                      return (
                        <div key={userId} className="gt-conf-tile">
                          {isPeerVideoOff ? (
                            <div className="gt-conf-avatar-tile">
                              <div className="gt-conf-avatar-circle large">
                                {rName.charAt(0).toUpperCase()}
                              </div>
                              <span className="gt-conf-avatar-status">
                                Camera Off
                              </span>
                            </div>
                          ) : (
                            <video
                              ref={(el) => {
                                if (el && stream && el.srcObject !== stream) {
                                  el.srcObject = stream;
                                }
                              }}
                              autoPlay
                              playsInline
                              className="gt-conf-tile-video"
                            />
                          )}
                          <div className="gt-conf-tile-name">{rName}</div>
                          {isPeerMuted && (
                            <div className="gt-conf-tile-muted-badge">
                              <MicOff size={13} />
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {/* Bottom Toolbar Controls */}
              <div className="gt-conf-toolbar">
                <button
                  type="button"
                  className={`gt-toolbar-btn ${isMeetingMuted ? "off" : ""}`}
                  onClick={toggleMeetingMic}
                  title={isMeetingMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMeetingMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  <span className="gt-toolbar-label">
                    {isMeetingMuted ? "Unmute" : "Mute"}
                  </span>
                </button>

                <button
                  type="button"
                  className={`gt-toolbar-btn ${
                    isMeetingVideoOff ? "off" : ""
                  }`}
                  onClick={toggleMeetingVideo}
                  title={
                    isMeetingVideoOff ? "Turn On Camera" : "Turn Off Camera"
                  }
                >
                  {isMeetingVideoOff ? (
                    <VideoOff size={18} />
                  ) : (
                    <Video size={18} />
                  )}
                  <span className="gt-toolbar-label">
                    {isMeetingVideoOff ? "Start Video" : "Stop Video"}
                  </span>
                </button>

                <button
                  type="button"
                  className={`gt-toolbar-btn ${
                    isMeetingScreenSharing ? "sharing" : ""
                  }`}
                  onClick={
                    isMeetingScreenSharing
                      ? stopMeetingScreenShare
                      : startMeetingScreenShare
                  }
                  title={
                    isMeetingScreenSharing
                      ? "Stop Sharing Screen"
                      : "Share Your Screen"
                  }
                >
                  {isMeetingScreenSharing ? (
                    <MonitorOff size={18} />
                  ) : (
                    <Monitor size={18} />
                  )}
                  <span className="gt-toolbar-label">
                    {isMeetingScreenSharing ? "Stop Share" : "Share Screen"}
                  </span>
                </button>

                <button
                  type="button"
                  className="gt-toolbar-btn"
                  onClick={() => setIsMeetingMaximized((prev) => !prev)}
                  title={
                    isMeetingMaximized ? "Exit Fullscreen" : "Maximize Window"
                  }
                >
                  {isMeetingMaximized ? (
                    <Minimize2 size={18} />
                  ) : (
                    <Maximize2 size={18} />
                  )}
                  <span className="gt-toolbar-label">
                    {isMeetingMaximized ? "Restore" : "Maximize"}
                  </span>
                </button>

                <button
                  type="button"
                  className="gt-toolbar-btn end-call"
                  onClick={exitMeetingRoom}
                  title="Leave Conference Room & Exit to Hallway"
                >
                  <PhoneOff size={18} />
                  <span className="gt-toolbar-label">Exit Room</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {showChat && (
        <div
          style={{
            position: "fixed",
            right: "20px",
            bottom: "80px",
            width: "800px",
            height: "70vh",
            backgroundColor: "white",
            borderRadius: "15px",
            boxShadow:
              "0 10px 25px rgba(0,0,0,0.3), 0 6px 12px rgba(74, 108, 247, 0.2)",
            zIndex: 1000,
            overflow: "hidden",
            border: "2px solid rgba(74, 108, 247, 0.1)",
            background: "linear-gradient(to bottom right, #ffffff, #f0f4ff)",
          }}
        >
          <button
            onClick={() => setShowChat(false)}
            style={{
              position: "absolute",
              right: "10px",
              top: "10px",
              backgroundColor: "#ff4b4b",
              border: "none",
              borderRadius: "50%",
              width: "30px",
              height: "30px",
              color: "white",
              fontSize: "18px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
              zIndex: 1001,
            }}
          >
            ×
          </button>
          <Chat
            username={playerName}
            socket={socketRef.current}
            chatTargetId={chatTargetId}
          />
        </div>
      )}
      {/* Gamified Toast message for call end */}
      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "40px",
            transform: "translateX(-50%)",
            background: "linear-gradient(90deg, #23272e 0%, #3a3f4b 100%)",
            color: "#fff",
            padding: "18px 38px 22px 38px",
            borderRadius: "18px",
            fontSize: "20px",
            zIndex: 4000,
            boxShadow: "0 4px 24px #000a, 0 0px 0px #0000",
            border: "4px solid #4a6cf7",
            fontFamily: "'Press Start 2P', 'VT323', 'monospace', monospace",
            minWidth: "320px",
            textAlign: "center",
            letterSpacing: "1px",
            userSelect: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 28,
                filter: "drop-shadow(0 2px 0 #222)",
                marginRight: 4,
              }}
              role="img"
              aria-label="Trophy"
            >
              🏆
            </span>
            <span
              style={{
                fontWeight: "bold",
                color: "#ffe066",
                textShadow: "0 2px 0 #222, 0 0px 8px #ffe06699",
                fontSize: 22,
                letterSpacing: "2px",
              }}
            >
              {toast}
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#aaa",
              letterSpacing: "0.5px",
              fontFamily: "inherit",
              textShadow: "0 1px 0 #222",
            }}
          >
            +10 XP for socializing!
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;
