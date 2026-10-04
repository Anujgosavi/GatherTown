import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Copy, Check, LogOut, User, ArrowLeft } from "lucide-react";
import "./Navbar.css";

const Navbar = ({ roomInfo }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (roomInfo) {
      const inviteUrl = `${window.location.origin}/room/${roomInfo.code}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="gt-navbar">
      <div className="gt-navbar-left">
        <Link to="/" className="gt-brand">
          <span className="gt-logo-icon">🕹️</span>
          <span className="gt-brand-text">GatherTown</span>
        </Link>

        {roomInfo && (
          <div className="gt-room-badge">
            <span className="gt-room-title">{roomInfo.name}</span>
            <span className="gt-room-code">#{roomInfo.code}</span>
            <button
              onClick={handleCopyLink}
              className={`gt-copy-btn ${copied ? "copied" : ""}`}
              title="Copy shareable invite link"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? "Link Copied!" : "Share Link"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="gt-navbar-right">
        {roomInfo && (
          <button
            onClick={() => navigate("/dashboard")}
            className="gt-nav-btn gt-btn-subtle"
          >
            <ArrowLeft size={16} />
            <span>Leave Space</span>
          </button>
        )}

        {isAuthenticated ? (
          <div className="gt-user-profile">
            <div className="gt-avatar-badge">
              <User size={14} />
              <span>{user?.name}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="gt-nav-btn gt-logout-btn"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="gt-auth-links">
            <Link to="/login" className="gt-nav-link">
              Login
            </Link>
            <Link to="/register" className="gt-nav-btn gt-btn-primary">
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
