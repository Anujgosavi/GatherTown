import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import "./AuthPages.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.error || "Login failed. Please check your credentials."
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
            <h1 className="gt-auth-title">Welcome Back</h1>
            <p className="gt-auth-subtitle">
              Sign in to enter your virtual spaces & collaborate
            </p>
          </div>

          {error && <div className="gt-error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="gt-form-group">
              <label className="gt-form-label">Email Address</label>
              <input
                type="email"
                className="gt-input"
                placeholder="you@example.com"
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="gt-btn-block"
              disabled={loading}
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="gt-auth-footer">
            Don't have an account?
            <Link to="/register">Create one</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
