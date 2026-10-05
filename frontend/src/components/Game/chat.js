import React, { useState, useEffect, useRef } from "react";
import "./chat.css";
import axios from "axios";
import { Paperclip, Edit2, Trash2, Check, X, Send, Smile, User } from "lucide-react";

const BACKEND_URL = (
  process.env.REACT_APP_BACKEND_URL || "http://localhost:3001"
).replace(/\/+$/, "");

function Chat({ username, socket, chatTargetId, currentUser }) {
  const [message, setMessage] = useState("");
  const [listner, setListner] = useState("");
  const [targetUserName, setTargetUserName] = useState("");
  const [allchat, setAllchat] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState("");

  const messagesEndRef = useRef(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allchat, editingMessageId]);

  useEffect(() => {
    if (!socket) return;

    // Register user with username and optional account ID
    socket.emit("register", {
      username,
      userId: currentUser?.id || currentUser?._id || null,
    });

    const handleOnlineUsers = (users) => setUserMap(users);
    socket.on("onlineUserswithnames", handleOnlineUsers);

    const handleAllchat = (chatList) => {
      if (Array.isArray(chatList)) {
        setAllchat(chatList);
      }
    };
    socket.on("receive_message", handleAllchat);

    const handleIncomingSec = (chatList, fromSocketId) => {
      if (Array.isArray(chatList) && listner === fromSocketId) {
        setAllchat(chatList);
      }
    };
    socket.on("receive_message_sec", handleIncomingSec);
    socket.on("message_sent", handleIncomingSec);

    // Real-time message edit event
    const handleMessageEdited = ({ messageId, newMessage, isEdited, editedAt }) => {
      setAllchat((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, message: newMessage, isEdited: true, editedAt }
            : m
        )
      );
    };
    socket.on("message_edited", handleMessageEdited);

    // Real-time message delete event
    const handleMessageDeleted = ({ messageId }) => {
      setAllchat((prev) => prev.filter((m) => m._id !== messageId));
    };
    socket.on("message_deleted", handleMessageDeleted);

    return () => {
      socket.off("onlineUserswithnames", handleOnlineUsers);
      socket.off("receive_message", handleAllchat);
      socket.off("receive_message_sec", handleIncomingSec);
      socket.off("message_sent", handleIncomingSec);
      socket.off("message_edited", handleMessageEdited);
      socket.off("message_deleted", handleMessageDeleted);
    };
  }, [socket, username, listner, currentUser]);

  // When selected user or chatTargetId changes
  useEffect(() => {
    if (chatTargetId && Object.values(userMap).includes(chatTargetId)) {
      const foundName = Object.keys(userMap).find(
        (uname) => userMap[uname] === chatTargetId
      );
      setListner(chatTargetId);
      setTargetUserName(foundName || "");
      socket.emit("getChatHistory", {
        listner: chatTargetId,
        targetUsername: foundName,
      });
    }
  }, [chatTargetId, userMap, socket]);

  const startChat = (name) => {
    const targetSocketId = userMap[name];
    setListner(targetSocketId);
    setTargetUserName(name);
    setEditingMessageId(null);
    socket.emit("getChatHistory", {
      listner: targetSocketId,
      targetUsername: name,
    });
  };

  const sendtext = () => {
    if (!message.trim()) return;
    if (!listner) {
      alert("Please select an online user to chat with.");
      return;
    }

    socket.emit("sendMessage", {
      listner,
      message: message.trim(),
      senderUsername: username,
      recipientUsername: targetUserName,
      senderUserId: currentUser?.id || currentUser?._id || null,
    });
    setMessage("");
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const sendFile = async () => {
    if (!listner) {
      alert("Please select a user to chat with.");
      return;
    }
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);

    try {
      const res = await axios.post(`${BACKEND_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const filePath = res.data.filePath;
      socket.emit("sendMessage", {
        listner,
        message: filePath,
        senderUsername: username,
        recipientUsername: targetUserName,
        senderUserId: currentUser?.id || currentUser?._id || null,
      });
      setFile(null);
    } catch (err) {
      console.error("File upload error:", err);
      alert("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartEdit = (msg) => {
    setEditingMessageId(msg._id);
    setEditMessageText(msg.message);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditMessageText("");
  };

  const handleSaveEdit = (msgId) => {
    if (!editMessageText.trim()) return;
    socket.emit("editMessage", {
      messageId: msgId,
      newMessage: editMessageText.trim(),
      listner,
    });
    setEditingMessageId(null);
    setEditMessageText("");
  };

  const handleDeleteMessage = (msgId) => {
    if (window.confirm("Delete this message?")) {
      socket.emit("deleteMessage", {
        messageId: msgId,
        listner,
      });
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  };

  return (
    <div className="gt-chat-wrapper">
      <div className="gt-chat-container">
        {/* Sidebar: Online Users */}
        <div className="gt-chat-sidebar">
          <div className="gt-sidebar-header">
            <h3>Online Users</h3>
            <span className="gt-online-count">
              {Object.keys(userMap).filter((u) => userMap[u] !== socket?.id).length}
            </span>
          </div>

          <div className="gt-user-list">
            {Object.entries(userMap)
              .filter(([uname, id]) => id !== socket?.id)
              .map(([uname, id]) => {
                const isActive = listner === id;
                return (
                  <div
                    key={id}
                    onClick={() => startChat(uname)}
                    className={`gt-user-item ${isActive ? "active" : ""}`}
                  >
                    <div className="gt-user-avatar-pill">
                      {uname.slice(0, 2).toUpperCase()}
                      <span className="gt-online-dot"></span>
                    </div>
                    <div className="gt-user-details">
                      <span className="gt-user-name">{uname}</span>
                      <span className="gt-user-status">Click to chat</span>
                    </div>
                  </div>
                );
              })}

            {Object.entries(userMap).filter(([uname, id]) => id !== socket?.id).length === 0 && (
              <div className="gt-no-users">
                <User size={28} opacity={0.4} />
                <p>No other players online in this space right now.</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="gt-chat-area">
          <div className="gt-chat-header">
            {listner ? (
              <div className="gt-chat-target-info">
                <div className="gt-target-avatar">
                  {targetUserName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="gt-target-name">{targetUserName}</h4>
                  <span className="gt-target-status">Direct Message • MongoDB Synced</span>
                </div>
              </div>
            ) : (
              <div className="gt-chat-header-empty">
                <h4>Select a user to chat</h4>
                <p>Choose an online team member from the list to start messaging</p>
              </div>
            )}
          </div>

          {/* Messages list */}
          <div className="gt-chat-messages">
            {!listner ? (
              <div className="gt-empty-chat-state">
                <Smile size={36} color="#60a5fa" />
                <h3>Welcome to Spatial Chat</h3>
                <p>Pick someone on the left to start a real-time conversation.</p>
              </div>
            ) : allchat.length === 0 ? (
              <div className="gt-empty-chat-state">
                <p>No messages yet. Say hello to <strong>{targetUserName}</strong>!</p>
              </div>
            ) : (
              allchat.map((msg, idx) => {
                const isSelf =
                  msg.sender === socket?.id ||
                  (username && msg.senderUsername === username);
                const isEditingThis = editingMessageId === msg._id;
                const isFileLink =
                  msg.message &&
                  (msg.message.startsWith("http://") ||
                    msg.message.startsWith("https://"));

                return (
                  <div
                    key={msg._id || `msg-${idx}`}
                    className={`gt-msg-row ${isSelf ? "self" : "other"}`}
                  >
                    <div className={`gt-msg-bubble ${isSelf ? "sent" : "received"}`}>
                      {/* Hover action bar for self messages */}
                      {isSelf && msg._id && !isEditingThis && (
                        <div className="gt-msg-actions">
                          <button
                            type="button"
                            className="gt-msg-action-btn edit"
                            onClick={() => handleStartEdit(msg)}
                            title="Edit message"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            className="gt-msg-action-btn delete"
                            onClick={() => handleDeleteMessage(msg._id)}
                            title="Delete message"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}

                      {/* Message Content */}
                      {isEditingThis ? (
                        <div className="gt-inline-edit-wrapper">
                          <input
                            type="text"
                            value={editMessageText}
                            onChange={(e) => setEditMessageText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(msg._id);
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="gt-inline-edit-input"
                            autoFocus
                          />
                          <div className="gt-inline-edit-btns">
                            <button
                              type="button"
                              className="gt-save-edit-btn"
                              onClick={() => handleSaveEdit(msg._id)}
                              title="Save"
                            >
                              <Check size={13} /> Save
                            </button>
                            <button
                              type="button"
                              className="gt-cancel-edit-btn"
                              onClick={handleCancelEdit}
                              title="Cancel"
                            >
                              <X size={13} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : isFileLink ? (
                        <div className="gt-msg-file">
                          <Paperclip size={14} />
                          <a
                            href={msg.message}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {msg.message.split("/").pop() || "Download Attachment"}
                          </a>
                        </div>
                      ) : (
                        <p className="gt-msg-text">{msg.message}</p>
                      )}

                      {/* Meta Footer */}
                      <div className="gt-msg-meta">
                        <span className="gt-msg-sender-name">
                          {isSelf ? "You" : msg.senderUsername || targetUserName}
                        </span>
                        {msg.createdAt && (
                          <span className="gt-msg-time">
                            {formatTime(msg.createdAt)}
                          </span>
                        )}
                        {msg.isEdited && (
                          <span className="gt-msg-edited" title="Edited message">
                            (edited)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="gt-chat-input-bar">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                listner
                  ? `Message ${targetUserName}...`
                  : "Select an online user first..."
              }
              disabled={!listner}
              onKeyDown={(e) => e.key === "Enter" && sendtext()}
              className="gt-chat-text-input"
            />

            <input
              type="file"
              id="gtFileInput"
              onChange={handleFileChange}
              className="gt-hidden-file-input"
              disabled={!listner}
            />

            <label
              htmlFor="gtFileInput"
              className={`gt-icon-btn ${file ? "file-selected" : ""} ${
                !listner ? "disabled" : ""
              }`}
              title={file ? file.name : "Attach file"}
            >
              <Paperclip size={18} />
            </label>

            {file ? (
              <button
                type="button"
                onClick={sendFile}
                className="gt-send-file-btn"
                disabled={isUploading || !listner}
              >
                {isUploading ? "Uploading..." : `Send (${file.name.slice(0, 10)}...)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={sendtext}
                className="gt-send-msg-btn"
                disabled={!listner || !message.trim()}
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;
