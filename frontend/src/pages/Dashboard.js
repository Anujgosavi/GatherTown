import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import { PlusCircle, LogIn, Users, Sparkles } from "lucide-react";
import "./AuthPages.css";

const Dashboard = () => {
  const { user, token, BACKEND_URL } = useAuth();
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [publicRooms, setPublicRooms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/rooms`);
        setPublicRooms(res.data.rooms || []);
      } catch (e) {
        console.warn("Could not fetch public rooms list:", e.message);
      }
    };
    fetchRooms();
  }, [BACKEND_URL]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError("");
    setCreating(true);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(
        `${BACKEND_URL}/api/rooms/create`,
        { name: roomName || "Gather Lounge" },
        { headers }
      );
      const { code } = res.data.room;
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create space.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!joinInput.trim()) return;

    setError("");
    setJoining(true);

    // Extract room code if user pasted a full URL
    let code = joinInput.trim();
    if (code.includes("/room/")) {
      code = code.split("/room/")[1].split("?")[0].split("/")[0];
    }

    if (code) {
      navigate(`/room/${code.toLowerCase()}`);
    } else {
      setError("Please enter a valid room code or link.");
      setJoining(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="gt-page-container">
        <div className="gt-dashboard-container">
          <div className="gt-dash-hero">
            <h1>
              Welcome,{" "}
              <span className="gt-brand-text">
                {user ? user.name : "Explorer"}
              </span>{" "}
              👋
            </h1>
            <p>
              Jump into an interactive 2D spatial office, collaborate in real-time,
              and connect with your team.
            </p>
          </div>

          {error && <div className="gt-error-banner">{error}</div>}

          <div className="gt-cards-grid">
            {/* Create Room Card */}
            <div className="gt-action-card">
              <div>
                <div className="gt-card-header">
                  <div className="gt-card-icon">
                    <PlusCircle size={24} />
                  </div>
                  <h3 className="gt-card-title">Create a New Space</h3>
                </div>
                <p className="gt-card-desc">
                  Start your own virtual room with video conferencing, spatial
                  proximity audio, and chat. Share the link with friends.
                </p>

                <form onSubmit={handleCreateRoom}>
                  <div className="gt-form-group">
                    <label className="gt-form-label">Space Name</label>
                    <input
                      type="text"
                      className="gt-input"
                      placeholder="e.g. Engineering Standup or Game Lounge"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="gt-btn-block"
                    disabled={creating}
                  >
                    {creating ? "Launching Space..." : "🚀 Launch Space"}
                  </button>
                </form>
              </div>
            </div>

            {/* Join Room Card */}
            <div className="gt-action-card">
              <div>
                <div className="gt-card-header">
                  <div className="gt-card-icon">
                    <LogIn size={24} />
                  </div>
                  <h3 className="gt-card-title">Join Existing Space</h3>
                </div>
                <p className="gt-card-desc">
                  Have an invite code or room URL? Enter it below to immediately
                  teleport into that world.
                </p>

                <form onSubmit={handleJoinRoom}>
                  <div className="gt-form-group">
                    <label className="gt-form-label">Room Code or Invite URL</label>
                    <input
                      type="text"
                      className="gt-input"
                      placeholder="e.g. ytcw4y or http://localhost:3000/room/ytcw4y"
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="gt-btn-block"
                    style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                    disabled={joining}
                  >
                    {joining ? "Entering..." : "🚪 Enter Space"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Public Spaces List */}
          {publicRooms.length > 0 && (
            <div className="gt-rooms-section">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <Users size={18} color="#60a5fa" />
                <h2 style={{ margin: 0 }}>Recent Public Spaces</h2>
              </div>
              <div className="gt-room-list">
                {publicRooms.map((r) => (
                  <div key={r.code} className="gt-room-row">
                    <div className="gt-room-meta">
                      <Sparkles size={16} color="#818cf8" />
                      <div>
                        <div className="gt-room-name">{r.name}</div>
                        <div className="gt-room-owner">
                          Hosted by {r.ownerName || "Host"} • Code: {r.code}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/room/${r.code}`)}
                      className="gt-btn-sm"
                    >
                      Join Room
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;
