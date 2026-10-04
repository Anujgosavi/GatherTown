import React, { useState, useEffect } from "react";
import "./chat.css";
import axios from "axios";
import { Paperclip } from "lucide-react";

const BACKEND_URL = (
  process.env.REACT_APP_BACKEND_URL || "http://localhost:3001"
).replace(/\/+$/, "");

function Chat({ username, socket, chatTargetId }) {
  const [message, setMessage] = useState("");
  const [listner, setListner] = useState("");
  const [allchat, setAllchat] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!socket) return;

    console.log(username);

    socket.emit("register", username);
    // setShowModal(false);

    const handleOnlineUserstwo = (users) => setUserMap(users);
    socket.on("onlineUserswithnames", handleOnlineUserstwo);

    const handleAllchat = (allchat) => setAllchat(allchat);
    socket.on("receive_message", handleAllchat);

    const handleAllchattwo = (allchat, socketid) => {
      if (listner === socketid) setAllchat(allchat);
    };

    socket.on("message_sent", handleAllchattwo);

    return () => {
      socket.off("onlineUserswithnames", handleOnlineUserstwo);
      socket.off("receive_message", handleAllchat);
      socket.off("message_sent", handleAllchattwo);
    };
  }, [socket, username, listner]);

  useEffect(() => {
    if (chatTargetId && Object.values(userMap).includes(chatTargetId)) {
      setListner(chatTargetId);
      socket.emit("getChatHistory", chatTargetId);
    }
  }, [chatTargetId, userMap, socket]);

  const sendtext = () => {
    if (!message.trim()) return alert("Message cannot be empty!");
    if (!listner) return alert("Please select a user to chat with.");
    socket.emit("sendMessage", { listner, message });
    setMessage("");
  };

  const startChat = (username) => {
    setListner(userMap[username]);
    socket.emit("getChatHistory", userMap[username]);
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const sendFile = async () => {
    if (!listner) return alert("Please select a user to chat with.");
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await axios.post(
          `${BACKEND_URL}/upload`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );
        const filePath = res.data.filePath;
        socket.emit("sendMessage", { listner, message: filePath });
        setFile(null);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="main-container">
      <div className="chat-wrapper">
        <h1 className="title">Real-Time Chat</h1>
        <div className="chat-container">
          {/* Sidebar */}
          <div className="sidebar">
            <div className="sidebar-header">
              <h2>Online Users</h2>
            </div>
            <div className="user-list">
              {Object.entries(userMap)
                .filter(([username, id]) => id !== socket.id)
                .map(([username, id]) => (
                  <div
                    key={id}
                    onClick={() => startChat(username)}
                    className={`user-item ${listner === id ? "active" : ""}`}
                  >
                    <div className="user-avatar">
                      {username.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="user-name">{username}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className="chat-area">
            <div className="chat-header">
              <h2 style={{ color: "#2563eb" }}>
                {listner
                  ? `Chat with: ${Object.keys(userMap).find(
                      (username) => userMap[username] === listner
                    )}`
                  : "Select a user to start chatting"}
              </h2>
            </div>

            <div className="chat-messages">
              {allchat.map(({ sender, message, senderUsername }, idx) => (
                <div
                  key={`${sender}-${idx}`}
                  className={`chat-message ${
                    sender === socket.id ? "right" : "left"
                  }`}
                >
                  <div
                    className={`message-box ${
                      sender === socket.id ? "sent" : "received"
                    }`}
                  >
                    {message.startsWith("http://") ||
                    message.startsWith("https://") ? (
                      <a
                        href={message}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {message}
                      </a>
                    ) : (
                      <p>{message}</p>
                    )}
                    <span className="sender">
                      {sender === socket.id ? "You" : senderUsername}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="chat-input">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                onKeyDown={(e) => e.key === "Enter" && sendtext()}
              />
              <button onClick={sendtext}>Send</button>
              <input
                type="file"
                id="fileInput"
                onChange={handleFileChange}
                className="file-input"
              />
              <label htmlFor="fileInput" className="icon-btn">
                <Paperclip className={`icon ${file ? "highlighted" : ""}`} />
              </label>
              <button onClick={sendFile} className="file-send-btn">
                Send File
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;
