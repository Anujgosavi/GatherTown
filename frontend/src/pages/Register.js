import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import "./AuthPages.css";

const AVATARS = [
  { id: "chr1", label: "Hero 1", img: "/images/chr1.png" },
  { id: "chr2", label: "Hero 2", img: "/images/chr2.png" },
  { id: "chr3", label: "Hero 3", img: "/images/chr3.png" },
  { id: "chr4", label: "Hero 4", img: "/images/chr4.png" },
];

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("chr1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(name, email, password, selectedAvatar);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.error || "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="gt-page-container">
        <div className="gt-auth-card">
          <div className="gt-auth-header">
            <h1 className="gt-auth-title">Create Account</h1>
            <p className="gt-auth-subtitle">
              Join the 2D metaverse and build your virtual workspace
            </p>
          </div>

          {error && <div className="gt-error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="gt-form-group">
              <label className="gt-form-label">Full Name / Display Name</label>
              <input
                type="text"
                className="gt-input"
                placeholder="Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="gt-form-group">
              <label className="gt-form-label">Email Address</label>
              <input
                type="email"
                className="gt-input"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="gt-form-group">
              <label className="gt-form-label">Password</label>
              <input
                type="password"
                className="gt-input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="gt-form-group">
              <label className="gt-form-label">Choose Avatar Character</label>
              <div className="gt-avatar-grid">
                {AVATARS.map((av) => (
                  <div
                    key={av.id}
                    className={`gt-avatar-choice ${
                      selectedAvatar === av.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedAvatar(av.id)}
                  >
                    <img src={av.img} alt={av.label} />
                    <span>{av.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="gt-btn-block"
              disabled={loading}
            >
              {loading ? "Creating Account..." : "Create Account & Enter"}
            </button>
          </form>

          <div className="gt-auth-footer">
            Already have an account?
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Register;
