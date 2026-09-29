import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import Canvas from "../components/Game/Canvas";
import Particles from "../components/Particles";

const RoomView = () => {
  const { roomCode } = useParams();
  const { user, BACKEND_URL } = useAuth();
  const [roomInfo, setRoomInfo] = useState({
    code: roomCode,
    name: `Space #${roomCode}`,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/rooms/${roomCode}`);
        if (res.data?.room) {
          setRoomInfo(res.data.room);
        }
      } catch (err) {
        console.warn(
          "Room not found in database; initializing as an ad-hoc room:",
          err.message
        );
        setRoomInfo({
          code: roomCode,
          name: `Space #${roomCode.toUpperCase()}`,
        });
      } finally {
        setLoading(false);
      }
    };

    if (roomCode) {
      fetchRoom();
    }
  }, [roomCode, BACKEND_URL]);

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#94a3b8",
          fontFamily: "sans-serif",
        }}
      >
        Loading virtual space...
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar roomInfo={roomInfo} />
      <Particles />
      <div id="gameWrapper" style={{ paddingTop: "60px" }}>
        <Canvas roomCode={roomCode} initialPlayerName={user?.name} userAvatar={user?.avatar} />
      </div>
    </div>
  );
};

export default RoomView;
